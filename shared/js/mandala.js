/* =============================================================
   mandala.js — animated sacred-geometry mandala that morphs
   between dotwork, lotus, linework, and shading.
   -------------------------------------------------------------
   Renders a layered mandala on any <canvas data-mandala>. Four
   visual phases cross-fade in a continuous cycle:

     Phase 0 — DOTWORK    (stippled rings)
     Phase 1 — LOTUS      (radial lotus-petal arches — Scotty's signature ornament)
     Phase 2 — LINEWORK   (polygons + star + vesica)
     Phase 3 — SHADING    (concentric radial stipple, density gradient)

   Each layer's opacity is a smoothstep bump centred on its peak.
   Peaks are spaced evenly around the cycle, with overlap so the
   transitions feel continuous rather than discrete.

   Zero dependencies. Honours prefers-reduced-motion (renders a
   blended still frame and skips the rAF loop). Pauses when offscreen
   via IntersectionObserver. Resizes with the parent.

   Markup:
     <canvas data-mandala data-mandala-theme="red"></canvas>

   Data attributes (all optional):
     data-mandala-theme    : red | gold | white | bark   (default: red)
     data-mandala-rings    : integer, # of concentric polygon rings    (default: 4)
     data-mandala-dots     : integer, # of dots in outer ring          (default: 96)
     data-mandala-speed    : float, rotation speed multiplier          (default: 1)
     data-mandala-opacity  : float 0-1, overall canvas opacity         (default: 1)
     data-mandala-cycle    : ms per full phase cycle (dot -> line ->
                             shade -> dot)                              (default: 30000)
   ============================================================= */
