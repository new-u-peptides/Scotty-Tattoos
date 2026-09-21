'use strict';

// Supabase persistence, over the PostgREST endpoint with plain fetch — no SDK,
// so the function bundle stays small and there is nothing to keep up to date.
//
// THE RULE THAT SHAPES THIS WHOLE FILE: the store is optional. A deployment
// with no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must keep taking enquiries
// and keep sending email; it simply has no board and no follow-ups. That is
// not a best-effort promise, it is structural — every exported function is
// wrapped by guarded() below, which owns the returned promise and can only
// resolve, never reject. There is no path out of this module that can take a
// handler down, so callers deal with exactly one degraded case: null (or an
// empty list) means "not recorded, carry on".
//
// The service role key bypasses row-level security, which is why it only ever
// exists server-side and why no query built here is ever logged: a PostgREST
// query string carries email addresses.

const { newEnquiryRef, STATUSES } = require('./enquiry');
const { cleanText, clampInt, redact, truncate, nowIso } = require('./util');

const TABLE_ENQUIRIES = 'enquiries';
const TABLE_EVENTS = 'enquiry_events';
const TABLE_EMAIL_ACTIVITY = 'enquiry_email_activity';

const REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_LIST_LIMIT = 200;
const MAX_LIST_LIMIT = 500;
const MAX_CANDIDATES = 200;

// Columns the API is allowed to write. An unknown key makes PostgREST reject
// the whole statement with a 400, which would lose the enquiry over a stray
// camelCase field; filtering here means a caller can hand over a slightly
// wider object and still have the row land.
const ENQUIRY_COLUMNS = new Set([
  'enquiry_ref', 'status', 'segments',
  'first_name', 'last_name', 'email', 'country', 'instagram',
  'project_type', 'scale', 'idea', 'placement', 'existing_tattoos',
  'preferred_timing', 'heard_from', 'additional_info', 'reference_count',
  'lead_score', 'lead_label',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'landing_page', 'referrer',
  'email_status', 'emails_sent',
  'step1_at', 'submitted_at', 'reviewed_at', 'unsubscribed_at',
  'reminder_01_sent_at', 'reminder_02_sent_at',
  'created_at', 'updated_at',
]);

const EMAIL_ACTIVITY_COLUMNS = new Set([
  'enquiry_ref', 'email', 'template', 'message_id', 'event_type', 'occurred_at', 'raw',
]);

