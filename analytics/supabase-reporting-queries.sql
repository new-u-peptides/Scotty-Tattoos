-- ============================================================================
-- SUPABASE REPORTING QUERY PACK — v2 (post-audit)
-- ============================================================================
-- Read-only analyst queries for the store backend (project irmmcjnlhyaytpcansvq).
-- v2 applies every fix from the reporting audit. See analytics/README.md for
-- the audit-finding -> fix mapping and for the data-grounding notes.
--
-- CONVENTIONS (applied to every query)
-- ----------------------------------------------------------------------------
-- PAID SET      payment_status IN ('paid','paid_crypto','shipped','delivered').
--               Live data currently contains paid / shipped / delivered only.
--               'paid_crypto' is kept defensively — if a new paid-like status
--               is ever introduced, add it here FIRST, in every query.
--
-- PAID TIME     Sales revenue is attributed to the moment the order was PAID,
--               not the moment the checkout row was created (audit fix 2).
--               paid_at = COALESCE(
--                   first order_status_updates row with status = 'paid',
--                   earliest checkout_intents.paid_at for the same order_ref,
--                   checkout_orders.created_at  -- fallback, flagged in
--               )                               -- paid_at_source
--               Checkout-FUNNEL queries (8, 9, 23) intentionally keep
--               created_at — funnels measure checkout starts.
--
-- TIMEZONE      All bucketing is pinned to UTC via AT TIME ZONE 'UTC'
--               (audit fix: timezone consistency). To report in operations
--               local time, replace 'UTC' with e.g. 'Europe/Malta' everywhere.
--
-- CURRENCY      Store prices, totals and economics are USD. Verified live:
--               order_line_economics.currency = 'USD' for 100% of rows, and
--               checkout_orders carries no per-order currency column.
--               Revenue columns are therefore suffixed _usd (audit fix 1).
--               Query 33 is the guardrail — if it ever returns more than one
--               currency, every money query in this pack must gain
--               GROUP BY currency or FX normalization before being trusted.
--
-- TEST ORDERS   Every query excludes checkout_orders.is_test = TRUE
--               (audit fix: test-order exclusion). Query 34 audits the
--               test / internal / risk-flagged population.
--
-- EMAILS        Customer identity = LOWER(TRIM(email)), with NULL and blank
--               emails excluded from customer-level metrics (audit fix:
--               new-vs-returning, LTV). Order-level metrics keep all orders.
--
-- PARTIAL       Trend queries either exclude the current incomplete period or
-- PERIODS       label it 'partial' and provide an elapsed-aligned comparison
--               (audit fix: partial-period comparisons).
--
-- The canonical paid_orders CTE is repeated verbatim at the top of each query
-- so that every statement is standalone and copy-paste runnable in the
-- Supabase SQL editor.
--
-- SECTIONS
--   A.  1-6    Revenue and growth
--   B.  7-14   Products, funnel, carts, order composition
--   C. 15-17   Customers
--   D. 18-19   Margin (economics-coverage aware)
--   E. 20      Fulfilment SLA
--   F. 21      Affiliates
--   G. 22-23   Acquisition
--   H. 24-30   Net revenue, fees, payments (new in v2)
--   I. 31      Cohort retention (new in v2)
--   J. 32-36   Data-integrity guardrails (new in v2 — run these first)
-- ============================================================================


-- ============================================================================
-- SECTION A — REVENUE AND GROWTH
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q1. Daily revenue — last 30 days, by payment time
-- FIX(audit 2): buckets on paid_at, not created_at
-- FIX(audit 1): explicit _usd naming, single-currency store verified by Q33
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.*,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
)
SELECT (paid_at AT TIME ZONE 'UTC')::date              AS day_utc,
       COUNT(*)                                        AS paid_orders,
       ROUND(SUM(total), 2)                            AS gross_revenue_usd,
       ROUND(SUM(subtotal), 2)                         AS product_subtotal_usd,
       ROUND(SUM(COALESCE(discount_amount, 0)), 2)     AS discounts_usd,
       ROUND(SUM(COALESCE(delivery_fee, 0)), 2)        AS shipping_revenue_usd,
       ROUND(AVG(total), 2)                            AS aov_usd
  FROM paid_orders
 WHERE paid_at >= NOW() - INTERVAL '30 days'
 GROUP BY 1
 ORDER BY 1;


-- ----------------------------------------------------------------------------
-- Q2. Weekly revenue and week-over-week growth — last 12 COMPLETE weeks
-- FIX(audit: partial periods): the current incomplete week is excluded, so
--   WoW growth always compares two complete weeks
-- FIX(audit: timezone): week boundaries pinned to UTC
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.*,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
),
weekly AS (
    SELECT DATE_TRUNC('week', paid_at AT TIME ZONE 'UTC')::date AS week_start_utc,
           COUNT(*)            AS paid_orders,
           SUM(total)          AS revenue_usd
      FROM paid_orders
     WHERE DATE_TRUNC('week', paid_at AT TIME ZONE 'UTC')
               <  DATE_TRUNC('week', NOW() AT TIME ZONE 'UTC')      -- complete weeks only
       AND DATE_TRUNC('week', paid_at AT TIME ZONE 'UTC')
               >= DATE_TRUNC('week', NOW() AT TIME ZONE 'UTC') - INTERVAL '12 weeks'
     GROUP BY 1
)
SELECT week_start_utc,
       paid_orders,
       ROUND(revenue_usd, 2) AS revenue_usd,
       ROUND(LAG(revenue_usd) OVER (ORDER BY week_start_utc), 2) AS prev_week_revenue_usd,
       ROUND(100.0 * (revenue_usd - LAG(revenue_usd) OVER (ORDER BY week_start_utc))
                   / NULLIF(LAG(revenue_usd) OVER (ORDER BY week_start_utc), 0), 1) AS wow_growth_pct
  FROM weekly
 ORDER BY week_start_utc;


-- ----------------------------------------------------------------------------
-- Q3a. Monthly revenue with year-over-year — partial month clearly labelled
-- FIX(audit: partial periods): the current month is flagged so a partial month
--   is never silently compared with a full month (use Q3b for a fair YoY)
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.*,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
),
monthly AS (
    SELECT DATE_TRUNC('month', paid_at AT TIME ZONE 'UTC')::date AS month_utc,
           COUNT(*)   AS paid_orders,
           SUM(total) AS revenue_usd
      FROM paid_orders
     GROUP BY 1
)
SELECT month_utc,
       paid_orders,
       ROUND(revenue_usd, 2) AS revenue_usd,
       ROUND(LAG(revenue_usd, 12) OVER (ORDER BY month_utc), 2) AS revenue_same_month_last_year_usd,
       ROUND(100.0 * (revenue_usd - LAG(revenue_usd, 12) OVER (ORDER BY month_utc))
                   / NULLIF(LAG(revenue_usd, 12) OVER (ORDER BY month_utc), 0), 1) AS yoy_growth_pct,
       CASE WHEN month_utc = DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC')::date
            THEN 'PARTIAL month-to-date — do not compare against full months'
            ELSE 'complete' END AS period_status
  FROM monthly
 ORDER BY month_utc;


