/* =============================================================
   mandala-morph.js — Scotty Massa's hero mandala.
   -------------------------------------------------------------
   A single, premium DOTWORK mandala in the language of Scotty's
   tattoos: pure black stipple, layered geometry, value built
   entirely from the density of black dots (dense at the edges,
   fading to fine stipple toward the centre).

   It rests on a soft, edgeless skin-warm halo (no box — the glow
   fades to fully transparent well inside the canvas) so the black
   ink reads cleanly on the dark hero. It does NOT morph or burst:
   it assembles once with a gentle fade, then breathes and turns
   very slowly.

   Several designs are available; pick one with data-morph-design:
     "lotus"     — layered pointed-petal lotus + flower-of-life heart
     "rosette"   — full many-petal chrysanthemum rosette
     "geometric" — sacred-geometry star (hexagram + seed of life)

   The dotwork + halo are pre-baked to offscreen layers, so each
   frame is just two composited draws — smooth and cheap.

   Deterministic (seeded PRNG), zero dependencies. Honours
   prefers-reduced-motion (one static frame). Pauses offscreen
   (IntersectionObserver), rebakes on resize (ResizeObserver),
   DPR capped at 2.

   Data attributes (all optional):
     data-morph-design  : lotus | rosette | geometric        (default lotus)
     data-morph-ink     : dot colour                          (default #0b0908)
     data-morph-fit     : mandala radius / half-min-side      (default 0.94)
     data-morph-dot     : base dot size in CSS px             (default 1.7)
     data-morph-density : stipple density multiplier          (default 1)
     data-morph-halo    : skin-glow strength 0..1.6           (default 1)
     data-morph-speed   : rotation / breathing multiplier     (default 1)
     data-morph-reveal  : ms of the opening assemble          (default 1700)
     data-morph-seed    : PRNG seed                           (default "scotty-massa")
     data-morph-animate : "false" -> one static frame         (default true)
   ============================================================= */
