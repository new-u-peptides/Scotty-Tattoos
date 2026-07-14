/* =============================================================
   mandala.js — animated sacred-geometry mandala, drawn in the
   language of Scotty Massa's dotwork.
   -------------------------------------------------------------
   Renders a layered mandala on any <canvas data-mandala> and
   cross-fades through four hand-stippled phases in a slow,
   continuous cycle:

     Phase 0 — DOTWORK   — golden-angle phyllotaxis bloom + mala rim
     Phase 1 — LOTUS     — three ogee-petal crowns at golden-ratio radii
     Phase 2 — LINEWORK  — seed of life + 12-point star + mehndi ray fringe
     Phase 3 — SHADING   — density-graded value bands + whip-fade crescents

   ARCHITECTURE (bake & composite):
   each phase is generated once from a seeded PRNG into a list of
   {x, y, r, a} dots in unit space (radius 1 = rim), then baked into
   its own offscreen canvas using equal-area fillRect stipple (far
   cheaper than per-frame arc()+fill(), and the per-dot rgba-string
   parsing is gone from the hot path entirely). Baking is chunked so
   a big hero disc stipples in progressively without ever stalling a
   frame. Every animation frame is then just a clearRect plus a
   handful of transformed drawImage() blits — <2ms of scripting even
   on mid-range mobile.

   No additive mud: a persistent low-alpha SPINE (outer rim + inner
   ring + centre seal) anchors the composition so it never reads
   empty, and the four phases cross-fade with an energy-conserving
   weight (sin²) so overlaps hold ~constant ink coverage instead of
   darkening. Each layer counter-rotates at its own rate for depth.

   Zero dependencies. Deterministic (seeded). Honours
   prefers-reduced-motion (one baked still). Pauses offscreen
   (IntersectionObserver, clock frozen so phases don't jump). Rebakes
   on resize (ResizeObserver). DPR capped at 2. Tears itself down on
   disconnect so partials:loaded re-inits never leak observers/loops.

   Pairs with assets/css/components/mandala.css for placement, the
   hero sigil glow, and the ornament variants.

   Markup:
     <canvas data-mandala data-mandala-theme="ink"></canvas>

   Data attributes (all optional):
     data-mandala-theme    : ink | red | gold | white | bark   (default: red)
     data-mandala-rings    : integer, geometry density          (default: 4)
     data-mandala-dots     : integer, rim beads / stipple scale  (default: 96)
     data-mandala-speed    : float, rotation speed multiplier    (default: 1)
     data-mandala-weight   : float, dot/line boldness multiplier (default: 1)
     data-mandala-opacity  : float 0-1, overall canvas opacity   (default: 1)
     data-mandala-cycle    : ms per full phase cycle             (default: 30000)
     data-mandala-seed     : PRNG seed string                    (default: "scotty-massa")
     data-mandala-density  : stipple density multiplier 0.1-4    (default: 1)
     data-mandala-fit      : radius / half-min-side, 0.4-1.0     (default: 0.92)
     data-mandala-phases   : subset/order of
                             dotwork,lotus,linework,shading      (default: all four)
     data-mandala-glow     : 0-1.5 baked warm halo under the ink (default: 0 = off)
     data-mandala-drift    : "scroll" -> rotate with page scroll (default: off)
     data-mandala-interactive : "true" -> pointer proximity wake (default: off)
     data-mandala-animate  : "false" -> one static baked frame   (default: true)
   ============================================================= */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.39996 rad (137.5°)
  var WIDTH = 0.30;          // phase pulse half-width (clean 2-layer crossfades)
  var SPINE_ALPHA = 0.22;    // persistent skeleton opacity
  var BASE_DOT = 1.5;        // base stipple dot size in CSS px

  var PHASE_ROT = {          // per-layer rotation multiplier (parallax + depth)
    dotwork: 1.00, lotus: 0.55, linework: -0.40, shading: 0.25, spine: 0.15
  };
  var ALL_PHASES = ['dotwork', 'lotus', 'linework', 'shading'];

  var PALETTES = {
    // ink = bold black ink + dotwork with blood-red accents.
    ink:   { stroke: 'rgba(10, 10, 10, 0.94)',    accent: 'rgba(200, 16, 46, 0.96)',   dot: 'rgba(10, 10, 10, 0.92)',   center: 'rgba(200, 16, 46, 1)' },
    red:   { stroke: 'rgba(200, 16, 46, 0.78)',   accent: 'rgba(245, 242, 236, 0.92)', dot: 'rgba(245, 242, 236, 0.62)', center: 'rgba(200, 16, 46, 1)' },
    gold:  { stroke: 'rgba(184, 149, 106, 0.82)', accent: 'rgba(245, 239, 230, 0.92)', dot: 'rgba(245, 239, 230, 0.58)', center: 'rgba(184, 149, 106, 1)' },
    white: { stroke: 'rgba(245, 242, 236, 0.80)', accent: 'rgba(200, 16, 46, 0.92)',   dot: 'rgba(245, 242, 236, 0.52)', center: 'rgba(245, 242, 236, 1)' },
    bark:  { stroke: 'rgba(61, 40, 23, 0.55)',    accent: 'rgba(184, 149, 106, 0.80)', dot: 'rgba(61, 40, 23, 0.45)',    center: 'rgba(61, 40, 23, 0.95)' }
  };

  var prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function attr(el, key, fallback) {
    var v = el.getAttribute('data-mandala-' + key);
    return v == null ? fallback : v;
  }
  function num(el, key, fallback) {
    var v = parseFloat(attr(el, key, fallback));
    return isFinite(v) ? v : fallback;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function smootherstep(t) { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }

  // Smooth bump: 1.0 at peakAt, easing to 0 at distance >= width. Wraps 0..1.
  function smoothPulse(phase, peakAt, width) {
    var d = phase - peakAt;
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    d = Math.abs(d);
    if (d >= width) return 0;
    return smootherstep(1 - d / width);
  }

  // Seeded PRNG — identical stipple layout on every load.
  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Parse an rgba()/hex colour once into {r,g,b,a}.
  function parseColor(str) {
    var m = /rgba?\(([^)]+)\)/.exec(str);
    if (m) {
      var p = m[1].split(',');
      return {
        r: parseFloat(p[0]) || 0, g: parseFloat(p[1]) || 0, b: parseFloat(p[2]) || 0,
        a: p.length > 3 ? (parseFloat(p[3]) || 0) : 1
      };
    }
    var h = (str + '').replace('#', '');
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    return { r: parseInt(h.slice(0, 2), 16) || 0, g: parseInt(h.slice(2, 4), 16) || 0, b: parseInt(h.slice(4, 6), 16) || 0, a: 1 };
  }

  /* ---------- a dot toolkit bound to one figure (unit space, radius 1 = rim).
     Every helper appends dots {x, y, r, a, c} (c = colour key: dot|stroke|
     accent) that get baked to a pixel layer once. Draws in the same visual
     dialect as the hero engine (shared/js/hero-mandala.js). */
  function toolkit(rand) {
    var dots = [];
    function jit(p, amt) { return [p[0] + (rand() - 0.5) * amt, p[1] + (rand() - 0.5) * amt]; }
    function P(r, a) { return [Math.cos(a) * r, Math.sin(a) * r]; }
    var T = { dots: dots, rand: rand, P: P };

    T.dot = function (x, y, r, a, c) { dots.push({ x: x, y: y, r: r, a: a, c: c || 'dot' }); };

    // a crisp dotted quadratic curve (linework as fine single-needle stipple)
    T.curve = function (p0, cp, p1, steps, size, alpha, c) {
      for (var s = 0; s <= steps; s++) {
        var t = s / steps, u = 1 - t;
        var x = u * u * p0[0] + 2 * u * t * cp[0] + t * t * p1[0];
        var y = u * u * p0[1] + 2 * u * t * cp[1] + t * t * p1[1];
        var p = jit([x, y], 0.006);
        T.dot(p[0], p[1], size * (0.8 + rand() * 0.5), alpha * (0.8 + rand() * 0.3), c);
      }
    };
    // a crisp dotted straight line
    T.line = function (p0, p1, size, alpha, c) {
      var dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.sqrt(dx * dx + dy * dy);
      var n = Math.max(2, Math.round(len * 170));
      for (var s = 0; s <= n; s++) {
        var t = s / n, p = jit([p0[0] + dx * t, p0[1] + dy * t], 0.005);
        T.dot(p[0], p[1], size * (0.75 + rand() * 0.5), alpha * (0.8 + rand() * 0.3), c);
      }
    };
    // a dotted circle outline
    T.ring = function (cx, cy, rad, size, alpha, c) {
      var steps = Math.max(20, Math.round(rad * 210));
      for (var s = 0; s < steps; s++) {
        var a = (s / steps) * TAU, p = jit([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad], 0.005);
        T.dot(p[0], p[1], size * (0.75 + rand() * 0.5), alpha * (0.75 + rand() * 0.35), c);
      }
    };
    // a dotted circular arc
    T.arc = function (cx, cy, rad, a0, a1, size, alpha, c) {
      var span = a1 - a0, steps = Math.max(3, Math.round(Math.abs(span) * rad * 210));
      for (var s = 0; s <= steps; s++) {
        var a = a0 + span * (s / steps), p = jit([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad], 0.004);
        T.dot(p[0], p[1], size * (0.75 + rand() * 0.4), alpha * (0.8 + rand() * 0.3), c);
      }
    };
    // one refined ogee petal. The sides are S-curves — a rounded shoulder
    // that bulges past the base width, easing concave into a tapered tip —
    // capped with a small arc so the point reads sculpted, not spiked.
    // A confident inner echo outline, a base arc, highlight ridge dots along
    // the outer third of each edge (accent ink), a shadow pool at the base
    // for tonal separation from the ring beneath, and a stipple fill whose
    // density climbs toward the tip. fillN 0 -> outline + ridge only.
    T.petal = function (a, hw, rIn, rOut, fillN, edgeC, fillC) {
      var span = rOut - rIn;
      var tipR = rOut - span * 0.05;
      var bL = P(rIn, a - hw), bR = P(rIn, a + hw);
      var tL = P(tipR, a - hw * 0.10), tR = P(tipR, a + hw * 0.10);
      // S-curve sides via two quadratic passes: shoulder, then taper
      var shR = P(rIn + span * 0.34, a + hw * 1.10), shL = P(rIn + span * 0.34, a - hw * 1.10);
      var mdR = P(rIn + span * 0.58, a + hw * 0.66), mdL = P(rIn + span * 0.58, a - hw * 0.66);
      var tpR = P(rIn + span * 0.80, a + hw * 0.28), tpL = P(rIn + span * 0.80, a - hw * 0.28);
      T.curve(bR, shR, mdR, 16, 0.6, 1.0, edgeC);
      T.curve(mdR, tpR, tR, 16, 0.6, 1.0, edgeC);
      T.curve(bL, shL, mdL, 16, 0.6, 1.0, edgeC);
      T.curve(mdL, tpL, tL, 16, 0.6, 1.0, edgeC);
      // rounded tip cap
      T.arc(0, 0, tipR + span * 0.012, a - hw * 0.11, a + hw * 0.11, 0.5, 0.95, edgeC);
      // inner echo outline (the tattooer's confident second pass)
      var rIe = rIn + span * 0.10;
      var tip2 = P(rOut * 0.88, a), bL2 = P(rIe, a - hw * 0.82), bR2 = P(rIe, a + hw * 0.82);
      var cR2 = P(rIn + span * 0.62, a + hw * 0.48), cL2 = P(rIn + span * 0.62, a - hw * 0.48);
      T.curve(bR2, cR2, tip2, 22, 0.5, 0.7, edgeC);
      T.curve(tip2, cL2, bL2, 22, 0.5, 0.7, edgeC);
      // base arc
      var arcN = Math.max(6, Math.round(hw * 28));
      for (var s = 0; s <= arcN; s++) {
        var aa = a - hw + (2 * hw) * (s / arcN), p = jit(P(rIn, aa), 0.005);
        T.dot(p[0], p[1], 0.52 * (0.8 + rand() * 0.4), 0.9, edgeC);
      }
      // highlight ridge: bright accent dots riding the outer third of each edge
      for (var hR = 0; hR < 2; hR++) {
        var sgn = hR ? 1 : -1;
        for (var q = 0; q < 6; q++) {
          var uu = 0.64 + 0.32 * (q / 5);
          var ww = hw * Math.pow(1 - uu, 0.72) * 1.02;
          var hp = jit(P(rIn + span * uu, a + sgn * ww), 0.004);
          T.dot(hp[0], hp[1], 0.6, 0.8, 'accent');
        }
      }
      // base shadow pool — quiet tonal step between this petal and the ring
      // below (skipped for outline-only petals)
      var nS = fillN > 0 ? Math.max(6, Math.round(fillN * 0.12)) : 0;
      for (var b = 0; b < nS; b++) {
        var us = Math.pow(rand(), 2.2) * 0.20;
        var vs = (rand() * 2 - 1) * hw * 0.85;
        var sp = jit(P(rIn + span * us, a + vs), 0.006);
        T.dot(sp[0], sp[1], 0.5, 0.22 + rand() * 0.2, fillC);
      }
      // tip-weighted fill
      for (var i = 0; i < fillN; i++) {
        var u = rand();                              // 0 base -> 1 tip
        if (rand() > 0.55 + 0.45 * u) continue;      // denser toward the tip
        var hwAt = hw * Math.pow(1 - u, 0.62);       // petal narrows to the tip
        var v = (rand() * 2 - 1); v = v * (1 - 0.18 * v * v);
        var p2 = jit(P(rIn + span * u, a + v * hwAt), 0.008);
        T.dot(p2[0], p2[1], 0.55 * (0.7 + rand() * 0.6), 0.5 + 0.42 * u + 0.05 * rand(), fillC);
      }
    };
    // flower-of-life heart: central circle + six around it (each through the
    // centre, as the construction demands) inside a ring, plus a stipple core.
    T.heart = function (rc) {
      T.ring(0, 0, rc, 0.5, 0.85, 'stroke');
      for (var k = 0; k < 6; k++) {
        var ca = -Math.PI / 2 + k * (TAU / 6);
        T.ring(Math.cos(ca) * rc, Math.sin(ca) * rc, rc, 0.46, 0.8, 'stroke');
      }
      T.ring(0, 0, rc * 2, 0.5, 0.8, 'stroke');
      for (var c = 0; c < 60; c++) {
        var aa = rand() * TAU, rr = Math.pow(rand(), 1.4) * rc * 0.7;
        T.dot(Math.cos(aa) * rr, Math.sin(aa) * rr, 0.42 * (0.7 + rand() * 0.5), 0.5 + rand() * 0.3, 'accent');
      }
    };
    return T;
  }

  /* ---------- phase builders (unit space, radius 1 = rim) ---------- */

  // DOTWORK — a sunflower-seed stipple field (golden-angle phyllotaxis) whose
  // value comes from dot SPACING, not grey ink: airy toward the centre, dense
  // toward the rim, ringed by a mala of beads with heavier guru beads.
  function buildDotwork(T, o) {
    var rand = T.rand;
    var N = Math.max(400, Math.min(o.capN, Math.round(o.dots * 24 * o.density)));
    for (var i = 0; i < N; i++) {
      var f = i / N, rr = Math.sqrt(f);           // even areal spread
      if (rand() > 0.10 + 0.90 * rr * rr) continue; // strong airy heart, dense rim
      var ang = i * GOLDEN_ANGLE;                  // clean spiral arms (no jitter)
      var rad = rr * 0.90 + (rand() - 0.5) * 0.006;
      T.dot(Math.cos(ang) * rad, Math.sin(ang) * rad, 0.5 + rand() * 0.2, 0.82 + rand() * 0.18, 'dot');
    }
    // mala rim: `dots` beads at 0.985R, every 8th a heavier guru/marker bead
    var beads = Math.max(24, o.dots);
    for (var b = 0; b < beads; b++) {
      var a = (b / beads) * TAU, big = (b % 8 === 0);
      T.dot(Math.cos(a) * 0.985, Math.sin(a) * 0.985, big ? 1.2 : 0.62, big ? 1.0 : 0.9, 'dot');
    }
    T.ring(0, 0, 0.955, 0.42, 0.5, 'dot');
    T.ring(0, 0, 0.905, 0.36, 0.42, 'dot');
  }

  // LOTUS — three concentric crowns of ogee petals at golden-ratio radii,
  // alternate crowns offset so tips nestle in the notches behind. The outer
  // crown carries the ornamental edge: an alternating long/short petal
  // rhythm, tip beads on the long petals, and scallop arcs bridging the
  // bases so the perimeter flows as a crafted crown, not a ring of spikes.
  function buildLotus(T, o) {
    var crowns = [
      { m: Math.max(12, o.rings * 3),             rIn: 0.585, rOut: 0.95, hw: 0.80, off: false, alt: true  },
      { m: Math.max(8,  o.rings * 2),             rIn: 0.38,  rOut: 0.62, hw: 0.82, off: true,  alt: false },
      { m: Math.max(6,  Math.round(o.rings * 1.5)), rIn: 0.20, rOut: 0.40, hw: 0.85, off: false, alt: false }
    ];
    for (var ci = 0; ci < crowns.length; ci++) {
      var C = crowns[ci], hw = (Math.PI / C.m) * C.hw;
      var a0 = -Math.PI / 2 + (C.off ? (Math.PI / C.m) : 0);
      var fillN = Math.max(28, Math.round((C.rOut - C.rIn) * C.rOut * 500 * o.density));
      for (var i = 0; i < C.m; i++) {
        var a = a0 + i * (TAU / C.m);
        var isLong = !C.alt || (i % 2 === 0);
        var rOut = isLong ? C.rOut : C.rIn + (C.rOut - C.rIn) * 0.82;
        T.petal(a, hw, C.rIn, rOut, fillN, (i % 3 === 0) ? 'accent' : 'stroke', 'dot');
        if (C.alt && isLong) {
          T.dot(Math.cos(a) * (rOut + 0.02), Math.sin(a) * (rOut + 0.02), 1.0, 0.95, 'accent');
        }
      }
      // scallop arcs riding between the outer crown's petal bases
      if (C.alt) {
        for (var sI = 0; sI < C.m; sI++) {
          var sa = a0 + (sI + 0.5) * (TAU / C.m);
          T.arc(Math.cos(sa) * (C.rIn + 0.012), Math.sin(sa) * (C.rIn + 0.012), 0.026,
                sa - Math.PI * 0.9, sa + Math.PI * 0.9, 0.42, 0.55, 'stroke');
        }
      }
    }
    T.heart(0.105);
    T.ring(0, 0, 1.0, 0.5, 0.4, 'dot');
  }

  // LINEWORK — correct sacred-geometry construction in fine dotted line:
  // seed of life, a double-hexagram 12-point star locked by a dodecagon,
  // a mehndi ray fringe and a scalloped rim.
  function buildLinework(T, o) {
    var P = T.P;
    function hexagram(rO, rot) {
      var V = [], k;
      for (k = 0; k < 6; k++) V.push(P(rO, rot + k * (TAU / 6)));
      T.line(V[0], V[2], 0.55, 0.86, 'accent'); T.line(V[2], V[4], 0.55, 0.86, 'accent'); T.line(V[4], V[0], 0.55, 0.86, 'accent');
      T.line(V[1], V[3], 0.55, 0.86, 'accent'); T.line(V[3], V[5], 0.55, 0.86, 'accent'); T.line(V[5], V[1], 0.55, 0.86, 'accent');
    }
    function frame(rO, sides, rot, size, alpha, c) {
      var prev = P(rO, rot);
      for (var k = 1; k <= sides; k++) { var p = P(rO, rot + k * (TAU / sides)); T.line(prev, p, size, alpha, c); prev = p; }
    }

    // outer double rim
    T.ring(0, 0, 1.00, 0.55, 0.72, 'stroke');
    T.ring(0, 0, 0.965, 0.45, 0.5, 'stroke');
    // mehndi ray band: every 6th ray extended and finished with a terminal dot
    var rays = Math.max(48, o.rings * 12), i;
    for (i = 0; i < rays; i++) {
      var a = -Math.PI / 2 + i * (TAU / rays), ext = (i % 6 === 0);
      T.line(P(0.74, a), P(ext ? 0.955 : 0.92, a), 0.48, 0.66, 'stroke');
      if (ext) T.dot(Math.cos(a) * 0.955, Math.sin(a) * 0.955, 0.95, 0.9, 'accent');
    }
    // scalloped fringe of small outward arcs riding the rim
    var scal = Math.max(18, Math.round(o.dots / 3));
    for (i = 0; i < scal; i++) {
      var a2 = (i / scal) * TAU;
      T.arc(Math.cos(a2) * 0.975, Math.sin(a2) * 0.975, 0.028, a2 - Math.PI * 0.9, a2 + Math.PI * 0.9, 0.4, 0.55, 'stroke');
    }
    // ring of pointed petal OUTLINES (fillN 0)
    var pet = Math.max(12, o.rings * 4), hw = (TAU / pet) * 0.6;
    for (i = 0; i < pet; i++) T.petal(-Math.PI / 2 + i * (TAU / pet), hw, 0.62, 0.84, 0, 'stroke', 'stroke');
    T.ring(0, 0, 0.62, 0.5, 0.6, 'stroke');
    // layered 12-point star + dodecagon / hexagon frames
    hexagram(0.56, -Math.PI / 2);
    hexagram(0.56, -Math.PI / 2 + TAU / 12);
    frame(0.44, 12, -Math.PI / 2, 0.5, 0.7, 'stroke');
    frame(0.34, 6, -Math.PI / 2, 0.5, 0.7, 'stroke');
    frame(0.34, 6, -Math.PI / 2 + TAU / 12, 0.48, 0.6, 'stroke');
    T.ring(0, 0, 0.30, 0.45, 0.6, 'stroke');
    // seed-of-life heart
    T.heart(0.135);
  }

  // SHADING — a dotwork value study: three tonal bands with value encoded as
  // ring-dot density, overlaid with whip-fade crescents offset from the lotus
  // petal axes so they read as the petals' cast shadows during the cross-fade.
  function buildShading(T, o) {
    var rand = T.rand;
    // Smooth airbrushed value halo: many fine rings of even (blue-noise-ish)
    // stipple whose density and darkness climb smoothly toward the rim — no
    // visible band edges, no clumps. This is a dotwork value study, not noise.
    var rings = 66, k = 8.5 * o.density, spacing = 0.82 / rings;
    for (var ri = 0; ri < rings; ri++) {
      var t = ri / (rings - 1);
      var r = 0.14 + t * 0.82;
      var val = 0.12 + 0.88 * smoothstep(t);        // airbrush falloff
      var n = Math.max(4, Math.round(TAU * r * val * k * 2));
      var off = rand() * TAU;
      for (var i = 0; i < n; i++) {
        var a = off + (i / n) * TAU + (rand() - 0.5) * (TAU / n) * 0.9; // even + jitter
        var jr = (rand() - 0.5) * spacing * 1.6;
        T.dot(Math.cos(a) * (r + jr), Math.sin(a) * (r + jr),
              0.45 + rand() * 0.12, (0.32 + 0.5 * val) * (0.8 + rand() * 0.3), 'dot');
      }
    }
    // Soft petal-shadow crescents — feathered, offset from the lotus petal axes
    // so during the cross-fade they read as the petals' cast shadows.
    var m = 16, offA = -7 * Math.PI / 180, per = Math.max(18, Math.round(30 * o.density));
    for (var c = 0; c < m; c++) {
      var ca = -Math.PI / 2 + c * (TAU / m) + offA;
      for (var j = 0; j < per; j++) {
        var u = rand(), edge = 1 - u;                // dense/dark at the outer edge
        if (rand() > 0.4 + 0.6 * edge) continue;
        var rr = 0.92 - 0.42 * u, spread = (TAU / m) * (0.16 + 0.34 * u);
        var aa = ca + (rand() * 2 - 1) * spread;
        T.dot(Math.cos(aa) * rr, Math.sin(aa) * rr, 0.45 + rand() * 0.12, 0.24 + 0.34 * edge, 'dot');
      }
    }
  }

  // SPINE — the persistent skeleton drawn faintly under every phase so the
  // composition never reads empty (replaces the old per-phase alpha floors).
  function buildSpine(T) {
    T.ring(0, 0, 1.0, 0.55, 0.6, 'stroke');
    T.ring(0, 0, 0.62, 0.42, 0.5, 'stroke');
    for (var k = 0; k < 6; k++) {
      var a = -Math.PI / 2 + k * (TAU / 6);
      T.dot(Math.cos(a) * 0.05, Math.sin(a) * 0.05, 1.0, 0.8, 'accent');
    }
  }

  var BUILDERS = {
    dotwork: buildDotwork, lotus: buildLotus, linework: buildLinework,
    shading: buildShading, spine: buildSpine
  };

  // Live instances, swept by autoInit() so re-inits after DOM swaps never leak.
  var INSTANCES = [];

  /* ---------- engine ---------- */

  function init(canvas) {
    if (canvas.dataset.mandalaBound) return;
    canvas.dataset.mandalaBound = '1';

    var themeName = attr(canvas, 'theme', 'red');
    var theme   = PALETTES[themeName] || PALETTES.red;
    var rings   = Math.max(1, Math.floor(num(canvas, 'rings', 4)));
    var dots    = Math.max(12, Math.floor(num(canvas, 'dots', 96)));
    var speed   = num(canvas, 'speed', 1);
    var weightK = clamp(num(canvas, 'weight', 1), 0.3, 2.2);
    var opacity = clamp(num(canvas, 'opacity', 1), 0, 1);
    var cycle   = Math.max(2000, num(canvas, 'cycle', 30000));
    var seed    = attr(canvas, 'seed', 'scotty-massa');
    var density = clamp(num(canvas, 'density', 1), 0.1, 4);
    var fit     = clamp(num(canvas, 'fit', 0.92), 0.4, 1.0);
    var glow    = clamp(num(canvas, 'glow', 0), 0, 1.5);
    var drift   = (attr(canvas, 'drift', '') + '').toLowerCase();
    var interactive = attr(canvas, 'interactive', 'false') === 'true';
    var animate = attr(canvas, 'animate', 'true') !== 'false';

    // phase list: subset/reorder of the four, defaulting to all in legacy order
    var phases = (attr(canvas, 'phases', '') + '').toLowerCase().split(',')
      .map(function (s) { return s.trim(); })
      .filter(function (n) { return BUILDERS[n] && n !== 'spine'; });
    if (!phases.length) phases = ALL_PHASES.slice();

    var colorRGB = {}, colorBaseA = {};
    ['dot', 'stroke', 'accent', 'center'].forEach(function (key) {
      var c = parseColor(theme[key]);
      colorRGB[key] = 'rgb(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ')';
      colorBaseA[key] = c.a;
    });

    var ctx = canvas.getContext('2d', { alpha: true });
    var layers = {};                 // phase name -> baked layer {cv,g,dots,i,done,...}
    var glowCv = null, builtFor = '';
    var size = { w: 1, h: 1, dpr: 1 };
    var staticMode = !animate || prefersReducedMotion;
    var visible = true, start = performance.now(), pausedAt = 0;
    var scrollY = 0, wake = 0, wakeTarget = 0;
    // Canonical time for the reduced-motion / animate="false" still frame:
    // mid-lotus (Scotty's signature). Used by both the static draw and refit()
    // so a resize never redraws the still at a different phase.
    var STILL_ELAPSED = cycle * 0.25 + 1400;

    function fit_() {
      var rect = canvas.getBoundingClientRect();
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var w = Math.max(1, Math.floor(rect.width));
      var h = Math.max(1, Math.floor(rect.height));
      var bw = Math.floor(w * dpr), bh = Math.floor(h * dpr);
      if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
      return { w: w, h: h, dpr: dpr };
    }

    // Build one phase's dot list, capped by disc area so a small mobile disc
    // never overdraws into solid black.
    function buildPhase(name) {
      var dpr = size.dpr;
      var R = Math.min(canvas.width, canvas.height) * 0.5 * fit;
      var cssR = R / dpr;
      var capN = Math.max(4000, Math.round(Math.PI * cssR * cssR));
      var rnd = mulberry32(xmur3(seed + '|' + name)());
      var T = toolkit(rnd);
      BUILDERS[name](T, { rings: rings, dots: dots, density: density, capN: capN });
      return T.dots;
    }

    function startBake(name) {
      if (layers[name]) return layers[name];
      var pw = canvas.width, ph = canvas.height, dpr = size.dpr;
      var cv = document.createElement('canvas'); cv.width = pw; cv.height = ph;
      layers[name] = {
        cv: cv, g: cv.getContext('2d'), dots: buildPhase(name), i: 0, done: false,
        cx: pw / 2, cy: ph / 2, R: Math.min(pw, ph) * 0.5 * fit, dpr: dpr
      };
      return layers[name];
    }
    // Progressive bake: chunked so a big disc stipples in without freezing rAF.
    function stepBake(name, budget) {
      var e = layers[name]; if (!e || e.done) return;
      var g = e.g, ds = e.dots, end = Math.min(e.i + budget, ds.length);
      var cx = e.cx, cy = e.cy, R = e.R, dpr = e.dpr;
      var minR = Math.max(0.6, 0.5 * dpr), sz = BASE_DOT * dpr * weightK;
      var curC = null;
      // Round stipple. Baking is one-time and chunked, so arc()+fill() (which
      // reads as real dotwork, not digital squares) costs us nothing per frame.
      for (var i = e.i; i < end; i++) {
        var d = ds[i];
        if (d.c !== curC) { curC = d.c; g.fillStyle = colorRGB[curC] || colorRGB.dot; }
        g.globalAlpha = clamp(d.a * (colorBaseA[curC] || 1), 0, 1);
        var rr = Math.max(minR, d.r * sz);
        g.beginPath();
        g.arc(cx + d.x * R, cy + d.y * R, rr, 0, TAU);
        g.fill();
      }
      e.i = end;
      if (end >= ds.length) { e.done = true; e.dots = null; g.globalAlpha = 1; }
    }

    // Optional baked warm halo under the ink (for dark grounds without the CSS
    // stage). Off by default so legacy canvases stay pixel-honest.
    function bakeGlow() {
      if (glow <= 0) { glowCv = null; return; }
      var pw = canvas.width, ph = canvas.height;
      var cx = pw / 2, cy = ph / 2, R = Math.min(pw, ph) * 0.5 * fit;
      glowCv = document.createElement('canvas'); glowCv.width = pw; glowCv.height = ph;
      var hg = glowCv.getContext('2d');
      var acc = parseColor(theme.accent);
      var grad = hg.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 1.12);
      grad.addColorStop(0.00, 'rgba(245,242,236,' + (0.10 * glow) + ')');
      grad.addColorStop(0.55, 'rgba(' + Math.round(acc.r) + ',' + Math.round(acc.g) + ',' + Math.round(acc.b) + ',' + (0.08 * glow) + ')');
      grad.addColorStop(1.00, 'rgba(0,0,0,0)');
      hg.fillStyle = grad; hg.beginPath(); hg.arc(cx, cy, R * 1.12, 0, TAU); hg.fill();
    }

    function ensureSize() {
      var key = canvas.width + 'x' + canvas.height;
      if (key === builtFor) return;
      builtFor = key;
      layers = {};
      bakeGlow();
    }

    function drawSeal(cx, cy, alpha) {
      var R = Math.min(canvas.width, canvas.height) * 0.5 * fit;
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.fillStyle = colorRGB.center;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, R * 0.012) * Math.min(weightK, 1.8), 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    function draw(now) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ensureSize();
      var elapsed = now - start; if (elapsed < 0) elapsed = 0;
      var intro = smootherstep(clamp(elapsed / 1400, 0, 1));
      var cx = canvas.width / 2, cy = canvas.height / 2;
      var bud = staticMode ? 1e9 : 11000;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (interactive && !staticMode) { wake += (wakeTarget - wake) * 0.06; }
      var eff = speed * (1 + 0.18 * wake);
      var breath = 1 + (0.012 + 0.05 * wake) * Math.sin(elapsed * 0.0006 * speed);
      var rot = elapsed * 0.0001 * eff + (drift === 'scroll' ? scrollY * 0.0002 : 0);
      var base = 0.965 + 0.035 * intro;

      if (glowCv) { ctx.globalAlpha = intro * opacity; ctx.drawImage(glowCv, 0, 0); ctx.globalAlpha = 1; }

      function blit(name, alpha, extraScale) {
        var e = layers[name];
        if (!e || alpha <= 0.003) return;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot * (PHASE_ROT[name] || 0.3));
        var scl = base * breath * extraScale;
        ctx.scale(scl, scl);
        ctx.translate(-cx, -cy);
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.drawImage(e.cv, 0, 0);
        ctx.restore();
      }

      // energy-conserving phase weights — overlaps hold ~constant ink coverage.
      // Pulse width scales with phase count so fewer phases still cover the whole
      // cycle (a single-phase ornament stays constant rather than winking out).
      var phase = (elapsed % cycle) / cycle, N = phases.length, i, a = [];
      if (N <= 1) {
        a = [1];
      } else {
        var width = N >= 4 ? WIDTH : (0.5 / N + 0.16);
        var raw = [], sum = 0;
        for (i = 0; i < N; i++) { var w = smoothPulse(phase, i / N, width); raw.push(w); sum += w; }
        var denom = Math.max(1, sum);
        for (i = 0; i < N; i++) a.push(Math.pow(Math.sin((raw[i] / denom) * (Math.PI / 2)), 2));
      }

      // persistent spine, always baked
      startBake('spine'); stepBake('spine', bud);
      blit('spine', SPINE_ALPHA * intro * opacity, 1);

      // phases (a layer bakes lazily the moment it first has weight, ~0.3 cycle
      // before its peak, so a cross-fade never hits an empty layer)
      for (i = 0; i < N; i++) {
        if (a[i] <= 0.004) continue;
        startBake(phases[i]); stepBake(phases[i], bud);
        blit(phases[i], a[i] * intro * opacity, 1 + 0.03 * (1 - a[i]));
      }

      // live centre seal — stays perfectly crisp under rotation, anchors all phases
      drawSeal(cx, cy, intro * opacity);
      ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /* ---- loop / lifecycle ---- */
    var raf = null, io = null, ro = null, destroyed = false;
    function frame(now) {
      if (destroyed) return;
      if (!canvas.isConnected) { destroy(); return; }
      if (!visible) { raf = null; return; }
      draw(now);
      raf = requestAnimationFrame(frame);
    }
    function startLoop() { if (!raf && !destroyed) raf = requestAnimationFrame(frame); }
    function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    var resizePending = false;
    function refit() {
      if (resizePending) return; resizePending = true;
      requestAnimationFrame(function () {
        resizePending = false;
        if (destroyed) return;
        size = fit_();
        draw(staticMode ? (start + STILL_ELAPSED) : performance.now());
      });
    }

    function onScroll() { scrollY = window.pageYOffset || 0; }
    function onMove(e) {
      var r = canvas.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      var dist = Math.sqrt(dx * dx + dy * dy), reach = Math.max(r.width, r.height) * 0.9;
      wakeTarget = clamp(1 - dist / reach, 0, 1);
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      if (io) io.disconnect();
      if (ro) ro.disconnect(); else window.removeEventListener('resize', refit);
      if (drift === 'scroll') window.removeEventListener('scroll', onScroll);
      if (interactive) window.removeEventListener('pointermove', onMove);
      layers = {}; glowCv = null;
      delete canvas.dataset.mandalaBound;
      for (var j = INSTANCES.length - 1; j >= 0; j--) {
        if (INSTANCES[j].canvas === canvas) INSTANCES.splice(j, 1);
      }
    }
    // Register for the autoInit() sweep so a canvas removed from the DOM is torn
    // down even when it never gets a rAF/IntersectionObserver event to notice —
    // e.g. static/reduced-motion canvases (no loop, no IO) and canvases removed
    // while paused offscreen. This is what keeps partials:loaded re-inits from
    // leaking observers/listeners.
    INSTANCES.push({ canvas: canvas, destroy: destroy });

    size = fit_();

    if ('ResizeObserver' in window) { ro = new ResizeObserver(refit); ro.observe(canvas); }
    else { window.addEventListener('resize', refit); }

    if (drift === 'scroll') { scrollY = window.pageYOffset || 0; window.addEventListener('scroll', onScroll, { passive: true }); }
    if (interactive && !staticMode) { window.addEventListener('pointermove', onMove, { passive: true }); }

    if (staticMode) {
      // one baked still, mid-lotus (Scotty's signature) — no loop
      draw(start + STILL_ELAPSED);
      return;
    }

    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (destroyed) return;
          if (e.isIntersecting) {
            visible = true;
            if (pausedAt) { start += performance.now() - pausedAt; pausedAt = 0; } // freeze clock while hidden
            startLoop();
          } else {
            visible = false; pausedAt = performance.now(); stopLoop();
            if (!canvas.isConnected) destroy();
          }
        });
      }, { threshold: 0.01 });
      io.observe(canvas);
    } else {
      startLoop();
    }
  }

  function autoInit() {
    // Sweep: tear down any previously-bound canvas that has left the DOM (a
    // partials:loaded reload detaches the old node before re-injecting). This
    // reaches static/paused canvases that have no live loop or IO event to
    // self-destruct, so observers and listeners never accumulate across reloads.
    for (var j = INSTANCES.length - 1; j >= 0; j--) {
      if (!INSTANCES[j].canvas.isConnected) INSTANCES[j].destroy();
    }
    var nodes = document.querySelectorAll('[data-mandala]');
    for (var i = 0; i < nodes.length; i++) init(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
  document.addEventListener('partials:loaded', autoInit);
})();