-- ----------------------------------------------------------------------------
-- Q3b. Month-to-date vs the SAME ELAPSED PORTION of the month one year ago
-- FIX(audit: partial periods): apples-to-apples YoY for the running month
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.total,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AT TIME ZONE 'UTC' AS paid_utc
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
),
b AS (
    SELECT DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC') AS cur_month_start,
           NOW() AT TIME ZONE 'UTC'                      AS now_utc
)
SELECT ROUND(SUM(total) FILTER (WHERE paid_utc >= b.cur_month_start
                                  AND paid_utc <  b.now_utc), 2)  AS mtd_revenue_usd,
       COUNT(*) FILTER (WHERE paid_utc >= b.cur_month_start
                          AND paid_utc <  b.now_utc)              AS mtd_orders,
       ROUND(SUM(total) FILTER (WHERE paid_utc >= b.cur_month_start - INTERVAL '1 year'
                                  AND paid_utc <  b.now_utc      - INTERVAL '1 year'), 2)
                                                                  AS same_elapsed_period_last_year_usd,
       COUNT(*) FILTER (WHERE paid_utc >= b.cur_month_start - INTERVAL '1 year'
                          AND paid_utc <  b.now_utc      - INTERVAL '1 year')
                                                                  AS same_period_last_year_orders,
       ROUND(100.0 * (SUM(total) FILTER (WHERE paid_utc >= b.cur_month_start
                                           AND paid_utc <  b.now_utc)
                    - SUM(total) FILTER (WHERE paid_utc >= b.cur_month_start - INTERVAL '1 year'
                                           AND paid_utc <  b.now_utc      - INTERVAL '1 year'))
                    / NULLIF(SUM(total) FILTER (WHERE paid_utc >= b.cur_month_start - INTERVAL '1 year'
                                                  AND paid_utc <  b.now_utc      - INTERVAL '1 year'), 0), 1)
                                                                  AS yoy_mtd_growth_pct
  FROM paid_orders, b;


-- ----------------------------------------------------------------------------
-- Q4. Average order value by month (paid orders, payment-time based)
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.*,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
)
SELECT DATE_TRUNC('month', paid_at AT TIME ZONE 'UTC')::date AS month_utc,
       COUNT(*)                                              AS paid_orders,
       ROUND(SUM(total), 2)                                  AS revenue_usd,
       ROUND(AVG(total), 2)                                  AS aov_usd,
       ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total))::numeric, 2) AS median_order_value_usd
  FROM paid_orders
 GROUP BY 1
 ORDER BY 1;


-- ----------------------------------------------------------------------------
-- Q5. Revenue by shipping country — last 90 days by payment time
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.*,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
)
SELECT COALESCE(NULLIF(TRIM(country), ''), '(unknown)') AS country,
       COUNT(*)                                          AS paid_orders,
       ROUND(SUM(total), 2)                              AS revenue_usd,
       ROUND(AVG(total), 2)                              AS aov_usd,
       ROUND(100.0 * SUM(total) / NULLIF(SUM(SUM(total)) OVER (), 0), 1) AS revenue_share_pct
  FROM paid_orders
 WHERE paid_at >= NOW() - INTERVAL '90 days'
 GROUP BY 1
 ORDER BY revenue_usd DESC;


-- ----------------------------------------------------------------------------
-- Q6. Revenue by payment method — last 90 days by payment time
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.*,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
)
SELECT COALESCE(NULLIF(TRIM(payment_method), ''), '(unknown)') AS payment_method,
       COUNT(*)             AS paid_orders,
       ROUND(SUM(total), 2) AS revenue_usd,
       ROUND(AVG(total), 2) AS aov_usd
  FROM paid_orders
 WHERE paid_at >= NOW() - INTERVAL '90 days'
 GROUP BY 1
 ORDER BY revenue_usd DESC;


-- ============================================================================
-- SECTION B — PRODUCTS, FUNNEL, CARTS, ORDER COMPOSITION
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q7. Product pricing — QUANTITY-WEIGHTED average unit price
-- FIX(audit: average unit price): SUM(line_total) / SUM(quantity) replaces
--   AVG(unit_price), so a quantity-10 line no longer weighs the same as a
--   quantity-1 line
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.id,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
)
SELECT oi.product_name,
       SUM(oi.quantity)                                             AS units_sold,
       COUNT(DISTINCT oi.order_id)                                  AS orders,
       ROUND(SUM(oi.line_total), 2)                                 AS line_revenue_usd,
       ROUND(SUM(oi.line_total) / NULLIF(SUM(oi.quantity), 0), 2)   AS avg_unit_price_weighted_usd,
       ROUND(MIN(oi.unit_price), 2)                                 AS min_unit_price_usd,
       ROUND(MAX(oi.unit_price), 2)                                 AS max_unit_price_usd
  FROM paid_orders po
  JOIN order_items oi ON oi.order_id = po.id
 GROUP BY 1
 ORDER BY line_revenue_usd DESC;


-- ----------------------------------------------------------------------------
-- Q8. Daily checkout conversion — checkouts created vs eventually paid
-- NOTE: this is a FUNNEL query, so it deliberately buckets on created_at
--   (audit fix 2 draws exactly this distinction)
-- ----------------------------------------------------------------------------
SELECT (created_at AT TIME ZONE 'UTC')::date AS day_utc,
       COUNT(*) AS checkouts_created,
       COUNT(*) FILTER (WHERE payment_status IN ('paid','paid_crypto','shipped','delivered')) AS paid,
       ROUND(100.0 * COUNT(*) FILTER (WHERE payment_status IN ('paid','paid_crypto','shipped','delivered'))
                   / NULLIF(COUNT(*), 0), 1) AS conversion_pct
  FROM checkout_orders
 WHERE COALESCE(is_test, FALSE) = FALSE
   AND created_at >= NOW() - INTERVAL '30 days'
 GROUP BY 1
 ORDER BY 1;


-- ----------------------------------------------------------------------------
-- Q9a. Checkout funnel from checkout_intents (preferred source) — last 90 days
-- FIX(audit: funnel stages): stages are defined as CUMULATIVE SUPERSETS, so
--   stage2 >= stage3 is guaranteed by construction. Superseded (re-attempted)
--   intents are excluded so one shopper is not counted twice.
-- CAVEAT: an intent that reached the gateway but ended failed/expired keeps
--   its terminal status, so stage2 undercounts abandoned gateway visits until
--   payment_events is populated — the count can only be conservative, never
--   inverted.
-- ----------------------------------------------------------------------------
SELECT COUNT(*) AS stage1_checkout_intents,
       COUNT(*) FILTER (WHERE status IN ('payment_started', 'paid')
                           OR paid_at IS NOT NULL)                  AS stage2_payment_started,
       COUNT(*) FILTER (WHERE status = 'paid' OR paid_at IS NOT NULL) AS stage3_paid,
       ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('payment_started', 'paid')
                                         OR paid_at IS NOT NULL)
                   / NULLIF(COUNT(*), 0), 1)                        AS pct_reach_payment,
       ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'paid' OR paid_at IS NOT NULL)
                   / NULLIF(COUNT(*), 0), 1)                        AS pct_paid
  FROM checkout_intents
 WHERE COALESCE(is_test, FALSE) = FALSE
   AND superseded_by IS NULL
   AND created_at >= NOW() - INTERVAL '90 days';


