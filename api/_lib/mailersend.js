'use strict';

// The only outbound email path in this repository.
//
// A plain fetch wrapper rather than the SDK: one HTTP call does not justify a
// dependency in a serverless bundle, and keeping it here means swapping
// providers again is one file, as it was when this replaced Resend.
//
// Two invariants this module is responsible for:
//   1. MAILERSEND_API_TOKEN never appears in a log line, an Error message or
//      anything returned to a caller. Provider bodies are redacted before they
//      are touched, and the Error the caller sees carries no provider text at
//      all — only a status code and the template name.
//   2. The enquiry reference always rides along as a MailerSend tag, because
//      the webhook has nothing else reliable to match an activity event back
//      to an enquiry.

const { renderEmail, renderSubject } = require('./templates');
const { cleanText, redact, truncate } = require('./util');

const MAILERSEND_API_URL = 'https://api.mailersend.com/v1/email';

// Read once and exported for the webhook and for diagnostics. The send call
// itself does not need it — the sending domain is implied by the from address.
const MAILERSEND_DOMAIN_ID = process.env.MAILERSEND_DOMAIN_ID || '';

const BASE_TAGS = Object.freeze(['tattoo', 'enquiry', 'transactional']);

// These four are about a confirmed piece of work rather than an enquiry, and
// carry the extra 'booking' tag so the studio can filter them in MailerSend.
const BOOKING_TEMPLATES = new Set([
  'SM_BOOKING_CONFIRMED',
  'SM_DEPOSIT_REMINDER',
  'SM_SESSION_REMINDER',
  'SM_ENQUIRY_CONSULTATION',
]);

const MAX_TAGS = 5;                       // MailerSend's hard limit
const SEND_AT_MAX_AHEAD_SECONDS = 72 * 60 * 60; // MailerSend caps scheduling at 72h
const REQUEST_TIMEOUT_MS = 10000;
const TAG_SAFE_RE = /[^A-Za-z0-9_:.-]+/g;

function isConfigured() {
  return Boolean(process.env.MAILERSEND_API_TOKEN && process.env.MAILERSEND_FROM_EMAIL);
}

// ---------------------------------------------------------------------------
// Payload assembly
// ---------------------------------------------------------------------------

function toRecipients(to) {
  const list = Array.isArray(to) ? to : [to];
  const out = [];
  for (const item of list) {
    if (!item) continue;
    if (typeof item === 'string') {
      const email = cleanText(item, 254);
      if (email) out.push({ email });
    } else if (typeof item === 'object' && item.email) {
      const email = cleanText(item.email, 254);
      if (!email) continue;
      const name = cleanText(item.name, 120);
      out.push(name ? { email, name } : { email });
    }
  }
  return out;
}

function cleanTag(value) {
  return cleanText(value, 60).replace(TAG_SAFE_RE, '-').replace(/^-+|-+$/g, '');
}

// Tag order is a priority order, because MailerSend accepts at most five and
// silently rejects the whole send if given more. The three base tags identify
// the stream, `ref:…` is what the webhook resolves an enquiry from, and
// 'booking' (or one caller-supplied extra) takes the last slot. A caller's
// sixth tag is dropped rather than risking the send.
function buildTags(template, tags, variables) {
  const supplied = (Array.isArray(tags) ? tags : []).map(cleanTag).filter(Boolean);

  const fromCaller = supplied.find((tag) => tag.toLowerCase().indexOf('ref:') === 0) || '';
  const fromVariables = variables && variables.enquiry_ref ? 'ref:' + cleanTag(variables.enquiry_ref) : '';
  const refTag = fromCaller || (fromVariables !== 'ref:' ? fromVariables : '');

  const ordered = BASE_TAGS.slice();
  if (refTag) ordered.push(refTag);
  if (BOOKING_TEMPLATES.has(template)) ordered.push('booking');
  for (const tag of supplied) {
    if (ordered.indexOf(tag) === -1) ordered.push(tag);
  }

  const unique = [];
  for (const tag of ordered) {
    if (unique.indexOf(tag) === -1) unique.push(tag);
    if (unique.length === MAX_TAGS) break;
  }
  return unique;
}

function toAttachments(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) return null;
  const out = [];
  for (const file of attachments) {
    if (!file || !file.content) continue;
    out.push({
      filename: cleanText(file.filename, 200) || 'attachment',
      content: Buffer.isBuffer(file.content) ? file.content.toString('base64') : String(file.content),
      disposition: file.disposition === 'inline' ? 'inline' : 'attachment',
    });
  }
  return out.length ? out : null;
}

