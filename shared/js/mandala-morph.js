/* =============================================================
   mandala-morph.js — a living field of dotwork mandalas.
   -------------------------------------------------------------
   Thousands of tiny tattoo-stipple dots that continuously morph
   between a set of RANDOM geometric mandalas and slowly rotate, so
   the hero reads as an ever-shifting sheet of mandala tattoos.

   Each mandala is generated procedurally (concentric bands of lotus
   petals, pointed petals, diamonds, nested polygons, rings of circles
   and stars, around a random central motif) and rendered as clean
   LINEWORK: dots are placed evenly ALONG the stroke paths (arc-length
   sampled) so the lines read solid and crisp, the way a piece is drawn.

   Clouds are angle-sorted so dot #i corresponds across mandalas — the
   transition swirls and reflows rather than teleporting. Dots ease
   (smootherstep) with a gentle curl, breath and shimmer; the whole field
   rotates continuously.

   Deterministic: a seeded PRNG (data-morph-seed) fixes the mandala set
   and every dot, so it renders identically each load (set the seed to a
   timestamp for a fresh set per visit). Zero dependencies. Honours
   prefers-reduced-motion (one static frame). Pauses offscreen
   (IntersectionObserver) and resumes without a time jump. Resizes with
   its parent (ResizeObserver).

   Markup:
     <canvas data-mandala-morph></canvas>

   Data attributes (all optional):
     data-morph-count   : target dot count                    (default 11000)
     data-morph-dot     : max dot size in CSS px               (default 2.6)
     data-morph-ink     : dot colour (use a light tone on a dark bg)
                                                               (default #0a0a0a)
     data-morph-variants: number of random mandalas in the loop (default 5)
     data-morph-weight  : ink weight / contrast multiplier     (default 1.12)
     data-morph-flow    : transition swirl strength            (default 0.30)
     data-morph-breathe : idle breathing amount                (default 0.010)
     data-morph-shape   : "round" or "square" dots          (default round)
     data-morph-fit     : figure scale inside canvas           (default 0.46)
     data-morph-hold    : ms to hold each mandala              (default 3200)
     data-morph-blend   : ms to morph between mandalas         (default 2600)
     data-morph-accent  : fraction of dots inked blood-red     (default 0.012)
     data-morph-speed   : spin / motion multiplier             (default 1)
     data-morph-seed    : PRNG seed (default "scotty-massa")
     data-morph-animate : "false" → render one static frame   (default true)
     data-morph-fig     : lock to one mandala index, no morph  (default: cycle)
   ============================================================= */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
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

  // Seeded PRNG so the mandala set + dot layout are identical on every load.
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

  // Force [x,y,strength] points to exactly N, angle-sort for correspondence,
  // split into a positions buffer + a strength buffer.
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

  // Distribute ~N dots EVENLY along a set of stroke paths (by arc length) so
  // the lines read solid — not random scatter. Stroke = { len, str, at(u) }.
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

  /* ---------- parametric stroke primitives (unit space) ------ */

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
  function quadS(x0, y0, cx, cy, x1, y1, str) {
    var len = Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy);
    return { len: len, str: str,
             at: function (u) { var iu = 1 - u; return [iu * iu * x0 + 2 * iu * u * cx + u * u * x1,
                                                        iu * iu * y0 + 2 * iu * u * cy + u * u * y1]; } };
  }
  function polyS(s, cx, cy, r, sides, rot, str) {
    var pts = [], i;
    for (i = 0; i <= sides; i++) { var an = rot + i * TAU / sides; pts.push([cx + Math.cos(an) * r, cy + Math.sin(an) * r]); }
    for (i = 0; i < sides; i++) s.push(segS(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], str));
  }

  /* ---------- mandala band elements -------------------------- */

  // rounded lotus petals
  function ringPetals(s, n, rIn, rOut, str) {
    var half = Math.PI / n;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * TAU - Math.PI / 2;
      var blx = Math.cos(a - half) * rIn, bly = Math.sin(a - half) * rIn;
      var brx = Math.cos(a + half) * rIn, bry = Math.sin(a + half) * rIn;
      var tx = Math.cos(a) * rOut, ty = Math.sin(a) * rOut;
      var mid = (rIn + rOut) * 0.5;
      var clx = Math.cos(a - half * 0.5) * mid * 1.06, cly = Math.sin(a - half * 0.5) * mid * 1.06;
      var crx = Math.cos(a + half * 0.5) * mid * 1.06, cry = Math.sin(a + half * 0.5) * mid * 1.06;
      s.push(quadS(blx, bly, clx, cly, tx, ty, str));
      s.push(quadS(tx, ty, crx, cry, brx, bry, str));
    }
  }
  // sharp pointed spikes — narrow base so the points read crisp/angular
  function ringSpikes(s, n, rIn, rOut, str) {
    for (var i = 0; i < n; i++) {
      var a = (i / n) * TAU - Math.PI / 2;
      var aL = ((i - 0.34) / n) * TAU - Math.PI / 2, aR = ((i + 0.34) / n) * TAU - Math.PI / 2;
      var blx = Math.cos(aL) * rIn, bly = Math.sin(aL) * rIn;
      var brx = Math.cos(aR) * rIn, bry = Math.sin(aR) * rIn;
      var tx = Math.cos(a) * rOut, ty = Math.sin(a) * rOut;
      s.push(segS(blx, bly, tx, ty, str)); s.push(segS(tx, ty, brx, bry, str));
      s.push(segS(blx, bly, brx, bry, str));   // close the base for a crisp triangle
    }
  }
  // diamonds / rhombi
  function ringDiamonds(s, n, rIn, rOut, str) {
    var half = Math.PI / n, mid = (rIn + rOut) / 2;
    for (var i = 0; i < n; i++) {
      var a = ((i + 0.5) / n) * TAU - Math.PI / 2;
      var ix = Math.cos(a) * rIn, iy = Math.sin(a) * rIn;
      var ox = Math.cos(a) * rOut, oy = Math.sin(a) * rOut;
      var lx = Math.cos(a - half * 0.55) * mid, ly = Math.sin(a - half * 0.55) * mid;
      var rx = Math.cos(a + half * 0.55) * mid, ry = Math.sin(a + half * 0.55) * mid;
      s.push(segS(ix, iy, lx, ly, str)); s.push(segS(lx, ly, ox, oy, str));
      s.push(segS(ox, oy, rx, ry, str)); s.push(segS(rx, ry, ix, iy, str));
    }
  }
  // a ring of small circles
  function ringCircles(s, n, r, dr, str) {
    for (var i = 0; i < n; i++) { var a = (i / n) * TAU; s.push(circS(Math.cos(a) * r, Math.sin(a) * r, dr, str)); }
  }
  // a ring of little cross-stars
  function ringStars(s, n, rIn, rOut, str) {
    var r = (rIn + rOut) / 2, sz = (rOut - rIn) * 0.5;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * TAU, cx = Math.cos(a) * r, cy = Math.sin(a) * r;
      s.push(segS(cx - sz, cy, cx + sz, cy, str)); s.push(segS(cx, cy - sz, cx, cy + sz, str));
      s.push(segS(cx - sz * 0.7, cy - sz * 0.7, cx + sz * 0.7, cy + sz * 0.7, str));
      s.push(segS(cx - sz * 0.7, cy + sz * 0.7, cx + sz * 0.7, cy - sz * 0.7, str));
    }
  }
  // a ring of sharp triangles, pointing out (or in)
  function ringTriangles(s, n, rIn, rOut, out, str) {
    var half = Math.PI / n;
    for (var i = 0; i < n; i++) {
      var a = ((i + 0.5) / n) * TAU - Math.PI / 2;
      var tip = out ? rOut : rIn, base = out ? rIn : rOut;
      var tx = Math.cos(a) * tip, ty = Math.sin(a) * tip;
      var blx = Math.cos(a - half * 0.92) * base, bly = Math.sin(a - half * 0.92) * base;
      var brx = Math.cos(a + half * 0.92) * base, bry = Math.sin(a + half * 0.92) * base;
      s.push(segS(blx, bly, tx, ty, str)); s.push(segS(tx, ty, brx, bry, str));
      s.push(segS(blx, bly, brx, bry, str));
    }
  }
  // a ring of small squares (rot in radians, relative to the radial axis)
  function ringSquares(s, n, r, sz, rot, str) {
    for (var i = 0; i < n; i++) {
      var a = (i / n) * TAU, cx = Math.cos(a) * r, cy = Math.sin(a) * r;
      var base = a + rot, p = [], k;
      for (k = 0; k < 4; k++) { var ang = base + Math.PI / 4 + k * (Math.PI / 2); p.push([cx + Math.cos(ang) * sz, cy + Math.sin(ang) * sz]); }
      for (k = 0; k < 4; k++) s.push(segS(p[k][0], p[k][1], p[(k + 1) % 4][0], p[(k + 1) % 4][1], str));
    }
  }
  // a zig-zag chevron band between rIn and rOut
  function ringChevrons(s, n, rIn, rOut, str) {
    var prev = null;
    for (var i = 0; i <= n; i++) {
      var a = (i / n) * TAU - Math.PI / 2;
      var rr = (i % 2 === 0) ? rIn : rOut;
      var pt = [Math.cos(a) * rr, Math.sin(a) * rr];
      if (prev) s.push(segS(prev[0], prev[1], pt[0], pt[1], str));
      prev = pt;
    }
  }
  // a sharp star polygon {points} drawn as an outline through alternating radii
  function starPolyS(s, cx, cy, points, rOut, rIn, str) {
    var m = points * 2, prev = null, k;
    for (k = 0; k <= m; k++) {
      var a = (k / m) * TAU - Math.PI / 2, rr = (k % 2 === 0) ? rOut : rIn;
      var pt = [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
      if (prev) s.push(segS(prev[0], prev[1], pt[0], pt[1], str));
      prev = pt;
    }
  }
  // a band densely packed with diamonds (two interleaved rows = a lattice)
  function diamondLattice(s, n, rIn, rOut, str) {
    var mid = (rIn + rOut) / 2;
    ringDiamonds(s, n, rIn, mid + (rOut - rIn) * 0.02, str);
    ringDiamonds(s, n, mid - (rOut - rIn) * 0.02, rOut, str);
    // half-step offset row of small diamonds straddling the divide
    var half = Math.PI / n;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * TAU - Math.PI / 2;
      var ix = Math.cos(a) * (mid - (rOut - rIn) * 0.18), iy = Math.sin(a) * (mid - (rOut - rIn) * 0.18);
      var ox = Math.cos(a) * (mid + (rOut - rIn) * 0.18), oy = Math.sin(a) * (mid + (rOut - rIn) * 0.18);
      var lx = Math.cos(a - half * 0.4) * mid, ly = Math.sin(a - half * 0.4) * mid;
      var rx = Math.cos(a + half * 0.4) * mid, ry = Math.sin(a + half * 0.4) * mid;
      s.push(segS(ix, iy, lx, ly, str)); s.push(segS(lx, ly, ox, oy, str));
      s.push(segS(ox, oy, rx, ry, str)); s.push(segS(rx, ry, ix, iy, str));
    }
  }
  function triangleS(s, R, up, str) {
    var rot = up ? -Math.PI / 2 : Math.PI / 2, v = [], k;
    for (k = 0; k < 3; k++) { var a = rot + k * (TAU / 3); v.push([Math.cos(a) * R, Math.sin(a) * R]); }
    s.push(segS(v[0][0], v[0][1], v[1][0], v[1][1], str));
    s.push(segS(v[1][0], v[1][1], v[2][0], v[2][1], str));
    s.push(segS(v[2][0], v[2][1], v[0][0], v[0][1], str));
  }
  function centerMotif(s, R, rand) {
    var STR = 0.9, t = rand(), Rm = R * 0.92;
    if (R < 0.05) { s.push(circS(0, 0, Math.max(0.02, R), STR)); return; }
    if (t < 0.24) { triangleS(s, Rm, true, STR); triangleS(s, Rm, false, STR); }                  // hexagram
    else if (t < 0.44) { polyS(s, 0, 0, Rm, 4, 0, STR); polyS(s, 0, 0, Rm, 4, Math.PI / 4, STR); } // 8-point star
    else if (t < 0.60) { triangleS(s, Rm, true, STR); triangleS(s, Rm * 0.72, false, STR); triangleS(s, Rm * 0.46, true, STR); } // nested tris (yantra)
    else if (t < 0.76) { starPolyS(s, 0, 0, 5, Rm, Rm * 0.42, STR); }                              // pentagram
    else if (t < 0.90) { ringDiamonds(s, 4 + (rand() * 3 | 0), R * 0.18, Rm, STR); }               // diamond burst
    else { ringPetals(s, 6 + (rand() * 4 | 0), R * 0.28, Rm, STR); }                               // flower
    s.push(circS(0, 0, R * 0.4, 0.82));
    s.push(circS(0, 0, R * 0.14, 0.95));
  }

  // One random geometric mandala → a strokes array. Concentric bands, each a
  // randomly chosen element, around a random centre. Deterministic per `rand`.
  function randomMandala(rand) {
    var s = [], STR = 0.85;
    function pick(arr) { return arr[(rand() * arr.length) | 0]; }
    s.push(circS(0, 0, 0.985, 0.7));
    if (rand() < 0.6) s.push(circS(0, 0, 0.955, 0.76));
    var r = pick([0.90, 0.92, 0.94]);
    var bands = 4 + (rand() * 3 | 0);                 // 4–6 bands
    for (var b = 0; b < bands; b++) {
      var rIn = r - (0.09 + rand() * 0.07);
      if (rIn < 0.13) rIn = 0.13;
      var n = pick([8, 10, 12, 12, 16, 18, 24]);
      var mid = (rIn + r) / 2, t = rand();
      // weighted toward angular shapes (diamonds, triangles, spikes, stars);
      // rounded petals are an occasional softer accent.
      if (t < 0.20) ringDiamonds(s, n, rIn, r, STR);
      else if (t < 0.32) diamondLattice(s, n, rIn, r, STR);          // dense diamonds
      else if (t < 0.45) ringTriangles(s, n, rIn, r, rand() < 0.6, STR);
      else if (t < 0.57) ringSpikes(s, n, rIn, r, STR);
      else if (t < 0.67) { var rot = rand() * TAU; polyS(s, 0, 0, r, n, rot, STR); polyS(s, 0, 0, rIn, n, rot + Math.PI / n, STR); }
      else if (t < 0.76) ringSquares(s, n, mid, (r - rIn) * 0.5, rand() * Math.PI, STR);
      else if (t < 0.84) ringChevrons(s, n, rIn, r, STR);
      else if (t < 0.90) starPolyS(s, 0, 0, n, r, rIn, STR);         // big sharp star ring
      else if (t < 0.95) ringCircles(s, n, mid, (r - rIn) * 0.45, STR);
      else ringPetals(s, n, rIn, r, STR);
      s.push(circS(0, 0, rIn, 0.72));                 // separator ring
      r = rIn - rand() * 0.015;
      if (r < 0.15) break;
    }
    centerMotif(s, r, rand);
    return s;
  }

  /* ---------- engine ----------------------------------------- */

  function init(canvas) {
    if (canvas.dataset.morphBound) return;
    canvas.dataset.morphBound = '1';

    var N       = Math.max(400, Math.floor(num(canvas, 'count', 11000)));
    var dotMax  = num(canvas, 'dot', 2.6);
    var dotMin  = Math.max(0.6, dotMax * 0.58);
    var INK     = attr(canvas, 'ink', '#0a0a0a');
    var NV      = Math.max(2, Math.floor(num(canvas, 'variants', 5)));
    var weight  = Math.max(0.55, num(canvas, 'weight', 1.12));
    var flow    = Math.max(0, num(canvas, 'flow', 0.40));
    var breathA = Math.max(0, num(canvas, 'breathe', 0.010));
    var fitK    = clamp(num(canvas, 'fit', 0.46), 0.34, 0.50);
    var HOLD    = Math.max(0, num(canvas, 'hold', 3200));
    var BLEND   = Math.max(200, num(canvas, 'blend', 2600));
    var accentF = clamp(num(canvas, 'accent', 0.012), 0, 0.18);
    var speed   = Math.max(0, num(canvas, 'speed', 1));
    var shape   = attr(canvas, 'shape', 'round');
    var roundDots = shape !== 'square';
    var seed    = attr(canvas, 'seed', 'scotty-massa');
    var animate = attr(canvas, 'animate', 'true') !== 'false';
    var lockRaw = canvas.getAttribute('data-morph-fig');
    var lockFig = lockRaw == null ? -1 : (parseInt(lockRaw, 10) || 0);
    var SEG     = HOLD + BLEND;

    var rand = mulberry32(xmur3(seed)());

    // A set of random geometric mandalas; the dots morph between them and the
    // whole field slowly rotates.
    var clouds = [];
    for (var v = 0; v < NV; v++) clouds.push(finalize(strokeCloud(randomMandala(rand), N, rand), N, rand));
    var F = clouds.length;

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
      var Rfit = Math.min(w, h) * fitK;

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
      // the whole field rotates continuously
      var rot = elapsed * 0.00011 * speed;
      var rc = Math.cos(rot), rs = Math.sin(rot);
      var morphPulse = Math.sin(k * Math.PI);
      var breathe = 1 + Math.sin(now * 0.00080 * speed) * breathA;
      var shA = now * 0.00100 * speed, shB = now * 0.00086 * speed;
      var flowSign = cur % 2 === 0 ? 1 : -1;

      for (var p = 0; p < N; p++) {
        var ix = p * 2, iy = ix + 1;
        var bx = sp[ix] + (dp[ix] - sp[ix]) * k;   // interpolate first
        var by = sp[iy] + (dp[iy] - sp[iy]) * k;
        var nx = bx * rc - by * rs;                // then rotate the field
        var ny = bx * rs + by * rc;
        var str = ssr[p] + (dsr[p] - ssr[p]) * k;

        if (morphPulse > 0.0001 && flow > 0) {
          var rr = Math.sqrt(nx * nx + ny * ny) + 0.0001;
          var aa = Math.atan2(ny, nx);
          aa += flowSign * flow * morphPulse * (0.14 + rr * 0.62);   // swirl
          rr *= 1 + morphPulse * (0.06 + Math.sin(phaseB[p] + rr * 6.0) * 0.03); // breathe out + reform
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
      if (lockFig < 0) lockFig = 0;
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