-- ----------------------------------------------------------------------------
-- Q9b. Checkout funnel from checkout_orders (legacy source) — last 90 days
-- FIX(audit: funnel stages): stage2 now ORs together every gateway reference
--   column, payment_token, AND the paid set itself — a paid order always
--   counts as having started payment, whatever route it took (manual
--   confirmation, cleared token, new gateway). stage3 can never exceed stage2.
-- ----------------------------------------------------------------------------
SELECT COUNT(*) AS stage1_checkouts_created,
       COUNT(*) FILTER (
           WHERE payment_status IN ('paid','paid_crypto','shipped','delivered')
              OR payment_token IS NOT NULL
              OR COALESCE(passimpay_id, payram_id, paymento_token, lexicons_id,
                          nexapay_id, clkk_id, quiklie_id, conflux_id, payment_ref)
                 IS NOT NULL
       ) AS stage2_payment_started,
       COUNT(*) FILTER (WHERE payment_status IN ('paid','paid_crypto','shipped','delivered'))
         AS stage3_paid,
       ROUND(100.0 * COUNT(*) FILTER (WHERE payment_status IN ('paid','paid_crypto','shipped','delivered'))
                   / NULLIF(COUNT(*), 0), 1) AS pct_paid
  FROM checkout_orders
 WHERE COALESCE(is_test, FALSE) = FALSE
   AND created_at >= NOW() - INTERVAL '90 days';


-- ----------------------------------------------------------------------------
-- Q10. Abandoned carts worth recovering — explicit recoverable statuses only
-- FIX(audit: abandoned carts): NULL payment_status is treated as 'pending'
--   via COALESCE, and the filter is an explicit ALLOWLIST of recoverable
--   states — cancelled, failed, expired and risk-flagged orders are never
--   emailed. Suppressed emails are excluded, blank emails are excluded.
-- ----------------------------------------------------------------------------
SELECT co.order_ref,
       LOWER(TRIM(co.email))                       AS email,
       ROUND(co.total, 2)                          AS cart_value_usd,
       COALESCE(co.payment_status, 'pending')      AS payment_status,
       co.created_at,
       co.abandoned_email_stage,
       co.abandoned_email_sent_at
  FROM checkout_orders co
 WHERE COALESCE(co.payment_status, 'pending') IN ('pending', 'awaiting_payment')
       -- add 'expired' here only if ops decides an expired payment window is
       -- worth a recovery email
   AND COALESCE(co.is_test, FALSE) = FALSE
   AND NULLIF(TRIM(co.email), '') IS NOT NULL
   AND COALESCE(co.risk_review_status, '') NOT IN ('flagged', 'rejected', 'review')
   AND co.created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '2 hours'
   AND NOT EXISTS (SELECT 1 FROM email_suppressions es
                    WHERE LOWER(TRIM(es.email)) = LOWER(TRIM(co.email)))
 ORDER BY co.total DESC;


-- ----------------------------------------------------------------------------
-- Q11. Top products by revenue — last 90 days by payment time
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.id,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
)
SELECT oi.product_name,
       oi.dosage,
       SUM(oi.quantity)             AS units_sold,
       COUNT(DISTINCT oi.order_id)  AS orders,
       ROUND(SUM(oi.line_total), 2) AS revenue_usd
  FROM paid_orders po
  JOIN order_items oi ON oi.order_id = po.id
 WHERE po.paid_at >= NOW() - INTERVAL '90 days'
 GROUP BY 1, 2
 ORDER BY revenue_usd DESC
 LIMIT 25;


-- ----------------------------------------------------------------------------
-- Q12. Discount code performance (paid orders only)
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.*,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
)
SELECT UPPER(TRIM(discount_code))                    AS discount_code,
       COUNT(*)                                      AS paid_orders,
       ROUND(SUM(COALESCE(discount_amount, 0)), 2)   AS discount_given_usd,
       ROUND(SUM(total), 2)                          AS revenue_after_discount_usd,
       ROUND(AVG(total), 2)                          AS aov_usd
  FROM paid_orders
 WHERE NULLIF(TRIM(discount_code), '') IS NOT NULL
 GROUP BY 1
 ORDER BY revenue_after_discount_usd DESC;


-- ----------------------------------------------------------------------------
-- Q13. Order pipeline snapshot — all non-test orders by status
-- ----------------------------------------------------------------------------
SELECT COALESCE(payment_status, 'pending') AS payment_status,
       COUNT(*)                            AS orders,
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS orders_last_30d,
       ROUND(SUM(total), 2)                AS order_value_usd
  FROM checkout_orders
 WHERE COALESCE(is_test, FALSE) = FALSE
 GROUP BY 1
 ORDER BY orders DESC;


-- ----------------------------------------------------------------------------
-- Q14a. Order size distribution by UNIT COUNT (paid orders)
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.id, co.total,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
),
per_order AS (
    SELECT po.id, po.total, SUM(oi.quantity) AS units
      FROM paid_orders po
      JOIN order_items oi ON oi.order_id = po.id
     GROUP BY po.id, po.total
)
SELECT CASE WHEN units = 1  THEN '1 unit'
            WHEN units = 2  THEN '2 units'
            WHEN units <= 5 THEN '3-5 units'
            WHEN units <= 10 THEN '6-10 units'
            ELSE '11+ units' END AS unit_bucket,
       COUNT(*)                  AS orders,
       ROUND(SUM(total), 2)      AS revenue_usd,
       ROUND(AVG(total), 2)      AS aov_usd
  FROM per_order
 GROUP BY 1
 ORDER BY MIN(units);


-- ----------------------------------------------------------------------------
-- Q14b. Order size distribution by ORDER VALUE (USD buckets)
-- FIX(audit: query 14 title mismatch): the promised value-bucket breakdown now
--   exists, denominated explicitly in the store reporting currency (USD)
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.total,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
)
SELECT CASE WHEN total < 50   THEN 'under 50 USD'
            WHEN total < 100  THEN '50-99 USD'
            WHEN total < 250  THEN '100-249 USD'
            WHEN total < 500  THEN '250-499 USD'
            ELSE '500+ USD' END AS value_bucket_usd,
       COUNT(*)                 AS orders,
       ROUND(SUM(total), 2)     AS revenue_usd,
       ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS order_share_pct
  FROM paid_orders
 GROUP BY 1
 ORDER BY MIN(total);


-- ============================================================================
-- SECTION C — CUSTOMERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q15. Top customers by lifetime paid revenue
-- FIX(audit: customer identity): identity is LOWER(TRIM(email)), blank and
--   NULL emails excluded so anonymous orders cannot pool into one mega-customer
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.*,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
)
SELECT LOWER(TRIM(email))       AS customer_email,
       COUNT(*)                 AS paid_orders,
       ROUND(SUM(total), 2)     AS lifetime_revenue_usd,
       ROUND(AVG(total), 2)     AS aov_usd,
       MIN(paid_at)::date       AS first_paid_order,
       MAX(paid_at)::date       AS last_paid_order
  FROM paid_orders
 WHERE NULLIF(TRIM(email), '') IS NOT NULL
 GROUP BY 1
 ORDER BY lifetime_revenue_usd DESC
 LIMIT 25;


