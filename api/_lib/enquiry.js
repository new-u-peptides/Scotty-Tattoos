'use strict';

// The enquiry domain: the vocabulary every other module agrees on.
//
// Slugs, labels, lifecycle events, board statuses and segments are defined
// exactly once — here — because the same strings appear in the form markup,
// the URL of a deep link, an email body, a database column and the admin
// board. A typo that only exists in one of those places is the kind of bug
// that silently drops enquiries, so nothing else in the codebase is allowed
// to spell them out by hand.
//
// Nothing here touches the network. Signing and URL building are pure, so a
// handler can call them before it knows whether the database is reachable.

const crypto = require('crypto');
const { cleanText, timingSafeCompare } = require('./util');

const SITE_URL = 'https://scottymassa.com';
const BOOKING_URL = SITE_URL + '/booking.html';
const PRIVACY_URL = SITE_URL + '/privacy.html';
const AFTERCARE_URL = SITE_URL + '/aftercare.html';
const ADMIN_BOARD_URL = SITE_URL + '/admin/enquiries.html';
const STUDIO_LOCATION = 'Birkirkara, Malta';

// The only two money facts this codebase is allowed to state. Everything else
// — hourly rates, project totals, a minimum spend — is quoted by Scotty per
// project after he has read the enquiry. Never invent a number.
const DEPOSIT_PERCENT = '30%';
const CURRENCY_SYMBOL = '€';

// ---------------------------------------------------------------------------
// Project types
// ---------------------------------------------------------------------------

const PROJECT_TYPE_LIST = [
  { slug: 'sleeve', label: 'Sleeve' },
  { slug: 'half-sleeve', label: 'Half sleeve' },
  { slug: 'backpiece', label: 'Backpiece' },
  { slug: 'full-leg', label: 'Full leg' },
  { slug: 'chest', label: 'Chest' },
  { slug: 'ribs', label: 'Ribs / torso' },
  { slug: 'multiple', label: 'Multiple areas' },
  { slug: 'long-term', label: 'Long-term build' },
  { slug: 'bodysuit', label: 'Geometric bodysuit' },
  { slug: 'other', label: 'Other' },
];

// PROJECT_TYPES is needed two ways and serves both: as an ordered list (to
// render the <select> and to validate in form order) and as a slug lookup
// (`PROJECT_TYPES['sleeve']` → 'Sleeve', for the ?project= deep link). The
// slug keys are non-enumerable, so Object.keys / JSON.stringify / for..of
// still see a plain array of { slug, label } and nothing downstream has to
// know about the second access path.
const PROJECT_TYPES = (function buildProjectTypes(list) {
  const entries = list.map((item) => Object.freeze({ slug: item.slug, label: item.label }));
  entries.forEach((item) => {
    Object.defineProperty(entries, item.slug, { value: item.label, enumerable: false });
  });
  return Object.freeze(entries);
})(PROJECT_TYPE_LIST);

// Exact strings — these are the option values the form posts, not slugs, so a
// comparison anywhere else has to match character for character (note the EN
// DASH in "Within 1–3 months").
const SCALES = Object.freeze([
  'Small',
  'Medium',
  'Large',
  'Full limb / major project',
  'Multi-session project',
  'Not sure yet',
]);

const EXISTING_TATTOOS = Object.freeze([
  'No',
  'Yes, working around existing tattoo',
  'Yes, cover-up / transformation',
  'Not sure',
]);

const TIMINGS = Object.freeze([
  'As soon as possible',
  'Within 1–3 months',
  '3–6 months',
  'Later this year',
  'Flexible',
]);

const HEARD_FROM = Object.freeze([
  'Instagram',
  'Google',
  'Referral',
  'Facebook',
  'Previous client',
  'Other',
]);

// Append-only lifecycle log (enquiry_events.event). An enquiry accumulates
// these; it is never "in" one of them.
const LIFECYCLE = Object.freeze([
  'started',
  'step_1_completed',
  'step_2_started',
  'submitted',
  'email_sent',
  'email_delivered',
  'email_opened',
  'email_clicked',
  'reviewed',
  'qualified',
  'contacted',
  'consultation',
  'deposit_requested',
  'deposit_paid',
  'booked',
  'completed',
  'lost',
]);

