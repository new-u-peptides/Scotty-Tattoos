/* =============================================================
   mandala-morph.js — a refined living dotwork engine.
   -------------------------------------------------------------
   Thousands of tiny tattoo-stipple dots that continuously morph
   between five figures in Scotty's dotwork language:

       text → mandala → skull → sacred geometry → owl → (loop)

   The dots first spell the brand ("SCOTTY MASSA / TATTOOS"), then bloom
   into a dotwork mandala, a skull, a flower-of-life, and a geometric owl.
   Each figure is a
   cloud of ~N points; clouds are sorted by angle so dot #i maps across
   figures — the transition swirls and reflows rather than teleporting.
   Every dot eases (smootherstep) between figures with a controlled curl,
   a little shimmer and breath, and carries a "strength" (source darkness)
   that drives its size and opacity — so shadows read dense and bold,
   highlights fine. Only the mandala slowly spins; text, skull and
   geometry stay upright.

   Deterministic: a seeded PRNG (data-morph-seed) places every dot and
   fixes per-dot styling, so the artwork renders identically on every load.

   Zero dependencies. Honours prefers-reduced-motion (draws a single
   static frame, no loop). Pauses offscreen via IntersectionObserver and
   resumes without a time jump. Resizes with its parent (ResizeObserver) —
   clouds live in a normalised [-1, 1] space, so only the scale changes.

   Pairs with assets/css/components/mandala.css for the bone "skin" disc —
   or pass data-morph-skin to draw skin in-canvas and run fully standalone.

   Markup:
     <canvas data-mandala-morph></canvas>

   Data attributes (all optional):
     data-morph-count   : target dot count                    (default 4200)
     data-morph-dot     : max dot size in CSS px; size scales down toward
                          this in highlights                   (default 2.45)
     data-morph-weight  : ink weight / contrast multiplier     (default 1.12)
     data-morph-flow    : transition swirl strength            (default 0.34)
     data-morph-breathe : idle breathing amount                (default 0.012)
     data-morph-shape   : "round" or "square" dots          (default round)
     data-morph-fit     : figure scale inside canvas           (default 0.465)
     data-morph-hold    : ms to hold each figure               (default 3000)
     data-morph-blend   : ms to morph between figures          (default 2600)
     data-morph-accent  : fraction of dots inked blood-red     (default 0.014)
     data-morph-speed   : mandala spin / motion multiplier     (default 1)
     data-morph-seed    : PRNG seed for stable layout (default "scotty-massa")
     data-morph-animate : "false" → render one static frame   (default true)
     data-morph-skin    : CSS colour; fill an in-canvas skin disc so the
                          piece reads without the paired CSS (default: none)
     data-morph-fig     : lock to one figure, no morph
                          (0 = text, 1 = mandala, 2 = skull,
                           3 = geometry, 4 = owl)            (default: cycle)
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
    // Slight lift in the highlights, heavier punch in the shadows.
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

  /* ---------- figure 1: Scotty's dotwork back-mandala -------- */

  // One lotus petal drawn the way it is tattooed: a crisp dark OUTLINE
  // (the stencil linework) wrapping a light interior that only deepens
  // toward the rim (the backfill stipple). When rasterCloud samples this,
  // the outline becomes a tight line of dots and the interior a soft
  // gradient of dots — reading as real dotwork, not a fuzzy blob.
  function petal(c, a, r0, r1, h, base, tip) {
    var bx = Math.cos(a) * r0, by = Math.sin(a) * r0;
    var tx = Math.cos(a) * r1, ty = Math.sin(a) * r1;
    var mid = (r0 + r1) * 0.5;
    var lx = Math.cos(a - h) * mid, ly = Math.sin(a - h) * mid;
    var rx = Math.cos(a + h) * mid, ry = Math.sin(a + h) * mid;
    var g = c.createRadialGradient(0, 0, r0, 0, 0, r1);
    g.addColorStop(0, base);
    g.addColorStop(0.45, base);
    g.addColorStop(1, tip);            // interior shading deepens at the rim
    c.beginPath();
    c.moveTo(bx, by);
    c.quadraticCurveTo(lx, ly, tx, ty);
    c.quadraticCurveTo(rx, ry, bx, by);
    c.closePath();
    c.fillStyle = g; c.fill();
    c.lineWidth = 0.013; c.strokeStyle = '#050505'; c.stroke();  // stencil linework
  }

  // A crisp concentric circle — the ring linework that frames each row.
  function ringLine(c, r, lw) {
    c.lineWidth = lw; c.strokeStyle = '#0a0a0a';
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
  }

  function drawMandala(c) {
    var i, a, L;

    // Outline-first construction: each row is a band of SHORT outlined
    // petals (short radial span + many rows → the rhythm reads concentric,
    // not spoked), framed by crisp concentric ring lines. Interiors stay
    // light so the dots concentrate on the linework and fade through the
    // fill — the look of a piece being tattooed (back-mandala.jpg).
    // tips deepen toward the outer rows for a layered, vignetted depth.
    var rings = [
      { n: 36, r0: 0.82, r1: 0.95, base: '#cfcfcf', tip: '#2c2c2c', off: 0.00 },
      { n: 30, r0: 0.70, r1: 0.835, base: '#d2d2d2', tip: '#343434', off: 0.50 },
      { n: 24, r0: 0.58, r1: 0.715, base: '#d4d4d4', tip: '#3c3c3c', off: 0.00 },
      { n: 20, r0: 0.46, r1: 0.595, base: '#d6d6d6', tip: '#454545', off: 0.50 },
      { n: 16, r0: 0.34, r1: 0.475, base: '#d8d8d8', tip: '#4e4e4e', off: 0.00 },
      { n: 12, r0: 0.22, r1: 0.355, base: '#dadada', tip: '#565656', off: 0.50 },
      { n: 8,  r0: 0.10, r1: 0.235, base: '#dcdcdc', tip: '#5e5e5e', off: 0.00 }
    ];
    for (L = 0; L < rings.length; L++) {
      var ring = rings[L], h = (Math.PI / ring.n) * 0.96;
      for (i = 0; i < ring.n; i++) {
        a = ((i + ring.off) / ring.n) * TAU - Math.PI / 2;
        petal(c, a, ring.r0, ring.r1, h, ring.base, ring.tip);
      }
      ringLine(c, ring.r0, 0.009);   // concentric frame at the row base
    }

    // crisp outer boundary rings (the border linework)
    ringLine(c, 0.965, 0.012);
    ringLine(c, 0.995, 0.006);

    // Central lotus — a small ring of outlined petals + a seeded eye.
    var burst = 8;
    for (i = 0; i < burst; i++) {
      a = (i / burst) * TAU - Math.PI / 2;
      petal(c, a, 0.034, 0.10, (Math.PI / burst) * 0.96, '#dcdcdc', '#7a7a7a');
    }
    ringLine(c, 0.034, 0.008);
    c.fillStyle = '#101010';
    c.beginPath(); c.arc(0, 0, 0.026, 0, TAU); c.fill();
    c.fillStyle = '#f0f0f0';
    c.beginPath(); c.arc(0, 0, 0.011, 0, TAU); c.fill();
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

  /* ---------- figure 4: geometric owl ------------------------ */

  // The geometric-linework primitive: stroke a regular polygon in unit
  // space (after Gemini's drawPolygon). Build figures from clean stroked
  // shapes and let rasterCloud render the strokes as dotwork linework —
  // the methodology behind every geometric piece here.
  function poly(c, cx, cy, r, sides, rot) {
    c.beginPath();
    for (var i = 0; i <= sides; i++) {
      var an = rot + i * TAU / sides;
      var x = cx + r * Math.cos(an), y = cy + r * Math.sin(an);
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
  }
  function seg(c, x0, y0, x1, y1) {
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  }

  // A fierce geometric owl — sacred-geometry crown, angular brow, focused
  // eyes, layered beak, hexagram chest. Pure stencil linework; the engine
  // stipples it. (Adapted from Gemini's geometric_owl, mapped to unit space.)
  function drawOwl(c) {
    c.strokeStyle = '#0a0a0a';
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.lineWidth = 0.013;

    // Crown — sacred geometry over the brow
    poly(c, 0, -0.593, 0.256, 6, Math.PI / 2);   // outer hexagon
    poly(c, 0, -0.593, 0.160, 6, Math.PI / 2);   // inner hexagon
    poly(c, 0, -0.593, 0.256, 3, -Math.PI / 2);  // upward triangle
    poly(c, 0, -0.593, 0.256, 3, Math.PI / 2);   // downward triangle

    // Brow / horns — angular and aggressive
    seg(c, 0, -0.304, -0.417, -0.304); seg(c, -0.417, -0.304, -0.545, -0.112);
    seg(c, 0, -0.304, 0.417, -0.304);  seg(c, 0.417, -0.304, 0.545, -0.112);

    // Eyes — fierce, focused (outlined iris + solid pupil)
    c.beginPath(); c.ellipse(-0.256, -0.112, 0.160, 0.096, 0, 0, TAU); c.stroke();
    c.beginPath(); c.ellipse(0.256, -0.112, 0.160, 0.096, 0, 0, TAU); c.stroke();
    c.fillStyle = '#0a0a0a';
    c.beginPath(); c.arc(-0.256, -0.112, 0.052, 0, TAU); c.fill();
    c.beginPath(); c.arc(0.256, -0.112, 0.052, 0, TAU); c.fill();
    c.fillStyle = '#f2f2f2';                     // catchlight keeps the eye alive
    c.beginPath(); c.arc(-0.238, -0.130, 0.016, 0, TAU); c.fill();
    c.beginPath(); c.arc(0.274, -0.130, 0.016, 0, TAU); c.fill();

    // Beak — sharp layered triangle
    c.beginPath();
    c.moveTo(-0.096, -0.048); c.lineTo(0.096, -0.048); c.lineTo(0, 0.208);
    c.closePath(); c.stroke();
    seg(c, 0, -0.048, 0, 0.150);                 // centre ridge

    // Wing/feather sweeps framing the body
    seg(c, -0.40, -0.112, -0.30, 0.34);
    seg(c, 0.40, -0.112, 0.30, 0.34);

    // Chest — hexagram emblem + framing chevron
    poly(c, 0, 0.465, 0.192, 6, Math.PI / 2);
    poly(c, 0, 0.465, 0.096, 6, Math.PI / 2);
    poly(c, 0, 0.465, 0.192, 3, -Math.PI / 2);
    poly(c, 0, 0.465, 0.192, 3, Math.PI / 2);
    seg(c, -0.320, 0.208, 0, 0.849); seg(c, 0, 0.849, 0.320, 0.208);
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

    var N       = Math.max(400, Math.floor(num(canvas, 'count', 4200)));
    var dotMax  = num(canvas, 'dot', 2.45);
    var dotMin  = Math.max(0.42, dotMax * 0.26);
    var weight  = Math.max(0.55, num(canvas, 'weight', 1.12));
    var flow    = Math.max(0, num(canvas, 'flow', 0.34));
    var breathA = Math.max(0, num(canvas, 'breathe', 0.012));
    var fitK    = clamp(num(canvas, 'fit', 0.465), 0.34, 0.50);
    var HOLD    = Math.max(0, num(canvas, 'hold', 3000));
    var BLEND   = Math.max(200, num(canvas, 'blend', 2600));
    var accentF = clamp(num(canvas, 'accent', 0.014), 0, 0.18);
    var speed   = Math.max(0, num(canvas, 'speed', 1));
    var shape   = attr(canvas, 'shape', 'round');
    var roundDots = shape !== 'square';
    var seed    = attr(canvas, 'seed', 'scotty-massa');
    var animate = attr(canvas, 'animate', 'true') !== 'false';
    var skin    = canvas.getAttribute('data-morph-skin');
    var lockRaw = canvas.getAttribute('data-morph-fig');
    var lockFig = lockRaw == null ? -1 : (parseInt(lockRaw, 10) || 0);
    var SEG     = HOLD + BLEND;
    var MANDALA = 1; // the one figure that slowly spins

    var rand = mulberry32(xmur3(seed)());

    // Figures: text → mandala → skull → geometry → owl. All procedural —
    // crisp stencil linework with clean negative space, drawn greyscale
    // then stippled into dotwork.
    var clouds = [ finalize(rasterCloud(drawText, N, rand), N, rand),
                   finalize(rasterCloud(drawMandala, N, rand), N, rand),
                   finalize(rasterCloud(drawSkull, N, rand), N, rand),
                   finalize(geometryArr(), N, rand),
                   finalize(rasterCloud(drawOwl, N, rand), N, rand) ];
    var F = clouds.length;

    // The text figure wants the brand font; if it loads late, rebuild it.
    if (document.fonts && document.fonts.ready && document.fonts.status !== 'loaded') {
      document.fonts.ready.then(function () {
        var rrand = mulberry32(xmur3(seed + '-text')());
        clouds[0] = finalize(rasterCloud(drawText, N, rrand), N, rrand);
      });
    }

    // Stable per-dot styling. Keeping this seeded makes every load identical.
    var accent = new Uint8Array(N);
    var dotJitter = new Float32Array(N);
    var phaseA = new Float32Array(N);
    var phaseB = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      accent[i] = rand() < accentF ? 1 : 0;
      dotJitter[i] = 0.86 + rand() * 0.28;
      phaseA[i] = rand() * TAU;
      phaseB[i] = rand() * TAU;
    }

    var ctx = canvas.getContext('2d', { alpha: true });
    var pos = new Float32Array(N * 2);  // scratch positions for current frame
    var pstr = new Float32Array(N);     // scratch strengths for current frame
    var size = fit();
    var visible = true;
    var start = performance.now();
    var pausedAt = 0;

    function fit() {
      var rect = canvas.getBoundingClientRect();
      // Cap DPR to keep 4k+ dots smooth on mobile retina screens.
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

      // Optional in-canvas skin disc. The extra vignette gives the piece
      // enough depth to sit on the page without needing a CSS wrapper.
      if (skin) {
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.arc(cx, cy, discR, 0, TAU);
        ctx.fill();
        var skinShade = ctx.createRadialGradient(cx, cy, discR * 0.08, cx, cy, discR);
        skinShade.addColorStop(0, 'rgba(255,255,255,0.08)');
        skinShade.addColorStop(0.72, 'rgba(0,0,0,0.00)');
        skinShade.addColorStop(1, 'rgba(0,0,0,0.16)');
        ctx.fillStyle = skinShade;
        ctx.beginPath();
        ctx.arc(cx, cy, discR, 0, TAU);
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
        k = into <= HOLD ? 0 : smootherstep((into - HOLD) / BLEND);
      }

      var src = clouds[cur], dst = clouds[nxt];
      var sp = src.pos, ssr = src.str, dp = dst.pos, dsr = dst.str;
      // only the mandala spins; text, skull and geometry stay upright
      var rotM = elapsed * 0.00007 * speed;
      var sRot = cur === MANDALA ? rotM : 0;
      var dRot = nxt === MANDALA ? rotM : 0;
      var sc = Math.cos(sRot), ss = Math.sin(sRot);
      var dc = Math.cos(dRot), ds = Math.sin(dRot);
      var morphPulse = Math.sin(k * Math.PI); // 0 at rest, 1 mid-morph
      var breathe = 1 + Math.sin(now * 0.00082 * speed) * breathA;
      var shA = now * 0.00115 * speed, shB = now * 0.00096 * speed;
      var flowSign = cur % 2 === 0 ? 1 : -1;

      for (var p = 0; p < N; p++) {
        var ix = p * 2, iy = ix + 1;
        var sx = sp[ix], sy = sp[iy];
        var dx = dp[ix], dy = dp[iy];
        var rsx = sx * sc - sy * ss, rsy = sx * ss + sy * sc;
        var rdx = dx * dc - dy * ds, rdy = dx * ds + dy * dc;
        var nx = rsx + (rdx - rsx) * k;
        var ny = rsy + (rdy - rsy) * k;
        var str = ssr[p] + (dsr[p] - ssr[p]) * k;   // strength eases too

        // Morph flow: a controlled rotational curl during transitions only.
        // It avoids straight-line teleporting but settles to a clean still figure.
        if (morphPulse > 0.0001 && flow > 0) {
          var rr = Math.sqrt(nx * nx + ny * ny) + 0.0001;
          var aa = Math.atan2(ny, nx);
          var curl = flowSign * flow * morphPulse * (0.10 + rr * 0.68);
          aa += curl + Math.sin(phaseA[p] + elapsed * 0.00016 * speed) * curl * 0.28;
          rr *= 1 + Math.sin(phaseB[p] + rr * 7.0) * flow * morphPulse * 0.030;
          nx = Math.cos(aa) * rr;
          ny = Math.sin(aa) * rr;
        }

        // Fine idle shimmer. Softer on heavy shadow dots, stronger on pale edges.
        var shimmer = (0.0017 + (1 - str) * 0.0022) * (1 + morphPulse * 0.55);
        nx = (nx + Math.sin(shA + phaseA[p]) * shimmer) * breathe;
        ny = (ny + Math.cos(shB + phaseB[p]) * shimmer) * breathe;
        pos[ix] = cx + nx * Rfit;
        pos[iy] = cy + ny * Rfit;
        pstr[p] = str;
      }

      var span = dotMax - dotMin;
      function drawDot(x, y, s) {
        var hh = s * 0.5;
        if (roundDots) {
          ctx.beginPath();
          ctx.arc(x, y, hh, 0, TAU);
          ctx.fill();
        } else {
          ctx.fillRect(x - hh, y - hh, s, s);
        }
      }

      // Black ink pass. Size and opacity both follow the source darkness,
      // which gives the artwork more tattoo weight without crushing detail.
      ctx.fillStyle = INK;
      for (var b = 0; b < N; b++) {
        if (accent[b]) continue;
        var stB = inkCurve(pstr[b], weight);
        var sB = (dotMin + stB * span) * dotJitter[b];
        ctx.globalAlpha = 0.72 + stB * 0.28;
        drawDot(pos[b * 2], pos[b * 2 + 1], sB);
      }

      // Blood-red accent pass. Smaller and slightly translucent so it reads
      // like occasional ink flecking, not a second competing artwork.
      ctx.fillStyle = RED;
      for (var r = 0; r < N; r++) {
        if (!accent[r]) continue;
        var stR = inkCurve(pstr[r], weight);
        var sR = (dotMin + stR * span) * dotJitter[r] * 0.78;
        ctx.globalAlpha = 0.58 + stR * 0.20;
        drawDot(pos[r * 2], pos[r * 2 + 1], sR);
      }
      ctx.globalAlpha = 1;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    var raf = null;
    function frame(now) { if (!visible) return; draw(now); raf = requestAnimationFrame(frame); }
    function startLoop() { if (!raf) raf = requestAnimationFrame(frame); }
    function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    // Static when asked (data-morph-animate="false") or under reduced motion.
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
    if ('ResizeObserver' in window) {
      new ResizeObserver(refit).observe(canvas);
    } else {
      window.addEventListener('resize', refit);
    }

    if (staticMode) {
      if (lockFig < 0) lockFig = MANDALA; // rest on the mandala
      draw(0);                            // fixed timestamp → deterministic frame
      return;
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            visible = true;
            if (pausedAt) {
              start += performance.now() - pausedAt;
              pausedAt = 0;
            }
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
