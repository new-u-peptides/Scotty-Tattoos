#!/usr/bin/env node
/* =============================================================
   build-mandala-designs.js — draws the three directions in
   docs/MANDALA-DESIGN-DIRECTION.md as real vector geometry.

   Not traced from the references: every radius, line weight, gap
   and dot spacing here is computed from the rules in that
   document, so the output is a test of the rules rather than an
   illustration of them. If a rule produces something ugly, the
   rule is wrong and the drawing says so.

   Scale contract: the drawing is 1000x1000 with an outer radius
   R = 460. Millimetre figures in the design doc assume a 200mm
   mandala, so 1mm = R/100 = 4.6 units. MM below is that factor —
   change DIAMETER_MM and every weight, gap and dot rescales the
   way it would on skin.

   Output: docs/design/direction-{a,b,c}.svg + contact-sheet.html
   Run: node tools/build-mandala-designs.js
   ============================================================= */

'use strict';

var fs = require('fs');
var path = require('path');

/* ---------- scale ------------------------------------------- */

var SIZE = 1000;
var C = SIZE / 2;
var R = 460;
var DIAMETER_MM = 200;
var MM = R / (DIAMETER_MM / 2);        // units per millimetre

/* ---------- palette (from shared/js/hero-mandala.js) --------- */

var SHADOW = '#9B6C25';
var GOLD = '#E8B653';
var HIGHLIGHT = '#F3CC76';
var BONE = '#D7C6AE';
var JET = '#0A0A0A';

/* ---------- zone ladder (fractions of R) --------------------- */

var Z = {
  void: 0.105,
  ring: 0.125,
  rayIn: 0.150,
  rayOut: 0.310,
  structIn: 0.350,
  structOut: 0.700,
  breathe: 0.757,
  rim: 1.000
};

/* Every gap between zones is checked against the 4mm rule at the 200mm
   reference size: RADIANCE to STRUCTURE is 0.040 * 100mm = 4.0mm, and
   STRUCTURE to AURA is 7.5mm. Both scale down with the piece, so at
   120mm the second is 4.5mm and the first is 2.4mm — which is the
   point where the doc says to drop a zone rather than crowd it. */

/* ---------- helpers ------------------------------------------ */

function n(v) { return Math.round(v * 100) / 100; }
function px(mm) { return mm * MM; }
function rad(fraction) { return fraction * R; }

