'use strict';

// Step 1 of the enquiry funnel — POST JSON with the step-1 fields.
//
// This endpoint is deliberately quiet. It creates (or refreshes) the enquiry
// record and hands the browser back a reference plus a signature so that step
// 2 can prove which record it belongs to. It sends NO email: the first email
// the enquirer receives fires on full submission (/api/enquiry/submit).
//
// The client calls it fire-and-forget, so two rules sit above all others: it
// must be fast, and it must never 500. With no store configured it still
// mints a reference and hands it back, so the browser can carry it forward
// and the final submit stitches everything together in email-only mode.

const store = require('../_lib/store');
const {
  newEnquiryRef,
  signRef,
  verifyRef,
  splitName,
  normaliseInstagram,
  normaliseProjectType,
  matchOption,
  addSegment,
  SCALES, LOCATIONS,
} = require('../_lib/enquiry');
const { isValidEmail, cleanText, readRawBody, nowIso } = require('../_lib/util');

const MAX_BODY_BYTES = 64 * 1024;

// Vercel parses a JSON body for us, but never assume it: a missing or wrong
// content-type would otherwise take the whole enquiry down.
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

// Ask the store for the next sequential reference; fall back to a random one
// so an unconfigured deployment still produces a usable reference.
async function mintRef() {
  let seq = null;
  try {
    if (store.isConfigured()) seq = await store.nextRef();
  } catch (err) {
    console.warn('[enquiry/start] store.nextRef failed — falling back to a non-sequential reference');
  }
  if (typeof seq === 'string' && seq) return seq;
  return newEnquiryRef(seq);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return;
  }

  let ref = '';

  try {
    const body = await readJsonBody(req);

    // Honeypot — a real visitor never sees this field, so a value here means
    // a bot. Answer as though everything went fine and do no work.
    if (cleanText(body.company, 200)) {
      res.status(200).json({ ok: true, enquiryId: '', resumeSig: '' });
      return;
    }

    const name = cleanText(body.name, 120);
    const email = cleanText(body.email, 254);

    // Step 1 is fire-and-forget, so only the two fields the record is keyed
    // on are enforced here. The full required set is checked on submit, where
    // the visitor is waiting for an answer and can act on it.
    if (!name) {
      res.status(400).json({ ok: false, error: 'Please enter your name.' });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
      return;
    }

    // Never trust a client-supplied reference without a valid signature.
    const claimedRef = cleanText(body.enquiryId, 40);
    const claimedSig = cleanText(body.resumeSig, 64);
    const resumed = Boolean(claimedRef && verifyRef(claimedRef, claimedSig));

    ref = resumed ? claimedRef : await mintRef();

    const sig = signRef(ref);
    const who = splitName(name);
    const project = normaliseProjectType(body.projectType);

    const fields = {
      first_name: who.firstName,
      last_name: who.lastName,
      email: email,
      country: cleanText(body.country, 80),
      instagram: normaliseInstagram(body.instagram),
      project_type: project ? project.label : cleanText(body.projectType, 60),
      scale: matchOption(SCALES, body.scale) || cleanText(body.scale, 60),
      location: matchOption(LOCATIONS, body.location) || cleanText(body.location, 80),
      utm_source: cleanText(body.utmSource, 120),
      utm_medium: cleanText(body.utmMedium, 120),
      utm_campaign: cleanText(body.utmCampaign, 120),
      utm_content: cleanText(body.utmContent, 120),
      utm_term: cleanText(body.utmTerm, 120),
      landing_page: cleanText(body.landingPage, 500),
      referrer: cleanText(body.referrer, 500),
      step1_at: nowIso(),
    };

    // Persistence is best-effort by design (contract §6.4): a deployment with
    // no database still has to return a reference the browser can carry into
    // step 2, where the email is what actually delivers the enquiry.
    await persist(ref, fields, resumed);

    res.status(200).json({ ok: true, enquiryId: ref, resumeSig: sig });
  } catch (err) {
    console.error('[enquiry/start] unexpected failure', err);
    // Step 1 must never hand the browser a 500 — the form carries on either
    // way, so give it the best reference we can still produce.
    try {
      if (!ref) ref = newEnquiryRef();
      res.status(200).json({ ok: true, enquiryId: ref, resumeSig: signRef(ref) });
    } catch (fallbackErr) {
      res.status(200).json({ ok: true, enquiryId: '', resumeSig: '' });
    }
  }
};

async function persist(ref, fields, resumed) {
  if (!store.isConfigured()) return;

  try {
    const existing = await store.getEnquiryByRef(ref);

    if (existing) {
      await store.updateEnquiry(ref, fields);
    } else {
      await store.createEnquiry(Object.assign({ enquiry_ref: ref, status: 'new' }, fields, {
        // addSegment() is the only place a segment is ever added, and it
        // refuses MENTORSHIP_* and NEWSLETTER outright: a tattoo enquiry must
        // never accidentally enter the mentorship marketing flow (§12).
        segments: addSegment([], 'TATTOO_ENQUIRY'),
      }));
      await store.recordEvent(ref, 'started', { step: 1 });
    }

    await store.recordEvent(ref, 'step_1_completed', { resumed: resumed });
  } catch (err) {
    console.error('[enquiry/start] store write failed for ' + ref + ' — continuing in email-only mode', err);
  }
};
