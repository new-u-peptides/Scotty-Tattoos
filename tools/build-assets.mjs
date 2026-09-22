#!/usr/bin/env node
/**
 * Static-asset build for scottymassa.com.
 *
 *   npm run build
 *
 * The site is hand-authored HTML served straight off the repo root, so this
 * script is what stands in for a bundler. It:
 *
 *   1. flattens assets/css/styles.css (an index of 29 @imports, each of which
 *      the browser could only discover *after* the one above it had arrived)
 *      into a single minified assets/css/styles.min.css;
 *   2. minifies every shared/js/*.js to a sibling *.min.js;
 *   3. rewrites the <link>/<script> tags across every page to point at the
 *      built files, tagged with a content hash so they can be served
 *      immutable;
 *   4. regenerates the Content-Security-Policy in vercel.json with a sha256
 *      hash for every inline <script> block on the site, so the policy needs
 *      neither 'unsafe-inline' nor a nonce.
 *
 * Edit the component CSS and the unminified JS; never the generated files.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const r = (...p) => join(ROOT, ...p);
const read = (p) => readFileSync(r(p), 'utf8');
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8);

const PAGES = [
  ...readdirSync(ROOT).filter((f) => f.endsWith('.html')),
  ...readdirSync(r('journal')).filter((f) => f.endsWith('.html')).map((f) => `journal/${f}`),
];

/* ---------------------------------------------------------------------------
 * 0. Fonts — generate @font-face from the vendored manifest.
 *
 * Written into the bundle ahead of everything else so the declarations are
 * in the first bytes of CSS the browser parses. One block per
 * (family, unicode-range): the variable faces declare their whole weight
 * axis, so nothing has to be synthesised.
 * Run tools/fetch-fonts.py to refresh the files themselves.
 * ------------------------------------------------------------------------ */
function fontFaceCss() {
  const manifest = JSON.parse(read('assets/fonts/fonts.json'));
  const blocks = manifest
    .sort((a, b) => a.family.localeCompare(b.family) || a.subset.localeCompare(b.subset))
    .map(({ family, subset, file, unicodeRange, weight, variable }) => {
      const w = weight[0] === weight[1] ? `${weight[0]}` : `${weight[0]} ${weight[1]}`;
      return `/* ${family} ${subset}${variable ? ' (variable)' : ''} */
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${w};
  font-display: swap;
  src: url('../fonts/${file}') format('woff2');
  unicode-range: ${unicodeRange};
}`;
    });
  return blocks.join('\n') + '\n';
}

/* ---------------------------------------------------------------------------
 * 1. CSS — inline the @import chain into one file.
 * Each component lives in assets/css/components/ and its url()s are relative
 * to that directory; the bundle lands one level up, so they are re-based.
 * ------------------------------------------------------------------------ */
