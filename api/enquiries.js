'use strict';

// Admin API behind the enquiry board (admin/enquiries.html).
//
//   GET   /api/enquiries?status=&limit=   → the board
//   PATCH /api/enquiries  { ref, status } → move a card, append the matching
//                                           lifecycle event, apply segments
//
// Authorisation is a bearer token compared in constant time. With
// ADMIN_ACCESS_TOKEN unset the endpoint answers 503 — it is never open by
// default, because every enquiry in here is somebody's personal detail.

const store = require('./_lib/store');
const { STATUSES, eventForStatus, segmentsForStatus, addSegment } = require('./_lib/enquiry');
const { cleanText, timingSafeCompare, clampInt, readRawBody } = require('./_lib/util');

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const MAX_BODY_BYTES = 16 * 1024;

const STORE_NOTE = 'Enquiry persistence is not configured. Emails are still being sent — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to record enquiries here.';

function bearer(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return match ? match[1].trim() : '';
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try {
    const raw = await readRawBody(req, MAX_BODY_BYTES);
    const parsed = JSON.parse(raw.toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    return {};
  }
}

function isKnownStatus(status) {
  return STATUSES.indexOf(status) !== -1;
}

module.exports = async (req, res) => {
  const method = req.method;
  if (method !== 'GET' && method !== 'PATCH') {
    res.setHeader('Allow', 'GET, PATCH');
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const adminToken = process.env.ADMIN_ACCESS_TOKEN;
  if (!adminToken) {
    res.status(503).json({ ok: false, error: 'The enquiry board is not configured.' });
    return;
  }

  const presented = bearer(req);
  if (!presented || !timingSafeCompare(presented, adminToken)) {
    res.status(401).json({ ok: false, error: 'Not authorised.' });
    return;
  }

  try {
    if (method === 'GET') {
      await handleList(req, res);
    } else {
      await handlePatch(req, res);
    }
  } catch (err) {
    console.error('[enquiries] unexpected failure', err);
    res.status(500).json({ ok: false, error: 'Could not reach the enquiry store.' });
  }
};

async function handleList(req, res) {
  if (!store.isConfigured()) {
    res.status(200).json({ ok: true, enquiries: [], storeConfigured: false, note: STORE_NOTE });
    return;
  }

  const url = new URL(req.url || '/', 'https://www.scottymassa.com');
  const statusParam = (url.searchParams.get('status') || '').trim();
  const limit = clampInt(url.searchParams.get('limit'), 1, MAX_LIMIT, DEFAULT_LIMIT);

  // ?ref= returns one enquiry with its lifecycle timeline and email activity,
  // which is what the board's side panel needs. Kept off the list response on
  // purpose: the board renders dozens of cards and opens one.
  const refParam = cleanText(url.searchParams.get('ref'), 40);
  if (refParam) {
    const enquiry = await store.getEnquiryByRef(refParam);
    if (!enquiry) {
      res.status(404).json({ ok: false, error: 'No enquiry with that reference.' });
      return;
    }
    const [events, emailActivity] = await Promise.all([
      store.listEvents(refParam),
      store.listEmailActivity(refParam),
    ]);
    res.status(200).json({
      ok: true,
      storeConfigured: true,
      enquiry: enquiry,
      events: events || [],
      emailActivity: emailActivity || [],
    });
    return;
  }

  if (statusParam && !isKnownStatus(statusParam)) {
    res.status(400).json({ ok: false, error: 'Unknown status filter.' });
    return;
  }

  const enquiries = await store.listEnquiries({ limit: limit, status: statusParam || null });

  res.status(200).json({
    ok: true,
    storeConfigured: true,
    enquiries: Array.isArray(enquiries) ? enquiries : [],
  });
}

async function handlePatch(req, res) {
  const body = await readJsonBody(req);
  const ref = cleanText(body.ref, 40);
  const status = cleanText(body.status, 40).toLowerCase();

  if (!ref) {
    res.status(400).json({ ok: false, error: 'An enquiry reference is required.' });
    return;
  }
  if (!status || !isKnownStatus(status)) {
    res.status(400).json({ ok: false, error: 'Unknown status.' });
    return;
  }
  if (!store.isConfigured()) {
    res.status(503).json({ ok: false, error: STORE_NOTE });
    return;
  }

  const existing = await store.getEnquiryByRef(ref);
  if (!existing) {
    res.status(404).json({ ok: false, error: 'No enquiry with that reference.' });
    return;
  }

  const patch = { status: status };

  // SEGMENTS: reaching `booked` or `completed` records a fact about the
  // tattoo relationship. addSegment() refuses MENTORSHIP_* and NEWSLETTER
  // outright — a tattoo enquiry must never accidentally enter the mentorship
  // marketing flow (contract §12).
  const additions = segmentsForStatus(status);
  if (additions.length) {
    patch.segments = additions.reduce(addSegment, existing.segments || []);
  }

  const updated = await store.updateEnquiry(ref, patch);

  const event = eventForStatus(status);
  if (event) {
    try {
      await store.recordEvent(ref, event, { from: existing.status || null, to: status });
    } catch (err) {
      console.error('[enquiries] status changed but the ' + event + ' event was not recorded for ' + ref, err);
    }
  }

  res.status(200).json({
    ok: true,
    enquiry: updated || Object.assign({}, existing, patch),
  });
}