// Which timestamp a follow-up window is measured from.
const STAGE_COLUMNS = Object.freeze({
  step1: 'step1_at',
  step_1: 'step1_at',
  step1_at: 'step1_at',
  submitted: 'submitted_at',
  submitted_at: 'submitted_at',
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function credentials() {
  const url = cleanText(process.env.SUPABASE_URL, 300).replace(/\/+$/, '');
  const key = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY, 2000);
  if (!url || !key) return null;
  return { url, key };
}

function isConfigured() {
  return credentials() !== null;
}

let warnedUnconfigured = false;

// Once per cold start, not once per call: an email-only deployment is a
// legitimate configuration, not an incident, and a warning per enquiry would
// bury the logs that matter.
function warnUnconfigured() {
  if (warnedUnconfigured) return;
  warnedUnconfigured = true;
  console.warn('[store] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — running email-only: enquiries are emailed but not recorded, and the admin board and follow-ups are inactive.');
}

function logFailure(operation, err) {
  const detail = truncate(redact(err && (err.detail || err.message)), 300);
  console.error('[store] ' + operation + ' failed:', detail);
}

const NONE = () => null;
const EMPTY_LIST = () => [];

// The containment wrapper. Anything an exported function can do wrong — an
// unconfigured environment, a synchronous throw while building a query, a
// rejected fetch, a 500 from PostgREST — comes out here as the fallback value.
function guarded(operation, fallback, fn) {
  return function guardedCall(...args) {
    const creds = credentials();
    if (!creds) {
      warnUnconfigured();
      return Promise.resolve(fallback());
    }
    let result;
    try {
      result = fn(creds, ...args);
    } catch (err) {
      logFailure(operation, err);
      return Promise.resolve(fallback());
    }
    return Promise.resolve(result).catch((err) => {
      logFailure(operation, err);
      return fallback();
    });
  };
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

// `resource` is a table name plus its query string. Only the table name is
// ever logged — the query holds email addresses and references.
async function request(creds, method, resource, options) {
  const opts = options || {};
  const table = resource.split('?')[0];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(creds.url + '/rest/v1/' + resource, {
      method,
      headers: {
        apikey: creds.key,
        Authorization: 'Bearer ' + creds.key,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Prefer: opts.prefer || 'return=representation',
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch (err) {
    const wrapped = new Error('Supabase ' + method + ' ' + table + ' did not complete.');
    wrapped.detail = truncate(redact(err && err.message), 200);
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const wrapped = new Error('Supabase ' + method + ' ' + table + ' returned HTTP ' + response.status + '.');
    wrapped.detail = truncate(redact(body), 300);
    throw wrapped;
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function firstRow(rows) {
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function pick(row, allowed) {
  const out = {};
  if (!row || typeof row !== 'object') return out;
  for (const key of Object.keys(row)) {
    if (allowed.has(key) && row[key] !== undefined) out[key] = row[key];
  }
  return out;
}

function refFilter(ref) {
  return 'enquiry_ref=eq.' + encodeURIComponent(cleanText(ref, 40));
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

// Returns a complete `SM-YYYY-NNNNN` built from the database sequence, or null
// when there is no database — in which case the caller falls back to
// newEnquiryRef(null) and gets a non-sequential ref.
const nextRef = guarded('nextRef', NONE, async (creds) => {
  const value = await request(creds, 'POST', 'rpc/next_enquiry_seq', { body: {} });
  const seq = Array.isArray(value) ? Number(value[0]) : Number(value);
  if (!Number.isFinite(seq) || seq < 1) return null;
  return newEnquiryRef(seq);
});

const createEnquiry = guarded('createEnquiry', NONE, async (creds, row) => {
  const payload = pick(row, ENQUIRY_COLUMNS);
  if (!payload.enquiry_ref) throw new Error('createEnquiry needs an enquiry_ref.');
  return firstRow(await request(creds, 'POST', TABLE_ENQUIRIES, { body: payload }));
});

const updateEnquiry = guarded('updateEnquiry', NONE, async (creds, ref, patch) => {
  const payload = pick(patch, ENQUIRY_COLUMNS);
  if (!cleanText(ref, 40)) throw new Error('updateEnquiry needs a ref.');
  if (!Object.keys(payload).length) return null;
  // updated_at also has a trigger; setting it here keeps the returned row
  // honest even if the trigger is missing on an older project.
  payload.updated_at = nowIso();
  return firstRow(await request(creds, 'PATCH', TABLE_ENQUIRIES + '?' + refFilter(ref), { body: payload }));
});

const getEnquiryByRef = guarded('getEnquiryByRef', NONE, async (creds, ref) => {
  if (!cleanText(ref, 40)) return null;
  const rows = await request(creds, 'GET', TABLE_ENQUIRIES + '?select=*&' + refFilter(ref) + '&limit=1');
  return firstRow(rows);
});

// The webhook's fallback attribution path. Every message we send now carries a
// `ref:SM-YYYY-NNNNN` tag, so this is only reached for mail sent before that
// tag existed, or for an event whose tags were stripped in transit. Matching on
// the address alone cannot be exact — one person may hold several enquiries —
// so the newest is the best available guess, and the caller treats a miss as an
// unattributed activity row rather than an error.
const findEnquiryByEmail = guarded('findEnquiryByEmail', NONE, async (creds, email) => {
  const address = cleanText(email, 254).toLowerCase();
  if (!address) return null;
  const rows = await request(
    creds,
    'GET',
    TABLE_ENQUIRIES + '?select=*&email=ilike.' + encodeURIComponent(address)
      + '&order=created_at.desc&limit=1'
  );
  return firstRow(rows);
});

const listEnquiries = guarded('listEnquiries', EMPTY_LIST, async (creds, options) => {
  const opts = options || {};
  const limit = clampInt(opts.limit, 1, MAX_LIST_LIMIT, DEFAULT_LIST_LIMIT);

  // The status is interpolated into a query string, so it is matched against
  // the known list rather than escaped — an unknown value is simply ignored.
  const status = cleanText(opts.status, 40).toLowerCase();
  const statusFilter = STATUSES.indexOf(status) !== -1 ? '&status=eq.' + status : '';

  const rows = await request(
    creds,
    'GET',
    TABLE_ENQUIRIES + '?select=*' + statusFilter + '&order=created_at.desc&limit=' + limit
  );
  return Array.isArray(rows) ? rows : [];
});

const recordEvent = guarded('recordEvent', NONE, async (creds, ref, event, meta) => {
  const enquiryRef = cleanText(ref, 40);
  const name = cleanText(event, 40);
  if (!enquiryRef || !name) return null;
  // Deliberately not constrained to the LIFECYCLE list, here or in the schema:
  // this is an append-only log, and recording an unexpected event is more
  // useful than losing it.
  const body = { enquiry_ref: enquiryRef, event: name };
  if (meta && typeof meta === 'object') body.meta = meta;
  return firstRow(await request(creds, 'POST', TABLE_EVENTS, { body }));
});

const recordEmailActivity = guarded('recordEmailActivity', NONE, async (creds, row) => {
  const payload = pick(row, EMAIL_ACTIVITY_COLUMNS);
  if (!payload.event_type) throw new Error('recordEmailActivity needs an event_type.');
  if (!payload.occurred_at) payload.occurred_at = nowIso();
  return firstRow(await request(creds, 'POST', TABLE_EMAIL_ACTIVITY, { body: payload }));
});

// Enquiries whose `stage` timestamp sits inside [now - maxHours, now - minHours]
// and that have not been submitted or unsubscribed. The status pre-filter is an
// optimisation only — the cron still runs every candidate through
// isSuppressed(), which is the authority on whether a reminder may go out.
const findFollowupCandidates = guarded('findFollowupCandidates', EMPTY_LIST, async (creds, options) => {
  const opts = options || {};
  const column = STAGE_COLUMNS[cleanText(opts.stage, 40)] || 'step1_at';
  const minHours = Number(opts.minHours);
  const maxHours = Number(opts.maxHours);
  if (!Number.isFinite(minHours) || !Number.isFinite(maxHours) || maxHours <= minHours) {
    throw new Error('findFollowupCandidates needs minHours < maxHours.');
  }

  const now = Date.now();
  const newest = new Date(now - minHours * 3600000).toISOString();
  const oldest = new Date(now - maxHours * 3600000).toISOString();

  const query = TABLE_ENQUIRIES
    + '?select=*'
    + '&' + column + '=lte.' + newest
    + '&' + column + '=gte.' + oldest
    + '&submitted_at=is.null'
    + '&unsubscribed_at=is.null'
    + '&status=in.(new,reviewing)'
    + '&order=' + column + '.asc'
    + '&limit=' + MAX_CANDIDATES;

  const rows = await request(creds, 'GET', query);
  return Array.isArray(rows) ? rows : [];
});

const markUnsubscribed = guarded('markUnsubscribed', NONE, async (creds, ref) => {
  if (!cleanText(ref, 40)) return null;
  const body = { unsubscribed_at: nowIso(), updated_at: nowIso() };
  return firstRow(await request(creds, 'PATCH', TABLE_ENQUIRIES + '?' + refFilter(ref), { body }));
});

// Records that a template has gone to this enquiry, which is what
// isSuppressed() reads to avoid sending the same reminder twice. Read-modify-
// write is acceptable here: the cron is the only writer and it runs once a day,
// single-threaded.
const markEmailSent = guarded('markEmailSent', NONE, async (creds, ref, template) => {
  const enquiryRef = cleanText(ref, 40);
  const name = cleanText(template, 64);
  if (!enquiryRef || !name) return null;

  const rows = await request(creds, 'GET', TABLE_ENQUIRIES + '?select=emails_sent&' + refFilter(enquiryRef) + '&limit=1');
  const current = firstRow(rows);
  const sent = current && Array.isArray(current.emails_sent) ? current.emails_sent.slice() : [];
  if (sent.indexOf(name) === -1) sent.push(name);

  const body = { emails_sent: sent, updated_at: nowIso() };
  if (name === 'SM_ENQUIRY_REMINDER_01') body.reminder_01_sent_at = nowIso();
  if (name === 'SM_ENQUIRY_REMINDER_02') body.reminder_02_sent_at = nowIso();

  return firstRow(await request(creds, 'PATCH', TABLE_ENQUIRIES + '?' + refFilter(enquiryRef), { body }));
});

module.exports = {
  isConfigured,
  nextRef,
  createEnquiry,
  updateEnquiry,
  getEnquiryByRef,
  findEnquiryByEmail,
  listEnquiries,
  recordEvent,
  recordEmailActivity,
  findFollowupCandidates,
  markUnsubscribed,
  markEmailSent,
};
