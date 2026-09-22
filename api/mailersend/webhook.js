'use strict';

// MailerSend activity webhook.
//
// MailerSend signs the RAW request body with HMAC-SHA256 (hex) and sends the
// digest in the `signature` header, so the body parser is switched off below
// and the stream is read by hand — re-serialising the parsed JSON would not
// reproduce the bytes that were signed.
//
// Once the signature verifies we always answer 200, even when our own writes
// fail, because MailerSend retries anything else and a retry storm helps
// nobody. Failures are logged instead.

const crypto = require('crypto');
const store = require('../_lib/store');
const { SUBJECTS } = require('../_lib/templates');
const { readRawBody, timingSafeCompare } = require('../_lib/util');

const MAX_BODY_BYTES = 1024 * 1024;
const REF_TAG = /^ref:(SM-\d{4}-\d{1,6})$/i;

// sent → email_sent, and so on. Anything not listed is acknowledged and
// ignored (contract §14).
const EVENT_MAP = {
  sent: 'email_sent',
  delivered: 'email_delivered',
  opened: 'email_opened',
  clicked: 'email_clicked',
  soft_bounced: null,
  hard_bounced: null,
};

// A delivery is either one event, a top-level array of them, or a v2 batch
// with the events under `data`. A single event also has a `data` key, but it
// holds one activity object rather than an array — hence the Array check.
function extractEvents(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.data)) return payload.data;
  return [payload];
}

function normalise(event) {
  if (!event || typeof event !== 'object') return null;

  const activity = event.data && typeof event.data === 'object' && !Array.isArray(event.data)
    ? event.data
    : event;
  const rawType = String(event.type || activity.type || '');
  const type = rawType.replace(/^activity\./, '');
  if (!type) return null;

  const email = (activity.email && typeof activity.email === 'object') ? activity.email : {};
  const recipient = (email.recipient && typeof email.recipient === 'object') ? email.recipient : {};
  const tags = Array.isArray(email.tags) ? email.tags : [];

  return {
    type: type,
    messageId: email.id || activity.id || event.webhook_id || '',
    recipient: typeof recipient.email === 'string' ? recipient.email : '',
    subject: typeof email.subject === 'string' ? email.subject : '',
    tags: tags,
    occurredAt: event.created_at || activity.created_at || email.created_at || new Date().toISOString(),
  };
}

function refFromTags(tags) {
  for (let i = 0; i < tags.length; i += 1) {
    const match = REF_TAG.exec(String(tags[i] || ''));
    if (match) return match[1].toUpperCase();
  }
  return '';
}

// Nine of the ten subjects are fixed strings, so an exact match identifies
// the template without needing a tag slot we do not have to spare.
let subjectIndex = null;
function templateFromSubject(subject) {
  if (!subject) return '';
  if (!subjectIndex) {
    subjectIndex = Object.create(null);
    const map = SUBJECTS || {};
    Object.keys(map).forEach((name) => {
      const value = map[name];
      if (typeof value === 'string' && value.indexOf('{{') === -1) subjectIndex[value] = name;
    });
  }
  return subjectIndex[subject] || '';
}

async function resolveRef(event) {
  const tagged = refFromTags(event.tags);
  if (tagged) return tagged;
  if (!event.recipient || !store.isConfigured()) return '';
  // The tag is the reliable path; matching on the recipient address is the
  // fallback for mail sent before the ref tag existed. Feature-detected so a
  // store without it degrades to an unmatched activity row rather than
  // throwing on every delivery.
  if (typeof store.findEnquiryByEmail !== 'function') return '';
  try {
    const match = await store.findEnquiryByEmail(event.recipient);
    return (match && match.enquiry_ref) || '';
  } catch (err) {
    console.warn('[mailersend/webhook] could not match ' + event.type + ' to an enquiry by email');
    return '';
  }
}

async function handleEvent(event) {
  if (!Object.prototype.hasOwnProperty.call(EVENT_MAP, event.type)) return 'ignored';

  const ref = await resolveRef(event);
  const template = templateFromSubject(event.subject);

  if (!store.isConfigured()) return 'unstored';

  await store.recordEmailActivity({
    enquiry_ref: ref || null,
    email: event.recipient,
    template: template,
    message_id: event.messageId,
    event_type: event.type,
    occurred_at: event.occurredAt,
    raw: event.raw,
  });

  if (!ref) return 'unmatched';

  const lifecycle = EVENT_MAP[event.type];
  if (lifecycle) await store.recordEvent(ref, lifecycle, { template: template, message_id: event.messageId });

  // A hard bounce means the address is dead — flag it, which suppresses
  // every follow-up for this enquiry (contract §12).
  if (event.type === 'hard_bounced') await store.updateEnquiry(ref, { email_status: 'hard_bounced' });

  return 'recorded';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return;
  }

  const secret = process.env.MAILERSEND_WEBHOOK_SECRET;
  if (!secret) {
    // Never accept an unsigned event.
    console.error('[mailersend/webhook] MAILERSEND_WEBHOOK_SECRET is not set — rejecting the delivery');
    res.status(503).json({ ok: false, error: 'Webhook is not configured.' });
    return;
  }

  let raw;
  try {
    raw = await readRawBody(req, MAX_BODY_BYTES);
  } catch (err) {
    res.status(400).json({ ok: false, error: 'Could not read the request body.' });
    return;
  }

  const provided = req.headers.signature || req.headers['x-mailersend-signature'] || '';
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  if (!provided || !timingSafeCompare(String(provided), expected)) {
    res.status(401).json({ ok: false, error: 'Invalid signature.' });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch (err) {
    // Signed but unreadable: acknowledge so it is not retried forever.
    console.error('[mailersend/webhook] signed payload was not valid JSON');
    res.status(200).json({ ok: true, handled: 0 });
    return;
  }

  let handled = 0;
  try {
    const events = extractEvents(payload);
    for (let i = 0; i < events.length; i += 1) {
      const event = normalise(events[i]);
      if (!event) continue;
      event.raw = events[i];
      try {
        const outcome = await handleEvent(event);
        if (outcome === 'recorded') handled += 1;
      } catch (err) {
        console.error('[mailersend/webhook] could not record a ' + event.type + ' event', err);
      }
    }
  } catch (err) {
    console.error('[mailersend/webhook] failed while processing a verified delivery', err);
  }

  res.status(200).json({ ok: true, handled: handled });
};

// Assigned AFTER the handler: `module.exports = fn` above replaces the whole
// object, so setting this any earlier would silently lose it and Vercel would
// parse the body out from under the signature check.
module.exports.config = { api: { bodyParser: false } };
