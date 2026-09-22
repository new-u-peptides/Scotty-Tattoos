# Transactional email templates

Ten templates, one shell. The shell is byte-identical across all of them so
the system reads as one designed thing; only the body block differs.

Rendered by `api/_lib/templates.js`, sent by `api/_lib/mailersend.js`.

## How a template is chosen

For each template the sender checks `MAILERSEND_TEMPLATE_<NAME>`:

- **set** — sends via MailerSend's hosted template with that ID, passing the
  variables below as `personalization`. Use this if Scotty wants to edit copy
  in the MailerSend UI.
- **unset** (the default) — renders the `.html` file in this directory and
  sends it inline, with a generated plain-text alternative.

Either way the variable names are the same, so switching is a config change
with no code change.

## Template syntax

| Syntax | Meaning |
|---|---|
| `{{var}}` | HTML-escaped value. Use this for everything from a form. |
| `{{{var}}}` | Raw — only for values the caller has already escaped (`escapeMultiline` output). |
| `{{#var}}…{{/var}}` | Render the block only when `var` is truthy. Used so empty fields vanish rather than leaving a blank row. |

An absent variable renders as an empty string — never `undefined`, never the
literal `{{var}}`.

## Design

Black `#0A0A0A` ground, card `#121212`, headings `#F5F2EC`, body `#C8C5BF`,
gold `#E8B653` for accents and links, red `#C8102E` on the single CTA and
nowhere else. The SM monogram is a bordered table cell containing the letters,
not an image, so it renders in Outlook and in an inbox with images blocked.
Dark values are restated under `prefers-color-scheme: light` with `!important`
so light-mode clients don't invert the design. One media query at 600px.

## The templates

| Name | Trigger | Subject |
|---|---|---|
| `SM_ENQUIRY_RECEIVED` | Step 2 submitted | Your Scotty Massa enquiry |
| `SM_ENQUIRY_PROCESS` | ~15 min after submission (MailerSend `send_at`) | How tattooing with Scotty works |
| `SM_ENQUIRY_REMINDER_01` | Step 1 done, step 2 not, 24–48h later (cron) | Still thinking about your tattoo? |
| `SM_ENQUIRY_REMINDER_02` | Still incomplete, 4–6 days later (cron) | Your tattoo project |
| `SM_ENQUIRY_APPLICATION_RECEIVED` | Manual / alternate confirmation | Your enquiry is with Scotty |
| `SM_ENQUIRY_CONSULTATION` | Manual, when Scotty wants to talk | Let's talk about your piece |
| `SM_BOOKING_CONFIRMED` | Manual, once a session is set | Your session is booked |
| `SM_DEPOSIT_REMINDER` | Manual, deposit outstanding | Securing your session |
| `SM_SESSION_REMINDER` | Manual, ahead of a session | Your session with Scotty |
| `SM_INTERNAL_NEW_ENQUIRY` | Step 2 submitted → studio inbox | New tattoo enquiry · {{project_type}} · {{first_name}} |

Templates marked **manual** are wired and ready but nothing calls them
automatically yet — they need a trigger from the admin board, which is the
obvious next step.

## Variables

Every template also takes `privacy_url` and `unsubscribe_url`, used by the
footer.

| Template | Variables |
|---|---|
| `SM_ENQUIRY_RECEIVED` | `first_name`, `project_type`, `studio_location`, `booking_url`, `enquiry_ref` |
| `SM_ENQUIRY_PROCESS` | `first_name`, `booking_url` |
| `SM_ENQUIRY_REMINDER_01` | `first_name`, `project_type`, `booking_url` |
| `SM_ENQUIRY_REMINDER_02` | `first_name`, `booking_url` |
| `SM_ENQUIRY_APPLICATION_RECEIVED` | `first_name`, `project_type`, `enquiry_ref` |
| `SM_ENQUIRY_CONSULTATION` | `first_name`, `consultation_url` |
| `SM_BOOKING_CONFIRMED` | `first_name`, `session_date`, `session_time`, `studio_location`, `deposit_amount` |
| `SM_DEPOSIT_REMINDER` | `first_name`, `deposit_amount`, `deposit_url` |
| `SM_SESSION_REMINDER` | `first_name`, `session_date`, `session_time`, `studio_location`, `aftercare_url` |
| `SM_INTERNAL_NEW_ENQUIRY` | `first_name`, `last_name`, `email`, `country`, `location`, `project_type`, `scale`, `placement`, `existing_tattoos`, `preferred_timing`, `instagram`, `heard_from`, `reference_count`, `message`, `additional_info`, `utm_source`, `utm_campaign`, `landing_page`, `submitted_at`, `enquiry_ref`, `lead_score`, `lead_label`, `admin_url` |

## Tags

Every send carries `tattoo`, `enquiry`, `transactional` and
`ref:SM-YYYY-NNNNN`. Booking-stage templates add `booking`. MailerSend allows
five tags maximum — the ref tag is what lets the webhook attribute an open or
a click back to a specific enquiry, so it is never the one dropped.

## Editing

Copy lives in the HTML. If you change a variable name here, change it in
`api/_lib/templates.js` (`SUBJECTS`) and wherever the sender builds the
variables object — a renamed variable renders as an empty gap, silently.

To preview one:

```bash
node -e "
const t = require('./api/_lib/templates.js');
process.stdout.write(t.renderEmail('SM_ENQUIRY_RECEIVED', {
  first_name: 'Ada', project_type: 'Backpiece', booking_url: '#',
  studio_location: 'Birkirkara, Malta', enquiry_ref: 'SM-2026-00142',
  privacy_url: '#', unsubscribe_url: '#'
}).html);" > /tmp/preview.html
```
