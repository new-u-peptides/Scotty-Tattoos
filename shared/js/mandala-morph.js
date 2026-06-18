/* =============================================================
   mandala-morph.js — a living dotwork engine.
   -------------------------------------------------------------
   Thousands of tiny tattoo-stipple dots that continuously morph
   between four figures in Scotty's dotwork language:

       text → mandala → sacred geometry → owl → (loop)

   The brand "SCOTTY MASSA / TATTOOS" reads as SOLID ink (the dots pack
   dense across the letters), then breaks apart and flows into the tattoo
   imagery. The geometric figures (mandala, sacred geometry, owl) are built
   as clean LINEWORK: dots are placed evenly ALONG real stroke paths
   (arc-length sampled) so the lines read solid and crisp, the way a piece
   is actually drawn — not random scatter. The radially symmetric figures
   (mandala, geometry) slowly swirl so the piece feels alive.

   Each figure is a cloud of N points; clouds are angle-sorted so dot #i
   corresponds across figures — transitions swirl and reflow rather than
   teleport. Dots ease (smootherstep) with a gentle coherent curl, breath
   and shimmer, and carry a "strength" that drives size and opacity.
   Only the mandala slowly spins; the rest stay upright.

   Deterministic: a seeded PRNG (data-morph-seed) fixes every dot, so the
   artwork renders identically on every load. Zero dependencies. Honours
   prefers-reduced-motion (single static frame). Pauses offscreen
   (IntersectionObserver) and resumes without a time jump. Resizes with its
   parent (ResizeObserver) — clouds live in a normalised [-1, 1] space.

   Pairs with assets/css/components/mandala.css for the bone "skin" disc —
   or pass data-morph-skin to draw skin in-canvas and run fully standalone.

   Markup:
     <canvas data-mandala-morph></canvas>

   Data attributes (all optional):
     data-morph-count   : target dot count                    (default 9000)
     data-morph-dot     : max dot size in CSS px               (default 2.3)
     data-morph-weight  : ink weight / contrast multiplier     (default 1.12)
     data-morph-flow    : transition swirl strength            (default 0.30)
     data-morph-breathe : idle breathing amount                (default 0.010)
     data-morph-shape   : "round" or "square" dots          (default round)
     data-morph-fit     : figure scale inside canvas           (default 0.465)
     data-morph-hold    : ms to hold each figure               (default 3200)
     data-morph-blend   : ms to morph between figures          (default 2600)
     data-morph-accent  : fraction of dots inked blood-red     (default 0.012)
     data-morph-speed   : mandala spin / motion multiplier     (default 1)
     data-morph-seed    : PRNG seed for stable layout (default "scotty-massa")
     data-morph-animate : "false" → render one static frame   (default true)
     data-morph-skin    : CSS colour; fill an in-canvas skin disc so the
                          piece reads without the paired CSS (default: none)
     data-morph-fig     : lock to one figure, no morph
                          (0 = text, 1 = mandala, 2 = geometry, 3 = owl)
                                                             (default: cycle)
   ============================================================= */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var INK = '#0a0a0a';
  var RED = '#c8102e';

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
  function smootherstep(t) {
    t = clamp(t, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  function inkCurve(v, weight) {
    v = clamp(v, 0, 1);
    v = Math.pow(v, 0.82);
    return clamp((v - 0.055) * weight + 0.075, 0.06, 1);
  }

  // Seeded PRNG so the dot layout is identical on every load.
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

  /* ---------- cloud utilities -------------------------------- */

  // Force an array of [x,y,strength] points to exactly N, sort by angle
  // (then radius) so successive figures correspond limb-to-limb, and split
  // into a positions buffer + a strength buffer.
  function finalize(arr, N, rand) {
    if (arr.length > N) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = (rand() * (i + 1)) | 0;
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      arr.length = N;
    } else {
      var L = arr.length || 1;
      while (arr.length < N) {
        var p = arr[(rand() * L) | 0] || [0, 0, 0.8];
        arr.push([p[0] + (rand() - 0.5) * 0.012, p[1] + (rand() - 0.5) * 0.012, p[2]]);
      }
    }
    arr.sort(function (a, b) {
      var aa = Math.atan2(a[1], a[0]), ba = Math.atan2(b[1], b[0]);
      if (aa !== ba) return aa - ba;
      return (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]);
    });
    var pos = new Float32Array(N * 2), str = new Float32Array(N);
    for (var k = 0; k < N; k++) {
      pos[k * 2] = arr[k][0]; pos[k * 2 + 1] = arr[k][1];
      str[k] = arr[k][2] == null ? 0.8 : arr[k][2];
    }
    return { pos: pos, str: str };
  }

  // LINEWORK sampler: distribute ~N dots EVENLY along a set of stroke paths
  // (by arc length) so the lines read as solid, clean dotwork — the way a
  // tattoo is drawn — instead of random scatter. Each stroke is
  // { len, str, at(u)->[x,y] }. A hair of jitter keeps it hand-made.
  function strokeCloud(strokes, N, rand) {
    var total = 0, i;
    for (i = 0; i < strokes.length; i++) total += strokes[i].len;
    if (total <= 0) return [];
    var out = [];
    for (i = 0; i < strokes.length; i++) {
      var s = strokes[i];
      var cnt = Math.max(2, Math.round(N * s.len / total));
      for (var j = 0; j < cnt; j++) {
        var p = s.at((j + 0.5) / cnt);
        out.push([p[0] + (rand() - 0.5) * 0.005, p[1] + (rand() - 0.5) * 0.005, s.str]);
      }
    }
    return out;
  }

  // Parametric stroke primitives (unit space). Each returns { len, str, at }.
  function segS(x0, y0, x1, y1, str) {
    var dx = x1 - x0, dy = y1 - y0;
    return { len: Math.sqrt(dx * dx + dy * dy), str: str,
             at: function (u) { return [x0 + dx * u, y0 + dy * u]; } };
  }
  function arcS(cx, cy, r, a0, a1, str) {
    return { len: Math.abs(a1 - a0) * r, str: str,
             at: function (u) { var a = a0 + (a1 - a0) * u; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; } };
  }
  function circS(cx, cy, r, str) { return arcS(cx, cy, r, 0, TAU, str); }
  function ellipseS(cx, cy, rx, ry, str) {
    var len = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry))); // Ramanujan
    return { len: len, str: str,
             at: function (u) { var a = u * TAU; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; } };
  }
  function quadS(x0, y0, cx, cy, x1, y1, str) {
    var len = Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy); // close approx
    return { len: len, str: str,
             at: function (u) { var iu = 1 - u; return [iu * iu * x0 + 2 * iu * u * cx + u * u * x1,
                                                        iu * iu * y0 + 2 * iu * u * cy + u * u * y1]; } };
  }
  // Push a stroked regular polygon's edges (after Gemini's drawPolygon).
  function polyS(s, cx, cy, r, sides, rot, str) {
    var pts = [], i;
    for (i = 0; i <= sides; i++) { var an = rot + i * TAU / sides; pts.push([cx + Math.cos(an) * r, cy + Math.sin(an) * r]); }
    for (i = 0; i < sides; i++) s.push(segS(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], str));
  }

  // Rasterise a GREYSCALE figure drawn in unit space and scatter `density`
  // dots across it, weighted by darkness — dense in shadow, sparse in light.
  // Used for tonal figures (the brand fills solid; the skull shades).
  function rasterCloud(drawUnit, density, rand) {
    var S = 300;
    var sc = S / 2 * 0.95;
    var off = document.createElement('canvas');
    off.width = S; off.height = S;
    var c = off.getContext('2d');
    c.clearRect(0, 0, S, S);
    c.save();
    c.translate(S / 2, S / 2);
    c.scale(sc, sc);
    drawUnit(c);
    c.restore();
    var data;
    try { data = c.getImageData(0, 0, S, S).data; }
    catch (e) { return []; }
    var xs = [], ys = [], ds = [], cum = [], total = 0;
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var o = (y * S + x) * 4;
        var alpha = data[o + 3];
        if (alpha < 24) continue;
        var lum = (data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114) / 255;
        var dark = 1 - lum;
        var w = (alpha / 255) * (0.05 + dark * dark * 0.95);
        total += w;
        xs.push((x - S / 2) / sc);
        ys.push((y - S / 2) / sc);
        ds.push(dark);
        cum.push(total);
      }
    }
    var M = cum.length;
    if (!M) return [];
    var out = [];
    var jit = 1.0 / sc;
    for (var i = 0; i < density; i++) {
      var t = rand() * total, lo = 0, hi = M - 1;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (cum[mid] < t) lo = mid + 1; else hi = mid; }
      out.push([xs[lo] + (rand() - 0.5) * jit, ys[lo] + (rand() - 0.5) * jit, ds[lo]]);
    }
    return out;
  }

  /* ---------- figure 1: dotwork lotus mandala (linework) ----- */

  // Concentric ring lines + rows of lotus-petal outlines — Scotty's
  // ornamental signature — all as clean evenly-dotted strokes.
  function mandalaStrokes() {
    var s = [], i, L, STR = 0.86;
    var rings = [0.15, 0.27, 0.40, 0.53, 0.66, 0.80, 0.95];
    for (i = 0; i < rings.length; i++) s.push(circS(0, 0, rings[i], 0.80));
    s.push(circS(0, 0, 0.985, 0.74));                 // outer border
    var bands = [
      { rIn: 0.80, rOut: 0.95, n: 24 },
      { rIn: 0.66, rOut: 0.80, n: 20 },
      { rIn: 0.53, rOut: 0.665, n: 16 },
      { rIn: 0.40, rOut: 0.525, n: 14 },
      { rIn: 0.27, rOut: 0.395, n: 12 },
      { rIn: 0.15, rOut: 0.265, n: 10 }
    ];
    for (L = 0; L < bands.length; L++) {
      var bd = bands[L], half = Math.PI / bd.n;
      for (i = 0; i < bd.n; i++) {
        var a = (i / bd.n) * TAU - Math.PI / 2;
        var blx = Math.cos(a - half) * bd.rIn, bly = Math.sin(a - half) * bd.rIn;
        var brx = Math.cos(a + half) * bd.rIn, bry = Math.sin(a + half) * bd.rIn;
        var tx = Math.cos(a) * bd.rOut, ty = Math.sin(a) * bd.rOut;
        var mid = (bd.rIn + bd.rOut) * 0.5;
        var clx = Math.cos(a - half * 0.5) * mid * 1.06, cly = Math.sin(a - half * 0.5) * mid * 1.06;
        var crx = Math.cos(a + half * 0.5) * mid * 1.06, cry = Math.sin(a + half * 0.5) * mid * 1.06;
        s.push(quadS(blx, bly, clx, cly, tx, ty, STR));
        s.push(quadS(tx, ty, crx, cry, brx, bry, STR));
      }
    }
    s.push(circS(0, 0, 0.075, 0.92));                 // centre eye
    s.push(circS(0, 0, 0.030, 0.96));
    return s;
  }

  /* ---------- figure 3: sacred geometry (linework) ----------- */

  function geometryStrokes() {
    var s = [], q, r, STR = 0.86;
    var d = 0.235;
    for (q = -2; q <= 2; q++) {
      for (r = -2; r <= 2; r++) {
        var x = d * (q + r * 0.5), y = d * (r * Math.sqrt(3) / 2);
        if (Math.sqrt(x * x + y * y) <= 2.05 * d) s.push(circS(x, y, d, STR));
      }
    }
    for (var tri = 0; tri < 2; tri++) {
      var rot = tri * Math.PI / 3, R = 0.64, v = [];
      for (var k = 0; k < 3; k++) { var av = rot + k * (TAU / 3) - Math.PI / 2; v.push([Math.cos(av) * R, Math.sin(av) * R]); }
      s.push(segS(v[0][0], v[0][1], v[1][0], v[1][1], STR));
      s.push(segS(v[1][0], v[1][1], v[2][0], v[2][1], STR));
      s.push(segS(v[2][0], v[2][1], v[0][0], v[0][1], STR));
    }
    var Rh = 0.93;
    for (var sx = 0; sx < 6; sx++) {
      var a0 = (sx / 6) * TAU - Math.PI / 2, a1 = ((sx + 1) / 6) * TAU - Math.PI / 2;
      var x0 = Math.cos(a0) * Rh, y0 = Math.sin(a0) * Rh, x1 = Math.cos(a1) * Rh, y1 = Math.sin(a1) * Rh;
      s.push(segS(x0, y0, x1, y1, STR));
      s.push(segS(x0, y0, Math.cos(a0), Math.sin(a0), 0.8));
    }
    return s;
  }

  /* ---------- figure 4: geometric owl (linework) ------------- */

  function owlStrokes() {
    var s = [], STR = 0.86;
    // crown — sacred geometry over the brow
    polyS(s, 0, -0.593, 0.256, 6, Math.PI / 2, STR);
    polyS(s, 0, -0.593, 0.160, 6, Math.PI / 2, STR);
    polyS(s, 0, -0.593, 0.256, 3, -Math.PI / 2, STR);
    polyS(s, 0, -0.593, 0.256, 3, Math.PI / 2, STR);
    // brow / horns
    s.push(segS(0, -0.304, -0.417, -0.304, STR)); s.push(segS(-0.417, -0.304, -0.545, -0.112, STR));
    s.push(segS(0, -0.304, 0.417, -0.304, STR));  s.push(segS(0.417, -0.304, 0.545, -0.112, STR));
    // eyes — iris + pupil ring
    s.push(ellipseS(-0.256, -0.112, 0.160, 0.096, STR));
    s.push(ellipseS(0.256, -0.112, 0.160, 0.096, STR));
    s.push(circS(-0.256, -0.112, 0.052, 0.95));
    s.push(circS(0.256, -0.112, 0.052, 0.95));
    // beak
    s.push(segS(-0.096, -0.048, 0.096, -0.048, STR));
    s.push(segS(0.096, -0.048, 0, 0.208, STR));
    s.push(segS(0, 0.208, -0.096, -0.048, STR));
    s.push(segS(0, -0.048, 0, 0.150, STR));
    // wing sweeps
    s.push(segS(-0.40, -0.112, -0.30, 0.34, STR));
    s.push(segS(0.40, -0.112, 0.30, 0.34, STR));
    // chest hexagram + framing chevron
    polyS(s, 0, 0.465, 0.192, 6, Math.PI / 2, STR);
    polyS(s, 0, 0.465, 0.096, 6, Math.PI / 2, STR);
    polyS(s, 0, 0.465, 0.192, 3, -Math.PI / 2, STR);
    polyS(s, 0, 0.465, 0.192, 3, Math.PI / 2, STR);
    s.push(segS(-0.320, 0.208, 0, 0.849, STR));
    s.push(segS(0, 0.849, 0.320, 0.208, STR));
    return s;
  }

  /* ---------- figure 0: the brand, solid in dots ------------- */

  // "SCOTTY MASSA / TATTOOS" — drawn as solid filled glyphs; rasterCloud
  // packs the dots dense across them so the logo reads as solid ink, then
  // breaks apart into the artwork. Each line auto-fits the disc.
  function drawText(c) {
    c.fillStyle = '#000';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    var maxW = 1.78;
    function line(txt, y, basePx) {
      var font = '700 PXpx "Cinzel", Georgia, "Times New Roman", serif';
      c.font = font.replace('PX', basePx);
      var w = c.measureText(txt).width || 1;
      var px = w > maxW ? basePx * maxW / w : basePx;
      c.font = font.replace('PX', px);
      c.fillText(txt, 0, y);
    }
    line('SCOTTY', -0.56, 0.46);
    line('MASSA', -0.08, 0.46);
    c.fillRect(-0.40, 0.20, 0.80, 0.016);
    line('TATTOOS', 0.50, 0.26);
  }

  /* ---------- engine ----------------------------------------- */

  function init(canvas) {
    if (canvas.dataset.morphBound) return;
    canvas.dataset.morphBound = '1';

    var N       = Math.max(400, Math.floor(num(canvas, 'count', 11000)));
    var dotMax  = num(canvas, 'dot', 2.6);
    var dotMin  = Math.max(0.6, dotMax * 0.58);
    var weight  = Math.max(0.55, num(canvas, 'weight', 1.12));
    var flow    = Math.max(0, num(canvas, 'flow', 0.30));
    var breathA = Math.max(0, num(canvas, 'breathe', 0.010));
    var fitK    = clamp(num(canvas, 'fit', 0.465), 0.34, 0.50);
    var HOLD    = Math.max(0, num(canvas, 'hold', 3200));
    var BLEND   = Math.max(200, num(canvas, 'blend', 2600));
    var accentF = clamp(num(canvas, 'accent', 0.012), 0, 0.18);
    var speed   = Math.max(0, num(canvas, 'speed', 1));
    var shape   = attr(canvas, 'shape', 'round');
    var roundDots = shape !== 'square';
    var seed    = attr(canvas, 'seed', 'scotty-massa');
    var animate = attr(canvas, 'animate', 'true') !== 'false';
    var skin    = canvas.getAttribute('data-morph-skin');
    var lockRaw = canvas.getAttribute('data-morph-fig');
    var lockFig = lockRaw == null ? -1 : (parseInt(lockRaw, 10) || 0);
    var SEG     = HOLD + BLEND;
    var MANDALA = 1; // default figure for the static frame

    var rand = mulberry32(xmur3(seed)());

    // text is tonal (rasterised, packs solid); mandala/geometry/owl are clean
    // linework — dots sampled evenly along their stroke paths. The radially
    // symmetric figures (mandala, geometry) slowly spin so the piece feels
    // alive and continuously swirling, like the original sacred-geometry hero.
    var clouds = [ finalize(rasterCloud(drawText, N, rand), N, rand),
                   finalize(strokeCloud(mandalaStrokes(), N, rand), N, rand),
                   finalize(strokeCloud(geometryStrokes(), N, rand), N, rand),
                   finalize(strokeCloud(owlStrokes(), N, rand), N, rand) ];
    var F = clouds.length;
    var SPIN = [false, true, true, false]; // text, mandala, geometry, owl

    // The text figure wants the brand font; if it loads late, rebuild it.
    if (document.fonts && document.fonts.ready && document.fonts.status !== 'loaded') {
      document.fonts.ready.then(function () {
        var rrand = mulberry32(xmur3(seed + '-text')());
        clouds[0] = finalize(rasterCloud(drawText, N, rrand), N, rrand);
      });
    }

    // Stable per-dot styling — seeded so every load is identical.
    var accent = new Uint8Array(N);
    var dotJitter = new Float32Array(N);
    var phaseA = new Float32Array(N);
    var phaseB = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      accent[i] = rand() < accentF ? 1 : 0;
      dotJitter[i] = 0.9 + rand() * 0.2;
      phaseA[i] = rand() * TAU;
      phaseB[i] = rand() * TAU;
    }

    var ctx = canvas.getContext('2d', { alpha: true });
    var pos = new Float32Array(N * 2);
    var pstr = new Float32Array(N);
    var size = fit();
    var visible = true;
    var start = performance.now();
    var pausedAt = 0;

    function fit() {
      var rect = canvas.getBoundingClientRect();
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var w = Math.max(1, Math.floor(rect.width));
      var h = Math.max(1, Math.floor(rect.height));
      var bw = Math.floor(w * dpr), bh = Math.floor(h * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw; canvas.height = bh;
      }
      return { w: w, h: h, dpr: dpr };
    }

    function draw(now) {
      var w = size.w, h = size.h, dpr = size.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      var cx = w / 2, cy = h / 2;
      var discR = Math.min(w, h) * 0.5;
      var Rfit = Math.min(w, h) * fitK;

      if (skin) {
        ctx.fillStyle = skin;
        ctx.beginPath(); ctx.arc(cx, cy, discR, 0, TAU); ctx.fill();
        var skinShade = ctx.createRadialGradient(cx, cy, discR * 0.08, cx, cy, discR);
        skinShade.addColorStop(0, 'rgba(255,255,255,0.08)');
        skinShade.addColorStop(0.72, 'rgba(0,0,0,0.00)');
        skinShade.addColorStop(1, 'rgba(0,0,0,0.16)');
        ctx.fillStyle = skinShade;
        ctx.beginPath(); ctx.arc(cx, cy, discR, 0, TAU); ctx.fill();
      }

      var elapsed = now - start;
      if (elapsed < 0) elapsed = 0;
      var cur, nxt, k;
      if (lockFig >= 0) {
        cur = nxt = lockFig % F; k = 0;
      } else {
        cur = Math.floor(elapsed / SEG) % F;
        nxt = (cur + 1) % F;
        var into = elapsed % SEG;
        k = into <= HOLD ? 0 : smootherstep((into - HOLD) / BLEND);
      }

      var src = clouds[cur], dst = clouds[nxt];
      var sp = src.pos, ssr = src.str, dp = dst.pos, dsr = dst.str;
      var rotM = elapsed * 0.00011 * speed;   // slow continuous swirl
      var sRot = SPIN[cur] ? rotM : 0;
      var dRot = SPIN[nxt] ? rotM : 0;
      var sc = Math.cos(sRot), ss = Math.sin(sRot);
      var dc = Math.cos(dRot), ds = Math.sin(dRot);
      var morphPulse = Math.sin(k * Math.PI); // 0 at rest, 1 mid-morph
      var breathe = 1 + Math.sin(now * 0.00080 * speed) * breathA;
      var shA = now * 0.00100 * speed, shB = now * 0.00086 * speed;
      var flowSign = cur % 2 === 0 ? 1 : -1;

      for (var p = 0; p < N; p++) {
        var ix = p * 2, iy = ix + 1;
        var sx = sp[ix], sy = sp[iy];
        var dx = dp[ix], dy = dp[iy];
        var rsx = sx * sc - sy * ss, rsy = sx * ss + sy * sc;
        var rdx = dx * dc - dy * ds, rdy = dx * ds + dy * dc;
        var nx = rsx + (rdx - rsx) * k;
        var ny = rsy + (rdy - rsy) * k;
        var str = ssr[p] + (dsr[p] - ssr[p]) * k;

        // Coherent rotational curl during transitions only — the dots swirl
        // as a body, then settle cleanly on the still figure.
        if (morphPulse > 0.0001 && flow > 0) {
          var rr = Math.sqrt(nx * nx + ny * ny) + 0.0001;
          var aa = Math.atan2(ny, nx);
          aa += flowSign * flow * morphPulse * (0.12 + rr * 0.55);
          nx = Math.cos(aa) * rr;
          ny = Math.sin(aa) * rr;
        }

        var shimmer = (0.0011 + (1 - str) * 0.0016) * (1 + morphPulse * 0.6);
        nx = (nx + Math.sin(shA + phaseA[p]) * shimmer) * breathe;
        ny = (ny + Math.cos(shB + phaseB[p]) * shimmer) * breathe;
        pos[ix] = cx + nx * Rfit;
        pos[iy] = cy + ny * Rfit;
        pstr[p] = str;
      }

      var span = dotMax - dotMin;
      function drawDot(x, y, sz) {
        var hh = sz * 0.5;
        if (roundDots) { ctx.beginPath(); ctx.arc(x, y, hh, 0, TAU); ctx.fill(); }
        else { ctx.fillRect(x - hh, y - hh, sz, sz); }
      }

      ctx.fillStyle = INK;
      for (var b = 0; b < N; b++) {
        if (accent[b]) continue;
        var stB = inkCurve(pstr[b], weight);
        var sB = (dotMin + stB * span) * dotJitter[b];
        ctx.globalAlpha = 0.78 + stB * 0.22;
        drawDot(pos[b * 2], pos[b * 2 + 1], sB);
      }
      ctx.fillStyle = RED;
      for (var rr2 = 0; rr2 < N; rr2++) {
        if (!accent[rr2]) continue;
        var stR = inkCurve(pstr[rr2], weight);
        var sR = (dotMin + stR * span) * dotJitter[rr2] * 0.8;
        ctx.globalAlpha = 0.6 + stR * 0.2;
        drawDot(pos[rr2 * 2], pos[rr2 * 2 + 1], sR);
      }
      ctx.globalAlpha = 1;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    var raf = null;
    function frame(now) { if (!visible) return; draw(now); raf = requestAnimationFrame(frame); }
    function startLoop() { if (!raf) raf = requestAnimationFrame(frame); }
    function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    var staticMode = !animate || prefersReducedMotion;

    var resizePending = false;
    function refit() {
      if (resizePending) return;
      resizePending = true;
      requestAnimationFrame(function () {
        resizePending = false;
        size = fit();
        draw(staticMode ? 0 : performance.now());
      });
    }
    if ('ResizeObserver' in window) { new ResizeObserver(refit).observe(canvas); }
    else { window.addEventListener('resize', refit); }

    if (staticMode) {
      if (lockFig < 0) lockFig = MANDALA;
      draw(0);
      return;
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            visible = true;
            if (pausedAt) { start += performance.now() - pausedAt; pausedAt = 0; }
            startLoop();
          } else {
            visible = false;
            pausedAt = performance.now();
            stopLoop();
          }
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
