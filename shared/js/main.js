(function () {
  'use strict';

  function bindNavToggle() {
    var toggle = document.querySelector('.nav__toggle');
    var menu = document.querySelector('.nav__menu, .nav__links');
    if (!toggle || !menu || toggle.dataset.bound) return;
    toggle.dataset.bound = '1';
    toggle.addEventListener('click', function () {
      var open = menu.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
  }

  function bindReveal() {
    var els = document.querySelectorAll('.reveal:not([data-revealed])');
    if (!els.length || typeof IntersectionObserver === 'undefined') {
      els.forEach(function (el) { el.classList.add('is-visible'); el.setAttribute('data-revealed', '1'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    els.forEach(function (el) { el.setAttribute('data-revealed', '1'); observer.observe(el); });
  }

  function bindChips() {
    document.querySelectorAll('.chips').forEach(function (group) {
      if (group.dataset.bound) return;
      group.dataset.bound = '1';
      group.addEventListener('click', function (e) {
        var chip = e.target.closest('.chip');
        if (!chip) return;
        group.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
      });
    });
  }

  // Reveal the floating WhatsApp button once the hero is scrolled past, so it
  // never overlaps the hero. On pages without a hero it shows immediately.
  function bindWhatsApp() {
    var fab = document.querySelector('.wa-fab');
    if (!fab || fab.dataset.bound) return;
    fab.dataset.bound = '1';
    var hero = document.querySelector('.hero');
    if (!hero || typeof IntersectionObserver === 'undefined') {
      fab.classList.add('is-visible');
      return;
    }
    new IntersectionObserver(function (entries) {
      // visible only when the hero is mostly out of view
      fab.classList.toggle('is-visible', !entries[0].isIntersecting);
    }, { threshold: 0.4 }).observe(hero);
  }

  function bindActiveNav() {
    if (document.body.getAttribute('data-nav-current')) return;
    var path = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav__menu a').forEach(function (a) {
      var href = a.getAttribute('href');
      if (href === path || (path === '' && href === 'index.html')) {
        a.classList.add('is-active');
      }
    });
  }

  function bootstrap() {
    bindNavToggle();
    bindReveal();
    bindChips();
    bindActiveNav();
    bindWhatsApp();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
  document.addEventListener('partials:loaded', bootstrap);
})();