function pt(r, a) {
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function mulberry32(seed) {
  var t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    var x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- CORE: black void + one bold gold ring ------------ */

function core(voidF, ringF, ringMM) {
  voidF = voidF || Z.void;
  ringF = ringF || Z.ring;
  return [
    '<circle cx="' + C + '" cy="' + C + '" r="' + n(rad(voidF)) + '" fill="' + JET + '"/>',
    '<circle cx="' + C + '" cy="' + C + '" r="' + n(rad(ringF)) + '" fill="none" ' +
      'stroke="' + HIGHLIGHT + '" stroke-width="' + n(px(ringMM || 1.5)) + '"/>'
  ].join('\n  ');
}

function ring(rF, mm, colour, opacity) {
  return '<circle cx="' + C + '" cy="' + C + '" r="' + n(rad(rF)) + '" fill="none" stroke="' +
    colour + '" stroke-width="' + n(px(mm)) + '" opacity="' + (opacity || 1) + '"/>';
}

/* ---------- RADIANCE: 28 wavy tapered solar rays -------------
   Filled wedges rather than strokes: the reference reads as flame,
   and a tapered fill keeps a bold mid-body (which survives spread)
   while still coming to a point. The taper floor is 0.4mm — the doc's
   hard limit on where a tip may vanish.                          */

function rays(count, inF, outF, widthMM) {
  count = count || 28;
  var r0 = rad(inF || Z.rayIn);
  var r1 = rad(outF || Z.rayOut);
  var halfMax = px((widthMM || 3.8) / 2);
  var halfMin = px(0.2);               // 0.4mm floor at the tip
  var steps = 26;
  var out = [];

  for (var k = 0; k < count; k++) {
    var base = (k / count) * Math.PI * 2 - Math.PI / 2;
    var left = [];
    var right = [];

    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var r = r0 + t * (r1 - r0);
      // a gentle S-bend: the ray leans one way then recovers
      var a = base + 0.062 * Math.sin(t * Math.PI * 1.35);
      var w = Math.max(halfMin, halfMax * Math.pow(Math.sin(Math.PI * t), 0.55));
      var dA = w / r;                  // keep absolute width constant
      left.push(pt(r, a - dA));
      right.push(pt(r, a + dA));
    }

    var d = 'M' + n(left[0][0]) + ' ' + n(left[0][1]);
    for (var j = 1; j < left.length; j++) d += 'L' + n(left[j][0]) + ' ' + n(left[j][1]);
    for (var m = right.length - 1; m >= 0; m--) d += 'L' + n(right[m][0]) + ' ' + n(right[m][1]);
    d += 'Z';
    out.push('<path d="' + d + '" fill="' + GOLD + '"/>');
  }
  return out.join('\n  ');
}

/* ---------- STRUCTURE (C): one band of curved triangular cells
   Gap between cells is held at 3mm measured at the base — the
   widest point, where fill-in is most likely.                    */

function cells(count, rIn, rOut, gapMM) {
  count = count || 28;
  var gap = px(gapMM === undefined ? 3 : gapMM);
  var step = (Math.PI * 2) / count;
  var halfA = (step * rIn - gap) / 2 / rIn;   // half-angle at the base
  var out = [];

  for (var k = 0; k < count; k++) {
    var a = (k / count) * Math.PI * 2 - Math.PI / 2;
    var bl = pt(rIn, a - halfA);
    var br = pt(rIn, a + halfA);
    var apex = pt(rOut, a);
    /* Sides bulge OUTWARD (control point pushed past the straight-line
       midpoint), so the cell carries more mass through its middle — the
       part that has to survive spread — while still coming to a point.
       Mirrored exactly; an asymmetric control here reads as a fang. */
    var cMid = rIn + (rOut - rIn) * 0.42;
    var cl = pt(cMid, a - halfA * 0.90);
    var cr = pt(cMid, a + halfA * 0.90);

    out.push('<path d="M' + n(bl[0]) + ' ' + n(bl[1]) +
      ' Q' + n(cl[0]) + ' ' + n(cl[1]) + ' ' + n(apex[0]) + ' ' + n(apex[1]) +
      ' Q' + n(cr[0]) + ' ' + n(cr[1]) + ' ' + n(br[0]) + ' ' + n(br[1]) +
      // base follows the circle rather than cutting a chord across it
      ' A' + n(rIn) + ' ' + n(rIn) + ' 0 0 0 ' + n(bl[0]) + ' ' + n(bl[1]) +
      'Z" fill="' + GOLD + '"/>');
  }
  return out.join('\n  ');
}

/* ---------- STRUCTURE (A): two interlacing star polygons ------
   {12/4} decomposes into four triangles; two sets offset by half a
   step give eight. Chord distance from centre is Rout*cos(60deg) =
   0.5*Rout, so Rout = structOut puts the inner reach at exactly
   structIn — the lattice fills its band and stops.

   Every crossing is resolved: the lower-indexed triangle passes
   under and is cut away around the intersection. The cut is what
   keeps the crossing readable in ten years, so it is generous.   */

function segInt(p1, p2, p3, p4) {
  var d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-9) return null;
  var t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  var u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  if (t <= 0.001 || t >= 0.999 || u <= 0.001 || u >= 0.999) return null;
  return { t: t, u: u };
}

