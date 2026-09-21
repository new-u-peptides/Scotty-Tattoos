'use strict';

// Step 2 of the enquiry funnel — the full submission, multipart/form-data so
// it can carry reference images.
//
// The ordering below is deliberate and load-bearing:
//   1. parse + validate + honeypot
//   2. resolve the enquiry (signed reference → update, otherwise create)
//   3. score the lead
//   4. notify the studio, with the references attached — a failure here is
//      the ONLY fatal one, because a lost enquiry is the one unacceptable
//      outcome of this endpoint
//   5. confirm to the enquirer          (logged on failure, not fatal)
//   6. queue the "how this works" email (logged on failure, not fatal)
//   7. record events and segments       (logged on failure, not fatal)
//   8. 200
//
// Uploads are held in memory only long enough to attach them to the outgoing
// email — hence the hard size ceilings. See README → Booking flow for the
// object-storage upgrade path if these ever prove too tight.

const busboy = require('busboy');
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
  isNonSequentialRef,
  unsubscribeUrl,
  adminUrl,
  BOOKING_URL,
  PRIVACY_URL,
  STUDIO_LOCATION,
  SCALES,
  EXISTING_TATTOOS,
  TIMINGS,
  HEARD_FROM,
} = require('../_lib/enquiry');
const { sendTemplateEmail } = require('../_lib/mailersend');
const { renderSubject } = require('../_lib/templates');
const { scoreApplication } = require('../_lib/leadScore');
const { isValidEmail, cleanText, cleanMultiline, toBool, formatUtcTimestamp, nowIso } = require('../_lib/util');

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB per file
const MAX_FILES = 3;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024; // combined ceiling — stays under Vercel's request body limit
const FILE_FIELD = 'references';
const PROCESS_EMAIL_DELAY_SECONDS = 15 * 60;

const NOTIFY_EMAIL = process.env.BOOKING_NOTIFY_EMAIL || 'studio@scottymassa.com';
const STUDIO_REPLY_TO = 'studio@scottymassa.com';

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    let bb;
    try {
      bb = busboy({
        headers: req.headers,
        // One extra file slot so a fourth reference image still reaches us
        // and can be reported properly rather than silently vanishing.
        limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES + 1, fieldSize: 64 * 1024 },
      });
    } catch (err) {
      reject(httpError('Invalid form submission.', 400));
      return;
    }

    const fields = {};
    const files = [];
    let totalBytes = 0;
    let settled = false;

    function fail(message, statusCode) {
      if (settled) return;
      settled = true;
      reject(httpError(message, statusCode || 400));
      req.unpipe(bb);
      bb.removeAllListeners();
    }

    bb.on('field', (name, value) => {
      fields[name] = value;
    });

    bb.on('file', (name, stream, info) => {
      // Only `references` accepts files now. Anything else is drained so the
      // request still finishes cleanly instead of stalling on a paused stream.
      if (name !== FILE_FIELD) {
        stream.resume();
        return;
      }
      // An untouched file input still posts an empty part — ignore it before
      // the mimetype check, which it would otherwise fail.
      if (!info || !info.filename) {
        stream.resume();
        return;
      }
      if (!/^image\//i.test(info.mimeType || '')) {
        stream.resume();
        fail('"' + cleanText(info.filename, 80) + '" is not an image — please attach JPG, PNG, HEIC or WebP files only.', 415);
        return;
      }
      if (files.length >= MAX_FILES) {
        stream.resume();
        fail('Please attach no more than 3 reference images.', 413);
        return;
      }

      const chunks = [];
      let size = 0;
      let truncated = false;

      stream.on('limit', () => {
        truncated = true;
        fail('"' + cleanText(info.filename, 80) + '" is larger than 2MB — please compress it or choose a smaller image.', 413);
      });

      stream.on('data', (chunk) => {
        if (settled) return;
        size += chunk.length;
        totalBytes += chunk.length;
        if (totalBytes > MAX_TOTAL_BYTES) {
          fail('Your images add up to more than 4MB in total — please remove one or compress them.', 413);
          return;
        }
        chunks.push(chunk);
      });

      stream.on('end', () => {
        if (truncated || settled) return;
        if (files.length >= MAX_FILES) return;
        files.push({
          filename: cleanText(info.filename, 200) || 'reference',
          buffer: Buffer.concat(chunks, size),
        });
      });
    });

    bb.on('filesLimit', () => fail('Please attach no more than 3 reference images.', 413));
    bb.on('error', (err) => fail(err && err.message ? err.message : 'Could not read that upload.', 400));
    bb.on('close', () => {
      if (settled) return;
      settled = true;
      resolve({ fields: fields, files: files });
    });

    req.pipe(bb);
  });
}

