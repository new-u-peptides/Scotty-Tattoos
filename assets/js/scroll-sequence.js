/* =============================================================
   scroll-sequence.js — scroll-driven reveal sequence
   -------------------------------------------------------------
   Drives the home-page reveal panel below the hero. As the section
   scrolls into view, the mandala canvas translates left -> right
   across the stage, and each portfolio image / caption pair cross-
   fades in step with scroll progress.

   Markup:
     <section data-sequence>
       <div class="reveal-sequence__sticky">
         <div class="reveal-sequence__images">
           <img data-slot="0" src="..." alt="...">
           <img data-slot="1" src="..." alt="...">
           ...
         </div>
         <canvas class="reveal-sequence__mandala" data-mandala ...></canvas>
         <div class="reveal-sequence__captions">
           <div data-slot="0">...</div>
           <div data-slot="1">...</div>
         </div>
       </div>
     </section>

   The section's total height drives the scroll length; the sticky
   child stays pinned for the duration. Slot count is whatever count
   of [data-slot] elements you have under .reveal-sequence__images.
   ============================================================= */
(function () {
  'use strict';

  var prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function smoothstep(t) { return t * t * (3 - 2 * t); }

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
    if (!sticky || !mandala || !images.length) return;

    var N = images.length;
    var visible = false;
    var rafPending = false;
    var smallScreen = window.matchMedia('(max-width: 720px)').matches;

    function update() {
      rafPending = false;
      var rect = section.getBoundingClientRect();
      var sectionH = section.offsetHeight;
      var winH = window.innerHeight;
      var scrolled = -rect.top;
      var max = sectionH - winH;
      var t = Math.max(0, Math.min(1, scrolled / max));

      // Translate the mandala across the stage. We let it overshoot slightly
      // on either side so it enters/exits cleanly rather than landing on the edge.
      var stageW = sticky.offsetWidth;
      var mandalaW = mandala.offsetWidth || stageW * 0.4;
      var startX = -mandalaW * 0.15;
      var endX = stageW - mandalaW * 0.85;
      var x = startX + (endX - startX) * smoothstep(t);
      // Preserve the CSS-supplied vertical centring (-50%) when overriding transform
      mandala.style.transform = 'translate3d(' + x + 'px, -50%, 0)';

      // Cross-fade slots. Each slot owns a segment of progress; we round to
      // the nearest slot but cross-fade through the middle of each transition.
      var segment = 1 / N;
      var slotIdx = Math.min(N - 1, Math.floor(t / segment));
      activate(images, slotIdx);
      activate(captions, slotIdx);
      activate(dots, slotIdx);
    }

    function onScroll() {
      if (!visible || rafPending) return;
      rafPending = true;
      requestAnimationFrame(update);
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          visible = e.isIntersecting;
          if (visible) update();
        });
      }, { threshold: 0 });
      io.observe(section);
    } else {
      visible = true;
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () {
      smallScreen = window.matchMedia('(max-width: 720px)').matches;
      onScroll();
    });

    // Initial render so first paint matches scroll position on refresh
    if (prefersReducedMotion) {
      // Reduced motion: just show all slots stacked vertically (CSS handles it)
      section.classList.add('is-reduced-motion');
      activate(images, 0);
      activate(captions, 0);
      activate(dots, 0);
    } else {
      update();
    }
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