(function () {
  'use strict';

  var PALETTES = {
    red:   { stroke: 'rgba(200, 16, 46, 0.78)',  accent: 'rgba(245, 242, 236, 0.92)', dot: 'rgba(245, 242, 236, 0.62)', center: 'rgba(200, 16, 46, 1)' },
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
  function num(el, key, fallback) { return parseFloat(attr(el, key, fallback)); }

  // Smooth bump: 1.0 at peakAt, falling to 0 at distance >= width.
  // Wraps around 0..1 so peaks near the boundary still blend cleanly.
  function smoothPulse(phase, peakAt, width) {
    var d = phase - peakAt;
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    d = Math.abs(d);
    if (d >= width) return 0;
    var t = 1 - d / width;
    return t * t * (3 - 2 * t);
  }

  function setAlpha(rgba, alpha) {
    // Replace the alpha component of an rgba() string with `alpha`,
    // multiplied by the original alpha so layered fades compose well.
    return rgba.replace(/rgba\(([^)]+)\)/, function (_, inside) {
      var parts = inside.split(',').map(function (s) { return s.trim(); });
      var a = parts.length === 4 ? parseFloat(parts[3]) : 1;
      return 'rgba(' + parts[0] + ',' + parts[1] + ',' + parts[2] + ',' + (a * alpha).toFixed(3) + ')';
    });
  }

  function polygon(ctx, r, sides, rotation) {
    ctx.beginPath();
    for (var i = 0; i <= sides; i++) {
      var a = rotation + (i / sides) * Math.PI * 2;
      var x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function dottedRing(ctx, r, n, phase, radius, color) {
    ctx.fillStyle = color;
    for (var i = 0; i < n; i++) {
      var a = phase + (i / n) * Math.PI * 2;
      var rad = radius * (i % 4 === 0 ? 1.6 : 1);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Tattoo-style radial stipple: concentric rings of dots with density
  // falling off toward the centre. Reads as airbrushed shading at a distance.
  function shadingHalo(ctx, R, t, color) {
    var bands = 7;
    for (var b = 0; b < bands; b++) {
      var k = b / (bands - 1);             // 0 (innermost) → 1 (outermost)
      var ringR = R * (0.18 + k * 0.78);
      var density = Math.floor(24 + k * k * 220); // quadratic falloff
      var rad = 0.6 + (1 - k) * 1.4;       // outer dots smaller, inner larger
      var alpha = 0.35 + k * 0.45;
      var phaseShift = t * 0.00006 * (b % 2 === 0 ? 1 : -1);
      ctx.fillStyle = setAlpha(color, alpha);
      for (var i = 0; i < density; i++) {
        var a = phaseShift + (i / density) * Math.PI * 2;
        // Jitter the radius slightly per dot for an organic stipple feel
        var jitter = (Math.sin(i * 7.3 + b) * 0.5 + 0.5) * (R * 0.02);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * (ringR + jitter), Math.sin(a) * (ringR + jitter), rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* A ring of lotus-petal arches at radius R. Each petal is two
     quadratic curves meeting at the outer tip, mirroring Scotty's
     ornamental linework. */
  function lotusArches(ctx, R, n, rotation, color) {
    ctx.strokeStyle = color;
    var inner = R * 0.42;
    var outer = R * 0.92;
    var halfAngle = Math.PI / n;
    for (var i = 0; i < n; i++) {
      var a = rotation + (i / n) * Math.PI * 2;
      var ix = Math.cos(a - halfAngle) * inner;
      var iy = Math.sin(a - halfAngle) * inner;
      var jx = Math.cos(a + halfAngle) * inner;
      var jy = Math.sin(a + halfAngle) * inner;
      var tx = Math.cos(a) * outer;
      var ty = Math.sin(a) * outer;
      var cax = Math.cos(a - halfAngle * 0.5) * outer * 1.05;
      var cay = Math.sin(a - halfAngle * 0.5) * outer * 1.05;
      var cbx = Math.cos(a + halfAngle * 0.5) * outer * 1.05;
      var cby = Math.sin(a + halfAngle * 0.5) * outer * 1.05;
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      ctx.quadraticCurveTo(cax, cay, tx, ty);
      ctx.quadraticCurveTo(cbx, cby, jx, jy);
      ctx.stroke();
    }
  }

  function vesicaPiscis(ctx, r, color) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(-r * 0.4, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(r * 0.4, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  function starOfDavid(ctx, r, rotation, color) {
    ctx.strokeStyle = color;
    var pts1 = [], pts2 = [];
    for (var i = 0; i < 3; i++) {
      var a = rotation + (i * 2 / 3) * Math.PI;
      pts1.push([Math.cos(a) * r, Math.sin(a) * r]);
      a = rotation + Math.PI + (i * 2 / 3) * Math.PI;
      pts2.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    [pts1, pts2].forEach(function (pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.lineTo(pts[1][0], pts[1][1]);
      ctx.lineTo(pts[2][0], pts[2][1]);
      ctx.closePath();
      ctx.stroke();
    });
  }

  function fitCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(1, Math.floor(rect.width));
    var h = Math.max(1, Math.floor(rect.height));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    return { w: w, h: h, dpr: dpr };
  }

  function init(canvas) {
    if (canvas.dataset.mandalaBound) return;
    canvas.dataset.mandalaBound = '1';

    var theme = PALETTES[attr(canvas, 'theme', 'red')] || PALETTES.red;
    var rings = Math.max(1, Math.floor(num(canvas, 'rings', 4)));
    var dots  = Math.max(12, Math.floor(num(canvas, 'dots', 96)));
    var speed = num(canvas, 'speed', 1);
    var opacity = num(canvas, 'opacity', 1);
    var cycle = Math.max(2000, num(canvas, 'cycle', 30000));

    var ctx = canvas.getContext('2d');
    var size = fitCanvas(canvas);
    var visible = true;

    function draw(t) {
      var w = size.w, h = size.h, dpr = size.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = opacity;
      ctx.translate(w / 2, h / 2);

      var R = Math.min(w, h) * 0.46;
      var rot = t * 0.0001 * speed;
      var phase = (t % cycle) / cycle;

      // Four bumps spaced evenly around the cycle. Width 0.34 gives
      // overlap so transitions feel continuous, never empty.
      var aDot   = smoothPulse(phase, 0.00, 0.34);
      var aLotus = smoothPulse(phase, 0.25, 0.34);
      var aLine  = smoothPulse(phase, 0.50, 0.34);
      var aShade = smoothPulse(phase, 0.75, 0.34);

      // Always-on baseline so it never goes completely flat between peaks
      aDot   = Math.max(aDot,   0.18);
      aLotus = Math.max(aLotus, 0.14);
      aLine  = Math.max(aLine,  0.18);
      aShade = Math.max(aShade, 0.10);

      // ---- SHADING (drawn first so other layers sit on top) ----
      if (aShade > 0.01) {
        shadingHalo(ctx, R, t, setAlpha(theme.dot, aShade * 0.9));
      }

      // ---- DOTWORK ring ----
      if (aDot > 0.01) {
        var dotPulse = Math.max(0.7, R * 0.005);
        dottedRing(ctx, R, dots, rot * 0.5, dotPulse * (0.6 + aDot * 0.6),
                   setAlpha(theme.dot, aDot));
      }

      // ---- LOTUS petal arches — Scotty's ornamental signature ----
      if (aLotus > 0.01) {
        var petals = Math.max(6, Math.floor(rings * 3));
        ctx.lineWidth = Math.max(0.6, R * 0.0038) * (0.7 + aLotus);
        lotusArches(ctx, R, petals, rot * 0.4, setAlpha(theme.stroke, aLotus));
      }

      // ---- LINEWORK polygons + star + vesica ----
      if (aLine > 0.01) {
        ctx.lineWidth = Math.max(0.6, R * 0.0035) * (0.6 + aLine);
        ctx.strokeStyle = setAlpha(theme.stroke, aLine);
        for (var i = 0; i < rings; i++) {
          var ringR = R * (0.92 - i * (0.18 / Math.max(1, rings - 1)));
          var sides = 6 + i * 2;
          var dir   = i % 2 === 0 ? 1 : -1;
          polygon(ctx, ringR, sides, rot * dir * (1 + i * 0.3));
          polygon(ctx, ringR, sides, rot * dir * (1 + i * 0.3) + Math.PI / sides);
        }

        ctx.lineWidth = Math.max(0.8, R * 0.005) * (0.6 + aLine);
        starOfDavid(ctx, R * 0.28, rot * 0.8, setAlpha(theme.accent, aLine));

        ctx.lineWidth = Math.max(0.6, R * 0.004) * (0.6 + aLine);
        vesicaPiscis(ctx, R * 0.08, setAlpha(theme.accent, aLine));
      }

      // ---- Always-on centre dot (anchor across all phases) ----
      ctx.fillStyle = theme.center;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(2, R * 0.012), 0, Math.PI * 2);
      ctx.fill();

      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    var raf = null;
    function frame(t) {
      if (!visible) return;
      draw(t);
      raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf) raf = requestAnimationFrame(frame); }
    function stop()  { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    var resizePending = false;
    function onResize() {
      if (resizePending) return;
      resizePending = true;
      requestAnimationFrame(function () {
        resizePending = false;
        size = fitCanvas(canvas);
        draw(performance.now());
      });
    }
    window.addEventListener('resize', onResize);

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          visible = entry.isIntersecting;
          if (visible && !prefersReducedMotion) start(); else stop();
        });
      }, { threshold: 0.01 });
      io.observe(canvas);
    }

    if (prefersReducedMotion) {
      draw(cycle * 0.25);   // a still frame mid-lotus, Scotty's signature
    } else {
      start();
    }
  }

  function autoInit() {
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