async function mintRef() {
  let seq = null;
  try {
    if (store.isConfigured()) seq = await store.nextRef();
  } catch (err) {
    console.warn('[enquiry/submit] store.nextRef failed — falling back to a non-sequential reference');
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

  // ---- 1. parse ----------------------------------------------------------
  let fields;
  let files;
  try {
    const parsed = await parseMultipart(req);
    fields = parsed.fields;
    files = parsed.files;
  } catch (err) {
    res.status(err.statusCode || 400).json({
      ok: false,
      error: err.statusCode ? err.message : 'I could not read that submission — please try again.',
    });
    return;
  }

  try {
    // ---- 1b. honeypot ----------------------------------------------------
    // A real visitor never sees this field. Answer as though all is well.
    if (cleanText(fields.company, 200)) {
      res.status(200).json({ ok: true, enquiryId: '' });
      return;
    }

    // ---- 1c. validate ----------------------------------------------------
    // Presence is checked on what was actually typed; what gets stored is the
    // canonical spelling from the enquiry vocabulary wherever it matches, so
    // an unfamiliar value is kept rather than dropped.
    const data = {
      name: cleanText(fields.name, 120),
      email: cleanText(fields.email, 254),
      country: cleanText(fields.country, 80),
      instagram: normaliseInstagram(fields.instagram),
      projectType: cleanText(fields.projectType, 60),
      scale: cleanText(fields.scale, 60),
      idea: cleanMultiline(fields.idea, 4000),
      placement: cleanText(fields.placement, 160),
      existingTattoos: cleanText(fields.existingTattoos, 60),
      preferredTiming: cleanText(fields.preferredTiming, 60),
      heardFrom: cleanText(fields.heardFrom, 40),
      additionalInfo: cleanMultiline(fields.additionalInfo, 2000),
    };
    const consent = toBool(fields.consent);

    const missing = [];
    if (!data.name) missing.push('your name');
    if (!isValidEmail(data.email)) missing.push('a valid email address');
    if (!data.country) missing.push('the country you are in');
    if (!data.projectType) missing.push('the type of project');
    if (!data.scale) missing.push('the scale of the piece');
    if (!data.idea) missing.push('a description of your idea');
    if (!data.existingTattoos) missing.push('whether there are existing tattoos in that area');
    if (!data.preferredTiming) missing.push('your preferred timing');
    if (!consent) missing.push('confirmation that you are 18 or over and happy for your details to be used');

    if (missing.length) {
      res.status(400).json({ ok: false, error: 'Please add: ' + missing.join(', ') + '.' });
      return;
    }

    const project = normaliseProjectType(data.projectType);
    const projectLabel = project ? project.label : data.projectType;

    // ---- 2. resolve the enquiry ------------------------------------------
    // A client-supplied reference is only ever trusted with a valid
    // signature; anything else starts a fresh record.
    const claimedRef = cleanText(fields.enquiryId, 40);
    const claimedSig = cleanText(fields.resumeSig, 64);
    const resumed = Boolean(claimedRef && verifyRef(claimedRef, claimedSig));

    const ref = resumed ? claimedRef : await mintRef();
    const sig = signRef(ref);
    const who = splitName(data.name);
    const submittedAt = new Date();

    const row = {
      enquiry_ref: ref,
      first_name: who.firstName,
      last_name: who.lastName,
      email: data.email,
      country: data.country,
      instagram: data.instagram,
      project_type: projectLabel,
      scale: matchOption(SCALES, data.scale) || data.scale,
      idea: data.idea,
      placement: data.placement,
      existing_tattoos: matchOption(EXISTING_TATTOOS, data.existingTattoos) || data.existingTattoos,
      preferred_timing: matchOption(TIMINGS, data.preferredTiming) || data.preferredTiming,
      heard_from: matchOption(HEARD_FROM, data.heardFrom) || data.heardFrom,
      additional_info: data.additionalInfo,
      reference_count: files.length,
      utm_source: cleanText(fields.utmSource, 120),
      utm_medium: cleanText(fields.utmMedium, 120),
      utm_campaign: cleanText(fields.utmCampaign, 120),
      utm_content: cleanText(fields.utmContent, 120),
      utm_term: cleanText(fields.utmTerm, 120),
      landing_page: cleanText(fields.landingPage, 500),
      referrer: cleanText(fields.referrer, 500),
      submitted_at: nowIso(),
    };

    // Written before any email goes out, so the record survives even a failed
    // notification.
    const persisted = await persistEnquiry(ref, row);

    // ---- 3. score the lead -----------------------------------------------
    // A triage aid for the studio inbox only — never shown to the client, and
    // it never auto-declines anything.
    let score = { score: 0, label: '' };
    try {
      score = scoreApplication(row) || score;
    } catch (err) {
      console.error('[enquiry/submit] lead score failed for ' + ref, err);
    }

    // ---- 4. notify the studio (fatal on failure) -------------------------
    const internalVars = {
      first_name: who.firstName,
      last_name: who.lastName,
      email: data.email,
      country: data.country,
      project_type: projectLabel,
      scale: row.scale,
      placement: data.placement,
      existing_tattoo: row.existing_tattoos,
      preferred_timing: row.preferred_timing,
      instagram: data.instagram,
      message: data.idea,
      utm_source: row.utm_source,
      utm_campaign: row.utm_campaign,
      landing_page: row.landing_page,
      submitted_at: formatUtcTimestamp(submittedAt),
      enquiry_ref: ref,
      lead_score: String(score.score),
      lead_label: score.label,
      reference_count: String(files.length),
      additional_info: data.additionalInfo,
      admin_url: adminUrl(ref),
      // Rendered in the internal footer when the reference could not be drawn
      // from the store sequence, so a repeated number is explainable.
      ref_note: isNonSequentialRef(ref)
        ? 'Reference generated without the store sequence — it is not sequential and may repeat.'
        : '',
    };

    const attachments = files.map((file) => ({
      filename: file.filename,
      content: file.buffer.toString('base64'),
      disposition: 'attachment',
    }));

    try {
      await sendTemplateEmail({
        template: 'SM_INTERNAL_NEW_ENQUIRY',
        to: NOTIFY_EMAIL,
        subject: renderSubject('SM_INTERNAL_NEW_ENQUIRY', internalVars),
        variables: internalVars,
        tags: ['ref:' + ref],
        replyTo: data.email,
        attachments: attachments,
      });
    } catch (err) {
      // The one unacceptable outcome is a lost enquiry, so this is the only
      // failure the visitor is asked to act on.
      console.error('[enquiry/submit] failed to notify the studio for ' + ref, err);
      res.status(502).json({
        ok: false,
        error: 'I could not send that just now — please try again in a moment, or email studio@scottymassa.com directly.',
      });
      return;
    }

    await recordSend(ref, 'SM_INTERNAL_NEW_ENQUIRY');

    // ---- 5. confirm to the enquirer (logged, not fatal) ------------------
    const unsubscribe = unsubscribeUrl({ ref: ref, sig: sig });

    try {
      const receivedVars = {
        first_name: who.firstName,
        project_type: projectLabel,
        studio_location: STUDIO_LOCATION,
        booking_url: BOOKING_URL,
        enquiry_ref: ref,
        privacy_url: PRIVACY_URL,
        unsubscribe_url: unsubscribe,
      };
      await sendTemplateEmail({
        template: 'SM_ENQUIRY_RECEIVED',
        to: data.email,
        subject: renderSubject('SM_ENQUIRY_RECEIVED', receivedVars),
        variables: receivedVars,
        tags: ['ref:' + ref],
        replyTo: STUDIO_REPLY_TO,
      });
      await recordSend(ref, 'SM_ENQUIRY_RECEIVED');
    } catch (err) {
      console.error('[enquiry/submit] failed to confirm receipt to the enquirer for ' + ref, err);
    }

    // ---- 6. queue the process email 15 minutes out (logged, not fatal) ---
    try {
      const processVars = {
        first_name: who.firstName,
        booking_url: BOOKING_URL,
        privacy_url: PRIVACY_URL,
        unsubscribe_url: unsubscribe,
      };
      await sendTemplateEmail({
        template: 'SM_ENQUIRY_PROCESS',
        to: data.email,
        subject: renderSubject('SM_ENQUIRY_PROCESS', processVars),
        variables: processVars,
        tags: ['ref:' + ref],
        replyTo: STUDIO_REPLY_TO,
        sendAt: Math.floor(Date.now() / 1000) + PROCESS_EMAIL_DELAY_SECONDS,
      });
      await recordSend(ref, 'SM_ENQUIRY_PROCESS');
    } catch (err) {
      console.error('[enquiry/submit] failed to queue the process email for ' + ref, err);
    }

    // ---- 7. events and segments (logged, not fatal) ----------------------
    await finaliseRecord(ref, score, persisted);

    // ---- 8. done ---------------------------------------------------------
    res.status(200).json({ ok: true, enquiryId: ref });
  } catch (err) {
    console.error('[enquiry/submit] unexpected failure', err);
    res.status(500).json({
      ok: false,
      error: 'Something went wrong at my end — please try again in a moment, or email studio@scottymassa.com directly.',
    });
  }
};

// Returns { created, segments } so the finalising write can extend whatever
// segments the record already carried rather than overwriting them.
async function persistEnquiry(ref, row) {
  if (!store.isConfigured()) return { created: false, segments: [] };

  try {
    const existing = await store.getEnquiryByRef(ref);
    if (existing) {
      const patch = Object.assign({}, row);
      delete patch.enquiry_ref;
      await store.updateEnquiry(ref, patch);
      return { created: false, segments: existing.segments || [] };
    }
    await store.createEnquiry(Object.assign({ status: 'new' }, row));
    return { created: true, segments: [] };
  } catch (err) {
    console.error('[enquiry/submit] store write failed for ' + ref + ' — continuing in email-only mode', err);
    return { created: false, segments: [] };
  }
}

async function recordSend(ref, template) {
  if (!store.isConfigured()) return;
  try {
    await store.recordEvent(ref, 'email_sent', { template: template });
  } catch (err) {
    console.error('[enquiry/submit] could not record email_sent for ' + ref + ' / ' + template, err);
  }
}

async function finaliseRecord(ref, score, persisted) {
  if (!store.isConfigured()) return;

  try {
    // addSegment() is the only place a segment is ever added, and it refuses
    // MENTORSHIP_* and NEWSLETTER outright: a tattoo enquiry must never
    // accidentally enter the mentorship marketing flow (§12).
    let segments = addSegment(persisted.segments, 'TATTOO_ENQUIRY');
    segments = addSegment(segments, 'TATTOO_APPLICATION');

    await store.updateEnquiry(ref, {
      lead_score: score.score,
      lead_label: score.label,
      segments: segments,
    });
    if (persisted.created) await store.recordEvent(ref, 'started', { step: 2 });
    await store.recordEvent(ref, 'submitted', { step: 2 });
  } catch (err) {
    console.error('[enquiry/submit] could not record the submission for ' + ref, err);
  }
}
