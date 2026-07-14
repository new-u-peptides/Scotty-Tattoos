/* =============================================================
   hero-mandala.js — the Scotty Massa hero sigil.
   -------------------------------------------------------------
   A cinematic, particle-built rendition of the canonical Scotty
   Massa logo (assets/brand/logo-mark.png) that assembles itself
   from stippled ink, settles into a slow mechanical rotation, and
   then continuously evolves through two more intricate tattoo
   mandalas before reorganising back into the logo — a seamless
   loop with no visible reset.

   FIDELITY: the canonical state is reconstructed procedurally from
   measurements of the 1024px brand asset — 28-fold symmetry (28
   wavy solar rays, four concentric bands of 28 curved triangular
   cells, alternate bands offset by exactly half a cell), a bold
   gold ring at r≈0.147 around the black centre disc, cell fills
   that hold a bright plateau then dissolve into stipple at the
   tips, and a particle spray past the outer crown.

   ARCHITECTURE (fixed-N particle morph):
   every state is compiled once (seeded PRNG, deterministic) into
   the SAME number of particles N, partitioned into four fixed
   colour channels (shadow gold / main gold / highlight gold / bone
   line). Particle i of state A morphs to particle i of state B by
   interpolating in POLAR space (radius + shortest-path angle), so
   transitions read as geometry reorganising — triangles splitting
   into linework, rays extending into needles — never a crossfade.
   Each particle also carries a per-state spin multiplier, giving
   the abstract states their subtle independent ring rotation while
   the canonical logo stays unified.

   The centre disc + gold ring are drawn live as vector shapes
   (rotation-invariant, always crisp) and interpolate their radii
   between states.

   PERFORMANCE: typed arrays, zero per-frame allocation, fillRect
   stipple batched by colour channel, DPR capped at 2. An adaptive
   quality controller starts conservative, measures real frame
   times, and eases the drawn-particle fraction up on capable
   devices / down under sustained load (never a visible pop).
   Pauses offscreen (IntersectionObserver) and when the tab is
   hidden (visibilitychange); the clock freezes so the loop never
   jumps. Honours prefers-reduced-motion with one complete static
   canonical frame. Rebuilds safely on resize.

   Markup:
     <canvas data-hero-mandala aria-hidden="true"></canvas>

   Data attributes (all optional):
     data-hero-seed     : PRNG seed            (default "scotty-massa")
     data-hero-fit      : radius/half-min-side (default 0.94)
     data-hero-density  : particle multiplier  (default 1)
     data-hero-speed    : rotation multiplier  (default 1; 1 rev ≈ 45s)
     data-hero-animate  : "false" -> static    (default true)
     data-hero-debug    : "true" -> HUD        (also ?heroDebug=1)

   The SCOTTY MASSA wordmark is NOT drawn here — it is a real HTML
   <h1> layered above the canvas (see index.html / hero.css) and
   never rotates. Its reveal is a pure-CSS animation timed to land
   ~1.2s after the constructed logo starts rotating, so it stays in
   step with this engine without any JS coupling (and still reveals
   if scripting fails).
   ============================================================= */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var SYM = 28;                       // canonical 28-fold symmetry (measured)
  var CELL = TAU / SYM;

  /* Warm antique golds (brief palette; ring gold sampled from the
     brand PNG at rgb(245,189,89) sits between MAIN and HI). */
  var CHANNELS = ['#9B6C25', '#E8B653', '#F3CC76', '#D7C6AE'];
  var CH_SHADOW = 0, CH_MAIN = 1, CH_HI = 2, CH_LINE = 3;

  var BASE_DOT = 1.6;                 // base stipple dot size, CSS px

  /* ---- timeline (ms) ---- */
  var CONSTRUCT = 3200;               // phase 1: the logo tattoos itself in
  var ROT_ON = 2400, ROT_FULL = 5400; // rotation eases in across this window
  var REV_S = 46;                     // seconds per revolution (35–55 brief)
  var SEG = [                         // steady-state loop, seamless
    { state: 'sigil', hold: 9800, blend: 3200 },   // canonical presentation
    { state: 'weave', hold: 4800, blend: 3200 },   // interlocking star linework
    { state: 'bloom', hold: 5400, blend: 3600 }    // dense petal rosette
  ];
  var CYCLE = 0;
  for (var si = 0; si < SEG.length; si++) CYCLE += SEG[si].hold + SEG[si].blend;

  var prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- helpers ---------- */
  function attr(el, key, fallback) {
    var v = el.getAttribute('data-hero-' + key);
    return v == null ? fallback : v;
  }
  function num(el, key, fallback) {
    var v = parseFloat(attr(el, key, fallback));
    return isFinite(v) ? v : fallback;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function smootherstep(t) { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }
  function angLerp(a, b, t) {         // shortest-path angular interpolation
    var d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return a + d * t;
  }

  // Seeded PRNG — identical particle layout on every load.
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

  /* ---------- dot toolkit (unit space, radius 1 = outer halo edge) ----------
     Builders emit dots {r, th, s, a, c, sp, imp}:
       r/th polar position · s size · a alpha · c colour channel ·
       sp spin multiplier (per-ring differential rotation) ·
       imp importance (lower = survives quality culling longer). */
  function toolkit(rand) {
    var dots = [];
    var CUR_SP = 1;
    function P(r, a) { return [Math.cos(a) * r, Math.sin(a) * r]; }
    var T = { dots: dots, rand: rand, P: P };

    T.spin = function (sp) { CUR_SP = sp; };
    T.dot = function (r, th, s, a, c, imp) {
      dots.push({ r: r, th: th, s: s, a: a, c: c, sp: CUR_SP, imp: imp || 1 });
    };
    T.dotXY = function (x, y, s, a, c, imp) {
      T.dot(Math.sqrt(x * x + y * y), Math.atan2(y, x), s, a, c, imp);
    };
    // dotted circle
    T.ring = function (rad, s, a, c, densK) {
      var steps = Math.max(24, Math.round(rad * 240 * (densK || 1)));
      for (var i = 0; i < steps; i++) {
        var t = (i / steps) * TAU;
        T.dot(rad + (rand() - 0.5) * 0.004, t + (rand() - 0.5) * 0.002,
              s * (0.8 + rand() * 0.4), a * (0.8 + rand() * 0.3), c, 0.7);
      }
    };
    // dotted straight line between two XY points
    T.line = function (p0, p1, s, a, c) {
      var dx = p1[0] - p0[0], dy = p1[1] - p0[1];
      var n = Math.max(2, Math.round(Math.sqrt(dx * dx + dy * dy) * 150));
      for (var i = 0; i <= n; i++) {
        var t = i / n;
        T.dotXY(p0[0] + dx * t + (rand() - 0.5) * 0.004,
                p0[1] + dy * t + (rand() - 0.5) * 0.004,
                s * (0.78 + rand() * 0.44), a * (0.8 + rand() * 0.3), c, 0.7);
      }
    };
    // dotted quadratic curve
    T.curve = function (p0, cp, p1, steps, s, a, c) {
      for (var i = 0; i <= steps; i++) {
        var t = i / steps, u = 1 - t;
        var x = u * u * p0[0] + 2 * u * t * cp[0] + t * t * p1[0];
        var y = u * u * p0[1] + 2 * u * t * cp[1] + t * t * p1[1];
        T.dotXY(x + (rand() - 0.5) * 0.004, y + (rand() - 0.5) * 0.004,
                s * (0.78 + rand() * 0.44), a * (0.8 + rand() * 0.3), c, 0.7);
      }
    };
    // dotted cubic curve (the S-curves: solar rays, ogee petal sides)
    T.cubic = function (p0, c1, c2, p1, steps, s, a, c, taper) {
      for (var i = 0; i <= steps; i++) {
        var t = i / steps, u = 1 - t;
        var w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
        var x = w0 * p0[0] + w1 * c1[0] + w2 * c2[0] + w3 * p1[0];
        var y = w0 * p0[1] + w1 * c1[1] + w2 * c2[1] + w3 * p1[1];
        var k = taper ? (1 - 0.45 * t) : 1;
        T.dotXY(x + (rand() - 0.5) * 0.003, y + (rand() - 0.5) * 0.003,
                s * k * (0.8 + rand() * 0.4), a * (0.82 + rand() * 0.26), c, 0.7);
      }
    };
    // small arc around an arbitrary centre (scallops between petal tips)
    T.arcAt = function (cx, cy, rad, a0, a1, s, al, c) {
      var span = a1 - a0, n = Math.max(4, Math.round(Math.abs(span) * rad * 220));
      for (var i = 0; i <= n; i++) {
        var t = a0 + span * (i / n);
        T.dotXY(cx + Math.cos(t) * rad + (rand() - 0.5) * 0.003,
                cy + Math.sin(t) * rad + (rand() - 0.5) * 0.003,
                s * (0.78 + rand() * 0.4), al * (0.8 + rand() * 0.3), c, 0.75);
      }
    };

    /* One refined ogee petal — the edge language the site's mandalas
       upgrade to: S-curved sides (a rounded shoulder easing into a
       tapered tip), a softly rounded tip cap, highlight ridges along
       the outer thirds of both edges, a shadow pool at the base, and
       an optional tip-weighted stipple fill. */
    T.petal = function (a, hw, rIn, rOut, o) {
      o = o || {};
      var edgeC = o.edgeC != null ? o.edgeC : CH_LINE;
      var span = rOut - rIn;
      var tipR = rOut - span * 0.055;              // sides stop short of the tip…
      var bL = P(rIn, a - hw), bR = P(rIn, a + hw);
      var tL = P(tipR, a - hw * 0.10), tR = P(tipR, a + hw * 0.10);
      // S-curve side: shoulder bulges past base width, then eases concave into the tip
      var c1R = P(rIn + span * 0.32, a + hw * 1.10);
      var c2R = P(rIn + span * 0.74, a + hw * 0.30);
      var c1L = P(rIn + span * 0.32, a - hw * 1.10);
      var c2L = P(rIn + span * 0.74, a - hw * 0.30);
      var steps = o.steps || 26;
      T.cubic(bR, c1R, c2R, tR, steps, o.edgeS || 0.62, o.edgeA || 0.95, edgeC, true);
      T.cubic(bL, c1L, c2L, tL, steps, o.edgeS || 0.62, o.edgeA || 0.95, edgeC, true);
      // …and a small arc caps it: a rounded, intentional point, not a spike
      T.arcAt(0, 0, tipR + span * 0.01, a - hw * 0.11, a + hw * 0.11,
              (o.edgeS || 0.62) * 0.8, (o.edgeA || 0.95) * 0.95, edgeC);
      if (o.tipBead) T.dot(rOut + span * 0.045, a, 1.25, 0.95, o.tipBeadC != null ? o.tipBeadC : CH_MAIN, 0.5);
      // inner echo outline — the tattooer's confident second pass
      if (o.echo) {
        var e = 0.14;
        T.cubic(P(rIn + span * e, a + hw * 0.78), P(rIn + span * 0.40, a + hw * 0.80),
                P(rIn + span * 0.74, a + hw * 0.22), P(rOut - span * 0.16, a), 18,
                0.56, 0.72, edgeC, true);
        T.cubic(P(rIn + span * e, a - hw * 0.78), P(rIn + span * 0.40, a - hw * 0.80),
                P(rIn + span * 0.74, a - hw * 0.22), P(rOut - span * 0.16, a), 18,
                0.56, 0.72, edgeC, true);
      }
      // highlight ridge: sparse bright dots along the outer third of each edge
      if (o.ridge !== false) {
        for (var hR = 0; hR < 2; hR++) {
          var sgn = hR ? 1 : -1;
          for (var i = 0; i < 7; i++) {
            var u = 0.62 + 0.34 * (i / 6);
            var rr = rIn + span * u;
            var ww = hw * Math.pow(1 - u, 0.72) * 1.02;
            T.dot(rr, a + sgn * ww, 0.8, 0.9, CH_HI, 0.8);
          }
        }
      }
      // base shadow pool — tonal separation from the ring beneath
      if (o.baseShadow !== false) {
        var nS = o.shadowN || 14;
        for (var j = 0; j < nS; j++) {
          var uu = Math.pow(rand(), 2.2) * 0.22;
          var vv = (rand() * 2 - 1) * hw * 0.9;
          T.dot(rIn + span * uu, a + vv, 0.55, 0.34 + rand() * 0.22, CH_SHADOW, 1);
        }
      }
      // tip-weighted stipple fill
      var fillN = o.fillN || 0;
      for (var f = 0; f < fillN; f++) {
        var u2 = rand();
        if (rand() > 0.5 + 0.5 * u2) continue;       // density climbs to the tip
        var hwAt = hw * Math.pow(1 - u2, 0.66);
        var v2 = (rand() * 2 - 1); v2 = v2 * (1 - 0.2 * v2 * v2);
        T.dot(rIn + span * u2 + (rand() - 0.5) * 0.006,
              a + v2 * hwAt, 0.66 * (0.7 + rand() * 0.6),
              (0.42 + 0.44 * u2) * (0.85 + rand() * 0.3),
              o.fillC != null ? o.fillC : CH_MAIN, 1);
      }
    };
    return T;
  }

  /* =============================================================
     STATE BUILDERS
     ============================================================= */

  /* Canonical Scotty Massa sigil — procedural rebuild of the brand
     mark. All radii from pixel measurements of logo-mark.png. */
  function buildSigil(T, dens) {
    var rand = T.rand, i, k;

    T.spin(1);                                       // the logo rotates as one

    // — 28 wavy solar rays, r 0.18 → 0.35, S-curved with rounded ends.
    //   Drawn as a two-strand ribbon so each ray reads as a bold stroke. —
    for (i = 0; i < SYM; i++) {
      var a = -Math.PI / 2 + i * CELL;
      var r0 = RAY.r0, r1 = RAY.r1;
      var amp = RAY.amp;
      var n = 30;
      for (var strand = -1; strand <= 1; strand += 2) {
        for (k = 0; k <= n; k++) {
          var u = k / n;
          var rr = r0 + (r1 - r0) * u;
          var off = amp * Math.sin(u * TAU * 0.75 + 0.4) * (1 - 0.25 * u);
          var w = 1.3 * (1 - 0.35 * u) + 0.001;
          T.dot(rr, a + (off + strand * 0.0024 * (1 - 0.4 * u)) / rr,
                w * (0.85 + rand() * 0.3),
                0.8 * (0.85 + rand() * 0.25), u > 0.62 ? CH_HI : CH_MAIN, 0.7);
        }
      }
      // rounded terminal bead
      T.dot(r1 + 0.012, a + (amp * Math.sin(TAU * 0.75 + 0.4) * 0.75) / r1, 1.6, 0.95, CH_HI, 0.6);
    }
    // dark disc texture behind the rays — sparse pale-gold overspray
    // (CH_LINE keeps the sigil's bone-channel budget doing visible work)
    var spk = Math.round(240 * dens);
    for (i = 0; i < spk; i++) {
      var sa = rand() * TAU, sr = 0.19 + Math.pow(rand(), 0.8) * 0.22;
      T.dot(sr, sa, 0.5 + rand() * 0.3, 0.10 + rand() * 0.16, CH_LINE, 1);
    }

    // — four bands of 28 curved triangular cells, alternate bands offset
    //   half a cell; brightest plateau at the base, dissolving stippled tips —
    var bands = SIGIL_BANDS;
    for (var b = 0; b < bands.length; b++) {
      var B = bands[b], span = B.rOut - B.rIn;
      var hw = CELL * 0.5 * 0.96;                     // cells nearly touch at the base
      var rows = Math.max(8, Math.round(26 * span / 0.15));
      var perRow = Math.round(6 * dens);
      for (i = 0; i < SYM; i++) {
        var ca = -Math.PI / 2 + (i + B.off) * CELL;
        // cell fill: rows base -> tip, angular width tapering with concave sides
        for (var rI = 0; rI < rows; rI++) {
          var u2 = rI / (rows - 1);
          var rr2 = B.rIn + span * u2;
          // proper triangle silhouette with slightly concave (vesica) sides
          var wAt = hw * (1 - Math.pow(u2, 1.15)) * (1 - 0.12 * Math.sin(u2 * Math.PI));
          if (wAt <= 0.001) continue;
          // plateau -> melt: bright and solid until the tip zone, easing into stipple
          var solid = u2 < (1 - B.tipMelt) ? 1 : smoothstep((1 - u2) / B.tipMelt);
          var rowN = Math.max(1, Math.round(perRow * (wAt / hw) * (0.35 + 0.65 * solid)));
          for (k = 0; k < rowN; k++) {
            // stratified across the width (even airbrush coverage, no clumps)
            var v = ((k + 0.5) / rowN * 2 - 1 + (rand() - 0.5) * (1.6 / rowN)) * wAt;
            var isEdge = Math.abs(v) > wAt * 0.72;
            var al = (0.30 + 0.38 * solid) * (0.84 + rand() * 0.26);
            var ch = u2 < 0.10 ? CH_HI : (isEdge && rand() < 0.3 ? CH_HI : CH_MAIN);
            if (!solid && rand() < 0.35) ch = CH_SHADOW;
            // stipple grain riding the solid vector cells (and the medium
            // that carries them away when the morph begins)
            T.dot(rr2 + (rand() - 0.5) * (span / rows) * 1.3, ca + v,
                  (0.85 + 0.75 * solid) * (0.85 + rand() * 0.3), al, ch, 1);
          }
        }
        // shadowed base seam — the depth line separating this band from the last
        for (k = 0; k < 6; k++) {
          T.dot(B.rIn - 0.008 + rand() * 0.010, ca + (rand() * 2 - 1) * hw * 0.85,
                0.6, 0.35 + rand() * 0.25, CH_SHADOW, 0.9);
        }
        // stipple spray past the tip (heavier on the outer crown) — pale gold
        var sprayN = Math.round((b === 3 ? 30 : 6) * dens);
        for (k = 0; k < sprayN; k++) {
          var g = Math.pow(rand(), 1.6);
          T.dot(B.rOut - span * 0.18 + g * span * (b === 3 ? 0.55 : 0.30),
                ca + (rand() * 2 - 1) * hw * 0.5 * (1 - g * 0.5),
                0.45 + rand() * 0.35, 0.16 + rand() * 0.4 * (1 - g), CH_LINE, 1);
        }
      }
    }

    // — peripheral particle halo: fine pale dust past the crown —
    var haloN = Math.round(260 * dens);
    for (i = 0; i < haloN; i++) {
      var ha = rand() * TAU, hr = 0.98 + Math.pow(rand(), 1.7) * 0.065;
      T.dot(hr, ha, 0.4 + rand() * 0.3, 0.05 + rand() * 0.16, CH_LINE, 1);
    }
  }

  /* Interlocking star + triangular-line mandala (reference 3), with
     the perimeter upgraded from straight spikes to an ornamental
     crown: alternating long/short ogee petal points, scallop arcs
     bridging the bases, highlight ridges and tip beads. */
  function buildWeave(T, dens) {
    var rand = T.rand, i;
    var P = T.P;

    // ornamental crown — 24 points, alternating long/short rhythm
    T.spin(1);
    var m = 24, cell = TAU / m;
    for (i = 0; i < m; i++) {
      var a = -Math.PI / 2 + i * cell;
      var isLong = (i % 2 === 0);
      T.petal(a, cell * 0.5 * 0.86, 0.775, isLong ? 1.0 : 0.915, {
        edgeC: CH_LINE, edgeS: 0.7, edgeA: 1.0,
        tipBead: isLong, tipBeadC: CH_MAIN,
        echo: isLong, fillN: Math.round(16 * dens), fillC: CH_MAIN,
        shadowN: 8
      });
    }
    // scallop arcs riding between the petal bases — a soft circular flow
    for (i = 0; i < m; i++) {
      var sa = -Math.PI / 2 + (i + 0.5) * cell;
      var c = P(0.788, sa);
      T.arcAt(c[0], c[1], 0.030, sa - Math.PI * 0.92, sa + Math.PI * 0.92, 0.58, 0.7, CH_LINE);
    }
    T.ring(0.775, 0.62, 0.8, CH_LINE);
    T.ring(0.748, 0.5, 0.6, CH_LINE, 0.8);

    // the interlocking chord star — a {24/7} weave (fine needle lines)
    T.spin(0.88);
    var R1 = 0.72, step = 7;
    for (i = 0; i < m; i++) {
      var a0 = -Math.PI / 2 + i * cell;
      var a1 = -Math.PI / 2 + ((i + step) % m) * cell;
      T.line(P(R1, a0), P(R1, a1), 0.62, 0.68, CH_LINE);
    }
    // gold nodes at the weave's rim vertices
    for (i = 0; i < m; i++) {
      var na = -Math.PI / 2 + i * cell;
      T.dot(R1, na, 1.1, 0.9, CH_MAIN, 0.5);
    }

    // needle ray band — fine alternating-length rays (rays -> needles morph)
    T.spin(1.06);
    var rays = 56;
    for (i = 0; i < rays; i++) {
      var ra = -Math.PI / 2 + i * (TAU / rays);
      var ext = (i % 2 === 0) ? 0.70 : 0.655;
      T.line(P(0.545, ra), P(ext, ra), 0.58, 0.68, CH_LINE);
      if (i % 4 === 0) T.dot(ext + 0.012, ra, 0.9, 0.8, CH_HI, 0.6);
    }
    T.ring(0.535, 0.58, 0.7, CH_LINE);

    // layered 12-point star (two hexagrams) — gold accent geometry
    T.spin(1.14);
    function hexagram(rO, rot, ch, al) {
      var V = [], k;
      for (k = 0; k < 6; k++) V.push(P(rO, rot + k * (TAU / 6)));
      T.line(V[0], V[2], 0.66, al, ch); T.line(V[2], V[4], 0.66, al, ch); T.line(V[4], V[0], 0.66, al, ch);
      T.line(V[1], V[3], 0.66, al, ch); T.line(V[3], V[5], 0.66, al, ch); T.line(V[5], V[1], 0.66, al, ch);
    }
    hexagram(0.50, -Math.PI / 2, CH_MAIN, 0.92);
    hexagram(0.50, -Math.PI / 2 + TAU / 12, CH_MAIN, 0.92);
    // star-tip highlights
    for (i = 0; i < 12; i++) {
      T.dot(0.50, -Math.PI / 2 + i * (TAU / 12), 1.0, 0.9, CH_HI, 0.5);
    }

    T.spin(0.94);
    T.ring(0.30, 0.55, 0.7, CH_LINE);
    // inner petal ring — small rounded petals (not spikes) around the core
    var m2 = 12, cell2 = TAU / m2;
    for (i = 0; i < m2; i++) {
      T.petal(-Math.PI / 2 + (i + 0.5) * cell2, cell2 * 0.5 * 0.8, 0.155, 0.285, {
        edgeC: CH_LINE, edgeS: 0.6, edgeA: 0.9, ridge: false, baseShadow: false, steps: 14
      });
    }

    // shading dust — value pooling toward the weave band, plus halo
    T.spin(1);
    var dust = Math.round(320 * dens);
    for (i = 0; i < dust; i++) {
      var da = rand() * TAU, dr = 0.30 + Math.pow(rand(), 0.7) * 0.44;
      T.dot(dr, da, 0.42 + rand() * 0.25, 0.06 + rand() * 0.16, CH_SHADOW, 1);
    }
    var haloN = Math.round(170 * dens);
    for (i = 0; i < haloN; i++) {
      var ha = rand() * TAU, hr = 1.0 + Math.pow(rand(), 1.8) * 0.05;
      T.dot(hr, ha, 0.4 + rand() * 0.28, 0.05 + rand() * 0.14, CH_LINE, 1);
    }
  }

  /* Dense radial tattoo rosette (reference 4 evolved) — nested petal
     crowns with layered depth, separated by dotted rings, finished
     with a two-layer ornamental crown and particle halo. */
  function buildBloom(T, dens) {
    var rand = T.rand, i;

    // back layer of the outer crown — offset half a pitch, deep gold,
    // sitting BEHIND the front crown (depth through tonal separation)
    T.spin(0.96);
    var m0 = 32, cell0 = TAU / m0;
    for (i = 0; i < m0; i++) {
      var ba = -Math.PI / 2 + (i + 0.5) * cell0;
      T.petal(ba, cell0 * 0.5 * 0.9, 0.80, 0.985, {
        edgeC: CH_SHADOW, edgeS: 0.55, edgeA: 0.55, ridge: false,
        fillN: Math.round(10 * dens), fillC: CH_SHADOW, shadowN: 4, steps: 18
      });
    }
    // front crown — alternating long/short, bright, beaded tips, scallops
    for (i = 0; i < m0; i++) {
      var fa = -Math.PI / 2 + i * cell0;
      var isLong = (i % 2 === 0);
      T.petal(fa, cell0 * 0.5 * 0.84, 0.775, isLong ? 0.955 : 0.895, {
        edgeC: CH_MAIN, edgeS: 0.72, edgeA: 1.0,
        tipBead: isLong, tipBeadC: CH_HI,
        fillN: Math.round(13 * dens), fillC: CH_MAIN, shadowN: 8, steps: 20
      });
    }
    for (i = 0; i < m0; i++) {
      var sca = -Math.PI / 2 + (i + 0.5) * cell0;
      var c = T.P(0.783, sca);
      T.arcAt(c[0], c[1], 0.024, sca - Math.PI * 0.9, sca + Math.PI * 0.9, 0.54, 0.65, CH_LINE);
    }
    T.ring(0.772, 0.58, 0.75, CH_LINE);

    // fine ray band under the crown
    T.spin(1.05);
    var rays = 64;
    for (i = 0; i < rays; i++) {
      var ra = -Math.PI / 2 + i * (TAU / rays);
      T.line(T.P(0.70, ra), T.P(0.755, ra), 0.55, 0.62, CH_LINE);
    }
    T.ring(0.695, 0.55, 0.7, CH_LINE, 0.9);

    // nested petal crowns at golden-ish steps, alternate offsets
    var crowns = [
      { m: 20, rIn: 0.50, rOut: 0.675, off: 0.5, sp: 0.92 },
      { m: 14, rIn: 0.325, rOut: 0.525, off: 0.0, sp: 1.06 },
      { m: 10, rIn: 0.165, rOut: 0.36, off: 0.5, sp: 0.98 }
    ];
    for (var cI = 0; cI < crowns.length; cI++) {
      var C = crowns[cI], cw = TAU / C.m;
      T.spin(C.sp);
      for (i = 0; i < C.m; i++) {
        var pa = -Math.PI / 2 + (i + C.off) * cw;
        T.petal(pa, cw * 0.5 * 0.86, C.rIn, C.rOut, {
          edgeC: CH_MAIN, edgeS: 0.7, edgeA: 0.98, echo: true,
          fillN: Math.round(22 * dens), fillC: CH_MAIN,
          shadowN: 12, steps: 22
        });
      }
      T.ring(C.rIn - 0.012, 0.52, 0.6, CH_LINE, 0.8);
    }

    // skin-texture stipple across the whole disc (kept airy)
    T.spin(1);
    var dust = Math.round(300 * dens);
    for (i = 0; i < dust; i++) {
      var da = rand() * TAU, dr = Math.pow(rand(), 0.6) * 0.78;
      T.dot(dr, da, 0.4 + rand() * 0.22, 0.05 + rand() * 0.12, CH_SHADOW, 1);
    }
    // halo
    var haloN = Math.round(190 * dens);
    for (i = 0; i < haloN; i++) {
      var ha = rand() * TAU, hr = 1.0 + Math.pow(rand(), 1.7) * 0.055;
      T.dot(hr, ha, 0.4 + rand() * 0.3, 0.05 + rand() * 0.15, CH_MAIN, 1);
    }
  }

  var BUILDERS = { sigil: buildSigil, weave: buildWeave, bloom: buildBloom };

  /* The sigil's solid geometry (shared with buildSigil's stipple):
     four bands of 28 curved-triangle cells + 28 wavy rays. The solid
     vector under-layer draws these per frame — mathematically sharp
     under rotation — and hands off to pure particles during morphs,
     so gold surfaces literally break into stipple. */
  var SIGIL_BANDS = [
    { rIn: 0.430, rOut: 0.578, off: 0.0, tipMelt: 0.10 },
    { rIn: 0.588, rOut: 0.734, off: 0.5, tipMelt: 0.12 },
    { rIn: 0.744, rOut: 0.895, off: 0.0, tipMelt: 0.16 },
    { rIn: 0.905, rOut: 1.000, off: 0.5, tipMelt: 0.42 }
  ];
  var RAY = { r0: 0.185, r1: 0.345, amp: 0.030 };
  function rayPoint(a, u) {
    var rr = RAY.r0 + (RAY.r1 - RAY.r0) * u;
    var off = RAY.amp * Math.sin(u * TAU * 0.75 + 0.4) * (1 - 0.25 * u);
    var th = a + off / rr;
    return [Math.cos(th) * rr, Math.sin(th) * rr];
  }
  // Ray polylines precomputed once in unit space (two passes: full stroke +
  // bright outer tip) — no per-frame point allocation in the vector layer.
  var RAY_STEPS = 14;
  var RAY_PTS = (function () {
    var passes = [];
    [0, 0.55].forEach(function (u0) {
      var pts = new Float32Array(SYM * (RAY_STEPS + 1) * 2), w = 0;
      for (var r = 0; r < SYM; r++) {
        var a = -Math.PI / 2 + r * CELL;
        for (var st = 0; st <= RAY_STEPS; st++) {
          var p = rayPoint(a, u0 + (1 - u0) * (st / RAY_STEPS));
          pts[w++] = p[0]; pts[w++] = p[1];
        }
      }
      passes.push(pts);
    });
    return passes;
  })();

  /* Per-state live-core parameters (black disc + crisp gold ring),
     interpolated continuously between states. */
  var CORE = {
    sigil: { disc: 0.118, ring: 0.140, ringW: 0.0075, a: 0.72 },
    weave: { disc: 0.078, ring: 0.100, ringW: 0.005,  a: 0.6 },
    bloom: { disc: 0.070, ring: 0.110, ringW: 0.006,  a: 0.62 }
  };

  /* =============================================================
     ENGINE
     ============================================================= */
  var INSTANCES = [];

  function init(canvas) {
    if (canvas.dataset.heroBound) return;
    canvas.dataset.heroBound = '1';

    var seed = attr(canvas, 'seed', 'scotty-massa');
    var fitK = clamp(num(canvas, 'fit', 0.94), 0.4, 1);
    var densK = clamp(num(canvas, 'density', 1), 0.2, 3);
    var speedK = clamp(num(canvas, 'speed', 1), 0, 4);
    var animate = attr(canvas, 'animate', 'true') !== 'false';
    var debugOn = attr(canvas, 'debug', 'false') === 'true' ||
                  /[?&]heroDebug=1/.test(window.location.search);

    var ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) { delete canvas.dataset.heroBound; return; }
    var staticMode = !animate || prefersReducedMotion;

    var size = { w: 1, h: 1, dpr: 1, R: 1 };
    var N = 0;                        // total particles (fixed across states)
    var states = {};                  // name -> typed-array particle sets
    var delay = null, prio = null;    // construction stagger, cull priority
    var start = performance.now(), pausedAt = 0;
    var quality = 0.85, qualityTarget = 0.85;
    var lastQChange = 0, slowWins = 0;
    var frameAcc = 0, frameCnt = 0, fps = 60;
    var destroyed = false, visible = true;

    var STATE_NAMES = ['sigil', 'weave', 'bloom'];

    /* ---- sizing ---- */
    function fit_() {
      var rect = canvas.getBoundingClientRect();
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var w = Math.max(1, Math.floor(rect.width));
      var h = Math.max(1, Math.floor(rect.height));
      var bw = Math.floor(w * dpr), bh = Math.floor(h * dpr);
      if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
      return { w: w, h: h, dpr: dpr, R: Math.min(bw, bh) * 0.5 * fitK };
    }

    /* ---- particle budget: viewport-, DPR- and density-aware ---- */
    function targetN() {
      var cssR = size.R / size.dpr;
      var vw = window.innerWidth || 1024;
      // desktop carries a 3x-density budget; the adaptive quality
      // controller trims it gracefully on machines that can't hold it
      var deviceMax = vw <= 560 ? 5000 : (vw <= 1024 ? 11000 : 54000);
      var n = Math.round(cssR * cssR * 0.66 * densK);
      return clamp(n, 3000, deviceMax);
    }

    /* ---- compile a state into fixed-N arrays ----
       The raw dot list is resampled to exactly N, preserving build order
       (structures stay contiguous, so per-particle colour changes remain
       cheap run-length fillStyle switches). Particle i of every state
       pairs with particle i of every other — that is the morph. */
    function compileState(name) {
      var rnd = mulberry32(xmur3(seed + '|' + name)());
      var T = toolkit(rnd);
      BUILDERS[name](T, densK);
      var raw = T.dots, L = raw.length;

      var st = {
        r: new Float32Array(N), th: new Float32Array(N),
        s: new Float32Array(N), a: new Float32Array(N),
        sp: new Float32Array(N), imp: new Float32Array(N),
        ch: new Uint8Array(N)
      };
      for (var q = 0; q < N; q++) {
        var d, jit = 0;
        if (L >= N) {
          d = raw[Math.floor(q * L / N)];
        } else {
          d = raw[Math.floor(q * L / N)];       // upsample: revisit with jitter
          jit = 1;
        }
        st.r[q] = d.r + (jit ? (rnd() - 0.5) * 0.008 : 0);
        st.th[q] = d.th + (jit ? (rnd() - 0.5) * 0.008 : 0);
        st.s[q] = d.s * (jit ? 0.92 : 1);
        st.a[q] = d.a * (jit ? 0.9 : 1);
        st.sp[q] = d.sp;
        st.imp[q] = d.imp || 1;
        st.ch[q] = d.c;
      }
      return st;
    }

    function buildAll() {
      N = targetN();
      states = {};
      for (var i = 0; i < STATE_NAMES.length; i++) {
        states[STATE_NAMES[i]] = compileState(STATE_NAMES[i]);
      }
      // construction stagger + cull priority, derived from the sigil layout
      var sg = states.sigil;
      var rnd = mulberry32(xmur3(seed + '|construct')());
      delay = new Float32Array(N);
      prio = new Float32Array(N);
      for (var p = 0; p < N; p++) {
        var sector = Math.floor(((sg.th[p] % TAU) + TAU) / CELL);
        var stag = 0.05 * Math.sin(sector * 2.399);          // radial segment stagger
        delay[p] = clamp(0.04 + sg.r[p] * 0.70 + stag + (rnd() - 0.5) * 0.10, 0, 0.84);
        prio[p] = rnd();
      }
    }

    /* ---- timeline ---- */
    function segmentAt(tc) {
      var t = tc % CYCLE, acc = 0;
      for (var i = 0; i < SEG.length; i++) {
        var s = SEG[i];
        if (t < acc + s.hold) return { a: s.state, b: s.state, k: 0 };
        acc += s.hold;
        if (t < acc + s.blend) {
          var nxt = SEG[(i + 1) % SEG.length].state;
          return { a: s.state, b: nxt, k: smootherstep((t - acc) / s.blend) };
        }
        acc += s.blend;
      }
      return { a: 'sigil', b: 'sigil', k: 0 };
    }

    /* ---- the sigil's solid vector under-layer ----
       Four gradient band-fills (all 28 cells of a band as one path) +
       the 28 wavy rays as stroked curves. ~6 draw calls per frame,
       always crisp: drawn in unit space under a live rotate transform,
       never a rotated raster. Fades out as morphs hand the geometry
       to the particles, and back in when the sigil reassembles. */
    var bandGrads = null;   // unit-space gradients are size-independent: build once
    function drawSigilVector(cx, cy, R, rot, alpha) {
      if (alpha <= 0.01) return;
      if (!bandGrads) {
        bandGrads = SIGIL_BANDS.map(function (B) {
          var meltAt = 1 - B.tipMelt;
          var g = ctx.createRadialGradient(0, 0, B.rIn, 0, 0, B.rOut);
          g.addColorStop(0, 'rgba(243, 204, 118, 0.95)');
          g.addColorStop(Math.max(0.01, meltAt * 0.45), 'rgba(232, 182, 83, 0.88)');
          g.addColorStop(clamp(meltAt, 0.02, 0.98), 'rgba(216, 160, 62, 0.62)');
          g.addColorStop(1, 'rgba(155, 108, 37, 0.04)');
          return g;
        });
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.scale(R, R);
      ctx.globalAlpha = alpha;

      // triangle-cell bands, brightest at the base, dissolving at the tips
      for (var b = 0; b < SIGIL_BANDS.length; b++) {
        var B = SIGIL_BANDS[b];
        ctx.fillStyle = bandGrads[b];
        ctx.beginPath();
        var hw = CELL * 0.5 * 0.96;
        for (var i = 0; i < SYM; i++) {
          var ca = -Math.PI / 2 + (i + B.off) * CELL;
          var bl = ca - hw, br = ca + hw;
          var tipR = B.rOut;
          // base arc (inner edge), then two slightly concave sides to the tip
          ctx.moveTo(Math.cos(bl) * B.rIn, Math.sin(bl) * B.rIn);
          ctx.arc(0, 0, B.rIn, bl, br);
          var cpR = B.rIn + (tipR - B.rIn) * 0.55;
          var cpW = hw * 0.34;
          ctx.quadraticCurveTo(
            Math.cos(ca + cpW) * cpR, Math.sin(ca + cpW) * cpR,
            Math.cos(ca) * tipR, Math.sin(ca) * tipR);
          ctx.quadraticCurveTo(
            Math.cos(ca - cpW) * cpR, Math.sin(ca - cpW) * cpR,
            Math.cos(bl) * B.rIn, Math.sin(bl) * B.rIn);
        }
        ctx.fill();
      }

      // dark seam under each band base — the depth line between rings
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = 'rgba(10, 10, 10, 1)';
      ctx.lineWidth = 0.012;
      for (var s = 1; s < SIGIL_BANDS.length; s++) {
        ctx.beginPath();
        ctx.arc(0, 0, SIGIL_BANDS[s].rIn - 0.006, 0, TAU);
        ctx.stroke();
      }

      // the 28 wavy solar rays — bold strokes with bright outer tips,
      // traced from the precomputed unit-space polylines
      ctx.lineCap = 'round';
      var perRay = (RAY_STEPS + 1) * 2;
      for (var pass = 0; pass < 2; pass++) {
        var pts = RAY_PTS[pass];
        ctx.beginPath();
        for (var r = 0; r < SYM; r++) {
          var o = r * perRay;
          ctx.moveTo(pts[o], pts[o + 1]);
          for (var st = 1; st <= RAY_STEPS; st++) {
            ctx.lineTo(pts[o + st * 2], pts[o + st * 2 + 1]);
          }
        }
        if (pass === 0) {
          ctx.globalAlpha = alpha * 0.95;
          ctx.strokeStyle = '#E8B653';
          ctx.lineWidth = 0.0135;
        } else {
          ctx.globalAlpha = alpha * 0.85;
          ctx.strokeStyle = '#F3CC76';
          ctx.lineWidth = 0.008;
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    /* ---- the live core: black disc + crisp gold ring ---- */
    function drawCore(cx, cy, R, seg, alpha, rot) {
      var A = CORE[seg.a], B = CORE[seg.b], k = seg.k;
      var disc = lerp(A.disc, B.disc, k) * R;
      var ring = lerp(A.ring, B.ring, k) * R;
      var ringW = lerp(A.ringW, B.ringW, k) * R;
      var a = lerp(A.a, B.a, k) * alpha;
      if (a <= 0.01) return;
      // A soft black centre bed (radial, edgeless) — gives the wordmark's
      // middle letters a dark ground for legibility without reading as a
      // hard disc, then a single fine gold line. Kept subordinate to the
      // wordmark: the ring tucks between the words, it doesn't crown a letter.
      var bed = ctx.createRadialGradient(cx, cy, 0, cx, cy, disc + ringW * 6);
      bed.addColorStop(0, 'rgba(8, 8, 8, ' + (0.92 * a / 0.72) + ')');
      bed.addColorStop(0.68, 'rgba(8, 8, 8, ' + (0.72 * a / 0.72) + ')');
      bed.addColorStop(1, 'rgba(8, 8, 8, 0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = bed;
      ctx.beginPath(); ctx.arc(cx, cy, disc + ringW * 6, 0, TAU); ctx.fill();
      // one fine gold line
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#E8B653';
      ctx.lineWidth = Math.max(0.75, ringW);
      ctx.beginPath(); ctx.arc(cx, cy, ring, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    /* ---- per-frame draw ---- */
    function draw(now) {
      var elapsed = now - start; if (elapsed < 0) elapsed = 0;
      var w = canvas.width, h = canvas.height;
      var cx = w / 2, cy = h / 2, R = size.R;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);

      var intro = smootherstep(elapsed / 900);
      var conP = staticMode ? 1 : clamp(elapsed / CONSTRUCT, 0, 1);
      var building = conP < 1;

      // rotation: angular velocity eases from 0 to ω across the ramp window,
      // then holds — heavy, mechanically precise, no abrupt acceleration.
      // Angle = ω·∫smootherstep = ω·T·u⁴(u² − 3u + 2.5) during the ramp
      // (0.5·ω·T at u=1), continuing linearly after.
      var omega = (TAU / (REV_S * 1000)) * speedK;
      var rot = 0;
      if (!staticMode && elapsed > ROT_ON) {
        var rampT = ROT_FULL - ROT_ON;
        if (elapsed < ROT_FULL) {
          var u = (elapsed - ROT_ON) / rampT;
          rot = omega * rampT * (u * u * u * u * (u * u - 3 * u + 2.5));
        } else {
          rot = omega * (rampT * 0.5 + (elapsed - ROT_FULL));
        }
      }

      // breathing: ≤1.2% scale, imperceptibly slow
      var breath = staticMode ? 1 : 1 + 0.012 * Math.sin(elapsed * 0.00052);
      var Rb = R * breath;

      var seg = staticMode ? { a: 'sigil', b: 'sigil', k: 0 } : segmentAt(elapsed);
      var A = states[seg.a], B = states[seg.b], k = seg.k;
      var morphing = k > 0 && k < 1 && seg.a !== seg.b;
      if (k >= 1) { A = B; morphing = false; }

      drawCore(cx, cy, Rb, seg, intro * (building ? smootherstep(conP * 3) : 1), rot);

      // solid sigil under-layer: settles in near the end of construction,
      // hands off to particles as the first morph begins, returns when
      // the loop reorganises back into the logo.
      var wSig = (seg.a === 'sigil' ? 1 - k : 0) + (seg.b === 'sigil' ? k : 0);
      var solidA = smoothstep((wSig - 0.45) / 0.55);
      if (building) solidA *= smoothstep((conP - 0.68) / 0.30);
      drawSigilVector(cx, cy, Rb, rot, solidA * intro);

      var q = quality;
      var Ar = A.r, Ath = A.th, As = A.s, Aa = A.a, Asp = A.sp, Ach = A.ch, Aimp = A.imp;
      var Br, Bth, Bs, Ba, Bsp, Bch, Bimp;
      if (morphing) { Br = B.r; Bth = B.th; Bs = B.s; Ba = B.a; Bsp = B.sp; Bch = B.ch; Bimp = B.imp; }
      var useB = morphing && k >= 0.5;      // colour/importance hand over mid-blend
      // at 3x density the grain goes finer, not blobbier
      var dotK = BASE_DOT * (N > 30000 ? 0.8 : 1) * size.dpr;
      var lastAlpha = -1, curCh = -1;

      for (var i = 0; i < N; i++) {
        if (prio[i] * (useB ? Bimp[i] : Aimp[i]) > q) continue;

        var rr, th, sz, al;
        if (morphing) {
          var aA = Ath[i] + rot * Asp[i], aB = Bth[i] + rot * Bsp[i];
          rr = lerp(Ar[i], Br[i], k);
          th = angLerp(aA, aB, k);
          sz = lerp(As[i], Bs[i], k);
          al = lerp(Aa[i], Ba[i], k);
        } else {
          rr = Ar[i]; th = Ath[i] + rot * Asp[i]; sz = As[i]; al = Aa[i];
        }

        if (building) {
          var lp = smootherstep((conP - delay[i]) / 0.16);
          if (lp <= 0) continue;
          if (lp < 1) {
            rr = lerp(rr * 0.22, rr, lp);
            th = th + (1 - lp) * 0.55 * (prio[i] > 0.5 ? 1 : -1);
            sz = sz * (1 + (1 - lp) * 0.8);       // the dot lands, then settles
            al = al * lp;
          }
        }

        al *= intro;
        if (al <= 0.01) continue;
        if (al > 1) al = 1;

        var chv = useB ? Bch[i] : Ach[i];
        if (chv !== curCh) { curCh = chv; ctx.fillStyle = CHANNELS[chv]; }
        if (Math.abs(al - lastAlpha) > 0.02) { ctx.globalAlpha = al; lastAlpha = al; }

        var px = cx + Math.cos(th) * rr * Rb;
        var py = cy + Math.sin(th) * rr * Rb;
        var s = Math.max(0.55 * size.dpr, sz * dotK);
        ctx.fillRect(px - s * 0.5, py - s * 0.5, s, s);
      }
      ctx.globalAlpha = 1;
    }

    /* ---- adaptive quality controller ---- */
    function tickQuality(dt, now) {
      if (staticMode) return;
      var elapsed = now - start;
      if (elapsed < 2200) return;              // ignore construction/bake-in
      if (dt > 180) return;                    // stall/GC/tab-jank, not render cost
      frameAcc += dt; frameCnt++;
      if (frameAcc >= 1000) {                  // time-based window: ~1s on any refresh rate
        var avg = frameAcc / frameCnt;
        fps = 1000 / avg;
        frameAcc = 0; frameCnt = 0;
        // demand two consecutive slow windows before cutting, so a single
        // heavy stretch (a morph, a background hiccup) never degrades quality
        if (avg > 22) slowWins++; else slowWins = 0;
        if (now - lastQChange > 2600) {
          if (slowWins >= 2 && qualityTarget > 0.5) {
            qualityTarget = Math.max(0.5, qualityTarget - 0.12);
            lastQChange = now; slowWins = 0;
          } else if (avg < 17.2 && qualityTarget < 1) {
            // 17.2ms sits just above the 60Hz vsync floor (16.7ms), so a
            // healthy 60fps device can always climb back to full density
            qualityTarget = Math.min(1, qualityTarget + 0.1);
            lastQChange = now;
          }
        }
      }
      // ease toward the target so density change is never a visible pop
      quality += (qualityTarget - quality) * 0.02;
    }

    /* ---- debug HUD ---- */
    var hud = null;
    function debugHud(now) {
      if (!debugOn) return;
      if (!hud) {
        hud = document.createElement('div');
        hud.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:9999;' +
          'font:11px/1.5 monospace;color:#F3CC76;background:rgba(10,10,10,.82);' +
          'padding:8px 10px;border:1px solid #9B6C25;pointer-events:none;white-space:pre';
        document.body.appendChild(hud);
      }
      var seg = segmentAt(now - start);
      var drawn = Math.round(N * Math.min(1, quality));
      hud.textContent =
        'fps      ' + fps.toFixed(0) +
        '\nparticles ' + drawn + ' / ' + N +
        '\nquality  ' + quality.toFixed(2) + ' → ' + qualityTarget.toFixed(2) +
        '\nphase    ' + seg.a + (seg.k > 0 ? ' → ' + seg.b : '') +
        '\nmorph k  ' + seg.k.toFixed(2) +
        '\nt        ' + ((now - start) / 1000).toFixed(1) + 's' +
        '\nrot      ' + (360 / REV_S * speedK).toFixed(1) + '°/s target';
    }

    /* ---- loop / lifecycle ---- */
    var raf = null, io = null, ro = null, lastT = 0;
    function frame(now) {
      if (destroyed) return;
      if (!canvas.isConnected) { destroy(); return; }
      if (!visible) { raf = null; return; }
      var dt = lastT ? now - lastT : 16.7;
      lastT = now;
      draw(now);
      tickQuality(dt, now);
      debugHud(now);
      raf = requestAnimationFrame(frame);
    }
    function startLoop() { if (!raf && !destroyed && !staticMode) raf = requestAnimationFrame(frame); }
    function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = null; } lastT = 0; }

    var resizePending = false;
    function refit() {
      if (resizePending) return; resizePending = true;
      requestAnimationFrame(function () {
        resizePending = false;
        if (destroyed) return;
        size = fit_();
        var wantN = targetN();
        if (Math.abs(wantN - N) / Math.max(1, N) > 0.25) buildAll();
        if (staticMode) draw(start + CONSTRUCT + 500);
      });
    }

    var ioVisible = true;
    function onVisibility() {
      if (document.hidden) {
        visible = false;
        if (!pausedAt) pausedAt = performance.now();
        stopLoop();
      } else if (ioVisible) {
        visible = true;
        if (pausedAt) { start += performance.now() - pausedAt; pausedAt = 0; }
        startLoop();
      }
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      if (io) io.disconnect();
      if (ro) ro.disconnect(); else window.removeEventListener('resize', refit);
      document.removeEventListener('visibilitychange', onVisibility);
      if (hud && hud.parentNode) hud.parentNode.removeChild(hud);
      states = {}; delay = null; prio = null;
      delete canvas.dataset.heroBound;
      for (var j = INSTANCES.length - 1; j >= 0; j--) {
        if (INSTANCES[j].canvas === canvas) INSTANCES.splice(j, 1);
      }
    }
    INSTANCES.push({ canvas: canvas, destroy: destroy });

    /* ---- boot ---- */
    size = fit_();
    buildAll();

    if ('ResizeObserver' in window) { ro = new ResizeObserver(refit); ro.observe(canvas); }
    else { window.addEventListener('resize', refit); }

    if (staticMode) {
      // one complete, premium still: the fully-formed canonical logo
      draw(start + CONSTRUCT + 500);
      return;
    }

    document.addEventListener('visibilitychange', onVisibility);
    if (document.hidden) { visible = false; pausedAt = start; }

    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (destroyed) return;
          ioVisible = e.isIntersecting;
          if (e.isIntersecting && !document.hidden) {
            visible = true;
            if (pausedAt) { start += performance.now() - pausedAt; pausedAt = 0; }
            startLoop();
          } else {
            visible = false;
            if (!pausedAt) pausedAt = performance.now();
            stopLoop();
            if (!canvas.isConnected) destroy();
          }
        });
      }, { threshold: 0.01 });
      io.observe(canvas);
    } else {
      startLoop();
    }
    startLoop();
  }

  function autoInit() {
    for (var j = INSTANCES.length - 1; j >= 0; j--) {
      if (!INSTANCES[j].canvas.isConnected) INSTANCES[j].destroy();
    }
    var nodes = document.querySelectorAll('[data-hero-mandala]');
    for (var i = 0; i < nodes.length; i++) init(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
  document.addEventListener('partials:loaded', autoInit);
})();
