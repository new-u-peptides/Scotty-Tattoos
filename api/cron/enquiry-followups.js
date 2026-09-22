'use strict';

// Daily follow-up sweep, registered in vercel.json at 10:00 UTC.
//
//   SM_ENQUIRY_REMINDER_01 — step 1 finished 24–48h ago, never submitted
//   SM_ENQUIRY_REMINDER_02 — step 1 finished 4–6 days ago, never submitted,
//                            reminder 01 already sent
//
// Two enquiries, two emails, then silence. isSuppressed() is the single gate
// that decides whether a given reminder may go out at all (contract §12), and
// it is applied here as well as in the store query — the brief is explicit
// that this must not turn into automation that badgers people.

const store = require('../_lib/store');
const {
  isSuppressed,
  signRef,
  resumeUrl,
  unsubscribeUrl,
  projectSlug,
  PRIVACY_URL,
  REMINDER_COLUMNS,
} = require('../_lib/enquiry');
const { sendTemplateEmail } = require('../_lib/mailersend');
const { renderSubject } = require('../_lib/templates');
const { timingSafeCompare } = require('../_lib/util');

const SEND_CAP = 50;
const STUDIO_REPLY_TO = 'studio@scottymassa.com';

// `stage` names the timestamp column the window is measured against, not the
// template — both reminders are counted from the moment step 1 was completed.
const REMINDERS = [
  { template: 'SM_ENQUIRY_REMINDER_01', stage: 'step1_at', minHours: 24, maxHours: 48, requires: '' },
  // 4–6 days, and only once reminder 01 has actually gone out: if the first
  // one failed to send, the second must not arrive as the only follow-up.
  { template: 'SM_ENQUIRY_REMINDER_02', stage: 'step1_at', minHours: 96, maxHours: 144, requires: 'SM_ENQUIRY_REMINDER_01' },
];

// Whether a given template has already reached this enquiry. Mirrors the test
// isSuppressed() makes internally; used here for the ordering prerequisite
// above, which is a scheduling rule rather than a suppression rule.
function hasSent(enquiry, template) {
  const column = REMINDER_COLUMNS[template];
  if (column && enquiry[column]) return true;
  return Array.isArray(enquiry.emails_sent) && enquiry.emails_sent.indexOf(template) !== -1;
}

function variablesFor(template, enquiry, links) {
  const base = {
    first_name: enquiry.first_name || '',
    // "Continue your enquiry" — straight back to step 2 with step 1 prefilled.
    booking_url: links.resume,
    privacy_url: PRIVACY_URL,
    unsubscribe_url: links.unsubscribe,
  };
  if (template === 'SM_ENQUIRY_REMINDER_01') base.project_type = enquiry.project_type || '';
  return base;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return;
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron/enquiry-followups] CRON_SECRET is not set — refusing to run');
    res.status(503).json({ ok: false, error: 'Cron is not configured.' });
    return;
  }
  if (!timingSafeCompare(String(req.headers.authorization || ''), 'Bearer ' + secret)) {
    res.status(401).json({ ok: false, error: 'Not authorised.' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');

  if (!store.isConfigured()) {
    res.status(200).json({ ok: true, sent: {}, note: 'store not configured' });
    return;
  }

  const sent = {};
  const skipped = {};
  let failed = 0;
  let budget = SEND_CAP;

  try {
    for (let i = 0; i < REMINDERS.length; i += 1) {
      const reminder = REMINDERS[i];
      sent[reminder.template] = 0;
      skipped[reminder.template] = 0;

      let candidates = [];
      try {
        candidates = await store.findFollowupCandidates({
          stage: reminder.stage,
          minHours: reminder.minHours,
          maxHours: reminder.maxHours,
        });
      } catch (err) {
        console.error('[cron/enquiry-followups] could not list candidates for ' + reminder.template, err);
        continue;
      }
      if (!Array.isArray(candidates)) candidates = [];

      for (let j = 0; j < candidates.length; j += 1) {
        if (budget <= 0) {
          console.warn('[cron/enquiry-followups] hit the ' + SEND_CAP + '-send cap; ' +
            (candidates.length - j) + ' ' + reminder.template + ' candidates left for the next run');
          break;
        }

        const enquiry = candidates[j];
        const ref = enquiry && enquiry.enquiry_ref;
        if (!ref || !enquiry.email) {
          skipped[reminder.template] += 1;
          continue;
        }

        if (reminder.requires && !hasSent(enquiry, reminder.requires)) {
          skipped[reminder.template] += 1;
          console.log('[cron/enquiry-followups] skipping ' + reminder.template + ' for ' + ref +
            ' — ' + reminder.requires + ' never went out');
          continue;
        }

        // isSuppressed returns a short reason string when the reminder must
        // not go out, or false when it may. A check that cannot run at all is
        // treated as "do not send" — an unwanted reminder costs more than a
        // missed one.
        let suppressed;
        try {
          suppressed = isSuppressed(enquiry, reminder.template);
        } catch (err) {
          suppressed = 'suppression check failed';
        }
        if (suppressed) {
          skipped[reminder.template] += 1;
          console.log('[cron/enquiry-followups] skipping ' + reminder.template + ' for ' + ref +
            ' — ' + suppressed);
          continue;
        }

        const sig = signRef(ref);
        const links = {
          resume: resumeUrl({
            ref: ref,
            sig: sig,
            projectSlug: projectSlug(enquiry.project_type),
            firstName: enquiry.first_name || '',
            email: enquiry.email,
            step: 2,
          }),
          unsubscribe: unsubscribeUrl({ ref: ref, sig: sig }),
        };
        const variables = variablesFor(reminder.template, enquiry, links);

        try {
          await sendTemplateEmail({
            template: reminder.template,
            to: enquiry.email,
            subject: renderSubject(reminder.template, variables),
            variables: variables,
            tags: ['ref:' + ref],
            replyTo: STUDIO_REPLY_TO,
          });
          budget -= 1;
          sent[reminder.template] += 1;
        } catch (err) {
          failed += 1;
          console.error('[cron/enquiry-followups] failed to send ' + reminder.template + ' to ' + ref, err);
          continue;
        }

        // Stamped at send time rather than waiting for the webhook, because
        // isSuppressed() reads this to decide whether a reminder has already
        // gone out. Without it a deployment with no webhook wired up would
        // send the same reminder every single day.
        try {
          await store.markEmailSent(ref, reminder.template);
          await store.recordEvent(ref, 'email_sent', { template: reminder.template });
        } catch (err) {
          console.error('[cron/enquiry-followups] sent ' + reminder.template + ' to ' + ref +
            ' but could not record it — it risks being sent again on the next run', err);
        }
      }
    }
  } catch (err) {
    console.error('[cron/enquiry-followups] run failed part way through', err);
  }

  res.status(200).json({ ok: true, sent: sent, skipped: skipped, failed: failed });
};
