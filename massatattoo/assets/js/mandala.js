/* =============================================================
   mandala.js — animated sacred-geometry mandala
   -------------------------------------------------------------
   Renders an animated concentric mandala on any <canvas data-mandala>.
   Zero dependencies. Honours prefers-reduced-motion (renders a still
   frame and skips the rAF loop). Pauses when offscreen via
   IntersectionObserver. Resizes with the parent element.

   Markup:
     <canvas data-mandala data-mandala-theme="red"></canvas>

   Data attributes (all optional):
     data-mandala-theme    : red | gold | white | bark   (default: red)
     data-mandala-rings    : integer, # of concentric polygon rings    (default: 4)
     data-mandala-dots     : integer, # of dots in outer ring          (default: 96)
     data-mandala-speed    : float, rotation speed multiplier          (default: 1)
     data-mandala-opacity  : float 0-1, overall canvas opacity         (default: 1)
     data-mandala-fill     : "0" disables the dot-ring fill, useful
                             if you want a stroke-only minimal version
   ============================================================= */
(function () {
  'use strict';

  var PALETTES = {
    red:   { stroke: 'rgba(200, 16, 46, 0.78)',  accent: 'rgba(245, 242, 236, 0.92)', dot: 'rgba(245, 242, 236, 0.55)', center: 'rgba(200, 16, 46, 1)' },
    gold:  { stroke: 'rgba(184, 149, 106, 0.82)', accent: 'rgba(245, 239, 230, 0.92)', dot: 'rgba(245, 239, 230, 0.55)', center: 'rgba(184, 149, 106, 1)' },
    white: { stroke: 'rgba(245, 242, 236, 0.80)', accent: 'rgba(200, 16, 46, 0.92)',   dot: 'rgba(245, 242, 236, 0.50)', center: 'rgba(245, 242, 236, 1)' },
    bark:  { stroke: 'rgba(61, 40, 23, 0.55)',    accent: 'rgba(184, 149, 106, 0.80)', dot: 'rgba(61, 40, 23, 0.45)',    center: 'rgba(61, 40, 23, 0.95)' }
  };

  var prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function attr(el, key, fallback) {
    var v = el.getAttribute('data-mandala-' + key);
    return v == null ? fallback : v;
  }
  function num(el, key, fallback) { return parseFloat(attr(el, key, fallback)); }

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
      // Subtle size variation: every 4th dot is slightly larger, creates rhythm
      var rad = radius * (i % 4 === 0 ? 1.6 : 1);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r, rad, 0, Math.PI * 2);
      ctx.fill();
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
    var showFill = attr(canvas, 'fill', '1') !== '0';

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
      var phase = t * 0.0001 * speed;

      // Outer dotwork ring — slow forward drift
      if (showFill) {
        dottedRing(ctx, R, dots, phase * 0.5, Math.max(0.7, R * 0.005), theme.dot);
      }

      // Concentric polygons — alternate rotation direction per ring
      ctx.lineWidth = Math.max(0.6, R * 0.0035);
      for (var i = 0; i < rings; i++) {
        var ringR = R * (0.92 - i * (0.18 / Math.max(1, rings - 1)));
        var sides = 6 + i * 2;                    // hex → oct → dec → 12-gon
        var dir   = i % 2 === 0 ? 1 : -1;
        ctx.strokeStyle = theme.stroke;
        polygon(ctx, ringR, sides, phase * dir * (1 + i * 0.3));
        // Half-step rotated overlay creates the lattice / petal feel
        polygon(ctx, ringR, sides, phase * dir * (1 + i * 0.3) + Math.PI / sides);
      }

      // Star of David accent inside the polygon stack
      ctx.lineWidth = Math.max(0.8, R * 0.005);
      starOfDavid(ctx, R * 0.28, phase * 0.8, theme.accent);

      // Vesica Piscis at the dead center
      ctx.lineWidth = Math.max(0.6, R * 0.004);
      vesicaPiscis(ctx, R * 0.08, theme.accent);

      // Center dot
      ctx.fillStyle = theme.center;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(2, R * 0.012), 0, Math.PI * 2);
      ctx.fill();

      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    function frame(t) {
      if (!visible) return;
      draw(t);
      raf = requestAnimationFrame(frame);
    }

    var raf = null;
    function start() {
      if (raf) return;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = null;
    }

    // Resize: debounced via rAF
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

    // Pause when offscreen to save battery on long pages
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
      // Single still frame; never animate.
      draw(0);
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
  // Re-scan when partials drop new canvases in
  document.addEventListener('partials:loaded', autoInit);
})();