-- ----------------------------------------------------------------------------
-- Q16. New vs returning customers by month — CUSTOMERS and ORDERS reported
--      separately
-- FIX(audit: new vs returning): counts distinct normalized emails, not just
--   orders, and excludes NULL/blank emails from forming a shared partition
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.*,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
),
emailed AS (
    SELECT LOWER(TRIM(email)) AS em, paid_at, total
      FROM paid_orders
     WHERE NULLIF(TRIM(email), '') IS NOT NULL
),
firsts AS (
    SELECT em, MIN(paid_at) AS first_paid_at
      FROM emailed
     GROUP BY em
),
classified AS (
    SELECT DATE_TRUNC('month', e.paid_at AT TIME ZONE 'UTC')::date AS month_utc,
           e.em, e.total,
           (e.paid_at = f.first_paid_at) AS is_first_order
      FROM emailed e
      JOIN firsts f ON f.em = e.em
)
SELECT month_utc,
       COUNT(DISTINCT em) FILTER (WHERE is_first_order)      AS new_customers,
       COUNT(DISTINCT em) FILTER (WHERE NOT is_first_order)  AS returning_customers,
       COUNT(*)           FILTER (WHERE is_first_order)      AS new_customer_orders,
       COUNT(*)           FILTER (WHERE NOT is_first_order)  AS returning_orders,
       ROUND(SUM(total)   FILTER (WHERE is_first_order), 2)     AS new_customer_revenue_usd,
       ROUND(SUM(total)   FILTER (WHERE NOT is_first_order), 2) AS returning_revenue_usd
  FROM classified
 GROUP BY 1
 ORDER BY 1;


-- ----------------------------------------------------------------------------
-- Q17. Customer LTV summary and repeat rate — customer-based, not order-based
-- FIX(audit: repeat rate + LTV): repeat rate = repeat CUSTOMERS / customers,
--   computed over normalized non-blank emails only
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.*,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
),
per_customer AS (
    SELECT LOWER(TRIM(email)) AS em,
           COUNT(*)           AS n_orders,
           SUM(total)         AS ltv_usd
      FROM paid_orders
     WHERE NULLIF(TRIM(email), '') IS NOT NULL
     GROUP BY 1
)
SELECT COUNT(*)                                             AS customers,
       COUNT(*) FILTER (WHERE n_orders > 1)                 AS repeat_customers,
       ROUND(100.0 * COUNT(*) FILTER (WHERE n_orders > 1)
                   / NULLIF(COUNT(*), 0), 1)                AS repeat_rate_pct,
       ROUND(AVG(ltv_usd), 2)                               AS avg_ltv_usd,
       ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ltv_usd))::numeric, 2) AS median_ltv_usd,
       ROUND(MAX(ltv_usd), 2)                               AS max_ltv_usd,
       ROUND(AVG(n_orders), 2)                              AS avg_orders_per_customer
  FROM per_customer;


-- ============================================================================
-- SECTION D — MARGIN (ECONOMICS-COVERAGE AWARE)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q18. Monthly gross margin WITH economics-coverage columns
-- FIX(audit: missing economics rows): revenue for uncosted lines is no longer
--   silently paired with zero COGS. Margin is computed ONLY over the costed
--   subset, coverage is shown per month, and each row carries a reliability
--   label — do not trust margin_pct unless economics_coverage_pct = 100.
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.id,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
),
lines AS (
    SELECT DATE_TRUNC('month', po.paid_at AT TIME ZONE 'UTC')::date AS month_utc,
           oi.id AS item_id,
           oi.line_total,
           ole.line_revenue,
           ole.line_cogs_total,
           (ole.order_item_id IS NOT NULL) AS costed
      FROM paid_orders po
      JOIN order_items oi            ON oi.order_id = po.id
      LEFT JOIN order_line_economics ole ON ole.order_item_id = oi.id
)
SELECT month_utc,
       COUNT(*)                                   AS total_lines,
       COUNT(*) FILTER (WHERE costed)             AS costed_lines,
       ROUND(100.0 * COUNT(*) FILTER (WHERE costed) / NULLIF(COUNT(*), 0), 1)
                                                  AS economics_coverage_pct,
       ROUND(SUM(line_total), 2)                  AS line_revenue_all_usd,
       ROUND(SUM(line_revenue)    FILTER (WHERE costed), 2) AS revenue_costed_usd,
       ROUND(SUM(line_cogs_total) FILTER (WHERE costed), 2) AS cogs_costed_usd,
       ROUND(SUM(line_revenue - line_cogs_total) FILTER (WHERE costed), 2)
                                                  AS gross_profit_costed_usd,
       ROUND(100.0 * SUM(line_revenue - line_cogs_total) FILTER (WHERE costed)
                   / NULLIF(SUM(line_revenue) FILTER (WHERE costed), 0), 1)
                                                  AS margin_pct_costed_subset,
       CASE WHEN COUNT(*) = COUNT(*) FILTER (WHERE costed)
            THEN 'reliable — full economics coverage'
            ELSE 'PARTIAL — margin covers costed lines only, backfill order_line_economics'
            END                                   AS reliability
  FROM lines
 GROUP BY 1
 ORDER BY 1;


-- ----------------------------------------------------------------------------
-- Q19. Product margin — uncosted products stay visible
-- FIX(audit: missing economics rows, opposite case): LEFT JOIN replaces the
--   inner join, so a product with no economics rows still appears, with its
--   revenue intact and NULL margin plus a coverage column instead of
--   vanishing from the report
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.id,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
)
SELECT oi.product_name,
       SUM(oi.quantity)                              AS units_sold,
       ROUND(SUM(oi.line_total), 2)                  AS revenue_usd,
       COUNT(*)                                      AS total_lines,
       COUNT(ole.order_item_id)                      AS costed_lines,
       ROUND(100.0 * COUNT(ole.order_item_id) / NULLIF(COUNT(*), 0), 1)
                                                     AS economics_coverage_pct,
       ROUND(SUM(ole.line_cogs_total), 2)            AS cogs_costed_usd,
       ROUND(SUM(ole.line_revenue - ole.line_cogs_total), 2)
                                                     AS gross_profit_costed_usd,
       ROUND(100.0 * SUM(ole.line_revenue - ole.line_cogs_total)
                   / NULLIF(SUM(ole.line_revenue), 0), 1)
                                                     AS margin_pct_costed_subset
  FROM paid_orders po
  JOIN order_items oi                ON oi.order_id = po.id
  LEFT JOIN order_line_economics ole ON ole.order_item_id = oi.id
 GROUP BY 1
 ORDER BY revenue_usd DESC;


