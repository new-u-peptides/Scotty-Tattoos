#!/usr/bin/env node
'use strict';

/*
 * Inline partials/*.html into every root page.
 *
 * WHY THIS EXISTS. The site used to load its header and footer at runtime with
 * fetch() into <div data-include>. That meant the HTML a crawler receives
 * contained no nav and no footer — so no internal links at all until
 * JavaScript ran and two more requests resolved. Google usually renders it;
 * Bing and the LLM crawlers that llms.txt explicitly courts are much worse at
 * it, and it delays first-pass indexing for no benefit on a site with no build
 * step and two partials.
 *
 * So the markup is inlined into the pages, and this script keeps partials/ the
 * single source of truth. Edit a partial, run this, commit.
 *
 *   node tools/sync-partials.js          # rewrite pages
 *   node tools/sync-partials.js --check  # exit 1 if any page is stale
 *
 * The inlined region is delimited by marker comments. Anything between them is
 * replaced wholesale, so never hand-edit inside them.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.indexOf('--check') !== -1;

const PARTIALS = [
  { name: 'header', file: 'partials/header.html' },
  { name: 'footer', file: 'partials/footer.html' },
];

// Root pages only. journal/ uses its own template set and massatattoo/ is a
// separate site with its own partials.
function rootPages() {
  return fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();
}

function markers(name) {
  return { open: '<!-- include:' + name + ' -->', close: '<!-- /include:' + name + ' -->' };
}

function block(name, html) {
  const m = markers(name);
  return m.open + '\n' + html.trim() + '\n' + m.close;
}

function inlineInto(source, name, html) {
  const m = markers(name);
  const rendered = block(name, html);

  const openAt = source.indexOf(m.open);
  if (openAt !== -1) {
    const closeAt = source.indexOf(m.close, openAt);
    if (closeAt === -1) throw new Error('unbalanced marker for ' + name);
    return source.slice(0, openAt) + rendered + source.slice(closeAt + m.close.length);
  }

  // First run: replace the old runtime placeholder.
  const placeholder = new RegExp('<div\\s+data-include="partials/' + name + '\\.html"\\s*></div>');
  if (placeholder.test(source)) return source.replace(placeholder, rendered);

  return null; // page does not use this partial (a redirect stub, for instance)
}

const html = {};
for (const p of PARTIALS) {
  html[p.name] = fs.readFileSync(path.join(ROOT, p.file), 'utf8');
}

let changed = 0;
const stale = [];

for (const page of rootPages()) {
  const file = path.join(ROOT, page);
  const before = fs.readFileSync(file, 'utf8');
  let after = before;

  for (const p of PARTIALS) {
    const next = inlineInto(after, p.name, html[p.name]);
    if (next !== null) after = next;
  }

  // includes.js only existed to fetch these two files. Once they are inlined it
  // has nothing to fetch, and leaving it in would re-request and re-inject
  // markup that is already in the document.
  after = after.replace(/\n\s*<script src="shared\/js\/includes\.js"><\/script>/g, '');

  if (after !== before) {
    stale.push(page);
    if (!CHECK) { fs.writeFileSync(file, after); changed++; }
  }
}

if (CHECK) {
  if (stale.length) {
    console.error('Stale pages (run `node tools/sync-partials.js`):\n  ' + stale.join('\n  '));
    process.exit(1);
  }
  console.log('All pages are in sync with partials/.');
} else {
  console.log('Synced ' + changed + ' page(s).' + (changed ? '\n  ' + stale.join('\n  ') : ''));
}
