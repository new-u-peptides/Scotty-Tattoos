(function () {
  'use strict';

  function bindNavToggle() {
    var toggle = document.querySelector('.nav__toggle');
    var menu = document.querySelector('.nav__menu');
    if (!toggle || !menu || toggle.dataset.bound) return;
    toggle.dataset.bound = '1';
    toggle.addEventListener('click', function () {
      var open = menu.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
  document.addEventListener('partials:loaded', bootstrap);
})();