-- ============================================================================
-- SECTION E — FULFILMENT
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q20. Fulfilment SLA — measured from PAYMENT CONFIRMATION, not checkout
--      creation
-- FIX(audit: fulfilment SLA): the clock starts at paid_at. Orders whose
--   paid_at fell back to created_at (no payment event recorded) are excluded
--   from the timing stats so the fallback cannot fake a longer SLA.
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.*,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at,
           CASE WHEN EXISTS (SELECT 1 FROM order_status_updates osu
                              WHERE osu.order_id = co.id AND osu.status = 'paid')
                     THEN 'status_update'
                WHEN EXISTS (SELECT 1 FROM checkout_intents ci
                              WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL)
                     THEN 'intent'
                ELSE 'fallback_created_at' END AS paid_at_source
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
)
SELECT DATE_TRUNC('week', paid_at AT TIME ZONE 'UTC')::date AS week_paid_utc,
       COUNT(*)                                             AS paid_orders,
       COUNT(*) FILTER (WHERE shipped_at IS NOT NULL)       AS shipped,
       COUNT(*) FILTER (WHERE paid_at_source = 'fallback_created_at')
                                                            AS missing_paid_timestamp,
       ROUND((AVG(EXTRACT(EPOCH FROM (shipped_at - paid_at)) / 86400.0)
              FILTER (WHERE shipped_at IS NOT NULL
                        AND paid_at_source <> 'fallback_created_at'))::numeric, 2)
                                                            AS avg_days_paid_to_ship,
       ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (
                  ORDER BY EXTRACT(EPOCH FROM (shipped_at - paid_at)) / 86400.0)
              FILTER (WHERE shipped_at IS NOT NULL
                        AND paid_at_source <> 'fallback_created_at'))::numeric, 2)
                                                            AS median_days_paid_to_ship
  FROM paid_orders
 GROUP BY 1
 ORDER BY 1;


-- ============================================================================
-- SECTION F — AFFILIATES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q21. Affiliate performance — last 90 days, CONSISTENTLY filtered
-- FIX(audit: affiliate mismatch): a paid-orders CTE defines the 90-day paid
--   population ONCE, and every column — order counts, revenue AND all three
--   commission sums — is filtered to that same population, so commission
--   totals can no longer include older or unpaid records. Clawbacks are
--   netted out explicitly.
-- NOTE: commission_status values observed live: calculated, void. Extend the
--   owed / paid-out lists when new statuses (approved, paid, ...) appear.
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.order_ref, co.total,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
),
paid_90 AS (
    SELECT * FROM paid_orders WHERE paid_at >= NOW() - INTERVAL '90 days'
)
SELECT ao.affiliate_id,
       ao.affiliate_b_tag,
       COUNT(p.order_ref)                       AS paid_orders_90d,
       ROUND(SUM(p.total), 2)                   AS revenue_driven_usd_90d,
       ROUND(SUM(ao.commission_amount)
             FILTER (WHERE p.order_ref IS NOT NULL
                       AND ao.commission_status IN ('calculated', 'approved')), 2)
                                                AS commission_owed_usd_90d,
       ROUND(SUM(ao.commission_amount)
             FILTER (WHERE p.order_ref IS NOT NULL
                       AND ao.commission_status = 'pending'), 2)
                                                AS commission_pending_usd_90d,
       ROUND(SUM(ao.commission_amount)
             FILTER (WHERE p.order_ref IS NOT NULL
                       AND ao.commission_status IN ('paid', 'paid_out')), 2)
                                                AS commission_paid_out_usd_90d,
       COUNT(*) FILTER (WHERE ao.commission_status = 'void')
                                                AS void_commissions_all_time,
       ROUND(COALESCE(SUM(cb.clawed_back_amount), 0), 2)
                                                AS clawed_back_usd
  FROM affiliate_orders ao
  LEFT JOIN paid_90 p ON p.order_ref = ao.order_ref
  LEFT JOIN LATERAL (
      SELECT SUM(acb.clawed_back_amount) AS clawed_back_amount
        FROM affiliate_clawbacks acb
       WHERE acb.order_ref = ao.order_ref
  ) cb ON TRUE
 GROUP BY 1, 2
 ORDER BY revenue_driven_usd_90d DESC NULLS LAST;


-- ============================================================================
-- SECTION G — ACQUISITION
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q22. Paid revenue by UTM source / medium — last 90 days by payment time
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.*,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
)
SELECT COALESCE(NULLIF(TRIM(utm_source), ''), '(direct/none)') AS utm_source,
       COALESCE(NULLIF(TRIM(utm_medium), ''), '(none)')        AS utm_medium,
       COUNT(*)             AS paid_orders,
       ROUND(SUM(total), 2) AS revenue_usd,
       ROUND(AVG(total), 2) AS aov_usd
  FROM paid_orders
 WHERE paid_at >= NOW() - INTERVAL '90 days'
 GROUP BY 1, 2
 ORDER BY revenue_usd DESC;


-- ----------------------------------------------------------------------------
-- Q23. Landing page and referrer conversion — last 90 days
-- NOTE: funnel query, so created_at is the correct axis here
-- ----------------------------------------------------------------------------
SELECT COALESCE(NULLIF(TRIM(landing_page), ''), '(unknown)') AS landing_page,
       COUNT(*) AS checkouts_created,
       COUNT(*) FILTER (WHERE payment_status IN ('paid','paid_crypto','shipped','delivered')) AS paid,
       ROUND(100.0 * COUNT(*) FILTER (WHERE payment_status IN ('paid','paid_crypto','shipped','delivered'))
                   / NULLIF(COUNT(*), 0), 1) AS conversion_pct,
       ROUND(SUM(total) FILTER (WHERE payment_status IN ('paid','paid_crypto','shipped','delivered')), 2)
             AS paid_revenue_usd
  FROM checkout_orders
 WHERE COALESCE(is_test, FALSE) = FALSE
   AND created_at >= NOW() - INTERVAL '90 days'
 GROUP BY 1
HAVING COUNT(*) >= 2
 ORDER BY checkouts_created DESC
 LIMIT 30;


-- ============================================================================
-- SECTION H — NET REVENUE, FEES AND PAYMENTS (new in v2, audit "missing
-- business metrics")
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q24. Refunds and NET revenue after refunds, by month
-- NOTE: refunds are bucketed by refund date (cash view). refunds.status is
--   free-form until the table gets traffic — failed/cancelled/rejected rows
--   are excluded from the effective total
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.total,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
),
monthly_revenue AS (
    SELECT DATE_TRUNC('month', paid_at AT TIME ZONE 'UTC')::date AS month_utc,
           SUM(total) AS gross_revenue_usd,
           COUNT(*)   AS paid_orders
      FROM paid_orders
     GROUP BY 1
),
monthly_refunds AS (
    SELECT DATE_TRUNC('month', r.created_at AT TIME ZONE 'UTC')::date AS month_utc,
           COUNT(*)      AS refunds,
           SUM(r.amount) FILTER (WHERE COALESCE(r.status, '')
                                       NOT IN ('failed', 'cancelled', 'rejected'))
                         AS refunded_usd
      FROM refunds r
     GROUP BY 1
)
SELECT mr.month_utc,
       mr.paid_orders,
       ROUND(mr.gross_revenue_usd, 2)                     AS gross_revenue_usd,
       COALESCE(mf.refunds, 0)                            AS refunds,
       ROUND(COALESCE(mf.refunded_usd, 0), 2)             AS refunded_usd,
       ROUND(mr.gross_revenue_usd - COALESCE(mf.refunded_usd, 0), 2)
                                                          AS net_revenue_after_refunds_usd,
       ROUND(100.0 * COALESCE(mf.refunded_usd, 0)
                   / NULLIF(mr.gross_revenue_usd, 0), 2)  AS refund_rate_pct
  FROM monthly_revenue mr
  LEFT JOIN monthly_refunds mf ON mf.month_utc = mr.month_utc
 ORDER BY mr.month_utc;


