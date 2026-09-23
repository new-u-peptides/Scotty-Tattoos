# The enquiry funnel - operator's guide

Everything scottymassa.com does between "someone sees a tattoo they like" and
"Scotty has an enquiry he can act on". Written from the code, not from a plan.

---

## 1. The journey

```
Instagram / Google / a portfolio link
        │
        ▼
  a portfolio or style page          main.js records first-touch attribution
        │                            (utm_*, landing page, referrer - 90 days)
        ▼
  booking.html?project=sleeve        project type preselected from the link
        │
        ├── STEP 1  name, email, country, Instagram,
        │           project type, scale, WHERE IT WOULD HAPPEN
        │              │
        │              └─► POST /api/enquiry/start   (fire-and-forget)
        │                   creates the record so an abandoned enquiry
        │                   is still reachable by the reminders
        │
        └── STEP 2  the idea, placement, existing tattoos, references,
                    timing, how they found him, consent
                       │
                       └─► POST /api/enquiry/submit  (multipart)
                             1. studio notification  ← failure here = 502
                             2. client confirmation  ← best effort
                             3. process email, +15m  ← best effort
                             4. store the record     ← best effort
        ▼
  enquiry-received.html              reference shown, four next steps
        ▼
  Scotty reviews on /admin/enquiries.html
        ▼
  consultation → deposit → booked
```

**Why step 1 posts separately.** If someone fills in who they are and then
leaves, that is still a lead. The record created at step 1 is what the 24-hour
reminder reaches. The call is deliberately fire-and-forget: the visitor is
never blocked on it, and if it fails the final submit creates the record
instead.

**Why the studio notification is the only fatal send.** A lost enquiry is the
one unacceptable outcome. If MailerSend is down for the *client's* confirmation
the enquiry is still safely with Scotty, so that failure is logged and
swallowed. If the studio copy fails, the request returns 502 and the visitor is
told to email directly.

---

## 2. Endpoints

| Route | Method | What it does |
|---|---|---|
| `/api/enquiry/start` | POST | Step 1. Creates or updates the record, returns `{enquiryId, resumeSig}`. Sends nothing. Never 500s. |
| `/api/enquiry/submit` | POST | Step 2, multipart with up to 3 reference images (2MB each, ~4MB total). Sends, records, returns `{enquiryId}`. |
| `/api/enquiry/unsubscribe` | GET | `?e=<ref>&t=<sig>`. Marks the enquiry unsubscribed and suppresses every future follow-up. Returns a small dark confirmation page. |
| `/api/mailersend/webhook` | POST | Activity events. HMAC-verified over the raw body. |
| `/api/enquiries` | GET | Admin list. `?ref=` returns one enquiry with its timeline and email activity. |
| `/api/enquiries` | PATCH | `{ref, status}` - moves an enquiry between board columns. |
| `/api/cron/enquiry-followups` | GET | Daily at 10:00 UTC. Sends the two reminders. |

---

## 3. Setting up MailerSend

1. Add and verify the sending domain in MailerSend (SPF, DKIM, return-path).
   `MAILERSEND_FROM_EMAIL` must be on that domain or every send is rejected.
2. Create an API token with **Email: full access** and, if you want webhooks
   managed via API, **Webhooks: full access**. Put it in `MAILERSEND_API_TOKEN`.
3. Create a webhook pointing at
   `https://scottymassa.com/api/mailersend/webhook`, subscribed to
   `activity.sent`, `activity.delivered`, `activity.opened`, `activity.clicked`,
   `activity.soft_bounced` and `activity.hard_bounced`. Use **webhook version 2**.
4. Copy the webhook's signing secret into `MAILERSEND_WEBHOOK_SECRET`.
   Without it the endpoint rejects everything with 503 - it fails closed rather
   than trusting unsigned events.

Templates live in `emails/templates/` and are sent inline by default. Setting
`MAILERSEND_TEMPLATE_<NAME>` switches that one template to a MailerSend-hosted
version with the same variables. See `emails/templates/README.md`.

---

## 4. Persistence (optional)

Run `supabase/migrations/0001_enquiries.sql` against a Supabase project, then
set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

The migration is idempotent, enables row-level security with no public policy
(service role only), and creates the reference sequence behind
`next_enquiry_seq()`.

**If you never run it**, the funnel still works. Every enquiry reaches the
studio inbox with its reference and lead score. What you lose:

