'use strict';

// A small, stateless "how promising is this enquiry" score computed at
// submission time. Shown ONLY in the studio's internal notification email —
// never to the client, and never used to auto-decline anything. It exists
// purely to help Scotty triage his inbox when several enquiries land at once;
// the artistic call is always his. See README → Enquiry flow.
//
// Weights lean toward what scottymassa.com advertises as the focus
// (large-scale geometric/ornamental work — sleeves, backs, full legs,
// long-term builds) and toward signals that the person has actually thought
// about the project rather than typed two lines at midnight.
//
// Reads the store's snake_case field names, and tolerates the form's camelCase
// so it can be called with either a database row or a freshly parsed request.

const { projectSlug, matchOption, TIMINGS, EXISTING_TATTOOS } = require('./enquiry');

// Project types by how close they sit to the work Scotty wants to be doing.
const MAJOR_FORMATS = new Set(['backpiece', 'full-leg', 'bodysuit', 'long-term', 'multiple']);
const STRONG_FORMATS = new Set(['sleeve']);
const MODERATE_FORMATS = new Set(['half-sleeve', 'chest', 'ribs']);

const IDEA_DETAILED = 400;
const IDEA_CONSIDERED = 200;
const IDEA_THIN = 60;

function field(enquiry, snake, camel) {
  if (!enquiry || typeof enquiry !== 'object') return '';
  const value = enquiry[snake] !== undefined ? enquiry[snake] : enquiry[camel];
  return typeof value === 'string' ? value : (value == null ? '' : String(value));
}

function scoreApplication(enquiry, counts) {
  const data = enquiry || {};
  const extra = counts || {};
  let score = 50; // neutral baseline

  const project = projectSlug(field(data, 'project_type', 'projectType'));
  if (MAJOR_FORMATS.has(project)) score += 20;
  else if (STRONG_FORMATS.has(project)) score += 15;
  else if (MODERATE_FORMATS.has(project)) score += 8;

  const scale = field(data, 'scale', 'scale');
  if (scale === 'Full limb / major project' || scale === 'Multi-session project') score += 15;
  else if (scale === 'Large') score += 10;
  else if (scale === 'Medium') score += 3;
  else if (scale === 'Small') score -= 15;

  // A cover-up is not a lesser project, but it constrains the geometry and
  // usually needs a conversation before it can be quoted — hence slightly
  // lower, not disqualifying.
  const existing = matchOption(EXISTING_TATTOOS, field(data, 'existing_tattoos', 'existingTattoos'));
  if (existing === 'Yes, cover-up / transformation') score -= 8;
  else if (existing === 'Not sure') score -= 2;

  const timing = matchOption(TIMINGS, field(data, 'preferred_timing', 'preferredTiming'));
  if (timing === 'As soon as possible') score += 10;
  else if (timing === 'Within 1–3 months') score += 8;
  else if (timing === '3–6 months') score += 3;
  else if (timing === 'Later this year') score -= 3;

  const referenceCount = Number(
    extra.referenceCount !== undefined
      ? extra.referenceCount
      : (data.reference_count !== undefined ? data.reference_count : data.referenceCount)
  );
  if (Number.isFinite(referenceCount)) {
    if (referenceCount >= 3) score += 12;
    else if (referenceCount > 0) score += 8;
  }

  // Length is a crude proxy, but in practice the difference between a
  // two-sentence enquiry and three paragraphs is the difference between
  // "thinking about it" and "ready to start".
  const idea = field(data, 'idea', 'idea');
  if (idea.length > IDEA_DETAILED) score += 12;
  else if (idea.length > IDEA_CONSIDERED) score += 8;
  else if (idea.length > 0 && idea.length < IDEA_THIN) score -= 8;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let label;
  if (score >= 70) label = 'High-fit enquiry';
  else if (score >= 40) label = 'Worth a look';
  else label = 'Lower priority';

  return { score, label };
}

module.exports = { scoreApplication, scoreEnquiry: scoreApplication };