-- ----------------------------------------------------------------------------
-- Q25. Chargebacks / disputes, by month
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
),
monthly_paid AS (
    SELECT DATE_TRUNC('month', paid_at AT TIME ZONE 'UTC')::date AS month_utc,
           COUNT(*) AS paid_orders
      FROM paid_orders
     GROUP BY 1
),
monthly_disputes AS (
    SELECT DATE_TRUNC('month', d.created_at AT TIME ZONE 'UTC')::date AS month_utc,
           COUNT(*)                          AS disputes,
           SUM(d.amount)                     AS disputed_usd,
           COUNT(*) FILTER (WHERE d.status IN ('lost'))              AS disputes_lost,
           COUNT(*) FILTER (WHERE d.status IN ('won'))               AS disputes_won
      FROM disputes d
     GROUP BY 1
)
SELECT mp.month_utc,
       mp.paid_orders,
       COALESCE(md.disputes, 0)                            AS disputes,
       ROUND(COALESCE(md.disputed_usd, 0), 2)              AS disputed_usd,
       COALESCE(md.disputes_won, 0)                        AS disputes_won,
       COALESCE(md.disputes_lost, 0)                       AS disputes_lost,
       ROUND(100.0 * COALESCE(md.disputes, 0)
                   / NULLIF(mp.paid_orders, 0), 2)         AS dispute_rate_pct
  FROM monthly_paid mp
  LEFT JOIN monthly_disputes md ON md.month_utc = mp.month_utc
 ORDER BY mp.month_utc;


-- ----------------------------------------------------------------------------
-- Q26. Estimated processor fees by gateway
-- NOTE: gateway_fee_config is currently EMPTY — rows without a config show
--   NULL fees and are labelled, never silently treated as zero-fee
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.payment_method, co.total,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
)
SELECT COALESCE(NULLIF(TRIM(po.payment_method), ''), '(unknown)') AS payment_method,
       COUNT(*)             AS paid_orders_90d,
       ROUND(SUM(po.total), 2) AS revenue_usd,
       g.percent_rate,
       g.fixed_usd,
       CASE WHEN g.gateway_key IS NULL THEN NULL
            ELSE ROUND(SUM(po.total * g.percent_rate / 100.0 + g.fixed_usd), 2)
            END AS estimated_fees_usd,
       CASE WHEN g.gateway_key IS NULL
            THEN 'NO FEE CONFIG — add a gateway_fee_config row'
            ELSE 'estimated from gateway_fee_config' END AS fee_basis
  FROM paid_orders po
  LEFT JOIN gateway_fee_config g ON g.gateway_key = po.payment_method
 WHERE po.paid_at >= NOW() - INTERVAL '90 days'
 GROUP BY po.payment_method, g.gateway_key, g.percent_rate, g.fixed_usd
 ORDER BY revenue_usd DESC;


-- ----------------------------------------------------------------------------
-- Q27. Shipping revenue vs allocated shipping cost, by month
-- NOTE: cost side only exists for costed lines (see Q18 coverage) — the
--   coverage column here says how much of the month is actually costed
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.id, co.delivery_fee,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
),
orders_monthly AS (
    SELECT DATE_TRUNC('month', paid_at AT TIME ZONE 'UTC')::date AS month_utc,
           COUNT(*)                        AS paid_orders,
           SUM(COALESCE(delivery_fee, 0))  AS shipping_revenue_usd
      FROM paid_orders
     GROUP BY 1
),
cost_monthly AS (
    SELECT DATE_TRUNC('month', po.paid_at AT TIME ZONE 'UTC')::date AS month_utc,
           SUM(ole.line_logistics_alloc) AS shipping_cost_alloc_usd,
           COUNT(oi.id)                  AS total_lines,
           COUNT(ole.order_item_id)      AS costed_lines
      FROM paid_orders po
      JOIN order_items oi                ON oi.order_id = po.id
      LEFT JOIN order_line_economics ole ON ole.order_item_id = oi.id
     GROUP BY 1
)
SELECT om.month_utc,
       om.paid_orders,
       ROUND(om.shipping_revenue_usd, 2)                    AS shipping_revenue_usd,
       ROUND(cm.shipping_cost_alloc_usd, 2)                 AS shipping_cost_alloc_usd_costed,
       ROUND(100.0 * cm.costed_lines / NULLIF(cm.total_lines, 0), 1)
                                                            AS economics_coverage_pct,
       ROUND(om.shipping_revenue_usd
             - COALESCE(cm.shipping_cost_alloc_usd, 0), 2)  AS shipping_net_usd_partial
  FROM orders_monthly om
  LEFT JOIN cost_monthly cm ON cm.month_utc = om.month_utc
 ORDER BY om.month_utc;


-- ----------------------------------------------------------------------------
-- Q28. Contribution margin by month — revenue minus COGS minus logistics
--      minus estimated fees minus refunds, with every gap surfaced
-- NOTE: this is only accounting-grade once economics coverage is 100%,
--   gateway_fee_config is populated, and refunds flow through the refunds
--   table — the caveat columns say exactly which inputs are incomplete
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.id, co.order_ref, co.total, co.payment_method,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
),
rev AS (
    SELECT DATE_TRUNC('month', paid_at AT TIME ZONE 'UTC')::date AS month_utc,
           SUM(total) AS revenue_usd,
           SUM(CASE WHEN g.gateway_key IS NULL THEN NULL
                    ELSE total * g.percent_rate / 100.0 + g.fixed_usd END) AS est_fees_usd,
           COUNT(*) FILTER (WHERE g.gateway_key IS NULL) AS orders_without_fee_config,
           COUNT(*) AS paid_orders
      FROM paid_orders po
      LEFT JOIN gateway_fee_config g ON g.gateway_key = po.payment_method
     GROUP BY 1
),
cogs AS (
    SELECT DATE_TRUNC('month', po.paid_at AT TIME ZONE 'UTC')::date AS month_utc,
           SUM(ole.line_cogs_total)      AS cogs_usd,
           SUM(ole.line_logistics_alloc) AS logistics_usd,
           COUNT(oi.id)                  AS total_lines,
           COUNT(ole.order_item_id)      AS costed_lines
      FROM paid_orders po
      JOIN order_items oi            ON oi.order_id = po.id
      LEFT JOIN order_line_economics ole ON ole.order_item_id = oi.id
     GROUP BY 1
),
ref AS (
    SELECT DATE_TRUNC('month', r.created_at AT TIME ZONE 'UTC')::date AS month_utc,
           SUM(r.amount) FILTER (WHERE COALESCE(r.status, '')
                                       NOT IN ('failed', 'cancelled', 'rejected')) AS refunded_usd
      FROM refunds r
     GROUP BY 1
)
SELECT rev.month_utc,
       rev.paid_orders,
       ROUND(rev.revenue_usd, 2)                          AS revenue_usd,
       ROUND(COALESCE(cogs.cogs_usd, 0), 2)               AS cogs_costed_usd,
       ROUND(COALESCE(cogs.logistics_usd, 0), 2)          AS logistics_costed_usd,
       ROUND(COALESCE(rev.est_fees_usd, 0), 2)            AS est_processor_fees_usd,
       ROUND(COALESCE(ref.refunded_usd, 0), 2)            AS refunded_usd,
       ROUND(rev.revenue_usd
             - COALESCE(cogs.cogs_usd, 0)
             - COALESCE(cogs.logistics_usd, 0)
             - COALESCE(rev.est_fees_usd, 0)
             - COALESCE(ref.refunded_usd, 0), 2)          AS contribution_margin_usd,
       ROUND(100.0 * cogs.costed_lines / NULLIF(cogs.total_lines, 0), 1)
                                                          AS economics_coverage_pct,
       rev.orders_without_fee_config
  FROM rev
  LEFT JOIN cogs ON cogs.month_utc = rev.month_utc
  LEFT JOIN ref  ON ref.month_utc  = rev.month_utc
 ORDER BY rev.month_utc;


