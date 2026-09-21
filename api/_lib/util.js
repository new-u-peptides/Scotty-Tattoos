'use strict';

// Shared, dependency-free helpers for every serverless handler.
//
// Two rules govern everything in here:
//   1. Nothing throws on bad input. A handler that receives junk should be
//      able to validate and answer 400 — it should never fall over parsing.
//   2. Nothing in here ever touches the network or the filesystem, so it is
//      safe to require from anywhere without slowing a cold start.

const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value.trim());
}

// Single-line fields (names, phone numbers, select values) — strips
// newlines/control characters so nothing can smuggle extra lines into an
// email subject or a rendered table row.
function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(/[\r\n\t\x00-\x1F\x7F]+/g, ' ').trim();
  return maxLength ? stripped.slice(0, maxLength) : stripped;
}

// Multi-line fields (textareas) — keeps real newlines but strips other
// control characters.
function cleanMultiline(value, maxLength) {
  if (typeof value !== 'string') return '';
  const stripped = value
    .replace(/\r\n/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]+/g, '')
    .trim();
  return maxLength ? stripped.slice(0, maxLength) : stripped;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escape + preserve line breaks, for dropping multiline fields into HTML email.
function escapeMultiline(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

// ---------------------------------------------------------------------------
// Logging / diagnostics
// ---------------------------------------------------------------------------

function truncate(value, maxLength) {
  const text = String(value == null ? '' : value);
  const cap = typeof maxLength === 'number' && maxLength > 0 ? maxLength : 200;
  return text.length > cap ? text.slice(0, cap) + '…' : text;
}

// The single choke point that keeps credentials out of the log drain.
//
// Provider error bodies and fetch failures have a habit of echoing the request
// (headers included) back at us, and anything written to console on Vercel is
// retained and readable long after the incident. Every error detail that comes
// off the wire goes through here before it is logged or attached to an Error.
// Matching on the live env values means this keeps working when a token is
// rotated — there is no pattern list to keep in sync.
function redact(value) {
  let out = String(value == null ? '' : value);
  const secrets = [
    process.env.MAILERSEND_API_TOKEN,
    process.env.MAILERSEND_WEBHOOK_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.ENQUIRY_LINK_SECRET,
    process.env.ADMIN_ACCESS_TOKEN,
    process.env.CRON_SECRET,
  ];
  for (const secret of secrets) {
    // Short values would match far too much ordinary text; a real token is long.
    if (typeof secret === 'string' && secret.length >= 8) {
      out = out.split(secret).join('[redacted]');
    }
  }
  // Catch bearer tokens we never held in an env var of our own (a third-party
  // header echoed back, a proxy's own credential).
  return out.replace(/(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[redacted]');
}

// ---------------------------------------------------------------------------
// Comparison / coercion
// ---------------------------------------------------------------------------

// Constant-time comparison that tolerates different lengths.
//
// crypto.timingSafeEqual throws when the two buffers differ in length, and the
// throw itself leaks the length of the secret. Hashing both sides first gives
// timingSafeEqual two 32-byte buffers every time, so the comparison is constant
// time and the function is total. Used for link signatures and admin tokens.
function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  try {
    const left = crypto.createHash('sha256').update(a, 'utf8').digest();
    const right = crypto.createHash('sha256').update(b, 'utf8').digest();
    return crypto.timingSafeEqual(left, right);
  } catch (err) {
    return false;
  }
}

function clampInt(value, min, max, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

// Checkboxes arrive as the string 'true' from JSON and as 'on' from a raw
// multipart POST, depending on how the browser serialised the form.
function toBool(value) {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  const normalised = value.trim().toLowerCase();
  return normalised === 'true' || normalised === 'on' || normalised === '1' || normalised === 'yes';
}

function nowIso() {
  return new Date().toISOString();
}

// `2026-09-21 14:32 UTC` — the stamp format the internal notification email
// uses. Explicitly UTC because the studio reads these from two timezones and
// a bare local time would be ambiguous. An empty/absent value means "now",
// which is what every caller wants when stamping a submission.
function formatUtcTimestamp(value) {
  const date = value instanceof Date
    ? value
    : (value == null || value === '' ? new Date() : new Date(value));
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return date.getUTCFullYear()
    + '-' + pad(date.getUTCMonth() + 1)
    + '-' + pad(date.getUTCDate())
    + ' ' + pad(date.getUTCHours())
    + ':' + pad(date.getUTCMinutes())
    + ' UTC';
}

// ---------------------------------------------------------------------------
// Raw request bodies
// ---------------------------------------------------------------------------

// Vercel parses JSON bodies for us, but a webhook signature is computed over
// the RAW bytes — re-serialising the parsed object changes key order and
// whitespace, and the HMAC no longer matches. Handlers that verify a signature
// must export `config = { api: { bodyParser: false } }` and read the stream
// through here. (If the body parser is left on, the stream is already drained
// and this resolves to an empty buffer, which fails the signature check
// closed — the safe direction.)
function readRawBody(req, maxBytes) {
  const cap = typeof maxBytes === 'number' && maxBytes > 0 ? maxBytes : 1024 * 1024;

  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body, 'utf8'));

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    function fail(err) {
      if (settled) return;
      settled = true;
      reject(err);
    }

    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > cap) {
        const err = new Error('Request body too large.');
        err.statusCode = 413;
        fail(err);
        if (typeof req.destroy === 'function') req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks, size));
    });

    req.on('error', fail);
  });
}

module.exports = {
  isValidEmail,
  cleanText,
  cleanMultiline,
  escapeHtml,
  escapeMultiline,
  truncate,
  redact,
  timingSafeCompare,
  clampInt,
  toBool,
  nowIso,
  formatUtcTimestamp,
  readRawBody,
};
