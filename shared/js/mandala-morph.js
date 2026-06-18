/* =============================================================
   mandala-morph.js — a living dotwork engine.
   -------------------------------------------------------------
   Thousands of tiny tattoo-stipple dots that continuously morph
   between three figures in Scotty's dotwork language:

       mandala  →  skull  →  sacred geometry  →  (loop)

   Each figure is a cloud of ~N points. The clouds are sorted by
   angle so dot #i in one figure maps to dot #i in the next — the
   transition swirls and reflows rather than teleporting. Every dot
   eases (smoothstep) from figure to figure with a little shimmer
   and breath; the mandala slowly spins while the bee and bird stay
   upright.

   Zero dependencies. Honours prefers-reduced-motion (draws a single
   static mandala, no loop). Pauses offscreen via IntersectionObserver.
   Resizes with its parent — clouds are stored in a normalised
   [-1, 1] space, so only the on-screen scale changes.

   Pairs with assets/css/components/mandala.css (the bone "skin" disc
   the black ink is multiplied onto).

   Markup:
     <canvas data-mandala-morph></canvas>

   Data attributes (all optional):
     data-morph-count  : target dot count                  (default 4000)
     data-morph-dot    : dot size in CSS px                 (default 2.1)
     data-morph-hold   : ms to hold each figure             (default 3400)
     data-morph-blend  : ms to morph between figures        (default 2200)
     data-morph-accent : fraction of dots inked blood-red   (default 0.035)
     data-morph-speed  : mandala spin / breath multiplier   (default 1)
     data-morph-fig    : lock to one figure, no morph
                         (0 = mandala, 1 = skull, 2 = geometry)
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
  function num(el, key, fallback) { return parseFloat(attr(el, key, fallback)); }
  function smoothstep(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }

  /* ---------- cloud utilities -------------------------------- */

  // Force an array of [x,y] points to exactly N, then sort by angle
  // (then radius) so successive figures correspond limb-to-limb.
  function finalize(arr, N) {
    if (arr.length > N) {
      // Fisher–Yates partial shuffle, then trim.
      for (var i = arr.length - 1; i > 0; i--) {
        var j = (Math.random() * (i + 1)) | 0;
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      arr.length = N;
    } else {
      var L = arr.length || 1;
      while (arr.length < N) {
        var p = arr[(Math.random() * L) | 0] || [0, 0];
        arr.push([p[0] + (Math.random() - 0.5) * 0.02, p[1] + (Math.random() - 0.5) * 0.02]);
      }
    }
    arr.sort(function (a, b) {
      var aa = Math.atan2(a[1], a[0]), ba = Math.atan2(b[1], b[0]);
      if (aa !== ba) return aa - ba;
      return (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]);
    });
    var f = new Float32Array(N * 2);
    for (var k = 0; k < N; k++) { f[k * 2] = arr[k][0]; f[k * 2 + 1] = arr[k][1]; }
    return f;
  }

  // Rasterise a GREYSCALE figure drawn in unit space [-1,1] and scatter
  // `density` dots across it, weighting each pixel by darkness — so shadowed
  // areas pack dense stipple and highlights stay sparse. That density gradient
  // is what makes it read as real dotwork shading rather than a flat fill.
  function rasterCloud(drawUnit, density) {
    var S = 260;
    var sc = S / 2 * 0.95;                 // unit → pixels (small margin)
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
    // Build a cumulative-weight table over the inked pixels.
    var xs = [], ys = [], cum = [], total = 0;
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var o = (y * S + x) * 4;
        var alpha = data[o + 3];
        if (alpha < 24) continue;
        var lum = (data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114) / 255;
        var dark = 1 - lum;                 // 0 = white highlight, 1 = black shadow
        var w = (alpha / 255) * (0.05 + dark * dark * 0.95); // faint everywhere, dense in shadow
        total += w;
        xs.push((x - S / 2) / sc);
        ys.push((y - S / 2) / sc);
        cum.push(total);
      }
    }
    var M = cum.length;
    if (!M) return [];
    var out = [];
    var jit = 1.1 / sc;
    for (var i = 0; i < density; i++) {
      // weighted pick via binary search on the cumulative table
      var t = Math.random() * total, lo = 0, hi = M - 1;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (cum[mid] < t) lo = mid + 1; else hi = mid; }
      out.push([xs[lo] + (Math.random() - 0.5) * jit, ys[lo] + (Math.random() - 0.5) * jit]);
    }
    return out;
  }

  /* ---------- figure 1: pointed-petal dotwork mandala -------- */

  // One sharp-tipped petal, base→tip greyscale gradient (dark base packs the
  // stipple, light tip lets it fade — the dahlia shading in the references).
  function petal(c, a, r0, r1, h, base, tip) {
    var bx = Math.cos(a) * r0, by = Math.sin(a) * r0;
    var tx = Math.cos(a) * r1, ty = Math.sin(a) * r1;
    var mid = (r0 + r1) * 0.5;
    var lx = Math.cos(a - h) * mid, ly = Math.sin(a - h) * mid;
    var rx = Math.cos(a + h) * mid, ry = Math.sin(a + h) * mid;
    var g = c.createLinearGradient(bx, by, tx, ty);
    g.addColorStop(0, base); g.addColorStop(1, tip);
    c.beginPath();
    c.moveTo(bx, by);
    c.quadraticCurveTo(lx, ly, tx, ty);
    c.quadraticCurveTo(rx, ry, bx, by);
    c.closePath();
    c.fillStyle = g; c.fill();
    c.lineWidth = 0.012; c.strokeStyle = '#000'; c.stroke(); // crisp dotted edge
  }

  function drawMandala(c) {
    var layers = [
      { n: 28, r0: 0.60, r1: 1.00, base: '#141414', tip: '#8f8f8f', off: 0.0 },
      { n: 18, r0: 0.36, r1: 0.68, base: '#0e0e0e', tip: '#7d7d7d', off: 0.5 },
      { n: 12, r0: 0.16, r1: 0.42, base: '#0a0a0a', tip: '#6a6a6a', off: 0.0 }
    ];
    for (var L = 0; L < layers.length; L++) {
      var ly = layers[L], h = (Math.PI / ly.n) * 0.92;
      for (var i = 0; i < ly.n; i++) {
        var a = ((i + ly.off) / ly.n) * TAU - Math.PI / 2;
        petal(c, a, ly.r0, ly.r1, h, ly.base, ly.tip);
      }
    }
    // outer lace tips — small sharp points around the rim
    var tipN = 36;
    for (var p = 0; p < tipN; p++) {
      var pa = (p / tipN) * TAU;
      petal(c, pa, 0.90, 1.0, (Math.PI / tipN) * 0.8, '#101010', '#444');
    }
    // pointed center star
    c.fillStyle = '#111';
    var cs = 8;
    c.beginPath();
    for (var s = 0; s <= cs * 2; s++) {
      var ang = (s / (cs * 2)) * TAU - Math.PI / 2;
      var rr = (s % 2 === 0) ? 0.18 : 0.07;
      var px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
      if (s === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath(); c.fill();
    c.lineWidth = 0.012; c.strokeStyle = '#000'; c.stroke();
  }

  /* ---------- figure 2: shaded dotwork skull ----------------- */

  function skullPath(c) {
    c.beginPath();
    c.moveTo(0, 0.82);
    c.bezierCurveTo(-0.15, 0.80, -0.25, 0.66, -0.29, 0.50);
    c.bezierCurveTo(-0.33, 0.40, -0.50, 0.34, -0.52, 0.15);
    c.bezierCurveTo(-0.55, -0.02, -0.52, -0.18, -0.48, -0.30);
    c.bezierCurveTo(-0.44, -0.64, -0.26, -0.92, 0, -0.92);
    c.bezierCurveTo(0.26, -0.92, 0.44, -0.64, 0.48, -0.30);
    c.bezierCurveTo(0.52, -0.18, 0.55, -0.02, 0.52, 0.15);
    c.bezierCurveTo(0.50, 0.34, 0.33, 0.40, 0.29, 0.50);
    c.bezierCurveTo(0.25, 0.66, 0.15, 0.80, 0, 0.82);
    c.closePath();
  }

  function softBlob(c, x, y, r, col) {
    var g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }

  function eyeSocket(c, x, y, rot) {
    c.save();
    c.translate(x, y); c.rotate(rot);
    var g = c.createRadialGradient(0, 0.02, 0.02, 0, 0, 0.22);
    g.addColorStop(0, '#000'); g.addColorStop(0.7, '#0c0c0c'); g.addColorStop(1, '#2c2c2c');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(0, 0, 0.20, 0.17, 0, 0, TAU); c.fill();
    c.restore();
  }

  function drawSkull(c) {
    // base cranium tone
    var g = c.createLinearGradient(0, -0.92, 0, 0.82);
    g.addColorStop(0, '#909090'); g.addColorStop(0.55, '#6e6e6e'); g.addColorStop(1, '#555555');
    c.fillStyle = g; skullPath(c); c.fill();

    // sculpt light + shadow, clipped to the skull
    c.save(); skullPath(c); c.clip();
    softBlob(c, -0.46, -0.10, 0.34, 'rgba(18,18,18,0.85)'); // left temple
    softBlob(c, 0.46, -0.10, 0.34, 'rgba(18,18,18,0.85)');  // right temple
    softBlob(c, -0.40, 0.30, 0.26, 'rgba(18,18,18,0.70)');  // under cheekbone L
    softBlob(c, 0.40, 0.30, 0.26, 'rgba(18,18,18,0.70)');   // under cheekbone R
    softBlob(c, 0, 0.32, 0.22, 'rgba(18,18,18,0.55)');      // mouth hollow
    softBlob(c, 0, -0.52, 0.30, 'rgba(230,230,230,0.55)');  // forehead highlight
    softBlob(c, -0.30, 0.05, 0.15, 'rgba(224,224,224,0.45)'); // cheek L
    softBlob(c, 0.30, 0.05, 0.15, 'rgba(224,224,224,0.45)');  // cheek R
    softBlob(c, 0, 0.62, 0.12, 'rgba(214,214,214,0.40)');   // chin
    c.restore();

    // deep sockets
    eyeSocket(c, -0.24, -0.16, -0.18);
    eyeSocket(c, 0.24, -0.16, 0.18);

    // nasal cavity (inverted heart)
    c.fillStyle = '#060606';
    c.beginPath();
    c.moveTo(0, 0.22);
    c.bezierCurveTo(-0.12, 0.10, -0.11, -0.04, -0.045, 0.03);
    c.bezierCurveTo(-0.02, 0.05, 0, 0.05, 0, 0.03);
    c.bezierCurveTo(0, 0.05, 0.02, 0.05, 0.045, 0.03);
    c.bezierCurveTo(0.11, -0.04, 0.12, 0.10, 0, 0.22);
    c.closePath(); c.fill();

    // teeth — a light band split by dark gaps
    var ty0 = 0.40, ty1 = 0.60, tx = 0.20;
    c.fillStyle = '#bcbcbc';
    c.fillRect(-tx, ty0, tx * 2, ty1 - ty0);
    c.fillStyle = '#0a0a0a';
    c.fillRect(-tx, ty0 - 0.018, tx * 2, 0.02);   // gum line
    var teeth = 7;
    for (var t = 0; t <= teeth; t++) {
      var gx = -tx + (t / teeth) * tx * 2;
      c.fillRect(gx - 0.008, ty0, 0.016, ty1 - ty0);
    }
  }

  /* ---------- figure 3: sacred geometry (flower of life) ----- */

  function geometryArr() {
    var a = [];
    function ringDots(cx, cy, r, n) {
      for (var i = 0; i < n; i++) { var an = (i / n) * TAU; a.push([cx + Math.cos(an) * r, cy + Math.sin(an) * r]); }
    }
    function lineDots(x0, y0, x1, y1, n) {
      for (var i = 0; i <= n; i++) { var u = i / n; a.push([x0 + (x1 - x0) * u, y0 + (y1 - y0) * u]); }
    }
    // flower of life — hex-packed overlapping circles
    var d = 0.235;
    for (var q = -2; q <= 2; q++) {
      for (var r = -2; r <= 2; r++) {
        var x = d * (q + r * 0.5);
        var y = d * (r * Math.sqrt(3) / 2);
        if (Math.sqrt(x * x + y * y) <= 2.05 * d) ringDots(x, y, d, 64);
      }
    }
    // hexagram (two interlocking triangles)
    for (var tri = 0; tri < 2; tri++) {
      var rot = tri * Math.PI / 3, R = 0.64, v = [];
      for (var k = 0; k < 3; k++) { var av = rot + k * (TAU / 3) - Math.PI / 2; v.push([Math.cos(av) * R, Math.sin(av) * R]); }
      lineDots(v[0][0], v[0][1], v[1][0], v[1][1], 34);
      lineDots(v[1][0], v[1][1], v[2][0], v[2][1], 34);
      lineDots(v[2][0], v[2][1], v[0][0], v[0][1], 34);
    }
    // pointed hexagon frame with spikes at each vertex
    var Rh = 0.93;
    for (var s = 0; s < 6; s++) {
      var a0 = (s / 6) * TAU - Math.PI / 2, a1 = ((s + 1) / 6) * TAU - Math.PI / 2;
      var x0 = Math.cos(a0) * Rh, y0 = Math.sin(a0) * Rh, x1 = Math.cos(a1) * Rh, y1 = Math.sin(a1) * Rh;
      lineDots(x0, y0, x1, y1, 30);
      // spike out past the vertex — keeps it "pointy"
      lineDots(x0, y0, Math.cos(a0), Math.sin(a0), 7);
    }
    return a;
  }

  /* ---------- engine ----------------------------------------- */

  function init(canvas) {
    if (canvas.dataset.morphBound) return;
    canvas.dataset.morphBound = '1';

    var N       = Math.max(400, Math.floor(num(canvas, 'count', 4000)));
    var dot     = num(canvas, 'dot', 2.1);
    var HOLD    = Math.max(0, num(canvas, 'hold', 3400));
    var BLEND   = Math.max(200, num(canvas, 'blend', 2200));
    var accentF = num(canvas, 'accent', 0.02);
    var speed   = num(canvas, 'speed', 1);
    var lockRaw = canvas.getAttribute('data-morph-fig');
    var lockFig = lockRaw == null ? -1 : (parseInt(lockRaw, 10) || 0);
    var SEG     = HOLD + BLEND;

    var clouds = [ finalize(rasterCloud(drawMandala, N), N),
                   finalize(rasterCloud(drawSkull, N), N),
                   finalize(geometryArr(), N) ];
    var F = clouds.length;

    // red speckle: a stable random subset
    var accent = new Uint8Array(N);
    for (var i = 0; i < N; i++) accent[i] = Math.random() < accentF ? 1 : 0;

    var ctx = canvas.getContext('2d');
    var pos = new Float32Array(N * 2); // scratch for current frame
    var size = fit();
    var visible = true;
    var start = performance.now();

    function fit() {
      var rect = canvas.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      var w = Math.max(1, Math.floor(rect.width));
      var h = Math.max(1, Math.floor(rect.height));
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr; canvas.height = h * dpr;
      }
      return { w: w, h: h, dpr: dpr };
    }

    function draw(now) {
      var w = size.w, h = size.h, dpr = size.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      var cx = w / 2, cy = h / 2;
      var Rfit = Math.min(w, h) * 0.46;
      var half = dot / 2;

      // rAF timestamps can read slightly before our captured start, which
      // would make Math.floor(elapsed/SEG) negative — clamp to keep cur >= 0.
      var elapsed = now - start;
      if (elapsed < 0) elapsed = 0;
      var cur, nxt, k;
      if (lockFig >= 0) {
        cur = nxt = lockFig % F; k = 0;
      } else {
        cur = Math.floor(elapsed / SEG) % F;
        nxt = (cur + 1) % F;
        var into = elapsed % SEG;
        k = into <= HOLD ? 0 : smoothstep((into - HOLD) / BLEND);
      }

      var src = clouds[cur], dst = clouds[nxt];
      // only the mandala (index 0) spins; others stay upright
      var rotM = elapsed * 0.00007 * speed;
      var sRot = cur === 0 ? rotM : 0;
      var dRot = nxt === 0 ? rotM : 0;
      var sc = Math.cos(sRot), ss = Math.sin(sRot);
      var dc = Math.cos(dRot), ds = Math.sin(dRot);
      var breathe = 1 + Math.sin(now * 0.0009) * 0.018;
      var shA = now * 0.0016, shB = now * 0.0013;

      for (var p = 0; p < N; p++) {
        var ix = p * 2, iy = ix + 1;
        var sx = src[ix], sy = src[iy];
        var dx = dst[ix], dy = dst[iy];
        var rsx = sx * sc - sy * ss, rsy = sx * ss + sy * sc;
        var rdx = dx * dc - dy * ds, rdy = dx * ds + dy * dc;
        var nx = rsx + (rdx - rsx) * k;
        var ny = rsy + (rdy - rsy) * k;
        // shimmer + breath
        nx = (nx + Math.sin(shA + p * 0.7) * 0.004) * breathe;
        ny = (ny + Math.cos(shB + p * 0.9) * 0.004) * breathe;
        pos[ix] = cx + nx * Rfit;
        pos[iy] = cy + ny * Rfit;
      }

      // black ink pass
      ctx.fillStyle = INK;
      for (var b = 0; b < N; b++) {
        if (accent[b]) continue;
        ctx.fillRect(pos[b * 2] - half, pos[b * 2 + 1] - half, dot, dot);
      }
      // blood-red accent pass — slightly finer so it reads as a speckle
      var rdot = dot * 0.85, rhalf = rdot / 2;
      ctx.fillStyle = RED;
      for (var r = 0; r < N; r++) {
        if (!accent[r]) continue;
        ctx.fillRect(pos[r * 2] - rhalf, pos[r * 2 + 1] - rhalf, rdot, rdot);
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    var raf = null;
    function frame(now) { if (!visible) return; draw(now); raf = requestAnimationFrame(frame); }
    function startLoop() { if (!raf) raf = requestAnimationFrame(frame); }
    function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    var resizePending = false;
    window.addEventListener('resize', function () {
      if (resizePending) return;
      resizePending = true;
      requestAnimationFrame(function () { resizePending = false; size = fit(); draw(performance.now()); });
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          visible = e.isIntersecting;
          if (visible && !prefersReducedMotion) startLoop(); else stopLoop();
        });
      }, { threshold: 0.01 }).observe(canvas);
    }

    if (prefersReducedMotion) draw(start); // a still mandala
    else startLoop();
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