// Board columns (enquiries.status) — exactly one at a time, in board order.
// The order is load-bearing: follow-up suppression asks whether a status is
// "beyond reviewing" by comparing positions in this array.
const STATUSES = Object.freeze([
  'new',
  'reviewing',
  'qualified',
  'contacted',
  'consultation',
  'deposit',
  'booked',
  'completed',
  'lost',
]);

// Marketing segments (enquiries.segments text[]).
//
// ⚠ A TATTOO ENQUIRY MUST NEVER RECEIVE `MENTORSHIP_LEAD`,
// `MENTORSHIP_CUSTOMER` OR `NEWSLETTER`. Someone asking about a backpiece has
// not asked to be sold a course or put on a mailing list, and mixing the two
// audiences is the fastest way to lose both. The mentorship segments exist in
// this list only because the column is shared with the course funnel, which
// lives in a different codebase. Use addSegment() below — it enforces this.
const SEGMENTS = Object.freeze([
  'TATTOO_ENQUIRY',
  'TATTOO_APPLICATION',
  'TATTOO_BOOKED',
  'TATTOO_COMPLETED',
  'MENTORSHIP_LEAD',
  'MENTORSHIP_CUSTOMER',
  'NEWSLETTER',
]);

const TATTOO_SEGMENTS = Object.freeze([
  'TATTOO_ENQUIRY',
  'TATTOO_APPLICATION',
  'TATTOO_BOOKED',
  'TATTOO_COMPLETED',
]);

// ---------------------------------------------------------------------------
// Vocabulary helpers
// ---------------------------------------------------------------------------

function projectLabel(value) {
  const input = cleanText(value, 80);
  if (!input) return '';
  const bySlug = PROJECT_TYPE_LIST.find((item) => item.slug === input.toLowerCase());
  if (bySlug) return bySlug.label;
  const byLabel = PROJECT_TYPE_LIST.find((item) => item.label.toLowerCase() === input.toLowerCase());
  return byLabel ? byLabel.label : '';
}

function projectSlug(value) {
  const input = cleanText(value, 80);
  if (!input) return '';
  const byLabel = PROJECT_TYPE_LIST.find((item) => item.label.toLowerCase() === input.toLowerCase());
  if (byLabel) return byLabel.slug;
  const bySlug = PROJECT_TYPE_LIST.find((item) => item.slug === input.toLowerCase());
  return bySlug ? bySlug.slug : '';
}

// Accepts either half of the pair and returns both, or null when the value is
// not one of ours. Handlers use this to validate `projectType` from the form
// and `?project=` from a deep link with the same call.
function normaliseProjectType(value) {
  const slug = projectSlug(value);
  return slug ? { slug, label: projectLabel(slug) } : null;
}

// Case-insensitive membership test against one of the exact-string lists.
// Returns the canonical spelling so the stored value is always ours, not
// whatever casing arrived in the request.
function matchOption(list, value) {
  const input = cleanText(value, 120);
  if (!input) return '';
  const found = list.find((option) => option.toLowerCase() === input.toLowerCase());
  return found || '';
}

