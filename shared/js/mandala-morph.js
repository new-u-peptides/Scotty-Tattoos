/* =============================================================
   mandala-morph.js — a living dotwork engine.
   -------------------------------------------------------------
   Thousands of tiny tattoo-stipple dots that continuously morph
   between four figures in Scotty's dotwork language:

       text  →  mandala  →  skull  →  sacred geometry  →  (loop)

   The dots first spell the brand ("SCOTTY MASSA / TATTOOS"), then bloom
   into the real upper-back mandala, a skull, and a flower-of-life. Each
   figure is a cloud of ~N points; clouds are sorted by angle so dot #i
   maps across figures — the transition swirls and reflows rather than
   teleporting. Every dot eases (smoothstep) between figures with a
   little shimmer and breath, and carries a "strength" (source darkness)
   that drives its size, so shadows read dense and bold, highlights fine.
   Only the mandala slowly spins; text, skull and geometry stay upright.

   Deterministic: a seeded PRNG (data-morph-seed) places every dot, so
   the artwork renders identically on every load.

   Zero dependencies. Honours prefers-reduced-motion (draws a single
   static frame, no loop). Pauses offscreen via IntersectionObserver.
   Resizes with its parent — clouds live in a normalised [-1, 1] space,
   so only the on-screen scale changes.

   The real mandala figure comes from window.MandalaFigures (load
   shared/js/mandala-figures.js first); without it, a procedural mandala
   is used instead. Pairs with assets/css/components/mandala.css for the
   bone "skin" disc — or pass data-morph-skin to draw skin in-canvas and
   run fully standalone.

   Markup:
     <canvas data-mandala-morph></canvas>

   Data attributes (all optional):
     data-morph-count   : target dot count                 (default 4000)
     data-morph-dot     : MAX dot size in CSS px; size scales down toward
                          this in highlights (default 2.6)
     data-morph-hold    : ms to hold each figure            (default 3400)
     data-morph-blend   : ms to morph between figures        (default 2200)
     data-morph-accent  : fraction of dots inked blood-red   (default 0.02)
     data-morph-speed   : mandala spin / breath multiplier   (default 1)
     data-morph-seed    : PRNG seed for a stable layout (default "scotty-massa")
     data-morph-animate : "false" → render one static frame  (default true)
     data-morph-skin    : CSS colour; fill an in-canvas skin disc so the
                          piece reads without the paired CSS (default: none)
     data-morph-fig     : lock to one figure, no morph
                          (0 = text, 1 = mandala, 2 = skull, 3 = geometry)
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

  function decodeB64(b64) {
    try {
      if (typeof atob === 'function') {
        var bin = atob(b64), u = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return u;
      }
    } catch (e) {}
    return null;
  }

  // Ray-cast point-in-polygon (used to mask the real tattoo region).
  function pointInPolygon(x, y, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  /* ---------- cloud utilities -------------------------------- */

  // Force an array of [x,y,strength] points to exactly N, sort by angle
  // (then radius) so successive figures correspond limb-to-limb, and split
  // into a positions buffer + a strength buffer.
  function finalize(arr, N, rand) {
    if (arr.length > N) {
      // Fisher–Yates partial shuffle, then trim.
      for (var i = arr.length - 1; i > 0; i--) {
        var j = (rand() * (i + 1)) | 0;
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      arr.length = N;
    } else {
      var L = arr.length || 1;
      while (arr.length < N) {
        var p = arr[(rand() * L) | 0] || [0, 0, 0.8];
        arr.push([p[0] + (rand() - 0.5) * 0.02, p[1] + (rand() - 0.5) * 0.02, p[2]]);
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

  // Rasterise a GREYSCALE figure drawn in unit space [-1,1] and scatter
  // `density` dots across it, weighting each pixel by darkness — so shadowed
  // areas pack dense stipple and highlights stay sparse. That density gradient
  // is what makes it read as real dotwork shading rather than a flat fill.
  function rasterCloud(drawUnit, density, rand) {
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
    var xs = [], ys = [], ds = [], cum = [], total = 0;
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
        ds.push(dark);                      // strength → drives dot size
        cum.push(total);
      }
    }
    var M = cum.length;
    if (!M) return [];
    var out = [];
    var jit = 1.1 / sc;
    for (var i = 0; i < density; i++) {
      // weighted pick via binary search on the cumulative table
      var t = rand() * total, lo = 0, hi = M - 1;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (cum[mid] < t) lo = mid + 1; else hi = mid; }
      out.push([xs[lo] + (rand() - 0.5) * jit, ys[lo] + (rand() - 0.5) * jit, ds[lo]]);
    }
    return out;
  }

  // Sample the real tattoo from a baked luminance grid (window.MandalaFigures).
  // Same weighting as rasterCloud, but reads cells from the grid and masks to
  // the tattoo region polygon. Returns [x,y,strength] in unit space.
  function gridCloud(fig, density, rand) {
    var lum = decodeB64(fig.lum);
    if (!lum) return null;
    var cols = fig.cols, rows = fig.rows, region = fig.region, CELL = 4;
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (var r0 = 0; r0 < region.length; r0++) {
      var rx = region[r0][0], ry = region[r0][1];
      if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
    }
    var ccx = (minX + maxX) / 2, ccy = (minY + maxY) / 2;
    var half = Math.max(maxX - minX, maxY - minY) / 2 || 1;
    var thr = 0.18;
    // One dot per inked cell (a halftone grid) — keeps the negative-space
    // petal lines crisp instead of blobbing the dark zones. finalize() then
    // trims/pads to exactly N.
    var out = [], jit = (CELL / half) * 0.95 * 0.6;
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var sx = col * CELL + CELL / 2, sy = row * CELL + CELL / 2;
        if (!pointInPolygon(sx, sy, region)) continue;
        var dark = (255 - lum[row * cols + col]) / 255;
        if (dark <= thr) continue;
        var s = Math.pow((dark - thr) / (1 - thr), 0.75);
        out.push([
          ((sx - ccx) / half) * 0.95 + (rand() - 0.5) * jit,
          ((sy - ccy) / half) * 0.95 + (rand() - 0.5) * jit,
          s
        ]);
      }
    }
    return out.length ? out : null;
  }

  /* ---------- figure 1: Scotty's dotwork back-mandala -------- */

  // Pointed lotus petal. The base→tip gradient drives stipple density:
  // a light, sparse base tucks under the ring inside it while the dark,
  // dense tip reads crisp — the feathered, layered depth of the real
  // back-piece (assets/images/tattoos/back-mandala.jpg).
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
    c.lineWidth = 0.009; c.strokeStyle = '#070707'; c.stroke();
  }

  function drawMandala(c) {
    var i, a, L;

    // Concentric rows of BROAD, overlapping lotus petals — drawn outer-row
    // first so each inner row layers on top like the scales of the real
    // back-piece. Rows are offset half a step so petals nest in the gaps
    // below; the light base → dark outer band gives each scale its depth.
    // Many SHORT, broad scallops (hw≈1 → petals touch within a row) read as
    // tight concentric scalloped bands rather than long radial spikes — the
    // overlapping-scale structure of the real back-piece.
    var rings = [
      { n: 32, r0: 0.72, r1: 0.90, hw: 1.00, base: '#8f8f8f', tip: '#121212', off: 0.0 },
      { n: 28, r0: 0.58, r1: 0.75, hw: 1.00, base: '#959595', tip: '#131313', off: 0.5 },
      { n: 22, r0: 0.45, r1: 0.61, hw: 1.00, base: '#9b9b9b', tip: '#141414', off: 0.0 },
      { n: 18, r0: 0.33, r1: 0.48, hw: 1.00, base: '#a1a1a1', tip: '#151515', off: 0.5 },
      { n: 14, r0: 0.21, r1: 0.35, hw: 1.00, base: '#a8a8a8', tip: '#161616', off: 0.0 },
      { n: 10, r0: 0.10, r1: 0.23, hw: 1.00, base: '#b0b0b0', tip: '#171717', off: 0.5 }
    ];
    for (L = 0; L < rings.length; L++) {
      var ring = rings[L], h = (Math.PI / ring.n) * ring.hw;
      for (i = 0; i < ring.n; i++) {
        a = ((i + ring.off) / ring.n) * TAU - Math.PI / 2;
        petal(c, a, ring.r0, ring.r1, h, ring.base, ring.tip);
      }
    }

    // Central lotus burst — fine radiating slivers + a dark seed.
    var burst = 12;
    for (i = 0; i < burst; i++) {
      a = (i / burst) * TAU - Math.PI / 2;
      petal(c, a, 0.028, 0.115, (Math.PI / burst) * 0.85, '#8a8a8a', '#181818');
    }
    c.fillStyle = '#151515';
    c.beginPath(); c.arc(0, 0, 0.032, 0, TAU); c.fill();

    // Outer rim — delicate alternating pointed teeth, the lace edge.
    var rim = 48;
    for (i = 0; i < rim; i++) {
      a = (i / rim) * TAU - Math.PI / 2;
      var tall = (i % 2 === 0);
      petal(c, a,
        tall ? 0.915 : 0.935, tall ? 0.992 : 0.958,
        (Math.PI / rim) * 0.70,
        '#3f3f3f', tall ? '#141414' : '#2a2a2a');
    }
  }

  /* ---------- figure 2: shaded dotwork skull ----------------- */

  // Front-facing skull: domed cranium, pinched temples, wide zygomatic
  // cheekbones, tapering through the jaw to the chin.
  function skullPath(c) {
    c.beginPath();
    c.moveTo(0, 0.86);                                        // chin
    c.bezierCurveTo(-0.18, 0.85, -0.28, 0.72, -0.33, 0.56);   // jaw L
    c.bezierCurveTo(-0.39, 0.46, -0.57, 0.42, -0.61, 0.18);   // zygomatic L (widest)
    c.bezierCurveTo(-0.65, 0.00, -0.60, -0.18, -0.55, -0.31); // temple L
    c.bezierCurveTo(-0.50, -0.63, -0.29, -0.88, 0, -0.88);    // dome L → top
    c.bezierCurveTo(0.29, -0.88, 0.50, -0.63, 0.55, -0.31);   // top → dome R
    c.bezierCurveTo(0.60, -0.18, 0.65, 0.00, 0.61, 0.18);     // temple R
    c.bezierCurveTo(0.57, 0.42, 0.39, 0.46, 0.33, 0.56);      // zygomatic R
    c.bezierCurveTo(0.28, 0.72, 0.18, 0.85, 0, 0.86);         // jaw R
    c.closePath();
  }

  function softBlob(c, x, y, r, col) {
    var g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }

  // Deep, almond eye socket: a soft dark halo that bleeds into the bone
  // plus a near-black cavity — no hard ring, so the stipple reads natural.
  function eyeSocket(c, x, y, rot) {
    c.save();
    c.translate(x, y); c.rotate(rot);
    var halo = c.createRadialGradient(0, 0, 0.04, 0, 0, 0.32);
    halo.addColorStop(0, 'rgba(8,8,8,0.95)');
    halo.addColorStop(0.55, 'rgba(8,8,8,0.65)');
    halo.addColorStop(1, 'rgba(8,8,8,0)');
    c.fillStyle = halo;
    c.beginPath(); c.arc(0, 0, 0.32, 0, TAU); c.fill();
    var g = c.createRadialGradient(0.02, 0.05, 0.02, 0, 0, 0.21);
    g.addColorStop(0, '#000'); g.addColorStop(0.75, '#070707'); g.addColorStop(1, '#1d1d1d');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(0, 0, 0.205, 0.165, 0, 0, TAU); c.fill();
    c.restore();
  }

  function drawSkull(c) {
    // Bone reads LIGHT (sparse dots); only the recesses go dark (dense
    // dots). That high-key bone vs deep-shadow contrast is what makes the
    // stipple read as a carved skull rather than a flat dark mass.
    c.save();
    c.scale(1.12, 1.12);              // fill a touch more of the disc

    c.save();
    skullPath(c);
    c.fillStyle = '#ececec';          // light bone base
    c.fill();
    c.clip();                          // all shading stays on the bone

    // perimeter vignette → carves the domed silhouette out of the bone
    var vg = c.createRadialGradient(0, -0.05, 0.34, 0, -0.05, 0.82);
    vg.addColorStop(0, 'rgba(20,20,20,0)');
    vg.addColorStop(0.68, 'rgba(20,20,20,0.06)');
    vg.addColorStop(1, 'rgba(16,16,16,0.55)');
    c.fillStyle = vg;
    c.fillRect(-1.2, -1.2, 2.4, 2.4);

    // inner-edge occlusion so the silhouette reads as a crisp rim of stipple
    c.lineWidth = 0.10; c.strokeStyle = 'rgba(14,14,14,0.55)';
    skullPath(c); c.stroke();

    // form shadows — soft, mid-dark, carving the cranial planes
    softBlob(c, -0.52, -0.15, 0.30, 'rgba(18,18,18,0.55)');  // temporal hollow L
    softBlob(c,  0.52, -0.15, 0.30, 'rgba(18,18,18,0.55)');  // temporal hollow R
    softBlob(c, -0.31, -0.30, 0.20, 'rgba(18,18,18,0.42)');  // upper temple L
    softBlob(c,  0.31, -0.30, 0.20, 'rgba(18,18,18,0.42)');  // upper temple R
    softBlob(c, -0.20, -0.01, 0.15, 'rgba(10,10,10,0.55)');  // brow underside L
    softBlob(c,  0.20, -0.01, 0.15, 'rgba(10,10,10,0.55)');  // brow underside R
    softBlob(c, -0.40,  0.12, 0.18, 'rgba(18,18,18,0.50)');  // cheek hollow L
    softBlob(c,  0.40,  0.12, 0.18, 'rgba(18,18,18,0.50)');  // cheek hollow R
    softBlob(c, -0.27,  0.41, 0.20, 'rgba(18,18,18,0.55)');  // under-cheekbone L
    softBlob(c,  0.27,  0.41, 0.20, 'rgba(18,18,18,0.55)');  // under-cheekbone R
    softBlob(c,  0.00,  0.30, 0.13, 'rgba(14,14,14,0.50)');  // nasal base
    softBlob(c,  0.00,  0.71, 0.22, 'rgba(18,18,18,0.50)');  // jaw shadow
    c.restore();

    // deep eye sockets
    eyeSocket(c, -0.27, -0.05, -0.16);
    eyeSocket(c,  0.27, -0.05,  0.16);

    // nasal cavity (inverted heart)
    c.fillStyle = '#080808';
    c.beginPath();
    c.moveTo(0, 0.30);
    c.bezierCurveTo(-0.14, 0.15, -0.12, 0.00, -0.05, 0.07);
    c.bezierCurveTo(-0.02, 0.09, 0, 0.09, 0, 0.06);
    c.bezierCurveTo(0, 0.09, 0.02, 0.09, 0.05, 0.07);
    c.bezierCurveTo(0.12, 0.00, 0.14, 0.15, 0, 0.30);
    c.closePath(); c.fill();

    // teeth — an upper row of light teeth split by dark gaps, dark gum line
    var ty0 = 0.46, ty1 = 0.66, tx = 0.25, teeth = 8, w = (tx * 2) / teeth, t, gx;
    c.fillStyle = 'rgba(10,10,10,0.9)';
    c.fillRect(-tx - 0.02, ty0 - 0.035, (tx + 0.02) * 2, 0.04); // gum shadow
    for (t = 0; t < teeth; t++) {
      gx = -tx + t * w;
      c.fillStyle = '#dcdcdc';
      c.fillRect(gx + 0.006, ty0, w - 0.012, ty1 - ty0);        // tooth
      c.fillStyle = '#0c0c0c';
      c.fillRect(gx - 0.004, ty0, 0.008, ty1 - ty0);            // gap
    }
    c.restore();                       // undo the 1.12 scale
  }

  /* ---------- figure 3: sacred geometry (flower of life) ----- */

  function geometryArr() {
    var a = [];
    function ringDots(cx, cy, r, n) {
      for (var i = 0; i < n; i++) { var an = (i / n) * TAU; a.push([cx + Math.cos(an) * r, cy + Math.sin(an) * r, 0.9]); }
    }
    function lineDots(x0, y0, x1, y1, n) {
      for (var i = 0; i <= n; i++) { var u = i / n; a.push([x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 0.9]); }
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

  /* ---------- figure 0: the brand, in dots ------------------- */

  // "SCOTTY MASSA / TATTOOS" — the dots spell the name, then bloom into
  // the artwork. Each line auto-fits so it never overflows the disc.
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
    c.fillRect(-0.40, 0.20, 0.80, 0.014);   // rule
    line('TATTOOS', 0.50, 0.26);
  }

  /* ---------- engine ----------------------------------------- */

  function init(canvas) {
    if (canvas.dataset.morphBound) return;
    canvas.dataset.morphBound = '1';

    var N       = Math.max(400, Math.floor(num(canvas, 'count', 4000)));
    var dotMax  = num(canvas, 'dot', 2.6);
    var dotMin  = Math.max(0.5, dotMax * 0.3);
    var HOLD    = Math.max(0, num(canvas, 'hold', 3400));
    var BLEND   = Math.max(200, num(canvas, 'blend', 2200));
    var accentF = num(canvas, 'accent', 0.02);
    var speed   = num(canvas, 'speed', 1);
    var seed    = attr(canvas, 'seed', 'scotty-massa');
    var animate = attr(canvas, 'animate', 'true') !== 'false';
    var skin    = canvas.getAttribute('data-morph-skin');
    var lockRaw = canvas.getAttribute('data-morph-fig');
    var lockFig = lockRaw == null ? -1 : (parseInt(lockRaw, 10) || 0);
    var SEG     = HOLD + BLEND;
    var MANDALA = 1; // the one figure that slowly spins

    var rand = mulberry32(xmur3(seed)());

    // Figures: text → mandala → skull → geometry.
    // The procedural mandala is primary (crisp geometry, clean negative space).
    // The baked real-tattoo grid is kept for reference but not used as the
    // morph target — it renders too diffuse to read as clean dotwork.
    var realFig = window.MandalaFigures && window.MandalaFigures.realMandala;
    void realFig; // available for future use
    function mandalaCloud() {
      return rasterCloud(drawMandala, N, rand);
    }
    var clouds = [ finalize(rasterCloud(drawText, N, rand), N, rand),
                   finalize(mandalaCloud(), N, rand),
                   finalize(rasterCloud(drawSkull, N, rand), N, rand),
                   finalize(geometryArr(), N, rand) ];
    var F = clouds.length;

    // The text figure wants the brand font; if it loads late, rebuild it.
    if (document.fonts && document.fonts.ready && document.fonts.status !== 'loaded') {
      document.fonts.ready.then(function () {
        var rrand = mulberry32(xmur3(seed + '-text')());
        clouds[0] = finalize(rasterCloud(drawText, N, rrand), N, rrand);
      });
    }

    // blood-red speckle: a stable (seeded) random subset
    var accent = new Uint8Array(N);
    for (var i = 0; i < N; i++) accent[i] = rand() < accentF ? 1 : 0;

    var ctx = canvas.getContext('2d');
    var pos = new Float32Array(N * 2);  // scratch positions for current frame
    var pstr = new Float32Array(N);     // scratch strengths for current frame
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

      // Optional in-canvas skin disc so the piece reads fully standalone.
      if (skin) {
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(w, h) * 0.5, 0, TAU);
        ctx.fill();
      }

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
      var sp = src.pos, ssr = src.str, dp = dst.pos, dsr = dst.str;
      // only the mandala spins; text, skull and geometry stay upright
      var rotM = elapsed * 0.00007 * speed;
      var sRot = cur === MANDALA ? rotM : 0;
      var dRot = nxt === MANDALA ? rotM : 0;
      var sc = Math.cos(sRot), ss = Math.sin(sRot);
      var dc = Math.cos(dRot), ds = Math.sin(dRot);
      var breathe = 1 + Math.sin(now * 0.0009) * 0.018;
      var shA = now * 0.0016, shB = now * 0.0013;

      for (var p = 0; p < N; p++) {
        var ix = p * 2, iy = ix + 1;
        var sx = sp[ix], sy = sp[iy];
        var dx = dp[ix], dy = dp[iy];
        var rsx = sx * sc - sy * ss, rsy = sx * ss + sy * sc;
        var rdx = dx * dc - dy * ds, rdy = dx * ds + dy * dc;
        var nx = rsx + (rdx - rsx) * k;
        var ny = rsy + (rdy - rsy) * k;
        // shimmer + breath
        nx = (nx + Math.sin(shA + p * 0.7) * 0.004) * breathe;
        ny = (ny + Math.cos(shB + p * 0.9) * 0.004) * breathe;
        pos[ix] = cx + nx * Rfit;
        pos[iy] = cy + ny * Rfit;
        pstr[p] = ssr[p] + (dsr[p] - ssr[p]) * k;   // strength eases too
      }

      var span = dotMax - dotMin;
      // black ink pass — dot size scales with strength (source darkness)
      ctx.fillStyle = INK;
      for (var b = 0; b < N; b++) {
        if (accent[b]) continue;
        var sB = dotMin + pstr[b] * span, hB = sB * 0.5;
        ctx.fillRect(pos[b * 2] - hB, pos[b * 2 + 1] - hB, sB, sB);
      }
      // blood-red accent pass — a touch finer so it reads as a speckle
      ctx.fillStyle = RED;
      for (var r = 0; r < N; r++) {
        if (!accent[r]) continue;
        var sR = (dotMin + pstr[r] * span) * 0.85, hR = sR * 0.5;
        ctx.fillRect(pos[r * 2] - hR, pos[r * 2 + 1] - hR, sR, sR);
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    var raf = null;
    function frame(now) { if (!visible) return; draw(now); raf = requestAnimationFrame(frame); }
    function startLoop() { if (!raf) raf = requestAnimationFrame(frame); }
    function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    // Static when asked (data-morph-animate="false") or under reduced motion.
    var staticMode = !animate || prefersReducedMotion;

    var resizePending = false;
    window.addEventListener('resize', function () {
      if (resizePending) return;
      resizePending = true;
      requestAnimationFrame(function () {
        resizePending = false; size = fit();
        draw(staticMode ? 0 : performance.now());
      });
    });

    if (staticMode) {
      if (lockFig < 0) lockFig = MANDALA; // rest on the real mandala
      draw(0);                            // fixed timestamp → deterministic frame
      return;
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          visible = e.isIntersecting;
          if (visible) startLoop(); else stopLoop();
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