function lattice() {
  var Rout = rad(Z.structOut);
  var breakHalf = px(1.6);             // 1.6mm of clear air either side of a crossing
  var chords = [];
  var tri = 0;

  /* Two sets of {12/4}, the second rotated by half a vertex step. They
     carry DIFFERENT weights — 0.60mm and 0.38mm, a 1.6x ratio — because
     the doc's own rule says adjacent weights must differ by at least
     1.5x or spread erases the distinction. One set reads as the primary
     star, the other as secondary webbing; at equal weight the whole band
     flattens into texture. */
  [{ offset: 0, mm: 0.60 }, { offset: Math.PI / 12, mm: 0.38 }].forEach(function (layer) {
    for (var s = 0; s < 4; s++) {
      var v = [];
      for (var i = 0; i < 3; i++) {
        var idx = s + i * 4;
        v.push(pt(Rout, (idx / 12) * Math.PI * 2 - Math.PI / 2 + layer.offset));
      }
      for (var e = 0; e < 3; e++) {
        chords.push({ a: v[e], b: v[(e + 1) % 3], tri: tri, mm: layer.mm });
      }
      tri++;
    }
  });

  // resolve every crossing; the under-strand collects cut parameters
  for (var i2 = 0; i2 < chords.length; i2++) {
    for (var j = i2 + 1; j < chords.length; j++) {
      var A = chords[i2], B = chords[j];
      if (A.tri === B.tri) continue;
      /* Only HEAVY-on-HEAVY crossings get cut. Drawing this revealed why:
         24 chords cross about 150 times, and a 1.6mm break at every one
         reduces the thin webbing to dashes. Where the two strands already
         differ by 1.6x in weight, that difference does the work a gap
         would have done — the eye reads the lighter line as passing
         behind without needing air around it. Gaps are then spent only
         where they are actually needed, which is the same logic as the
         doc's "one bold zone only", applied inside a single band. */
      if (A.mm !== B.mm) continue;
      var hit = segInt(A.a, A.b, B.a, B.b);
      if (!hit) continue;
      var aUnder = A.tri < B.tri;
      var under = aUnder ? A : B;
      (under.cuts || (under.cuts = [])).push(aUnder ? hit.t : hit.u);
    }
  }

  var out = [];
  // lightest first, so the heavy star genuinely sits on top
  chords.sort(function (x, y) { return x.mm - y.mm; }).forEach(function (ch) {
    var len = Math.hypot(ch.b[0] - ch.a[0], ch.b[1] - ch.a[1]);
    var d = breakHalf / len;
    var cuts = (ch.cuts || []).slice().sort(function (x, y) { return x - y; });
    var spans = [];
    var from = 0;
    cuts.forEach(function (t) {
      if (t - d > from) spans.push([from, t - d]);
      from = Math.max(from, t + d);
    });
    if (from < 1) spans.push([from, 1]);

    spans.forEach(function (sp) {
      var p = [ch.a[0] + (ch.b[0] - ch.a[0]) * sp[0], ch.a[1] + (ch.b[1] - ch.a[1]) * sp[0]];
      var q = [ch.a[0] + (ch.b[0] - ch.a[0]) * sp[1], ch.a[1] + (ch.b[1] - ch.a[1]) * sp[1]];
      out.push('<line x1="' + n(p[0]) + '" y1="' + n(p[1]) + '" x2="' + n(q[0]) + '" y2="' +
        n(q[1]) + '" stroke="' + (ch.mm > 0.5 ? GOLD : SHADOW) + '" stroke-width="' +
        n(px(ch.mm)) + '" stroke-linecap="round"/>');
    });
  });

  // solid nodes at the twelve star points and twelve valleys: the part
  // that survives longest, carrying the secondary rhythm
  var nodeR = px(0.75);
  for (var k = 0; k < 12; k++) {
    var aOut = (k / 12) * Math.PI * 2 - Math.PI / 2;
    var po = pt(Rout, aOut);
    out.push('<circle cx="' + n(po[0]) + '" cy="' + n(po[1]) + '" r="' + n(nodeR) +
      '" fill="' + HIGHLIGHT + '"/>');
    var pv = pt(rad(Z.structIn), aOut + Math.PI / 12);
    out.push('<circle cx="' + n(pv[0]) + '" cy="' + n(pv[1]) + '" r="' + n(nodeR * 0.8) +
      '" fill="' + GOLD + '"/>');
  }
  return out.join('\n  ');
}

/* ---------- AURA: stipple that stays stipple ------------------
   Dart-thrown with a hard minimum spacing of 3x dot DIAMETER, which
   is the whole longevity rule. That cap is why a stipple field tops
   out near 10% coverage and can never carry a design's weight —
   the ladder's "one bold zone only" falls straight out of it.     */