// Instagram handles are typed inconsistently — "@scottymassa", "scottymassa",
// sometimes a pasted profile URL. Store the bare handle.
function normaliseInstagram(value) {
  let handle = cleanText(value, 80);
  if (!handle) return '';
  handle = handle.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '');
  handle = handle.replace(/[/?#].*$/, '');
  handle = handle.replace(/^@+/, '');
  return handle.slice(0, 60);
}

function splitName(full) {
  const clean = cleanText(full, 120);
  if (!clean) return { firstName: '', lastName: '' };
  const parts = clean.split(/\s+/);
  const firstName = parts.shift() || '';
  return { firstName, lastName: parts.join(' ') };
}

// The lifecycle event that a board status change implies (§12). `new` has no
// event of its own — `started` is written when the enquiry is created.
const STATUS_EVENTS = Object.freeze({
  reviewing: 'reviewed',
  qualified: 'qualified',
  contacted: 'contacted',
  consultation: 'consultation',
  deposit: 'deposit_requested',
  booked: 'booked',
  completed: 'completed',
  lost: 'lost',
});

function eventForStatus(status) {
  return STATUS_EVENTS[cleanText(status, 40).toLowerCase()] || '';
}

// Segments a status change earns. Reaching `booked` or `completed` is a fact
// about the tattoo relationship, so it is recorded; nothing else adds a
// segment automatically.
function segmentsForStatus(status) {
  const value = cleanText(status, 40).toLowerCase();
  if (value === 'booked') return ['TATTOO_BOOKED'];
  if (value === 'completed') return ['TATTOO_COMPLETED'];
  return [];
}

// The one place a segment is ever added to a tattoo enquiry.
//
// It refuses MENTORSHIP_* and NEWSLETTER outright rather than trusting every
// call site to remember the rule (§12): a tattoo enquiry must never
// accidentally enter the mentorship marketing flow. Refusing loudly in the log
// and quietly in the data is deliberate — a mis-segmented person should not
// break the request they are in the middle of.
function addSegment(existing, segment) {
  const current = Array.isArray(existing) ? existing.slice() : [];
  const value = cleanText(segment, 40).toUpperCase();
  if (!value) return current;
  if (TATTOO_SEGMENTS.indexOf(value) === -1) {
    console.warn('[enquiry] refused to add segment "' + value + '" to a tattoo enquiry');
    return current;
  }
  if (current.indexOf(value) === -1) current.push(value);
  return current;
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

const REF_RE = /^SM-\d{4}-\d{5,}$/;

// Refs minted without a database sequence, remembered for this cold start so
// the internal email can say so in its footer. Bounded, because a long-lived
// instance should not grow a set forever.
const NON_SEQUENTIAL_REFS = new Set();
const NON_SEQUENTIAL_MEMORY = 64;

// `SM-2026-00042`. With a store sequence the number is monotonic and the ref
// doubles as a running count of enquiries. Without one (email-only
// deployment) a random slot keeps refs distinct enough for a human to quote
// back on the phone, but it is NOT unique — isNonSequentialRef() lets the
// internal email admit that rather than implying a count that doesn't exist.
function newEnquiryRef(seq) {
  const year = new Date().getUTCFullYear();
  const parsed = Number(seq);
  const sequential = Number.isFinite(parsed) && parsed >= 1;
  const value = sequential ? Math.floor(parsed) : crypto.randomInt(1, 99999);
  const ref = 'SM-' + year + '-' + String(value).padStart(5, '0');

  if (!sequential) {
    if (NON_SEQUENTIAL_REFS.size >= NON_SEQUENTIAL_MEMORY) NON_SEQUENTIAL_REFS.clear();
    NON_SEQUENTIAL_REFS.add(ref);
  }
  return ref;
}

function isNonSequentialRef(ref) {
  return NON_SEQUENTIAL_REFS.has(cleanText(ref, 40));
}

function isEnquiryRef(value) {
  return REF_RE.test(cleanText(value, 40));
}

// ---------------------------------------------------------------------------
// Signed links
// ---------------------------------------------------------------------------

const SIG_LENGTH = 32;
let warnedNoSecret = false;

// ENQUIRY_LINK_SECRET is the proper key; MAILERSEND_WEBHOOK_SECRET is accepted
// as a fallback so a deployment that only configured the webhook still gets
// working resume/unsubscribe links instead of silently unsigned ones.
function linkSecret() {
  const secret = process.env.ENQUIRY_LINK_SECRET || process.env.MAILERSEND_WEBHOOK_SECRET || '';
  if (!secret && !warnedNoSecret) {
    warnedNoSecret = true;
    console.warn('[enquiry] no ENQUIRY_LINK_SECRET — resume and unsubscribe links will be unsigned and verifyRef() will reject every signature.');
  }
  return secret;
}

// 32 hex chars is 128 bits of a SHA-256 HMAC: short enough to sit in a URL a
// person might read aloud, far beyond guessing.
function signRef(ref) {
  const secret = linkSecret();
  const value = cleanText(ref, 64);
  if (!secret || !value) return '';
  return crypto.createHmac('sha256', secret).update(value, 'utf8').digest('hex').slice(0, SIG_LENGTH);
}

// Total function: a malformed ref, a missing signature, a non-string argument
// and an unconfigured secret are all just "no". It never throws, because every
// caller is an HTTP handler deciding whether to honour a link — an exception
// there becomes a 500 on a page a client reached from their email.
//
// Fails CLOSED with no secret configured: an unsigned deployment must not
// treat every link as valid.
function verifyRef(ref, sig) {
  try {
    if (typeof sig !== 'string' || sig.length !== SIG_LENGTH) return false;
    const expected = signRef(ref);
    if (!expected) return false;
    return timingSafeCompare(expected, sig);
  } catch (err) {
    return false;
  }
}

function param(name, value) {
  const clean = value == null ? '' : String(value);
  return clean ? name + '=' + encodeURIComponent(clean) : '';
}

// Deep link back into an unfinished enquiry, straight to step 2 with the
// step-1 answers prefilled. Everything is encoded — a name with a space or an
// email with a plus sign would otherwise break the query string.
function resumeUrl(options) {
  const opts = options || {};
  const ref = cleanText(opts.ref, 40);
  const sig = opts.sig || signRef(ref);
  const step = opts.step == null ? 2 : opts.step;

  const query = [
    param('enquiry', ref),
    param('sig', sig),
    param('project', opts.projectSlug),
    param('name', opts.firstName),
    param('email', opts.email),
    param('step', step),
  ].filter(Boolean).join('&');

  return query ? BOOKING_URL + '?' + query : BOOKING_URL;
}

function unsubscribeUrl(options) {
  const opts = options || {};
  const ref = cleanText(opts.ref, 40);
  const sig = opts.sig || signRef(ref);
  const query = [param('e', ref), param('t', sig)].filter(Boolean).join('&');
  return SITE_URL + '/api/enquiry/unsubscribe' + (query ? '?' + query : '');
}

function adminUrl(ref) {
  const value = cleanText(ref, 40);
  return value ? ADMIN_BOARD_URL + '#' + encodeURIComponent(value) : ADMIN_BOARD_URL;
}

// ---------------------------------------------------------------------------
// Follow-up suppression (§12 — "do not over-automate")
// ---------------------------------------------------------------------------

// Reminders are the one thing in this system that emails someone who did not
// just press a button, so the bar for sending is high and every check fails
// closed. One reminder too few is an inconvenience; one too many reads as spam
// from a studio whose whole pitch is that it is not a factory.
const REMINDER_COLUMNS = Object.freeze({
  SM_ENQUIRY_REMINDER_01: 'reminder_01_sent_at',
  SM_ENQUIRY_REMINDER_02: 'reminder_02_sent_at',
});

const REVIEWING_INDEX = STATUSES.indexOf('reviewing');

function alreadySent(enquiry, template) {
  const column = REMINDER_COLUMNS[template];
  if (column && enquiry[column]) return true;
  return Array.isArray(enquiry.emails_sent) && enquiry.emails_sent.indexOf(template) !== -1;
}

// Returns `false` when the reminder may be sent, or a short human reason when
// it may not. A string is truthy, so `if (isSuppressed(row, template))` reads
// naturally, and the cron can log exactly why it skipped each candidate
// without a second call.
function isSuppressed(enquiry, template) {
  if (!enquiry || typeof enquiry !== 'object') return 'no enquiry record';

  const name = cleanText(template, 64);
  if (!name) return 'no template named';

  if (enquiry.submitted_at) return 'enquiry already submitted';
  if (enquiry.unsubscribed_at) return 'unsubscribed';
  if (enquiry.email_status === 'hard_bounced') return 'email address hard bounced';

  const status = cleanText(enquiry.status, 40).toLowerCase() || 'new';
  const index = STATUSES.indexOf(status);
  // An unrecognised status is treated as "further along than we know about".
  // Guessing in the other direction would email someone mid-conversation.
  if (index === -1) return 'unrecognised status "' + status + '"';
  if (index > REVIEWING_INDEX) return 'status is beyond reviewing (' + status + ')';

  if (alreadySent(enquiry, name)) return name + ' already sent';

  return false;
}

module.exports = {
  SITE_URL,
  BOOKING_URL,
  PRIVACY_URL,
  AFTERCARE_URL,
  ADMIN_BOARD_URL,
  STUDIO_LOCATION,
  DEPOSIT_PERCENT,
  CURRENCY_SYMBOL,

  PROJECT_TYPES,
  SCALES,
  EXISTING_TATTOOS,
  TIMINGS,
  HEARD_FROM,
  LIFECYCLE,
  STATUSES,
  SEGMENTS,

  projectLabel,
  projectSlug,
  normaliseProjectType,
  matchOption,
  normaliseInstagram,
  splitName,

  eventForStatus,
  segmentsForStatus,
  addSegment,

  newEnquiryRef,
  isNonSequentialRef,
  isEnquiryRef,

  signRef,
  verifyRef,
  resumeUrl,
  unsubscribeUrl,
  adminUrl,

  isSuppressed,
  REMINDER_COLUMNS,
};
