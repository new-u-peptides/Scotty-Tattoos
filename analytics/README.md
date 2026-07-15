# Supabase reporting query pack — v2 (post-audit)

`supabase-reporting-queries.sql` is the corrected version of the 23-query
reporting pack, rebuilt after the metric-integrity audit. Every query was
executed and validated against the live Supabase project
(`irmmcjnlhyaytpcansvq`) on 2026-07-15.

The v1 pack was rated "good for directional analysis, not accounting-grade."
v2 addresses every finding in the audit. The queries remain strictly
read-only and each statement is standalone — copy any one block into the
Supabase SQL editor and run it.

## Layout

| Section | Queries | Contents |
|---|---|---|
| A | 1–6 | Revenue and growth (daily, weekly, monthly + YoY, AOV, country, payment method) |
| B | 7–14b | Products, checkout funnel, abandoned carts, discounts, order composition |
| C | 15–17 | Customers (top customers, new vs returning, LTV + repeat rate) |
| D | 18–19 | Margin, economics-coverage aware |
| E | 20 | Fulfilment SLA from payment confirmation |
| F | 21 | Affiliate performance |
| G | 22–23 | Acquisition (UTM, landing pages) |
| H | 24–30 | **New:** refunds/net revenue, disputes, processor fees, shipping economics, contribution margin, gateway approval rates, payment latency |
| I | 31 | **New:** cohort retention at 30/60/90 days |
| J | 32–36 | **New:** data-integrity guardrails — run these before trusting the rest |

## Audit finding → fix

### Critical fixes

1. **Currency handling** — Verified against live data: `order_line_economics.currency`
   is `USD` for 100% of rows and `checkout_orders` has no per-order currency
   column, so the store is single-currency today. All money columns are now
   explicitly suffixed `_usd`, and **Q33 is a standing guardrail**: if any
   currency source ever shows a second currency, the pack must gain
   `GROUP BY currency` / FX normalization before its numbers are trusted.

2. **Revenue attributed to checkout creation** — Every sales query now derives
   a real payment timestamp:
   `paid_at = COALESCE(first 'paid' order_status_updates row, earliest checkout_intents.paid_at, created_at)`,
   with a `paid_at_source` flag wherever the fallback would distort timing
   stats (Q20 SLA, Q30 latency exclude fallback rows). Funnel queries
   (Q8, Q9, Q23) intentionally keep `created_at`. Live coverage today:
   27 of 35 paid orders have a real payment timestamp — Q30 reports the gap.

3. **Affiliate query mismatch (old #21)** — Q21 now builds a `paid_90` CTE once
   and filters *every* column against it, including all commission sums
   (`FILTER (WHERE p.order_ref IS NOT NULL AND ...)`). Clawbacks are netted
   via `affiliate_clawbacks`. Commission-status lists are explicit and
   commented for extension.

4. **Missing economics rows inflating margin (old #18/#19)** — Q18 reports
   `total_lines`, `costed_lines`, `economics_coverage_pct` and computes margin
   **only over the costed subset**, with a per-row reliability label. Q19 uses
   a LEFT JOIN so uncosted products stay visible (revenue intact, NULL margin)
   instead of disappearing. Q32 tracks coverage per month. Live coverage
   today: 155 of 192 order lines are costed (~81%) — margins are labelled
   PARTIAL until backfilled.

5. **Non-monotonic funnel stages (old #9)** — Two funnels now exist. Q9a uses
   `checkout_intents` (the better-instrumented source; superseded re-attempts
   excluded). Q9b keeps the legacy `checkout_orders` funnel but stage 2 ORs
   together every gateway reference column, `payment_token`, `payment_ref`
   **and the paid set itself**, so `stage3_paid > stage2_payment_started` is
   impossible by construction. (Live data confirmed the old approach was badly
   wrong: only 7 of 59 orders have any gateway ID stored.)

### Important corrections

- **Abandoned carts (old #10)** — `COALESCE(payment_status,'pending')` handles
  NULLs, and the filter is an explicit allowlist of recoverable states
  (`pending`, `awaiting_payment`) rather than `NOT IN (paid set)` — cancelled,
  failed, expired and risk-flagged orders are never emailed. Also new: blank
  emails excluded, `email_suppressions` respected, existing
  `abandoned_email_stage` surfaced.
- **New vs returning (old #16)** — counts `DISTINCT LOWER(TRIM(email))`
  customers and orders separately; NULL/blank emails are excluded so anonymous
  orders can't pool into one shared partition. Same normalization in Q15/Q17.
- **Average unit price (old #7)** — now quantity-weighted:
  `SUM(line_total) / NULLIF(SUM(quantity), 0)` (unweighted min/max kept as
  reference columns).
- **Order size distribution (old #14)** — the promised value-bucket view now
  exists as Q14b (explicit USD buckets) alongside the unit-bucket view Q14a.
- **Timezone consistency** — every bucketing expression is pinned with
  `AT TIME ZONE 'UTC'`; swap `'UTC'` for `'Europe/Malta'` (or a dashboard
  parameter) to change the reporting timezone in one obvious way.
- **Partial-period comparisons** — Q2 uses only complete weeks; Q3a labels the
  running month `PARTIAL`; Q3b compares month-to-date against the *same
  elapsed portion* of the month a year earlier.

### Missing business metrics (audit checklist → query)

| Metric | Query |
|---|---|
| Refunds / partial refunds, net revenue after refunds | Q24 |
| Chargebacks / disputes | Q25 |
| Processor fees (from `gateway_fee_config`, gaps labelled) | Q26 |
| Shipping revenue vs shipping cost | Q27 |
| Contribution margin (with every incomplete input surfaced) | Q28 |
| Failed-payment + approval rate by gateway | Q29 |
| Checkout-to-payment latency | Q30 |
| Repeat customer rate (customer-based) | Q17 |
| Cohort retention 30/60/90d (maturity-aware) | Q31 |
| Economics coverage % | Q18, Q32 |
| Test / internal order exclusion | global `is_test` filter + Q34 |
| Duplicate checkout-attempt handling | Q35 (+ `superseded_by` filters in Q9a/Q29) |
| Paid orders awaiting fulfilment | Q36 |
| Fulfilment SLA from payment confirmation | Q20 |

## Known data gaps the queries surface (but cannot fix)

These need pipeline/backfill work before the pack is accounting-grade:

1. **`order_line_economics` coverage ~81%** — backfill the 37 uncosted lines
   (Q32 lists them by month); until then all margin queries are labelled PARTIAL.
2. **8 of 35 paid orders lack a payment-time event** — older orders predate the
   `order_status_updates`/`checkout_intents` instrumentation; their revenue
   falls back to `created_at` timing.
3. **`gateway_fee_config` is empty** — Q26/Q28 show fees as NULL/0 with an
   explicit "NO FEE CONFIG" label until rows are added.
4. **`refunds`, `disputes`, `payment_events` have no traffic yet** — Q24/Q25
   are wired and will populate as those tables get data; status-value lists in
   them may need adjusting once real rows exist.