function stipple(rIn, rOut, seed, spacingInMM, spacingOutMM, dotMM, ease) {
  var rng = mulberry32(seed);
  var dotR = px((dotMM || 0.7) / 2);
  var minSpacing = 3 * (dotR * 2);
  var placed = [];
  var cell = px(spacingOutMM) ;
  var grid = {};

  function key(x, y) { return Math.floor(x / cell) + ':' + Math.floor(y / cell); }

  function fits(x, y, want) {
    var gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    for (var dx = -2; dx <= 2; dx++) {
      for (var dy = -2; dy <= 2; dy++) {
        var bucket = grid[(gx + dx) + ':' + (gy + dy)];
        if (!bucket) continue;
        for (var i = 0; i < bucket.length; i++) {
          var o = bucket[i];
          if (Math.hypot(o[0] - x, o[1] - y) < want) return false;
        }
      }
    }
    return true;
  }

  var attempts = 90000;
  for (var i = 0; i < attempts; i++) {
    // area-uniform sampling across the annulus
    var u = rng();
    var r = Math.sqrt(rIn * rIn + u * (rOut * rOut - rIn * rIn));
    var a = rng() * Math.PI * 2;
    var x = C + r * Math.cos(a), y = C + r * Math.sin(a);
    var f = (r - rIn) / (rOut - rIn);
    var want = Math.max(minSpacing,
      px(spacingInMM + (spacingOutMM - spacingInMM) * Math.pow(f, ease || 1.5)));
    if (!fits(x, y, want)) continue;
    placed.push([x, y, f]);
    var k = key(x, y);
    (grid[k] || (grid[k] = [])).push([x, y]);
  }

  return placed.map(function (p) {
    var fade = 1 - p[2] * 0.55;
    var fill = p[2] > 0.72 ? BONE : (p[2] > 0.4 ? GOLD : HIGHLIGHT);
    var r = dotR * (1 - p[2] * 0.25);
    return '<circle cx="' + n(p[0]) + '" cy="' + n(p[1]) + '" r="' + n(r) +
      '" fill="' + fill + '" opacity="' + n(fade) + '"/>';
  }).join('\n  ');
}

/* ---------- petals (B) ---------------------------------------- */

function petals(count, rIn, rOut, swMM, colour, opacity) {
  var sw = px(swMM);
  var out = [];
  for (var k = 0; k < count; k++) {
    var a = (k / count) * Math.PI * 2 - Math.PI / 2;
    var inner = pt(rIn, a);
    var outer = pt(rOut, a);
    var spread = (Math.PI * 2 / count) * 0.62;
    var c1 = pt(rIn + (rOut - rIn) * 0.42, a - spread);
    var c2 = pt(rIn + (rOut - rIn) * 0.42, a + spread);
    out.push('<path d="M' + n(inner[0]) + ' ' + n(inner[1]) +
      ' Q' + n(c1[0]) + ' ' + n(c1[1]) + ' ' + n(outer[0]) + ' ' + n(outer[1]) +
      ' Q' + n(c2[0]) + ' ' + n(c2[1]) + ' ' + n(inner[0]) + ' ' + n(inner[1]) +
      'Z" fill="none" stroke="' + colour + '" stroke-width="' + n(sw) +
      '" opacity="' + opacity + '"/>');
  }
  return out.join('\n  ');
}

/* ---------- assembly ------------------------------------------ */

function svg(title, body) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + SIZE + ' ' + SIZE + '" ' +
    'width="' + SIZE + '" height="' + SIZE + '" role="img" aria-label="' + title + '">\n' +
    '  <title>' + title + '</title>\n' +
    '  <rect width="' + SIZE + '" height="' + SIZE + '" fill="' + JET + '"/>\n  ' +
    body + '\n</svg>\n';
}

function directionA() {
  return svg('Direction A — Alchemical Solar Lattice', [
    rays(28, Z.rayIn, Z.rayOut, 3.2),
    ring(0.345, 0.4, SHADOW, '0.6'),          // closes the band on the inside
    lattice(),
    ring(0.715, 0.6, SHADOW, '0.8'),          // and on the outside
    stipple(rad(Z.breathe), rad(Z.rim), 0x5C0771, 2.0, 7.0, 0.7, 1.5),
    core(Z.void, Z.ring, 1.5)
  ].join('\n  '));
}

function directionB() {
  return svg('Direction B — Ethereal Stellar Crown', [
    petals(16, rad(0.175), rad(0.500), 0.60, GOLD, '1'),
    petals(16, rad(0.215), rad(0.405), 0.35, SHADOW, '0.85'),
    petals(24, rad(0.530), rad(0.900), 0.35, SHADOW, '0.28'),
    // the gradient IS the design, so it gets the full dynamic range:
    // 1.9mm spacing at the inner edge out to 11mm at the rim
    stipple(rad(0.500), rad(Z.rim), 0x81004D, 2.3, 12, 0.7, 1.1),
    core(Z.void, Z.ring, 1.5)
  ].join('\n  '));
}

