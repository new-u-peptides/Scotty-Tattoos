'use strict';

// Email template loading and rendering.
//
// The ten templates live in `emails/templates/*.html` as ordinary files in the
// repository, which means they are diffable, reviewable and deployed atomically
// with the code that sends them — no provider dashboard to keep in sync. On
// Vercel, process.cwd() is the project root and the whole repo ships with the
// function, so a plain readFileSync is all that is needed.
//
// The renderer is a deliberately tiny subset of Mustache: interpolation,
// a raw escape hatch, and truthiness sections. Anything more and the templates
// start containing logic, which is exactly what we do not want in an email.

const fs = require('fs');
const path = require('path');
const { escapeHtml, cleanText } = require('./util');

// Template names are also the keys of the optional MAILERSEND_TEMPLATE_* env
// vars, so the spelling here is the spelling everywhere.
const TEMPLATE_NAMES = Object.freeze([
  'SM_ENQUIRY_RECEIVED',
  'SM_ENQUIRY_PROCESS',
  'SM_ENQUIRY_REMINDER_01',
  'SM_ENQUIRY_REMINDER_02',
  'SM_ENQUIRY_APPLICATION_RECEIVED',
  'SM_ENQUIRY_CONSULTATION',
  'SM_BOOKING_CONFIRMED',
  'SM_DEPOSIT_REMINDER',
  'SM_SESSION_REMINDER',
  'SM_INTERNAL_NEW_ENQUIRY',
]);

// Subjects live in code rather than in the HTML so they can be read and
// reviewed as a set — an inbox shows ten subject lines from the same sender
// over a few weeks and they have to read like one person wrote them.
const SUBJECTS = Object.freeze({
  SM_ENQUIRY_RECEIVED: 'Your Scotty Massa enquiry',
  SM_ENQUIRY_PROCESS: 'How tattooing with Scotty works',
  SM_ENQUIRY_REMINDER_01: 'Still thinking about your tattoo?',
  SM_ENQUIRY_REMINDER_02: 'Your tattoo project',
  SM_ENQUIRY_APPLICATION_RECEIVED: 'Your enquiry is with Scotty',
  SM_ENQUIRY_CONSULTATION: "Let's talk about your piece",
  SM_BOOKING_CONFIRMED: 'Your session is booked',
  SM_DEPOSIT_REMINDER: 'Securing your session',
  SM_SESSION_REMINDER: 'Your session with Scotty',
  SM_INTERNAL_NEW_ENQUIRY: 'New tattoo enquiry · {{project_type}} · {{first_name}}',
});

// One read per template per cold start. Lambdas are reused across invocations,
// so this is effectively a warm cache; a deploy replaces the instance, which is
// the only time a template can change.
const cache = new Map();

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

// The name is pasted into a filesystem path, so it is validated against a
// strict character class rather than sanitised. Template names are a closed
// set of constants; anything else is a programming error and should say so.
const NAME_RE = /^[A-Z0-9_]+$/;

function loadTemplate(name) {
  const key = typeof name === 'string' ? name : '';
  if (!NAME_RE.test(key)) {
    throw new Error('Invalid email template name: ' + JSON.stringify(String(name)).slice(0, 80));
  }
  if (cache.has(key)) return cache.get(key);

  const file = path.join(process.cwd(), 'emails', 'templates', key + '.html');
  let source;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch (err) {
    // Named explicitly: the caller turns this into a 502 and the message is
    // the only clue in the log about which file failed to ship.
    throw new Error('Email template "' + key + '" is missing (expected emails/templates/' + key + '.html).');
  }

  cache.set(key, source);
  return source;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function lookup(variables, key) {
  if (!variables) return undefined;
  if (Object.prototype.hasOwnProperty.call(variables, key)) return variables[key];
  // Dotted paths, so a caller can pass a nested object without flattening it.
  if (key.indexOf('.') === -1) return undefined;
  return key.split('.').reduce((acc, part) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return acc[part];
  }, variables);
}