- the admin board (it says so plainly rather than showing an empty screen)
- lifecycle history and email-activity tracking
- the 24-hour and 4-day reminders
- sequential references - they fall back to a random 5-digit number in the
  same `SM-YYYY-NNNNN` format, and the internal email flags that the
  numbering is not contiguous

This is structural, not best-effort: every function in `api/_lib/store.js` is
wrapped so it can only resolve, never reject.

---

## 5. Lifecycle, statuses and segments

Three separate things, often confused:

**Lifecycle events** - append-only, in `enquiry_events`. An enquiry accumulates
these; it is never "in" one:
`started, step_1_completed, step_2_started, submitted, email_sent,
email_delivered, email_opened, email_clicked, reviewed, qualified, contacted,
consultation, deposit_requested, deposit_paid, booked, completed, lost`

**Board statuses** - exactly one at a time, in `enquiries.status`, in board
order: `new, reviewing, qualified, contacted, consultation, deposit, booked,
completed, lost`. The order matters: follow-up suppression asks whether a
status is "beyond reviewing" by comparing positions.

**Segments** - in `enquiries.segments`: `TATTOO_ENQUIRY`, `TATTOO_APPLICATION`,
`TATTOO_BOOKED`, `TATTOO_COMPLETED`, and the mentorship/newsletter segments
that belong to a different funnel.

> **A tattoo enquiry never receives `MENTORSHIP_LEAD`, `MENTORSHIP_CUSTOMER`
> or `NEWSLETTER`.** Someone asking about a backpiece has not asked to be sold
> a course. `addSegment()` in `api/_lib/enquiry.js` enforces this in code, not
> by convention.

---

## 6. Follow-ups, and when they stop

Two, both from the daily cron:

- **Reminder 01** - step 1 done, step 2 not, 24–48 hours later.
- **Reminder 02** - still incomplete, 4–6 days later, and only if 01 went.

A reminder is **never** sent when any of these is true, all checked by a single
`isSuppressed()` helper:

- the enquiry was submitted
- the person unsubscribed
- the status is past `reviewing` (Scotty has picked it up)
- that same reminder already went
- the address hard-bounced

Capped at 50 sends per run. **This is a sales workflow, not a newsletter.** Once
someone completes, gets a personal reply, books or pays a deposit, the
automation lets go. Adding a third reminder would be the wrong instinct.

---

## 7. The admin board

`https://scottymassa.com/admin/enquiries.html`, `noindex` and disallowed in
`robots.txt`.

Set `ADMIN_ACCESS_TOKEN` to any long random string. The board asks for it once
and keeps it in `sessionStorage` - never the URL, never `localStorage`, never a
log line. A 401 clears it.

**To rotate:** change the variable in Vercel and redeploy. Every open session
gets a 401 on its next request and is returned to the token prompt.

Nine columns, a card per enquiry, and a side panel (not a modal - the board
stays readable behind it) with the full record, the email-activity checklist,
the lifecycle timeline and a status dropdown.

**Known gap:** the board reads and re-stages enquiries. It cannot yet *send*
the six manual templates (consultation, booking confirmed, deposit reminder,
session reminder, application received). Those are built and wired but need a
send action here. That is the obvious next increment.

---

## 8. Troubleshooting

**No emails at all.** `MAILERSEND_API_TOKEN` unset or the from-address is not
on a verified domain. Check the function logs - the error is redacted but names
the status code.

**Enquiries arrive, nothing on the board.** Persistence is not configured, or
the migration has not been run. The board tells you which.

**Webhook returns 401.** The signature is computed over the raw body. If
something re-serialises the request before it reaches the handler the HMAC will
not match. `config.api.bodyParser` must stay `false`.

**Webhook returns 503.** `MAILERSEND_WEBHOOK_SECRET` is unset. Deliberate.

**Reminders never send.** `CRON_SECRET` unset (the job answers 503), or
persistence is off (there is nothing to query), or every candidate is
suppressed - the run logs what it skipped.

**Two records for one person.** A resume link could not be verified, so the
server refused to trust a client-supplied reference and created a new record.
Usually `ENQUIRY_LINK_SECRET` was rotated after the link was sent.

**References not attached.** Over 2MB each, more than 3 files, ~4MB combined, or
not an `image/*` type. The form says so before submitting; the server enforces
it again.