// MailerSend rejects a send_at more than 72h out and treats one in the past as
// an error, so a stale value is clamped forward and an elapsed one is dropped —
// a delayed email arriving immediately is better than not arriving.
function normaliseSendAt(sendAt) {
  const seconds = Math.floor(Number(sendAt));
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  const now = Math.floor(Date.now() / 1000);
  if (seconds <= now) return 0;
  return Math.min(seconds, now + SEND_AT_MAX_AHEAD_SECONDS);
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

function sendError(message, status, detail) {
  // The message is safe to surface anywhere; the provider's own words live on
  // `detail` (already redacted) for the log only. Keeping them off `.message`
  // means a handler that carelessly echoes err.message still cannot leak them.
  const err = new Error(message);
  err.provider = 'mailersend';
  if (status) err.status = status;
  if (detail) err.detail = detail;
  return err;
}

async function sendTemplateEmail(options) {
  const opts = options || {};
  const token = process.env.MAILERSEND_API_TOKEN;
  const fromEmail = cleanText(process.env.MAILERSEND_FROM_EMAIL, 254);
  const fromName = cleanText(process.env.MAILERSEND_FROM_NAME, 120) || 'Scotty Massa';

  if (!token || !fromEmail) {
    throw sendError('Email is not configured: set MAILERSEND_API_TOKEN and MAILERSEND_FROM_EMAIL.');
  }

  const template = cleanText(opts.template, 64);
  if (!template) throw sendError('sendTemplateEmail needs a template name.');

  const recipients = toRecipients(opts.to);
  if (!recipients.length) throw sendError('sendTemplateEmail needs a recipient for ' + template + '.');

  const variables = opts.variables || {};
  const subject = cleanText(opts.subject, 200) || renderSubject(template, variables);
  if (!subject) throw sendError('No subject configured for email template "' + template + '".');

  const payload = {
    from: { email: fromEmail, name: fromName },
    to: recipients,
    subject,
    tags: buildTags(template, opts.tags, variables),
  };

  // A MailerSend-hosted template wins when one is configured for this name, so
  // the studio can edit copy in the dashboard without a deploy. In that mode we
  // send no inline html at all — MailerSend renders its own and would ignore or
  // conflict with ours.
  const hostedTemplateId = cleanText(process.env['MAILERSEND_TEMPLATE_' + template], 64);
  if (hostedTemplateId) {
    payload.template_id = hostedTemplateId;
    payload.personalization = recipients.map((recipient) => ({
      email: recipient.email,
      data: variables,
    }));
  } else {
    const rendered = renderEmail(template, variables);
    payload.html = rendered.html;
    payload.text = rendered.text;
  }

  if (opts.replyTo) {
    const replyEmail = cleanText(typeof opts.replyTo === 'string' ? opts.replyTo : opts.replyTo.email, 254);
    if (replyEmail) {
      const replyName = typeof opts.replyTo === 'object' ? cleanText(opts.replyTo.name, 120) : '';
      payload.reply_to = replyName ? { email: replyEmail, name: replyName } : { email: replyEmail };
    }
  }

  const attachments = toAttachments(opts.attachments);
  if (attachments) payload.attachments = attachments;

  const sendAt = normaliseSendAt(opts.sendAt);
  if (sendAt) payload.send_at = sendAt;

  // An unbounded fetch can hold a serverless function open until the platform
  // kills it, which turns a slow provider into a 504 on the client's form.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(MAILERSEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    const detail = truncate(redact(err && err.message), 200);
    console.error('[mailersend] request failed for ' + template + ':', detail);
    throw sendError('Could not reach the email provider for ' + template + '.', 0, detail);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const detail = truncate(redact(body), 400);
    console.error('[mailersend] ' + template + ' rejected with HTTP ' + response.status + ':', detail);
    throw sendError('Email provider rejected ' + template + ' (HTTP ' + response.status + ').', response.status, detail);
  }

  // MailerSend answers 202 with an empty body; the id is in the header, and the
  // webhook needs it to tie activity back to this send.
  return {
    ok: true,
    template,
    subject,
    status: response.status,
    messageId: response.headers.get('x-message-id') || '',
  };
}

module.exports = {
  sendTemplateEmail,
  isConfigured,
  MAILERSEND_DOMAIN_ID,
};