/* Direction C is drawn LARGER in the frame on purpose: with the aura
   gone there is nothing to occupy the outer third, so the seal expands
   to fill it. Same rules, different radii. */
function directionC() {
  return svg('Direction C — Modern Minimalist Sacred', [
    rays(28, 0.205, 0.455, 4.8),
    cells(28, rad(0.600), rad(0.775), 3),
    ring(0.830, 1.8, GOLD),                   // the seal's edge
    core(0.145, 0.172, 1.7)
  ].join('\n  '));
}

/* ---------- contact sheet: the legibility test ---------------- */

function contactSheet(items) {
  var cards = items.map(function (it) {
    return [
      '<section class="card">',
      '  <header><h2>' + it.name + '</h2><p>' + it.note + '</p></header>',
      '  <div class="sizes">',
      '    <figure><div class="s s-lg">' + it.svg + '</div><figcaption>200 mm — as worn</figcaption></figure>',
      '    <figure><div class="s s-md">' + it.svg + '</div><figcaption>80 mm — wrist</figcaption></figure>',
      '    <figure><div class="s s-sm">' + it.svg + '</div><figcaption>16 mm — favicon</figcaption></figure>',
      '  </div>',
      '</section>'
    ].join('\n');
  }).join('\n');

  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Mandala directions — scale test</title>',
    '<style>',
    '  :root { color-scheme: dark; --gold:#E8B653; --bone:#D7C6AE; }',
    '  body { margin:0; padding:40px 16px 64px; background:#0A0A0A; color:var(--bone);',
    '         font:16px/1.6 Georgia, "Times New Roman", serif; }',
    '  h1 { font-size:26px; letter-spacing:.14em; text-transform:uppercase;',
    '       color:var(--gold); font-weight:400; text-align:center; margin:0 0 6px; }',
    '  .lede { text-align:center; max-width:60ch; margin:0 auto 48px; opacity:.72; font-size:15px; }',
    '  .card { max-width:1100px; margin:0 auto 56px; }',
    '  .card header { border-bottom:1px solid rgba(232,182,83,.22); padding-bottom:10px; margin-bottom:22px; }',
    '  h2 { font-size:19px; color:var(--gold); font-weight:400; letter-spacing:.06em; margin:0; }',
    '  .card header p { margin:4px 0 0; font-size:14px; opacity:.66; }',
    '  .sizes { display:flex; flex-wrap:wrap; gap:32px; align-items:flex-end; justify-content:center; }',
    '  figure { margin:0; text-align:center; }',
    '  figcaption { font-size:12px; letter-spacing:.09em; text-transform:uppercase;',
    '               opacity:.5; margin-top:10px; }',
    '  .s svg { display:block; width:100%; height:auto; }',
    '  .s-lg { width:420px; } .s-md { width:168px; } .s-sm { width:64px; }',
    '  @media (max-width:640px){ .s-lg{width:300px} }',
    '</style></head><body>',
    '<h1>Geometry, built to last</h1>',
    '<p class="lede">The same drawing at three sizes. A direction earns the tagline only if it',
    '   still reads in the third column — that is the whole test.</p>',
    cards,
    '</body></html>'
  ].join('\n');
}

/* ---------- write --------------------------------------------- */

var outDir = path.join(__dirname, '..', 'docs', 'design');
fs.mkdirSync(outDir, { recursive: true });

var built = [
  { file: 'direction-a.svg', name: 'Direction A — Alchemical Solar Lattice',
    note: 'sigil core, two-layer {12/4} lattice with cut crossings, restrained stipple aura',
    svg: directionA() },
  { file: 'direction-b.svg', name: 'Direction B — Ethereal Stellar Crown',
    note: 'quiet geometric heart, the gradient carries the design',
    svg: directionB() },
  { file: 'direction-c.svg', name: 'Direction C — Modern Minimalist Sacred',
    note: 'core, rays, one cell band; nothing fine enough to fail',
    svg: directionC() }
];

built.forEach(function (b) {
  fs.writeFileSync(path.join(outDir, b.file), b.svg);
  console.log('wrote docs/design/' + b.file + '  (' + (b.svg.length / 1024).toFixed(1) + ' kB)');
});

fs.writeFileSync(path.join(outDir, 'contact-sheet.html'), contactSheet(built));
console.log('wrote docs/design/contact-sheet.html');