-- ----------------------------------------------------------------------------
-- Q29. Payment approval and failure rate by gateway — last 90 days
-- NOTE: from checkout_intents. Drafts never reached a gateway, so they are
--   excluded from the approval denominator. Superseded intents excluded.
-- ----------------------------------------------------------------------------
SELECT COALESCE(NULLIF(TRIM(gateway), ''), '(unknown)') AS gateway,
       COUNT(*) FILTER (WHERE status <> 'draft')        AS attempts,
       COUNT(*) FILTER (WHERE status = 'paid' OR paid_at IS NOT NULL) AS paid,
       COUNT(*) FILTER (WHERE status = 'failed')        AS failed,
       COUNT(*) FILTER (WHERE status = 'expired')       AS expired,
       COUNT(*) FILTER (WHERE status = 'cancelled')     AS cancelled,
       ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'paid' OR paid_at IS NOT NULL)
                   / NULLIF(COUNT(*) FILTER (WHERE status IN ('paid','failed','expired','cancelled')
                                                OR paid_at IS NOT NULL), 0), 1)
                                                        AS approval_rate_pct,
       ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed')
                   / NULLIF(COUNT(*) FILTER (WHERE status <> 'draft'), 0), 1)
                                                        AS failure_rate_pct
  FROM checkout_intents
 WHERE COALESCE(is_test, FALSE) = FALSE
   AND superseded_by IS NULL
   AND created_at >= NOW() - INTERVAL '90 days'
 GROUP BY 1
 ORDER BY attempts DESC;


-- ----------------------------------------------------------------------------
-- Q30. Checkout-to-payment latency — real payment timestamps only
-- NOTE: orders whose paid_at fell back to created_at would report a fake
--   0-minute latency, so they are excluded and counted separately
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.created_at,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at,
           CASE WHEN EXISTS (SELECT 1 FROM order_status_updates osu
                              WHERE osu.order_id = co.id AND osu.status = 'paid')
                     THEN 'status_update'
                WHEN EXISTS (SELECT 1 FROM checkout_intents ci
                              WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL)
                     THEN 'intent'
                ELSE 'fallback_created_at' END AS paid_at_source
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
)
SELECT COUNT(*)                                                    AS paid_orders_total,
       COUNT(*) FILTER (WHERE paid_at_source <> 'fallback_created_at')
                                                                   AS with_real_paid_timestamp,
       COUNT(*) FILTER (WHERE paid_at_source = 'fallback_created_at')
                                                                   AS missing_paid_timestamp,
       ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (
                  ORDER BY EXTRACT(EPOCH FROM (paid_at - created_at)) / 60.0)
              FILTER (WHERE paid_at_source <> 'fallback_created_at'))::numeric, 1)
                                                                   AS median_minutes_to_pay,
       ROUND((PERCENTILE_CONT(0.9) WITHIN GROUP (
                  ORDER BY EXTRACT(EPOCH FROM (paid_at - created_at)) / 60.0)
              FILTER (WHERE paid_at_source <> 'fallback_created_at'))::numeric, 1)
                                                                   AS p90_minutes_to_pay,
       ROUND((AVG(EXTRACT(EPOCH FROM (paid_at - created_at)) / 60.0)
              FILTER (WHERE paid_at_source <> 'fallback_created_at'))::numeric, 1)
                                                                   AS avg_minutes_to_pay
  FROM paid_orders;


-- ============================================================================
-- SECTION I — RETENTION
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q31. Cohort retention at 30 / 60 / 90 days — first-paid-order cohorts
-- NOTE: a cohort only counts toward a window once it is old enough to have
--   completed that window (eligible_Nd columns), so young cohorts cannot
--   drag retention down artificially
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.email, co.total,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
),
cust AS (
    SELECT LOWER(TRIM(email)) AS em, paid_at
      FROM paid_orders
     WHERE NULLIF(TRIM(email), '') IS NOT NULL
),
firsts AS (
    SELECT em, MIN(paid_at) AS first_paid_at
      FROM cust
     GROUP BY em
),
flags AS (
    SELECT f.em,
           f.first_paid_at,
           COALESCE(BOOL_OR(c2.paid_at <= f.first_paid_at + INTERVAL '30 days'), FALSE) AS r30,
           COALESCE(BOOL_OR(c2.paid_at <= f.first_paid_at + INTERVAL '60 days'), FALSE) AS r60,
           COALESCE(BOOL_OR(c2.paid_at <= f.first_paid_at + INTERVAL '90 days'), FALSE) AS r90
      FROM firsts f
      LEFT JOIN cust c2 ON c2.em = f.em AND c2.paid_at > f.first_paid_at
     GROUP BY f.em, f.first_paid_at
)
SELECT DATE_TRUNC('month', first_paid_at AT TIME ZONE 'UTC')::date AS cohort_month_utc,
       COUNT(*)                                                    AS cohort_size,
       COUNT(*) FILTER (WHERE first_paid_at <= NOW() - INTERVAL '30 days') AS eligible_30d,
       COUNT(*) FILTER (WHERE r30 AND first_paid_at <= NOW() - INTERVAL '30 days') AS retained_30d,
       ROUND(100.0 * COUNT(*) FILTER (WHERE r30 AND first_paid_at <= NOW() - INTERVAL '30 days')
                   / NULLIF(COUNT(*) FILTER (WHERE first_paid_at <= NOW() - INTERVAL '30 days'), 0), 1)
                                                                   AS retention_30d_pct,
       COUNT(*) FILTER (WHERE first_paid_at <= NOW() - INTERVAL '60 days') AS eligible_60d,
       COUNT(*) FILTER (WHERE r60 AND first_paid_at <= NOW() - INTERVAL '60 days') AS retained_60d,
       ROUND(100.0 * COUNT(*) FILTER (WHERE r60 AND first_paid_at <= NOW() - INTERVAL '60 days')
                   / NULLIF(COUNT(*) FILTER (WHERE first_paid_at <= NOW() - INTERVAL '60 days'), 0), 1)
                                                                   AS retention_60d_pct,
       COUNT(*) FILTER (WHERE first_paid_at <= NOW() - INTERVAL '90 days') AS eligible_90d,
       COUNT(*) FILTER (WHERE r90 AND first_paid_at <= NOW() - INTERVAL '90 days') AS retained_90d,
       ROUND(100.0 * COUNT(*) FILTER (WHERE r90 AND first_paid_at <= NOW() - INTERVAL '90 days')
                   / NULLIF(COUNT(*) FILTER (WHERE first_paid_at <= NOW() - INTERVAL '90 days'), 0), 1)
                                                                   AS retention_90d_pct
  FROM flags
 GROUP BY 1
 ORDER BY 1;