function bundleCss() {
  const index = read('assets/css/styles.css');
  const imports = [...index.matchAll(/@import\s+url\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
  if (!imports.length) throw new Error('assets/css/styles.css has no @import rules');

  const parts = imports.map((spec) => {
    const from = posix.join('assets/css', spec);          // assets/css/components/x.css
    const fromDir = posix.dirname(from);
    const body = read(from).replace(
      /url\((['"]?)(?!data:|https?:|\/)([^'")]+)\1\)/g,
      (_m, q, url) => {
        const abs = posix.normalize(posix.join(fromDir, url));
        return `url(${q}${posix.relative('assets/css', abs)}${q})`;
      },
    );
    return `/* ${spec} */\n${body}`;
  });

  const { code } = esbuild.transformSync([fontFaceCss(), ...parts].join('\n'), {
    loader: 'css',
    minify: true,
  });
  writeFileSync(r('assets/css/styles.min.css'), code);
  return { file: 'assets/css/styles.min.css', hash: hash(code), bytes: code.length };
}

/* ---------------------------------------------------------------------------
 * 2. JS — minify each entry point in place. They are independent IIFEs with no
 * imports, so there is nothing to bundle; `defer` in the markup is what keeps
 * them off the critical path.
 * ------------------------------------------------------------------------ */
function minifyJs() {
  const out = {};
  for (const f of readdirSync(r('shared/js')).sort()) {
    if (!f.endsWith('.js') || f.endsWith('.min.js')) continue;
    const { code } = esbuild.transformSync(read(`shared/js/${f}`), {
      loader: 'js',
      minify: true,
      target: 'es2017',
      legalComments: 'none',
    });
    const dest = `shared/js/${f.replace(/\.js$/, '.min.js')}`;
    writeFileSync(r(dest), code);
    out[f] = { file: dest, hash: hash(code), bytes: code.length };
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * 3. Markup — point every page at the built files.
 * ------------------------------------------------------------------------ */
function rewritePages(css, js) {
  for (const page of PAGES) {
    const up = page.includes('/') ? '../' : '';
    let s = read(page);

    s = s.replace(
      new RegExp(`(href=")${up}assets/css/styles(?:\\.min)?\\.css(?:\\?v=[a-f0-9]+)?(")`, 'g'),
      `$1${up}${css.file}?v=${css.hash}$2`,
    );

    s = s.replace(
      new RegExp(`<script([^>]*?)src="${up}shared/js/([a-z-]+?)(?:\\.min)?\\.js(?:\\?v=[a-f0-9]+)?"([^>]*)>`, 'g'),
      (m, pre, name, post) => {
        const entry = js[`${name}.js`];
        if (!entry) return m;
        const attrs = `${pre} ${post}`.replace(/\bdefer\b/g, '').replace(/\s+/g, ' ').trim();
        return `<script defer${attrs ? ' ' + attrs : ''} src="${up}${entry.file}?v=${entry.hash}">`;
      },
    );

    writeFileSync(r(page), s);
  }
}

/* ---------------------------------------------------------------------------
 * 4. CSP — one sha256 per distinct *executable* inline <script>.
 *
 * JSON-LD is deliberately excluded. A <script type="application/ld+json"> is
 * a data block: the HTML spec bails out of "prepare the script element"
 * before the CSP check, and Chrome confirms it — a page under
 * `script-src 'self'` with an unhashed JSON-LD block raises no violation and
 * keeps its structured data. Hashing all ~30 of them would have added ~4KB
 * to every response for nothing.
 * ------------------------------------------------------------------------ */
const EXECUTABLE = /^(?:|text\/javascript|application\/javascript|module)$/i;

function inlineScriptHashes() {
  const hashes = new Set();
  for (const page of PAGES) {
    for (const m of read(page).matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
      const type = (m[1].match(/\btype="([^"]*)"/) || [, ''])[1].trim();
      if (!EXECUTABLE.test(type)) continue;
      hashes.add(`'sha256-${createHash('sha256').update(m[2], 'utf8').digest('base64')}'`);
    }
  }
  return [...hashes].sort();
}

function writeCsp(hashes) {
  const policy = [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')}`,
    // Fonts are vendored now, so neither Google origin is needed any more.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    // contact.html embeds the studio's Google Maps pin; nothing else frames.
    "frame-src https://www.google.com",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');

  // Trusted Types ships report-only. Our own code has no HTML sinks left
  // (includes.js uses DOMParser), but Vercel's analytics script is a
  // third party we do not control, so enforcing it could break it silently.
  // Watch the console on a deploy; if it stays clean, promote this into the
  // enforced policy above.
  // upgrade-insecure-requests is ignored in a report-only policy and Chrome
  // logs a console warning about it, so it is stripped from this copy.
  const reportOnly = `${policy.replace('; upgrade-insecure-requests', '')}; require-trusted-types-for 'script'`;

  const cfg = JSON.parse(read('vercel.json'));
  let found = false;
  for (const rule of cfg.headers ?? []) {
    for (const h of rule.headers) {
      if (h.key === 'Content-Security-Policy') { h.value = policy; found = true; }
      if (h.key === 'Content-Security-Policy-Report-Only') { h.value = reportOnly; }
    }
  }
  if (!found) throw new Error('vercel.json has no Content-Security-Policy header to update');
  writeFileSync(r('vercel.json'), JSON.stringify(cfg, null, 2) + '\n');
  return hashes.length;
}

const css = bundleCss();
const js = minifyJs();
rewritePages(css, js);
const n = writeCsp(inlineScriptHashes());

const kb = (b) => `${(b / 1024).toFixed(1)}K`;
console.log(`css   ${css.file}  ${kb(css.bytes)}  (was ${Object.keys(css).length && '30 requests'})`);
for (const [src, o] of Object.entries(js)) console.log(`js    ${o.file.padEnd(34)} ${kb(o.bytes)}  from ${src}`);
console.log(`csp   ${n} inline-script hashes across ${PAGES.length} pages`);
