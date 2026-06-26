/* =============================================================
   mandala-morph.js — Scotty Massa's living solar mandala.
   -------------------------------------------------------------
   A premium, animated hero mark. It ASSEMBLES out of gold ink
   (a dust cloud condensing into crisp dotwork + linework), forms
   Scotty's gold SOLAR LOGO — concentric rings of tessellated
   triangles, filled with a warm radial gold gradient, around a
   flaming sun — holds luminous, then slowly MORPHS through a set
   of geometric mandalas (star, lotus, girih, diamond, yantra) and
   returns home to the logo.

   Three keyed layers per figure, all driven by the same seeded
   geometry so they move together:
     1. FILLED BODY  — gold-gradient triangle tessellation (the
        bold sunburst), with a soft bloom so gold reads as light.
     2. DOTWORK GRIT — thousands of stipple dots sampled along the
        figure's edges; they reflow between figures during a morph
        (glowing additively, so the transition is a shower of gold
        sparks, not mud) and lay down the hand-stippled texture.
     3. FLAMING SUN  — the logo's centre: curling gold flame rays,
        dark core, bright corona.
   Finished with a dust halo, vignette and fine film grain.

   Deterministic (seeded PRNG), zero dependencies. Honours
   prefers-reduced-motion (one static assembled frame). Pauses
   offscreen (IntersectionObserver) and resumes without a jump.
   Resizes with its parent (ResizeObserver). DPR capped at 2.

   Markup:
     <canvas data-mandala-morph></canvas>

   Data attributes (all optional):
     data-morph-count   : dotwork dot count                  (default 5200)
     data-morph-dot     : max dot size in CSS px             (default 2.0)
     data-morph-ink     : dotwork colour (a light gold)      (default #f4e3ad)
     data-morph-variants: number of mandalas in the loop     (default 6)
     data-morph-flow    : morph swirl strength               (default 0.42)
     data-morph-fit     : figure scale inside the canvas     (default 0.46)
     data-morph-hold    : ms to hold each mandala            (default 3000)
     data-morph-blend   : ms to morph between mandalas        (default 2400)
     data-morph-reveal  : ms of the opening assemble          (default 2600)
     data-morph-accent  : fraction of dots inked blood-red    (default 0 — off)
     data-morph-speed   : spin / motion multiplier            (default 1)
     data-morph-seed    : PRNG seed                           (default "scotty-massa")
     data-morph-animate : "false" -> one static frame         (default true)
     data-morph-fig     : lock to one mandala index, no morph (default: cycle)
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

  // Seeded PRNG so the figures + dot layout are identical on every load.
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

  /* ---------- figure geometry (unit space, radius 1) ----------
     A figure is { tris:[ [ax,ay,bx,by,cx,cy], ... ], sun:bool }.
     Every gold triangle is stored as three unit-space points. */

  // One ring of tessellated triangles. Vertices alternate inner/outer
  // radius around the circle; triangle k = (v_k, v_{k+1}, v_{k+2}); we
  // keep every other one (the alternating gold/black sunburst).
  function triRing(tris, rIn, rOut, m, parity, off) {
    var n = m * 2, pts = [], i;
    for (i = 0; i < n; i++) {
      var a = (i / n) * TAU - Math.PI / 2 + (off || 0);
      var r = (i % 2 === 0) ? rIn : rOut;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    for (i = 0; i < n; i++) {
      if (((i + parity) & 1) !== 0) continue;
      var p0 = pts[i], p1 = pts[(i + 1) % n], p2 = pts[(i + 2) % n];
      tris.push([p0[0], p0[1], p1[0], p1[1], p2[0], p2[1]]);
    }
  }
  // A ring of pointed spokes (triangle tips on a circle) — broad petals.
  function spokeRing(tris, m, rIn, rOut, spread) {
    for (var i = 0; i < m; i++) {
      var a = (i / m) * TAU - Math.PI / 2, h = (TAU / m) * (spread || 0.42);
      tris.push([
        Math.cos(a - h) * rIn, Math.sin(a - h) * rIn,
        Math.cos(a) * rOut, Math.sin(a) * rOut,
        Math.cos(a + h) * rIn, Math.sin(a + h) * rIn
      ]);
    }
  }
  // Alternating filled wedges between two radii (a gear/star ring).
  function wedgeRing(tris, m, rIn, rOut, off) {
    for (var i = 0; i < m; i++) {
      if (i & 1) continue;
      var a0 = (i / m) * TAU - Math.PI / 2 + (off || 0);
      var a1 = ((i + 1) / m) * TAU - Math.PI / 2 + (off || 0);
      var am = (a0 + a1) / 2;
      tris.push([Math.cos(a0) * rOut, Math.sin(a0) * rOut,
                 Math.cos(a1) * rOut, Math.sin(a1) * rOut,
                 Math.cos(am) * rIn, Math.sin(am) * rIn]);
    }
  }
  // A small central star motif (filled), for the non-logo figures.
  function centerStar(tris, points, rOut, rIn) {
    var m = points * 2, i;
    for (i = 0; i < m; i += 2) {
      var a0 = (i / m) * TAU - Math.PI / 2;
      var a1 = ((i + 1) / m) * TAU - Math.PI / 2;
      var a2 = ((i + 2) / m) * TAU - Math.PI / 2;
      tris.push([Math.cos(a0) * rIn, Math.sin(a0) * rIn,
                 Math.cos(a1) * rOut, Math.sin(a1) * rOut,
                 Math.cos(a2) * rIn, Math.sin(a2) * rIn]);
    }
  }

  /* ---------- the figures ---------- */

  // Figure 0 — Scotty's solar logo: concentric tessellated triangle rings
  // (more, smaller triangles outward) around the flaming sun.
  var LOGO_BANDS = [
    { rIn: 0.30, rOut: 0.44, m: 9,  off: 0.00 },
    { rIn: 0.44, rOut: 0.58, m: 14, off: 0.70 },
    { rIn: 0.58, rOut: 0.72, m: 19, off: 0.18 },
    { rIn: 0.72, rOut: 0.86, m: 25, off: 0.55 },
    { rIn: 0.86, rOut: 0.985, m: 32, off: 0.30 }
  ];
  function figLogo() {
    var tris = [];
    for (var b = 0; b < LOGO_BANDS.length; b++) {
      var B = LOGO_BANDS[b], o = B.off * (TAU / (B.m * 2));
      triRing(tris, B.rIn, B.rOut, B.m, b & 1, o);
    }
    // thin dark separators between the bands (the logo's layered concentric rings)
    return { tris: tris, sun: true, rings: [0.30, 0.44, 0.58, 0.72, 0.86, 0.985] };
  }
  // Figure 1 — a 12-point star burst.
  function figStar() {
    var tris = [];
    triRing(tris, 0.72, 0.985, 18, 0, 0);
    wedgeRing(tris, 24, 0.42, 0.66, 0);
    triRing(tris, 0.20, 0.34, 6, 0, 0);
    centerStar(tris, 6, 0.17, 0.07);
    return { tris: tris, sun: false };
  }
  // Figure 2 — a broad lotus.
  function figLotus() {
    var tris = [];
    triRing(tris, 0.80, 0.985, 28, 0, 0);
    spokeRing(tris, 10, 0.46, 0.74, 0.46);
    triRing(tris, 0.30, 0.44, 10, 1, 0.1);
    centerStar(tris, 8, 0.18, 0.06);
    return { tris: tris, sun: false };
  }
  // Figure 3 — girih-style interlaced star ring.
  function figGirih() {
    var tris = [];
    triRing(tris, 0.78, 0.985, 20, 0, 0);
    spokeRing(tris, 10, 0.50, 0.78, 0.30);
    spokeRing(tris, 10, 0.50, 0.30, 0.30);   // inward-pointing counter spokes
    centerStar(tris, 10, 0.24, 0.10);
    return { tris: tris, sun: false };
  }
  // Figure 4 — dense diamond / rhombus field.
  function figDiamond() {
    var tris = [];
    triRing(tris, 0.74, 0.985, 30, 0, 0);
    triRing(tris, 0.50, 0.66, 20, 1, 0.1);
    triRing(tris, 0.28, 0.44, 12, 0, 0.2);
    centerStar(tris, 4, 0.18, 0.07);
    return { tris: tris, sun: false };
  }
  // Figure 5 — nested-triangle yantra.
  function figYantra() {
    var tris = [];
    triRing(tris, 0.80, 0.985, 24, 0, 0);
    spokeRing(tris, 6, 0.30, 0.74, 0.5);     // big upward triangles
    spokeRing(tris, 6, 0.30, 0.74, 0.5);
    triRing(tris, 0.30, 0.46, 6, 1, 0.5);
    centerStar(tris, 6, 0.16, 0.06);
    return { tris: tris, sun: false };
  }

  var BUILDERS = [figLogo, figStar, figLotus, figGirih, figDiamond, figYantra];

  /* ---------- dotwork cloud sampled along the triangle edges ---------- */
  function cloudFromTris(tris, N, rand) {
    var pts = [], i, j;
    for (i = 0; i < tris.length; i++) {
      var t = tris[i];
      var edges = [
        [t[0], t[1], t[2], t[3]],
        [t[2], t[3], t[4], t[5]],
        [t[4], t[5], t[0], t[1]]
      ];
      for (j = 0; j < 3; j++) {
        var e = edges[j], dx = e[2] - e[0], dy = e[3] - e[1];
        var len = Math.sqrt(dx * dx + dy * dy), cnt = Math.max(1, Math.round(len * 42));
        for (var k = 0; k < cnt; k++) {
          var u = (k + 0.5) / cnt;
          pts.push([e[0] + dx * u + (rand() - 0.5) * 0.006,
                    e[1] + dy * u + (rand() - 0.5) * 0.006]);
        }
      }
    }
    if (pts.length > N) {
      for (i = pts.length - 1; i > 0; i--) { var r = (rand() * (i + 1)) | 0, tmp = pts[i]; pts[i] = pts[r]; pts[r] = tmp; }
      pts.length = N;
    } else {
      var L = pts.length || 1;
      while (pts.length < N) { var p = pts[(rand() * L) | 0] || [0, 0]; pts.push([p[0] + (rand() - 0.5) * 0.01, p[1] + (rand() - 0.5) * 0.01]); }
    }
    // angle-sort so dot #i corresponds across figures (the morph reflows)
    pts.sort(function (a, b) {
      var aa = Math.atan2(a[1], a[0]), ba = Math.atan2(b[1], b[0]);
      if (aa !== ba) return aa - ba;
      return (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]);
    });
    var f = new Float32Array(N * 2);
    for (i = 0; i < N; i++) { f[i * 2] = pts[i][0]; f[i * 2 + 1] = pts[i][1]; }
    return f;
  }

  /* ---------- engine ---------- */

  function init(canvas) {
    if (canvas.dataset.morphBound) return;
    canvas.dataset.morphBound = '1';

    var N       = Math.max(800, Math.floor(num(canvas, 'count', 5200)));
    var dotMax  = num(canvas, 'dot', 2.0);
    var INK     = attr(canvas, 'ink', '#f4e3ad');
    var NV      = Math.max(2, Math.min(BUILDERS.length, Math.floor(num(canvas, 'variants', 6))));
    var flow    = Math.max(0, num(canvas, 'flow', 0.34));
    var fitK    = clamp(num(canvas, 'fit', 0.46), 0.30, 0.50);
    var HOLD    = Math.max(0, num(canvas, 'hold', 3000));
    var BLEND   = Math.max(300, num(canvas, 'blend', 2800));
    var REVEAL  = Math.max(0, num(canvas, 'reveal', 2600));
    var accentF = clamp(num(canvas, 'accent', 0), 0, 0.18);
    var speed   = Math.max(0, num(canvas, 'speed', 1));
    var seed    = attr(canvas, 'seed', 'scotty-massa');
    var animate = attr(canvas, 'animate', 'true') !== 'false';
    var lockRaw = canvas.getAttribute('data-morph-fig');
    var lockFig = lockRaw == null ? -1 : (parseInt(lockRaw, 10) || 0);
    var SEG     = HOLD + BLEND;

    var rand = mulberry32(xmur3(seed)());

    // Build the figures + their dot clouds (figure 0 = the logo).
    var figs = [], clouds = [], v;
    for (v = 0; v < NV; v++) {
      var f = (BUILDERS[v] || figLogo)();
      figs.push(f);
      clouds.push(cloudFromTris(f.tris, N, rand));
    }
    var F = figs.length;

    // Flaming-sun blades (seeded once, so the swirl is stable per load).
    var sunFlames = [];
    (function () { var Nf = 16; for (var s = 0; s < Nf; s++) sunFlames.push({ base: (s / Nf) * TAU, curl: 0.85 + rand() * 0.30, len: 0.86 + rand() * 0.18 }); })();

    // Stable per-dot styling + a scattered "dust" start position for the reveal.
    var accent = new Uint8Array(N);
    var jit = new Float32Array(N), phase = new Float32Array(N), scatter = new Float32Array(N * 2);
    for (var i = 0; i < N; i++) {
      accent[i] = rand() < accentF ? 1 : 0;
      jit[i] = 0.7 + rand() * 0.7;
      phase[i] = rand() * TAU;
      var sa = rand() * TAU, sr = 0.2 + rand() * 1.4;
      scatter[i * 2] = Math.cos(sa) * sr; scatter[i * 2 + 1] = Math.sin(sa) * sr;
    }

    var ctx = canvas.getContext('2d', { alpha: true });
    var pos = new Float32Array(N * 2);
    var size = fit();
    var visible = true;
    var start = performance.now();
    var pausedAt = 0;

    // Offscreen layers rebuilt on resize: dust halo + film grain.
    var halo = null, grain = null, builtFor = '';
    function buildLayers(w, h, dpr) {
      var key = w + 'x' + h + '@' + dpr;
      if (key === builtFor) return;
      builtFor = key;
      var cx = w / 2, cy = h / 2, R = Math.min(w, h) * fitK;
      var grand = mulberry32(0x9e3779b1 ^ (w * 73856093) ^ (h * 19349663));
      // halo
      halo = document.createElement('canvas'); halo.width = Math.floor(w * dpr); halo.height = Math.floor(h * dpr);
      var hc = halo.getContext('2d'); hc.setTransform(dpr, 0, 0, dpr, 0, 0);
      hc.fillStyle = 'rgba(247,225,160,0.85)';
      for (var n = 0; n < 2600; n++) {
        var a = grand() * TAU, rr = (0.95 + Math.pow(grand(), 2.2) * 0.11) * R;
        hc.globalAlpha = 0.10 + grand() * 0.5;
        hc.beginPath(); hc.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0.4 + grand() * 1.1, 0, TAU); hc.fill();
      }
      // grain
      grain = document.createElement('canvas'); grain.width = Math.floor(w * dpr); grain.height = Math.floor(h * dpr);
      var gc = grain.getContext('2d'); gc.setTransform(dpr, 0, 0, dpr, 0, 0);
      gc.globalAlpha = 0.035;
      for (var g = 0; g < 4200; g++) { gc.fillStyle = grand() < 0.5 ? '#fff' : '#000'; gc.fillRect(grand() * w, grand() * h, 1, 1); }
    }

    function fit() {
      var rect = canvas.getBoundingClientRect();
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var w = Math.max(1, Math.floor(rect.width));
      var h = Math.max(1, Math.floor(rect.height));
      var bw = Math.floor(w * dpr), bh = Math.floor(h * dpr);
      if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
      return { w: w, h: h, dpr: dpr };
    }

    function goldGrad(cx, cy, R) {
      var g = ctx.createRadialGradient(cx, cy, R * 0.10, cx, cy, R);
      g.addColorStop(0.00, '#fdeec0'); g.addColorStop(0.30, '#f2d488');
      g.addColorStop(0.58, '#d8ad53'); g.addColorStop(0.80, '#a87b32');
      g.addColorStop(1.00, '#6b4a18');
      return g;
    }

    function drawFills(fig, cx, cy, R, grad, alpha, rot) {
      if (alpha <= 0.004) return;
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(rot); ctx.translate(-cx, -cy);
      ctx.globalAlpha = alpha; ctx.fillStyle = grad;
      ctx.shadowColor = 'rgba(255,210,120,' + (0.45 * alpha) + ')'; ctx.shadowBlur = R * 0.032;
      var t = fig.tris;
      for (var i = 0; i < t.length; i++) {
        var q = t[i];
        ctx.beginPath();
        ctx.moveTo(cx + q[0] * R, cy + q[1] * R);
        ctx.lineTo(cx + q[2] * R, cy + q[3] * R);
        ctx.lineTo(cx + q[4] * R, cy + q[5] * R);
        ctx.closePath(); ctx.fill();
      }
      // thin dark band separators carve the concentric rings apart
      if (fig.rings) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(8,6,5,' + (0.5 * alpha) + ')';
        ctx.lineWidth = Math.max(1, R * 0.007);
        for (var ri = 0; ri < fig.rings.length; ri++) {
          ctx.beginPath(); ctx.arc(cx, cy, fig.rings[ri] * R, 0, TAU); ctx.stroke();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    // A flaming sun built from tapered, curved blades that all swirl one way
    // (an ammonite/solar vortex) around a dark gilded core with a bright corona.
    function flamePath(baseAng, innerR, outerR, curl, t, idx) {
      var steps = 20, Lx = [], Ly = [], Rx = [], Ry = [], s;
      for (s = 0; s <= steps; s++) {
        var f = s / steps, rad = innerR + (outerR - innerR) * f;
        var bend = curl * 0.62 * f * f, sway = Math.sin(t * 1.1 + idx * 0.7 + f * 2.0) * 0.03 * f;
        var ang = baseAng + bend + sway;
        var w = (0.20 * innerR) * (1 - f) * (0.6 + 0.4 * Math.sin(f * Math.PI));
        var nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
        var px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
        Lx[s] = px + nx * w; Ly[s] = py + ny * w; Rx[s] = px - nx * w; Ry[s] = py - ny * w;
      }
      ctx.beginPath(); ctx.moveTo(Lx[0], Ly[0]);
      for (var i = 1; i <= steps; i++) ctx.lineTo(Lx[i], Ly[i]);
      for (var j = steps; j >= 0; j--) ctx.lineTo(Rx[j], Ry[j]);
      ctx.closePath();
    }

    function drawSun(cx, cy, R, grad, scale, alpha, now) {
      if (alpha <= 0.004) return;
      var t = now * 0.001, pulse = Math.sin(now * 0.0016 * speed);
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(now * 0.00004 * speed); ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;
      var sunR = 0.30 * R, coreR = sunR * 0.34, innerR = sunR * 0.40, outerR = sunR * 0.99 * (1 + 0.02 * pulse);
      // corona (additive, so it glows)
      var corR = sunR * (1.30 + 0.05 * pulse);
      var cor = ctx.createRadialGradient(0, 0, coreR * 0.4, 0, 0, corR);
      cor.addColorStop(0, 'rgba(255,244,210,' + (1.0 * alpha) + ')');
      cor.addColorStop(0.24, 'rgba(248,216,140,' + (0.62 * alpha) + ')');
      cor.addColorStop(0.55, 'rgba(190,140,56,' + (0.22 * alpha) + ')');
      cor.addColorStop(1, 'rgba(110,78,22,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = cor;
      ctx.beginPath(); ctx.arc(0, 0, corR, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha;
      // main flame blades
      var fg = ctx.createRadialGradient(0, 0, coreR, 0, 0, outerR * 1.05);
      fg.addColorStop(0, '#fff1c4'); fg.addColorStop(0.45, '#e7c069'); fg.addColorStop(1, '#9a7026');
      ctx.fillStyle = fg;
      var Nf = sunFlames.length, step = TAU / Nf, i;
      for (i = 0; i < Nf; i++) { var fl = sunFlames[i]; flamePath(fl.base, innerR, outerR * fl.len, fl.curl, t, i); ctx.fill(); }
      // interleaved shorter counter-blades (depth)
      var fg2 = ctx.createRadialGradient(0, 0, coreR, 0, 0, outerR * 0.7);
      fg2.addColorStop(0, '#ffe7b0'); fg2.addColorStop(1, '#8a6422');
      ctx.fillStyle = fg2;
      for (i = 0; i < Nf; i++) { var fk = sunFlames[i]; flamePath(fk.base + step * 0.5, innerR * 0.92, outerR * 0.62, -fk.curl * 0.8, t, i + 50); ctx.fill(); }
      // dark gilded core + rim + hot spark
      var coreGrad = ctx.createRadialGradient(0, 0, coreR * 0.1, 0, 0, coreR * 1.15);
      coreGrad.addColorStop(0, '#1c140a'); coreGrad.addColorStop(0.6, '#120c06'); coreGrad.addColorStop(1, '#0a0604');
      ctx.fillStyle = coreGrad; ctx.beginPath(); ctx.arc(0, 0, coreR, 0, TAU); ctx.fill();
      ctx.lineWidth = Math.max(1.2, coreR * 0.10); ctx.strokeStyle = '#d8ad53';
      ctx.beginPath(); ctx.arc(0, 0, coreR * 1.02, 0, TAU); ctx.stroke();
      var spark = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR * 0.7);
      spark.addColorStop(0, 'rgba(255,248,222,' + (0.85 * alpha) + ')');
      spark.addColorStop(0.5, 'rgba(246,227,168,' + (0.30 * alpha) + ')');
      spark.addColorStop(1, 'rgba(246,227,168,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = spark;
      ctx.beginPath(); ctx.arc(0, 0, coreR * 0.7, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }

    function draw(now) {
      var w = size.w, h = size.h, dpr = size.dpr;
      buildLayers(w, h, dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      var cx = w / 2, cy = h / 2, R = Math.min(w, h) * fitK;
      var grad = goldGrad(cx, cy, R);

      var elapsed = now - start; if (elapsed < 0) elapsed = 0;
      var intro = REVEAL > 0 ? smooth(clamp(elapsed / REVEAL, 0, 1)) : 1;

      var cur, nxt, k;
      if (lockFig >= 0) { cur = nxt = lockFig % F; k = 0; intro = 1; }
      else if (elapsed < REVEAL) { cur = 0; nxt = 0; k = 0; }
      else {
        var ph = elapsed - REVEAL;
        cur = Math.floor(ph / SEG) % F;
        nxt = (cur + 1) % F;
        var into = ph % SEG;
        k = into <= HOLD ? 0 : smooth((into - HOLD) / BLEND);
      }
      var mp = Math.sin(k * Math.PI);
      var rot = elapsed * 0.00010 * speed;

      // background: near-black + red life-whisper + gold bloom underlay
      var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.3);
      rg.addColorStop(0, 'rgba(200,16,46,0.14)'); rg.addColorStop(0.5, 'rgba(140,12,34,0.05)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
      var bgg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.05);
      bgg.addColorStop(0, 'rgba(255,225,150,' + (0.18 * intro) + ')'); bgg.addColorStop(0.45, 'rgba(210,160,70,' + (0.09 * intro) + ')'); bgg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bgg; ctx.fillRect(0, 0, w, h);

      // FILLS — crossfade cur->nxt, dimmed through the swirl, faded up by reveal
      var fillReveal = REVEAL > 0 ? smooth(clamp((elapsed - REVEAL * 0.45) / (REVEAL * 0.55), 0, 1)) : 1;
      var fillMaster = fillReveal * (1 - 0.5 * mp);
      drawFills(figs[cur], cx, cy, R, grad, fillMaster * (1 - k), rot);
      if (k > 0) drawFills(figs[nxt], cx, cy, R, grad, fillMaster * k, rot);

      // DOTWORK — fine white stipple; reflows on morph, converges on reveal,
      // glows additively through the swirl. One pass (no red accents).
      var src = clouds[cur], dst = clouds[nxt];
      var rc = Math.cos(rot), rs = Math.sin(rot);
      var glow = mp > 0.12;
      ctx.fillStyle = INK;
      if (glow) ctx.globalCompositeOperation = 'lighter';
      for (var p = 0; p < N; p++) {
        var ix = p * 2, iy = ix + 1;
        var bx = src[ix] + (dst[ix] - src[ix]) * k, by = src[iy] + (dst[iy] - src[iy]) * k;
        if (intro < 1) { bx = scatter[ix] + (bx - scatter[ix]) * intro; by = scatter[iy] + (by - scatter[iy]) * intro; }
        var nx = bx * rc - by * rs, ny = bx * rs + by * rc;
        if (mp > 0.001 && flow > 0) {
          var rr = Math.sqrt(nx * nx + ny * ny) + 1e-4, aa = Math.atan2(ny, nx);
          aa += (cur % 2 ? -1 : 1) * flow * mp * (0.14 + rr * 0.5); rr *= 1 + mp * 0.05;
          nx = Math.cos(aa) * rr; ny = Math.sin(aa) * rr;
        }
        var x = cx + nx * R, y = cy + ny * R;
        // small, dense stipple; only a gentle swell during the morph so it stays tidy
        var sz = (0.5 + jit[p] * 0.5) * dotMax / 2 * (0.85 + 0.3 * Math.sin(phase[p] + now * 0.004)) * (1 + 0.28 * mp);
        ctx.globalAlpha = clamp((0.3 + 0.45 * intro) + 0.42 * mp, 0, 1);
        ctx.beginPath(); ctx.arc(x, y, Math.max(0.35, sz), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (glow) ctx.globalCompositeOperation = 'source-over';

      // dust halo (prebaked), breathes in with the reveal
      if (halo) { ctx.globalAlpha = 0.85 * intro; ctx.drawImage(halo, 0, 0, w, h); ctx.globalAlpha = 1; }

      // flaming sun — only the logo carries it; cross-fades + scales on reveal
      var sunA = ((figs[cur].sun ? 1 : 0) * (1 - k) + (figs[nxt].sun ? 1 : 0) * k) * fillReveal * (1 - 0.6 * mp);
      drawSun(cx, cy, R, grad, 0.5 + 0.5 * intro, sunA, now);

      // film grain, then a circular alpha mask so the whole piece FLOATS as a disc
      // (no square panel) — the canvas fades to transparent toward the corners.
      if (grain) ctx.drawImage(grain, 0, 0, w, h);
      var mask = ctx.createRadialGradient(cx, cy, R * 0.98, cx, cy, R * 1.16);
      mask.addColorStop(0, 'rgba(0,0,0,0)');
      mask.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = mask; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';

      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    var raf = null;
    function frame(now) { if (!visible) return; draw(now); raf = requestAnimationFrame(frame); }
    function startLoop() { if (!raf) raf = requestAnimationFrame(frame); }
    function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    var staticMode = !animate || prefersReducedMotion;

    var resizePending = false;
    function refit() {
      if (resizePending) return; resizePending = true;
      requestAnimationFrame(function () {
        resizePending = false; size = fit();
        draw(staticMode ? (start + REVEAL + HOLD) : performance.now());
      });
    }
    if ('ResizeObserver' in window) { new ResizeObserver(refit).observe(canvas); }
    else { window.addEventListener('resize', refit); }

    if (staticMode) {
      // one fully-assembled frame of the logo
      if (lockFig < 0) lockFig = 0;
      draw(start + REVEAL + HOLD);
      return;
    }

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