function isTruthy(value) {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

function stringify(value) {
  // An absent variable renders as nothing at all. It must never reach a
  // client's inbox as "undefined" or as the literal {{var}} — which is the
  // single most visible way an automated email can look broken.
  if (value == null || value === false) return '';
  return String(value);
}

const SECTION_RE = /\{\{#\s*([\w.]+)\s*\}\}([\s\S]*?)\{\{\/\s*\1\s*\}\}/;
const VALUE_RE = /\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*([\w.]+)\s*\}\}/g;
const STRAY_TAG_RE = /\{\{[#^/][\w.\s]*\}\}/g;

// `{{#var}}…{{/var}}` — render the block only when the variable is truthy.
// Recursing on the body handles a nested section correctly; the guard stops a
// pathological template from spinning.
function renderSections(source, variables) {
  let out = String(source);
  let match;
  let guard = 0;
  while ((match = SECTION_RE.exec(out)) !== null && guard++ < 500) {
    const body = isTruthy(lookup(variables, match[1])) ? renderSections(match[2], variables) : '';
    out = out.slice(0, match.index) + body + out.slice(match.index + match[0].length);
  }
  return out;
}

// `{{var}}` is HTML-escaped; `{{{var}}}` is raw, for blocks the caller has
// already escaped itself (escapeMultiline output, a prebuilt table of rows).
// Escaping by default means a client whose name contains an apostrophe or an
// idea that mentions "<3" cannot break the markup — or inject into it.
function interpolate(source, variables, escape) {
  return String(source).replace(VALUE_RE, (whole, rawKey, escapedKey) => {
    if (rawKey !== undefined) return stringify(lookup(variables, rawKey));
    const value = stringify(lookup(variables, escapedKey));
    return escape === false ? value : escapeHtml(value);
  });
}

function renderString(source, variables, options) {
  const escape = !options || options.escape !== false;
  const vars = variables || {};
  const withSections = renderSections(source, vars);
  // Any section tag still standing is unbalanced in the template; drop it
  // rather than mailing it out.
  return interpolate(withSections, vars, escape).replace(STRAY_TAG_RE, '');
}

function renderTemplate(name, variables) {
  return renderString(loadTemplate(name), variables);
}

// Subjects are interpolated WITHOUT HTML escaping — an inbox shows "Smith &
// Co", not "Smith &amp; Co" — and then cleaned, because a newline in a subject
// is header injection, not a formatting choice.
function renderSubject(name, variables) {
  const pattern = SUBJECTS[name];
  if (!pattern) return '';
  return cleanText(renderString(pattern, variables, { escape: false }), 200);
}

// ---------------------------------------------------------------------------
// Plain-text alternative
// ---------------------------------------------------------------------------

const ENTITIES = {
  '&nbsp;': ' ',
  '&middot;': '·',
  '&hellip;': '…',
  '&mdash;': '—',
  '&ndash;': '–',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
};

function decodeEntities(text) {
  let out = text.replace(/&#(\d+);/g, (whole, code) => {
    const point = parseInt(code, 10);
    return Number.isFinite(point) && point > 0 && point < 0x10ffff ? String.fromCodePoint(point) : '';
  });
  for (const entity of Object.keys(ENTITIES)) {
    out = out.split(entity).join(ENTITIES[entity]);
  }
  // Ampersand last, or "&amp;lt;" would decode twice into a real "<".
  return out.split('&amp;').join('&');
}

function stripTags(value) {
  return String(value).replace(/<[^>]*>/g, '');
}

// Every email goes out multipart: some clients, some corporate gateways and
// every screen reader in text mode want the plain part, and a message with no
// text alternative scores worse with spam filters.
//
// Link URLs are kept in parentheses after their label, because "click here"
// with no URL is useless in plain text.
function htmlToText(html) {
  let text = String(html == null ? '' : html);

  // Conditional comments carry the Outlook VML button — a duplicate of the
  // real link that would otherwise appear twice in the text part.
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  text = text.replace(/<(script|style|head|title)\b[\s\S]*?<\/\1>/gi, ' ');

  text = text.replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (whole, href, label) => {
    const words = decodeEntities(stripTags(label)).replace(/\s+/g, ' ').trim();
    const url = decodeEntities(href).trim();
    if (!url || url.charAt(0) === '#') return words;
    if (!words) return url;
    // "studio@scottymassa.com (mailto:studio@scottymassa.com)" helps nobody.
    if (url === words || url === 'mailto:' + words) return words;
    return words + ' (' + url + ')';
  });

  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|tr|h1|h2|h3|h4|h5|h6|li|table|blockquote)>/gi, '\n');
  text = text.replace(/<\/td>/gi, ' ');
  text = stripTags(text);
  text = decodeEntities(text);

  text = text.replace(/[ \t ]+/g, ' ');
  text = text.split('\n').map((line) => line.trim()).join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

// Everything a send needs, in one call.
function renderEmail(name, variables) {
  const html = renderTemplate(name, variables);
  return {
    subject: renderSubject(name, variables),
    html,
    text: htmlToText(html),
  };
}

module.exports = {
  TEMPLATE_NAMES,
  SUBJECTS,
  loadTemplate,
  renderString,
  renderTemplate,
  renderSubject,
  renderEmail,
  htmlToText,
};
