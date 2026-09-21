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

  // Alternate folio rows left/right based on VISIBLE order, so the zig-zag
  // stays correct even after a filter hides some rows. Marking the container
  // `.is-striped` hands layout control from the CSS :nth-of-type fallback to
  // these explicit `.is-flip` classes.
  function stripeFolio(folio) {
    folio.classList.add('is-striped');
    var visible = 0;
    folio.querySelectorAll('.folio-row').forEach(function (row) {
      if (row.style.display === 'none') { row.classList.remove('is-flip'); return; }
      row.classList.toggle('is-flip', visible % 2 === 1);
      visible++;
    });
  }

  function bindFolios() {
    document.querySelectorAll('.folio').forEach(stripeFolio);
  }

  function bindChips() {
    document.querySelectorAll('.chips').forEach(function (group) {
      if (group.dataset.bound) return;
      group.dataset.bound = '1';
      var scope = group.parentElement || document;
      var container = scope.querySelector('.grid--portfolio, .folio') ||
                      document.querySelector('.grid--portfolio, .folio');
      group.addEventListener('click', function (e) {
        var chip = e.target.closest('.chip');
        if (!chip) return;
        group.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        if (!container) return;
        var filter = chip.getAttribute('data-filter') || 'all';
        container.querySelectorAll('.tile, .folio-row').forEach(function (item) {
          var cats = (item.getAttribute('data-category') || '').split(/\s+/);
          var show = filter === 'all' || cats.indexOf(filter) !== -1;
          item.style.display = show ? '' : 'none';
        });
        if (container.classList.contains('folio')) stripeFolio(container);
      });
    });
  }

  // Honour a ?style=<filter> param on inbound links (e.g. the homepage "What
  // I tattoo" cards link to portfolio.html?style=mandala) by activating the
  // matching chip on load. Value is sanitised to letters so it can't be used
  // to inject an attribute selector.
  function applyUrlFilter() {
    var search = location.search;
    if (!search || search.indexOf('style=') === -1) return;
    var match = /[?&]style=([^&]+)/.exec(search);
    if (!match) return;
    var style = decodeURIComponent(match[1]).replace(/[^a-z]/gi, '').toLowerCase();
    if (!style) return;
    var group = document.querySelector('.chips');
    if (!group || group.dataset.urlApplied) return;
    var chip = group.querySelector('.chip[data-filter="' + style + '"]');
    if (!chip) return;
    group.dataset.urlApplied = '1';
    chip.click();
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


  // ---------------------------------------------------------------
  // Marketing attribution.
  //
  // Captured on every page because a visitor almost never lands on the
  // enquiry form directly — they arrive on a portfolio page from Instagram
  // and navigate. Without this, every enquiry would be attributed to
  // booking.html with no source.
  //
  // First touch wins for the landing page and referrer (where they actually
  // came from); the most recent non-empty campaign wins for the UTM fields
  // (the campaign that brought them back). Stored for 90 days.
  // ---------------------------------------------------------------
  var ATTR_KEY = 'sm-attribution';
  var ATTR_TTL = 90 * 24 * 60 * 60 * 1000;
  var UTM_KEYS = ['utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm'];

  function attrStore() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  function readParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    if (!m) return '';
    try { return decodeURIComponent(m[1].replace(/\+/g, ' ')).slice(0, 200); } catch (e) { return ''; }
  }

  function blankAttribution() {
    return { utmSource: '', utmMedium: '', utmCampaign: '', utmContent: '', utmTerm: '',
             landingPage: '', referrer: '', firstSeen: 0 };
  }

  function captureAttribution() {
    var store = attrStore();
    var saved = null;
    if (store) {
      try {
        var raw = store.getItem(ATTR_KEY);
        if (raw) saved = JSON.parse(raw);
      } catch (e) { saved = null; }
    }
    if (saved && saved.firstSeen && (Date.now() - saved.firstSeen) > ATTR_TTL) saved = null;

    var data = saved && typeof saved === 'object' ? saved : blankAttribution();
    if (!data.firstSeen) data.firstSeen = Date.now();

    // Later campaigns overwrite earlier ones, but an ordinary visit with no
    // UTM parameters must never blank out the campaign that brought them in.
    var incoming = {};
    var sawAny = false;
    UTM_KEYS.forEach(function (key) {
      var value = readParam(key.replace(/([A-Z])/g, '_$1').toLowerCase());
      incoming[key] = value;
      if (value) sawAny = true;
    });
    if (sawAny) UTM_KEYS.forEach(function (key) { data[key] = incoming[key]; });

    if (!data.landingPage) data.landingPage = location.href.slice(0, 500);
    if (!data.referrer) {
      var ref = document.referrer || '';
      if (ref && ref.indexOf(location.origin) !== 0) data.referrer = ref.slice(0, 500);
    }

    if (store) {
      try { store.setItem(ATTR_KEY, JSON.stringify(data)); } catch (e) { /* quota / private mode */ }
    }
    return data;
  }

  window.SM = window.SM || {};
  window.SM.attribution = function () {
    try { return captureAttribution(); } catch (e) { return blankAttribution(); }
  };

  function bootstrap() {
    bindNavToggle();
    bindReveal();
    bindFolios();
    bindChips();
    applyUrlFilter();
    bindActiveNav();
    bindWhatsApp();
    try { captureAttribution(); } catch (e) { /* storage disabled */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
  document.addEventListener('partials:loaded', bootstrap);
})();