(function () {
  'use strict';

  var TAU = Math.PI * 2;

  var prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function attr(el, key, fallback) {
    var v = el.getAttribute('data-morph-' + key);
    return v == null ? fallback : v;
  }
  function num(el, key, fallback) {
    var v = parseFloat(attr(el, key, fallback));
    return isFinite(v) ? v : fallback;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }

  // Seeded PRNG so the stipple layout is identical on every load.
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

  function P(r, a) { return [Math.cos(a) * r, Math.sin(a) * r]; }
  function qb(p0, c, p1, t) {           // quadratic bezier point
    var u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
            u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
  }

  /* ---------- a dot toolkit bound to one figure (unit space, radius 1) ----------
     Radius 1 == the mandala's outer rim. Every helper appends dots
     {x, y, r, a} that get baked to a pixel layer once. */
  function toolkit(rand) {
    var dots = [];
    function jit(p, amt) { return [p[0] + (rand() - 0.5) * amt, p[1] + (rand() - 0.5) * amt]; }
    var T = {
      dots: dots,
      rand: rand,
      dot: function (x, y, r, a) { dots.push({ x: x, y: y, r: r, a: a }); },
      jit: jit
    };
    // a crisp dotted quadratic curve (linework as fine stipple)
    T.curve = function (p0, c, p1, steps, size, alpha) {
      for (var s = 0; s <= steps; s++) {
        var p = jit(qb(p0, c, p1, s / steps), 0.006);
        T.dot(p[0], p[1], size * (0.8 + rand() * 0.5), alpha * (0.8 + rand() * 0.3));
      }
    };
    // a crisp dotted straight line
    T.line = function (p0, p1, size, alpha) {
      var dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.sqrt(dx * dx + dy * dy);
      var n = Math.max(2, Math.round(len * 175));
      for (var s = 0; s <= n; s++) {
        var t = s / n, p = jit([p0[0] + dx * t, p0[1] + dy * t], 0.005);
        T.dot(p[0], p[1], size * (0.75 + rand() * 0.5), alpha * (0.8 + rand() * 0.3));
      }
    };
    // a dotted circle outline
    T.ring = function (cx, cy, rad, size, alpha) {
      var steps = Math.max(22, Math.round(rad * 210));
      for (var s = 0; s < steps; s++) {
        var a = (s / steps) * TAU, p = jit([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad], 0.005);
        T.dot(p[0], p[1], size * (0.75 + rand() * 0.5), alpha * (0.75 + rand() * 0.35));
      }
    };
    // one pointed petal: two ogee sides to a sharp tip + a base arc, then a
    // stipple fill whose density (so its darkness) climbs toward the tip — the
    // petal reads near-solid black at the tip, fading to fine stipple at the base.
    T.petal = function (a, hw, rIn, rOut, fillN) {
      var tip = P(rOut, a);
      var bL = P(rIn, a - hw), bR = P(rIn, a + hw);
      var cR = P(rOut * 0.80, a + hw * 0.55);
      var cL = P(rOut * 0.80, a - hw * 0.55);
      T.curve(bR, cR, tip, 34, 0.62, 1.0);
      T.curve(tip, cL, bL, 34, 0.62, 1.0);
      var arcN = Math.max(7, Math.round(hw * 30));
      for (var s = 0; s <= arcN; s++) {
        var aa = a - hw + (2 * hw) * (s / arcN), p = jit(P(rIn, aa), 0.005);
        T.dot(p[0], p[1], 0.55 * (0.8 + rand() * 0.4), 0.95);
      }
      for (var i = 0; i < fillN; i++) {
        var u = rand();                              // 0 base -> 1 tip
        if (rand() > 0.6 + 0.4 * u) continue;        // dense body, denser tip
        var hwAt = hw * Math.pow(1 - u, 0.62);       // petal narrows to the tip
        var v = (rand() * 2 - 1); v = v * (1 - 0.18 * v * v);
        var p2 = jit(P(rIn + (rOut - rIn) * u, a + v * hwAt), 0.008);
        T.dot(p2[0], p2[1], 0.58 * (0.7 + rand() * 0.7), 0.55 + 0.4 * u + 0.05 * rand());
      }
    };
    // a triangle of dotted lines, with optional stipple toward the outer vertex
    T.triangle = function (p0, p1, p2, size, alpha, fillN) {
      T.line(p0, p1, size, alpha); T.line(p1, p2, size, alpha); T.line(p2, p0, size, alpha);
      for (var i = 0; i < (fillN || 0); i++) {
        var a1 = rand(), a2 = rand();
        if (a1 + a2 > 1) { a1 = 1 - a1; a2 = 1 - a2; }
        var b0 = 1 - a1 - a2;
        // weight toward p0 (the tip) so it reads dark there
        var w = Math.pow(rand(), 0.5);
        var x = p0[0] * (b0 + 0.4 * w) + p1[0] * a1 + p2[0] * a2;
        var y = p0[1] * (b0 + 0.4 * w) + p1[1] * a1 + p2[1] * a2;
        var p = jit([x, y], 0.01);
        T.dot(p[0], p[1], 0.5 * (0.7 + rand() * 0.6), 0.42 + 0.45 * rand());
      }
    };
    // flower-of-life heart (central circle + six around) inside a ring,
    // plus a small stipple core so the centre is never empty.
    T.heart = function (rc) {
      T.ring(0, 0, rc, 0.5, 0.85);
      for (var k = 0; k < 6; k++) {
        var ca = -Math.PI / 2 + k * (TAU / 6);
        T.ring(Math.cos(ca) * rc, Math.sin(ca) * rc, rc, 0.46, 0.8);
      }
      T.ring(0, 0, rc * 2, 0.52, 0.82);
      for (var c = 0; c < 70; c++) {
        var aa = rand() * TAU, rr = Math.pow(rand(), 1.4) * rc * 0.7;
        T.dot(Math.cos(aa) * rr, Math.sin(aa) * rr, 0.42 * (0.7 + rand() * 0.5), 0.5 + rand() * 0.3);
      }
    };
    return T;
  }

  // shared: rings of petals (optionally offset on alternate rings so petals nestle)
  function petalRings(T, rings, offset, density) {
    for (var rI = 0; rI < rings.length; rI++) {
      var R = rings[rI];
      var hw = (TAU / R.m) * R.hw;
      var fillN = Math.max(40, Math.round((R.rOut - R.rIn) * R.rOut * 680 * density));
      var a0 = -Math.PI / 2 + ((offset && (rI & 1)) ? (TAU / R.m) / 2 : 0);
      for (var i = 0; i < R.m; i++) T.petal(a0 + i * (TAU / R.m), hw, R.rIn, R.rOut, fillN);
    }
  }

  /* ---------- the designs ---------- */
  var DESIGNS = {
    // layered pointed-petal lotus, like Scotty's neck / wrist pieces — broad,
    // overlapping petals in concentric rings (scaled like lotus leaves)
    lotus: function (T, density) {
      petalRings(T, [
        { m: 12, rIn: 0.58, rOut: 1.00, hw: 0.80 },
        { m: 10, rIn: 0.40, rOut: 0.71, hw: 0.82 },
        { m: 8,  rIn: 0.22, rOut: 0.47, hw: 0.85 }
      ], false, density);
      T.heart(0.105);
      T.ring(0, 0, 1.0, 0.5, 0.42);
    },
    // full, dense dahlia/chrysanthemum, like the back & shoulder rosettes —
    // many SHORT, broad petals layered like scales across five concentric rings
    rosette: function (T, density) {
      petalRings(T, [
        { m: 38, rIn: 0.78, rOut: 1.00, hw: 0.62 },
        { m: 31, rIn: 0.63, rOut: 0.85, hw: 0.66 },
        { m: 24, rIn: 0.48, rOut: 0.70, hw: 0.68 },
        { m: 18, rIn: 0.33, rOut: 0.55, hw: 0.70 },
        { m: 12, rIn: 0.19, rOut: 0.40, hw: 0.72 }
      ], true, density * 1.15);
      T.heart(0.10);
      T.ring(0, 0, 1.0, 0.5, 0.42);
    },
    // sacred-geometry star: a ring of triangles, layered hexagrams, seed of life
    geometric: function (T, density) {
      T.ring(0, 0, 1.0, 0.6, 0.6);
      T.ring(0, 0, 0.93, 0.5, 0.5);
      // outward ring of triangles (a cog of points), shaded toward the tips
      var m = 24, rIn = 0.70, rOut = 0.95, hs = (TAU / m) * 0.5;
      for (var i = 0; i < m; i++) {
        var a = -Math.PI / 2 + i * (TAU / m);
        T.triangle(P(rOut, a), P(rIn, a - hs), P(rIn, a + hs), 0.6, 0.95,
          Math.round(70 * density));
      }
      // inner ring of counter-triangles pointing inward
      var m2 = 12, hs2 = (TAU / m2) * 0.5;
      for (var j = 0; j < m2; j++) {
        var a2 = -Math.PI / 2 + j * (TAU / m2);
        T.triangle(P(0.34, a2), P(0.62, a2 - hs2), P(0.62, a2 + hs2), 0.55, 0.9,
          Math.round(46 * density));
      }
      // two layered hexagrams -> a 12-point star
      function hexagram(rO, rot) {
        var V = [];
        for (var k = 0; k < 6; k++) V.push(P(rO, rot + k * (TAU / 6)));
        T.triangle(V[0], V[2], V[4], 0.6, 0.95, 0);
        T.triangle(V[1], V[3], V[5], 0.6, 0.95, 0);
      }
      hexagram(0.66, -Math.PI / 2);
      hexagram(0.66, -Math.PI / 2 + TAU / 12);
      T.ring(0, 0, 0.50, 0.5, 0.6);
      // seed-of-life heart, a touch larger here
      T.heart(0.165);
    },

    // a bold pointed star-burst — 12 long spokes with offset spokes between
    star: function (T, density) {
      petalRings(T, [
        { m: 12, rIn: 0.30, rOut: 1.00, hw: 0.34 },
        { m: 12, rIn: 0.18, rOut: 0.64, hw: 0.42 }
      ], true, density);
      T.ring(0, 0, 1.0, 0.5, 0.45);
      T.heart(0.12);
    },

    // sacred geometry — flower / seed of life: overlapping circles + petals
    seed: function (T, density) {
      T.ring(0, 0, 1.00, 0.5, 0.5);
      T.ring(0, 0, 0.86, 0.42, 0.4);
      for (var i = 0; i < 12; i++) {
        var a = -Math.PI / 2 + i * (TAU / 12);
        T.ring(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.24, 0.4, 0.6);
      }
      petalRings(T, [{ m: 18, rIn: 0.40, rOut: 0.64, hw: 0.6 }], false, density * 0.85);
      T.heart(0.30);
    },

    // ornamental lace — concentric scalloped petal bands
    lace: function (T, density) {
      petalRings(T, [
        { m: 30, rIn: 0.82, rOut: 1.00, hw: 0.66 },
        { m: 24, rIn: 0.66, rOut: 0.85, hw: 0.66 },
        { m: 36, rIn: 0.50, rOut: 0.67, hw: 0.62 },
        { m: 20, rIn: 0.34, rOut: 0.53, hw: 0.66 }
      ], true, density);
      T.ring(0, 0, 1.0, 0.5, 0.45);
      T.ring(0, 0, 0.82, 0.42, 0.5);
      T.ring(0, 0, 0.50, 0.42, 0.5);
      T.heart(0.14);
    }
  };

  var DESIGN_ORDER = ['lotus', 'rosette', 'geometric', 'star', 'seed', 'lace'];

  /* ---------- engine ---------- */

  function init(canvas) {
    if (canvas.dataset.morphBound) return;
    canvas.dataset.morphBound = '1';

    var design  = (attr(canvas, 'design', 'lotus') + '').toLowerCase();
    var build   = DESIGNS[design] || DESIGNS.lotus;
    var style   = (attr(canvas, 'style', 'dots') + '').toLowerCase();   // dots | ascii
    var INK     = attr(canvas, 'ink', '#0b0908');
    var fitK    = clamp(num(canvas, 'fit', 0.94), 0.4, 1.0);
    var dotMax  = num(canvas, 'dot', 1.7);
    var density = clamp(num(canvas, 'density', 1), 0.1, 80);
    var targetN = Math.max(0, Math.floor(num(canvas, 'count', 0)));    // target total dots (0 = use density)
    var inkA    = clamp(num(canvas, 'alpha', 1), 0.06, 1);             // per-dot alpha multiplier
    var haloK   = clamp(num(canvas, 'halo', 1), 0, 1.6);
    var speed   = Math.max(0, num(canvas, 'speed', 1));
    var REVEAL  = Math.max(0, num(canvas, 'reveal', 1700));
    var seed    = attr(canvas, 'seed', 'scotty-massa');
    var animate = attr(canvas, 'animate', 'true') !== 'false';
    // ASCII-style options
    var GLYPH   = attr(canvas, 'glyph', '#ece3d3');                     // ink color for ascii
    var RAMP    = attr(canvas, 'ramp', " .·:;+=oxX%#@");           // light -> dark
    var cellPx  = clamp(num(canvas, 'cell', 13), 6, 40);               // ascii font size (css px)
    var gamma   = clamp(num(canvas, 'gamma', 0.72), 0.2, 2);
    var grid    = null;                                                 // {cols,rows,cw,ch,val:Float32Array}

    // Morph cycle: the list of designs to morph through. data-morph-cycle can be
    // "all", a comma list ("lotus,rosette,geometric"), or omitted (single design).
    var cycleRaw = (attr(canvas, 'cycle', '') + '').toLowerCase().trim();
    var names;
    if (cycleRaw === 'all') names = DESIGN_ORDER.slice();
    else if (cycleRaw) names = cycleRaw.split(',');
    else names = [design];
    names = names.map(function (s) { return s.trim(); }).filter(function (n) { return DESIGNS[n]; });
    if (!names.length) names = ['lotus'];
    var HOLD  = Math.max(0, num(canvas, 'hold', 3600));    // ms each design holds
    var BLEND = Math.max(300, num(canvas, 'blend', 2000)); // ms to dissolve between
    var SEG   = HOLD + BLEND;

    var ctx = canvas.getContext('2d', { alpha: true });
    var layers = {};                 // design name -> baked dotwork canvas (current size)
    var halo = null, grid = null, builtFor = '';
    var size = { w: 1, h: 1, dpr: 1 };
    var visible = true, start = performance.now(), pausedAt = 0;

    function fit() {
      var rect = canvas.getBoundingClientRect();
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var w = Math.max(1, Math.floor(rect.width));
      var h = Math.max(1, Math.floor(rect.height));
      var bw = Math.floor(w * dpr), bh = Math.floor(h * dpr);
      if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
      return { w: w, h: h, dpr: dpr };
    }

    // Build one design's dot list, scaled to the requested total dot count.
    // (Fills dominate, so scaling density converges to the target in a pass or two.)
    function dotsFor(name) {
      function build1(d) {
        var rnd = mulberry32(xmur3(seed + '|' + name)());
        var tk = toolkit(rnd); DESIGNS[name](tk, d); return tk.dots;
      }
      var d = density, ds = build1(d);
      if (targetN > 0) {
        for (var pass = 0; pass < 4 && ds.length > 50; pass++) {
          var f = targetN / ds.length;
          if (f > 0.95 && f < 1.05) break;
          d = clamp(d * f, 0.03, 400); ds = build1(d);
        }
      }
      return ds;
    }

    // Pre-bake a design to its own transparent dotwork layer (done once per
    // design per size). Per frame we only composite these — cheap even at 100k.
    function bakeInk(name) {
      var pw = canvas.width, ph = canvas.height, dpr = size.dpr;
      var cx = pw / 2, cy = ph / 2, R = Math.min(pw, ph) * 0.5 * fitK;
      var ds = dotsFor(name);
      var cv = document.createElement('canvas'); cv.width = pw; cv.height = ph;
      var g = cv.getContext('2d'); g.fillStyle = INK;
      for (var i = 0; i < ds.length; i++) {
        var d = ds[i];
        g.globalAlpha = clamp(d.a * inkA, 0, 1);
        g.beginPath();
        g.arc(cx + d.x * R, cy + d.y * R, Math.max(0.35 * dpr, d.r * dotMax * dpr), 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
      return cv;
    }
    function ensureBaked(name) { return layers[name] || (layers[name] = bakeInk(name)); }

    function bakeHalo() {
      var pw = canvas.width, ph = canvas.height;
      var cx = pw / 2, cy = ph / 2, R = Math.min(pw, ph) * 0.5 * fitK;
      halo = document.createElement('canvas'); halo.width = pw; halo.height = ph;
      var hg = halo.getContext('2d');
      var hr = R * 1.12;
      var grad = hg.createRadialGradient(cx, cy, R * 0.05, cx, cy, hr);
      grad.addColorStop(0.00, 'rgba(240,232,219,' + (0.62 * haloK) + ')');
      grad.addColorStop(0.50, 'rgba(234,224,208,' + (0.54 * haloK) + ')');
      grad.addColorStop(0.78, 'rgba(220,200,166,' + (0.34 * haloK) + ')');
      grad.addColorStop(0.92, 'rgba(150,118,76,' + (0.12 * haloK) + ')');
      grad.addColorStop(1.00, 'rgba(0,0,0,0)');
      hg.fillStyle = grad; hg.beginPath(); hg.arc(cx, cy, hr, 0, TAU); hg.fill();
    }

    // ASCII: downsample a baked design into a glyph grid (avg ink alpha per cell)
    function buildGrid(name) {
      var src = ensureBaked(name), w = size.w, h = size.h, pw = canvas.width, ph = canvas.height;
      var cw = Math.max(3, cellPx * 0.58), chh = Math.max(5, cellPx);
      var cols = Math.max(8, Math.round(w / cw)), rows = Math.max(8, Math.round(h / chh));
      var tmp = document.createElement('canvas'); tmp.width = cols; tmp.height = rows;
      var tg = tmp.getContext('2d'); tg.drawImage(src, 0, 0, pw, ph, 0, 0, cols, rows);
      var data = tg.getImageData(0, 0, cols, rows).data;
      var val = new Float32Array(cols * rows);
      for (var p = 0; p < cols * rows; p++) val[p] = data[p * 4 + 3] / 255;
      grid = { cols: cols, rows: rows, val: val };
    }

    function ensureSize() {
      var key = canvas.width + 'x' + canvas.height;
      if (key === builtFor) return;
      builtFor = key;
      layers = {}; halo = null; grid = null;
      bakeHalo();
      if (style === 'ascii') buildGrid(names[0]);
    }

    // ASCII render: a mandala of monospace glyphs (light on the dark hero).
    function drawAscii(now, intro) {
      var w = size.w, h = size.h, dpr = size.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!grid) return;
      var cols = grid.cols, rows = grid.rows, val = grid.val;
      var cwp = w / cols, chp = h / rows;
      var cx = w / 2, cy = h / 2, maxR = Math.min(w, h) * 0.52;
      var L = RAMP.length - 1, t = (now - start) * 0.001 * speed;
      ctx.font = '600 ' + cellPx + 'px "DejaVu Sans Mono","SF Mono",Menlo,Consolas,monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = GLYPH;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var v = val[r * cols + c];
          if (v < 0.02) continue;
          var x = (c + 0.5) * cwp, y = (r + 0.5) * chp;
          var dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxR;
          var rev = clamp((intro * 1.3 - dist * 0.55) / 0.45, 0, 1);
          if (rev <= 0.001) continue;
          var sh = 0.84 + 0.16 * Math.sin(t * 2.2 + c * 0.55 + r * 0.85);
          var inten = clamp(Math.pow(v, gamma) * sh, 0, 1);
          var gi = Math.round(inten * L), ch = RAMP.charAt(gi < 0 ? 0 : gi > L ? L : gi);
          if (ch === ' ') continue;
          ctx.globalAlpha = clamp(rev * (0.4 + 0.6 * inten), 0, 1);
          ctx.fillText(ch, x, y);
        }
      }
      ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    function draw(now) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ensureSize();
      var elapsed = now - start; if (elapsed < 0) elapsed = 0;
      var intro = REVEAL > 0 ? smooth(clamp(elapsed / REVEAL, 0, 1)) : 1;

      if (style === 'ascii') { drawAscii(now, intro); return; }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var cx = canvas.width / 2, cy = canvas.height / 2;
      var breath = 1 + 0.012 * Math.sin(elapsed * 0.0006 * speed);
      var rot = elapsed * 0.00002 * speed;
      var base = 0.965 + 0.035 * intro;

      // halo (steady skin-glow; transparent when halo=0)
      if (halo) { ctx.globalAlpha = intro; ctx.drawImage(halo, 0, 0); ctx.globalAlpha = 1; }

      var N = names.length, cur = 0, nxt = 0, k = 0, into = 0;
      if (N > 1) {
        cur = Math.floor(elapsed / SEG) % N;
        into = elapsed % SEG;
        k = into <= HOLD ? 0 : smooth((into - HOLD) / BLEND);
        nxt = (cur + 1) % N;
      }
      ensureBaked(names[cur]);
      // bake the next design during the hold so the dissolve never hitches
      if (N > 1 && (k > 0 || into > HOLD * 0.5)) ensureBaked(names[nxt]);

      function blit(name, alpha, scl, rota) {
        if (alpha <= 0.003 || !layers[name]) return;
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(rota); ctx.scale(scl, scl); ctx.translate(-cx, -cy);
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.drawImage(layers[name], 0, 0);
        ctx.restore();
      }

      if (k <= 0) {
        blit(names[cur], intro, base * breath, rot);
      } else {
        // cross-dissolve: current drifts out + scales up, next settles in — a
        // smooth morph, no burst. Slight counter-rotation sells the transform.
        blit(names[cur], intro * (1 - k), base * (1 + 0.05 * k) * breath, rot - k * 0.10);
        blit(names[nxt], intro * k,       base * (0.95 + 0.05 * k) * breath, rot + (1 - k) * 0.12);
      }
      ctx.globalAlpha = 1;
    }

    var raf = null;
    function frame(now) { if (!visible) return; draw(now); raf = requestAnimationFrame(frame); }
    function startLoop() { if (!raf) raf = requestAnimationFrame(frame); }
    function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    size = fit();
    var staticMode = !animate || prefersReducedMotion;

    var resizePending = false;
    function refit() {
      if (resizePending) return; resizePending = true;
      requestAnimationFrame(function () {
        resizePending = false; size = fit();
        draw(staticMode ? (start + REVEAL) : performance.now());
      });
    }
    if ('ResizeObserver' in window) { new ResizeObserver(refit).observe(canvas); }
    else { window.addEventListener('resize', refit); }

    if (staticMode) { draw(start + REVEAL); return; }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            visible = true;
            if (pausedAt) { start += performance.now() - pausedAt; pausedAt = 0; }
            startLoop();
          } else { visible = false; pausedAt = performance.now(); stopLoop(); }
        });
      }, { threshold: 0.01 }).observe(canvas);
    }
    startLoop();
  }

  function autoInit() {
    var nodes = document.querySelectorAll('[data-mandala-morph]');
    for (var i = 0; i < nodes.length; i++) init(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
  document.addEventListener('partials:loaded', autoInit);
})();