-- ============================================================================
-- SECTION J — DATA-INTEGRITY GUARDRAILS (run these before trusting anything
-- above)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q32. Economics coverage over time — the guardrail behind Q18 / Q19 / Q28
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.id,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
)
SELECT DATE_TRUNC('month', po.paid_at AT TIME ZONE 'UTC')::date AS month_utc,
       COUNT(oi.id)                 AS total_lines,
       COUNT(ole.order_item_id)     AS costed_lines,
       COUNT(oi.id) - COUNT(ole.order_item_id) AS uncosted_lines,
       ROUND(100.0 * COUNT(ole.order_item_id) / NULLIF(COUNT(oi.id), 0), 1)
                                    AS economics_coverage_pct,
       ROUND(SUM(oi.line_total) FILTER (WHERE ole.order_item_id IS NULL), 2)
                                    AS uncosted_revenue_usd
  FROM paid_orders po
  JOIN order_items oi                ON oi.order_id = po.id
  LEFT JOIN order_line_economics ole ON ole.order_item_id = oi.id
 GROUP BY 1
 ORDER BY 1;


-- ----------------------------------------------------------------------------
-- Q33. Currency integrity guardrail
-- FIX(audit: currency handling): if this returns anything other than a single
--   USD row per source, STOP — every money query in this pack must then gain
--   GROUP BY currency or FX normalization at the paid-at exchange rate
-- ----------------------------------------------------------------------------
SELECT 'order_line_economics' AS source, COALESCE(currency, '(null)') AS currency, COUNT(*) AS rows
  FROM order_line_economics GROUP BY 2
UNION ALL
SELECT 'checkout_intents', COALESCE(currency, '(null)'), COUNT(*)
  FROM checkout_intents GROUP BY 2
UNION ALL
SELECT 'payment_intents', COALESCE(currency, '(null)'), COUNT(*)
  FROM payment_intents GROUP BY 2
UNION ALL
SELECT 'payment_events', COALESCE(currency, '(null)'), COUNT(*)
  FROM payment_events GROUP BY 2
 ORDER BY 1, 3 DESC;


-- ----------------------------------------------------------------------------
-- Q34. Test / internal / risk-flagged order audit
-- FIX(audit: test-order exclusion): quantifies what the global is_test filter
--   removes and what else may need excluding (admin-email orders, risk holds)
-- ----------------------------------------------------------------------------
SELECT 'is_test = true'            AS category,
       COUNT(*)                    AS orders,
       ROUND(SUM(total), 2)        AS order_value_usd
  FROM checkout_orders WHERE is_test = TRUE
UNION ALL
SELECT 'risk_review_status set', COUNT(*), ROUND(SUM(total), 2)
  FROM checkout_orders
 WHERE NULLIF(TRIM(risk_review_status), '') IS NOT NULL
UNION ALL
SELECT 'order email matches an admin_users email', COUNT(*), ROUND(SUM(co.total), 2)
  FROM checkout_orders co
 WHERE EXISTS (SELECT 1 FROM admin_users au
                WHERE LOWER(TRIM(au.email)) = LOWER(TRIM(co.email)))
UNION ALL
SELECT 'internal_notes present', COUNT(*), ROUND(SUM(total), 2)
  FROM checkout_orders
 WHERE NULLIF(TRIM(internal_notes), '') IS NOT NULL;


-- ----------------------------------------------------------------------------
-- Q35. Duplicate checkout attempts
-- FIX(audit: duplicate handling): three signals — shared idempotency keys,
--   superseded intent chains, and same email + same total within 30 minutes
-- ----------------------------------------------------------------------------
WITH dup_idempotency AS (
    SELECT COUNT(*) AS n
      FROM (SELECT idempotency_key
              FROM checkout_orders
             WHERE NULLIF(TRIM(idempotency_key), '') IS NOT NULL
               AND COALESCE(is_test, FALSE) = FALSE
             GROUP BY idempotency_key
            HAVING COUNT(*) > 1) d
),
superseded AS (
    SELECT COUNT(*) AS n
      FROM checkout_intents
     WHERE superseded_by IS NOT NULL
),
near_dupes AS (
    SELECT COUNT(*) AS n
      FROM checkout_orders a
      JOIN checkout_orders b
        ON LOWER(TRIM(a.email)) = LOWER(TRIM(b.email))
       AND a.total = b.total
       AND a.id < b.id
       AND b.created_at BETWEEN a.created_at AND a.created_at + INTERVAL '30 minutes'
     WHERE NULLIF(TRIM(a.email), '') IS NOT NULL
       AND COALESCE(a.is_test, FALSE) = FALSE
       AND COALESCE(b.is_test, FALSE) = FALSE
)
SELECT 'orders sharing an idempotency_key'                   AS signal, n FROM dup_idempotency
UNION ALL
SELECT 'superseded checkout_intents (re-attempt chains)',       n FROM superseded
UNION ALL
SELECT 'order pairs: same email + total within 30 minutes',     n FROM near_dupes;


-- ----------------------------------------------------------------------------
-- Q36. Paid orders awaiting fulfilment — aged from payment confirmation
-- ----------------------------------------------------------------------------
WITH paid_orders AS (
    SELECT co.*,
           COALESCE(
               (SELECT MIN(osu.created_at) FROM order_status_updates osu
                 WHERE osu.order_id = co.id AND osu.status = 'paid'),
               (SELECT MIN(ci.paid_at) FROM checkout_intents ci
                 WHERE ci.order_ref = co.order_ref AND ci.paid_at IS NOT NULL),
               co.created_at
           ) AS paid_at
      FROM checkout_orders co
     WHERE co.payment_status IN ('paid','paid_crypto','shipped','delivered')
       AND COALESCE(co.is_test, FALSE) = FALSE
)
SELECT po.order_ref,
       LOWER(TRIM(po.email))                    AS email,
       ROUND(po.total, 2)                       AS total_usd,
       po.paid_at,
       ROUND((EXTRACT(EPOCH FROM (NOW() - po.paid_at)) / 3600.0)::numeric, 1)
                                                AS hours_since_paid,
       COALESCE(fq.status, 'NOT IN FULFILMENT QUEUE') AS queue_status,
       fq.retry_count,
       fq.last_error
  FROM paid_orders po
  LEFT JOIN fulfillment_queue fq ON fq.order_id = po.id
 WHERE po.payment_status NOT IN ('shipped', 'delivered')
   AND po.shipped_at IS NULL
 ORDER BY po.paid_at;
