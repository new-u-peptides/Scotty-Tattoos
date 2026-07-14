/* =============================================================
   scroll-sequence.js — scroll-driven "selected work" reveal.
   -------------------------------------------------------------
   Drives the home-page panel below the hero. As the section scrolls
   through its own height, the ornament mandala canvas translates
   left → right across a pinned sticky stage, and each portfolio
   image / caption pair cross-fades in step with scroll progress.

   Markup:
     <section class="reveal-sequence" data-sequence>
       <div class="reveal-sequence__sticky">
         <div class="reveal-sequence__images">
           <div data-slot="0"><img src="..." alt="..."></div> …
         </div>
         <canvas class="reveal-sequence__mandala" data-mandala …></canvas>
         <div class="reveal-sequence__captions">
           <div data-slot="0">…</div> …
         </div>
         <div class="reveal-sequence__dots"><span data-slot="0"></span> …</div>
       </div>
     </section>

   The section's total height sets the scroll length; slot count is
   however many [data-slot] children live under __images. Zero deps.
   IntersectionObserver gates the scroll work; the handler is
   rAF-throttled. Honours prefers-reduced-motion (static, all slots
   shown via CSS). Auto-inits and no-ops on pages without [data-sequence],
   so dropping the same markup elsewhere just works.
   ============================================================= */
(function () {
  'use strict';

  var prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function smoothstep(t) { return t * t * (3 - 2 * t); }
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }

  function activate(elements, idx) {
    for (var i = 0; i < elements.length; i++) {
      elements[i].classList.toggle('is-active', i === idx);
    }
  }

  function init(section) {
    if (section.dataset.sequenceBound) return;
    section.dataset.sequenceBound = '1';

    var sticky   = section.querySelector('.reveal-sequence__sticky');
    var mandala  = section.querySelector('.reveal-sequence__mandala');
    var images   = section.querySelectorAll('.reveal-sequence__images > [data-slot]');
    var captions = section.querySelectorAll('.reveal-sequence__captions > [data-slot]');
    var dots     = section.querySelectorAll('.reveal-sequence__dots > [data-slot]');
    if (!sticky || !images.length) return;

    var N = images.length;

    // Reduced motion: no scroll coupling — CSS stacks every slot, visible.
    if (prefersReducedMotion) {
      section.classList.add('is-reduced-motion');
      activate(images, 0); activate(captions, 0); activate(dots, 0);
      return;
    }

    var visible = false, rafPending = false, lastIdx = -1;

    function update() {
      rafPending = false;
      var rect = section.getBoundingClientRect();
      var max = section.offsetHeight - window.innerHeight;
      var t = max > 0 ? clamp01(-rect.top / max) : 0;

      // Travel the mandala across the stage, overshooting each edge a little
      // so it enters/exits cleanly rather than parking on the border.
      if (mandala) {
        var stageW = sticky.offsetWidth;
        var mandalaW = mandala.offsetWidth || stageW * 0.4;
        var startX = -mandalaW * 0.15;
        var endX = stageW - mandalaW * 0.85;
        var x = startX + (endX - startX) * smoothstep(t);
        // preserve the CSS vertical centring (-50%) while overriding transform
        mandala.style.transform = 'translate3d(' + x.toFixed(1) + 'px, -50%, 0)';
      }

      // Cross-fade slots: each owns an equal segment of scroll progress.
      var idx = Math.min(N - 1, Math.floor(t * N));
      if (idx !== lastIdx) {
        lastIdx = idx;
        activate(images, idx);
        activate(captions, idx);
        activate(dots, idx);
      }
    }

    function onScroll() {
      if (!visible || rafPending) return;
      rafPending = true;
      requestAnimationFrame(update);
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          visible = entries[i].isIntersecting;
          if (visible) onScroll();
        }
      }, { threshold: 0 });
      io.observe(section);
    } else {
      visible = true;
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update(); // first paint matches scroll position on refresh
  }

  function autoInit() {
    var nodes = document.querySelectorAll('[data-sequence]');
    for (var i = 0; i < nodes.length; i++) init(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
  document.addEventListener('partials:loaded', autoInit);
})();
