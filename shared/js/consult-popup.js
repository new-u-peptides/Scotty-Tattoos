/* =========================================================
   Consultation invite popup.

   Fires once, ~30 seconds into the visitor's session — not 30s
   per page. The session start time is stamped in sessionStorage,
   so browsing several pages doesn't restart or re-trigger it.
   Invites the visitor to book a one-to-one or an online
   consultation about their concept.

   Skipped on the booking & contact pages (they're already there)
   and respects prefers-reduced-motion via the stylesheet.
   ========================================================= */
(function () {
  'use strict';

  var DELAY = 30000;                       // 30s into the session
  var SHOWN_KEY = 'sm-consult-shown';      // once-per-session guard
  var START_KEY = 'sm-session-start';      // session start timestamp
  var SKIP_PAGES = { booking: 1, contact: 1 };

  var popup = null;
  var lastFocused = null;
  var timer = null;

  function storage() {
    try { return window.sessionStorage; } catch (e) { return null; }
  }

  function alreadyShown() {
    var s = storage();
    return s ? s.getItem(SHOWN_KEY) === '1' : false;
  }

  function sessionStart() {
    var s = storage();
    var now = Date.now();
    if (!s) return now;
    var t = parseInt(s.getItem(START_KEY), 10);
    if (!t) { s.setItem(START_KEY, String(now)); return now; }
    return t;
  }

  function focusables() {
    return popup.querySelectorAll('a[href], button:not([disabled])');
  }

  function onKeydown(e) {
    if (!popup) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    var f = focusables();
    if (!f.length) return;
    var first = f[0];
    var last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open() {
    if (!popup || alreadyShown()) return;
    var s = storage();
    if (s) s.setItem(SHOWN_KEY, '1');

    lastFocused = document.activeElement;
    popup.hidden = false;
    void popup.offsetWidth;                // flush styles so the transition runs
    popup.classList.add('is-open');
    document.documentElement.classList.add('consult-open');
    document.addEventListener('keydown', onKeydown);

    var closeBtn = popup.querySelector('.consult__close');
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    if (!popup) return;
    popup.classList.remove('is-open');
    document.documentElement.classList.remove('consult-open');
    document.removeEventListener('keydown', onKeydown);

    var done = function () { popup.hidden = true; popup.removeEventListener('transitionend', done); };
    popup.addEventListener('transitionend', done);
    setTimeout(function () { if (!popup.classList.contains('is-open')) popup.hidden = true; }, 500);

    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function init() {
    if (popup) return;                     // already wired this page
    popup = document.querySelector('.consult');
    if (!popup) return;

    popup.querySelectorAll('[data-consult-close]').forEach(function (el) {
      el.addEventListener('click', function () { close(); });
    });

    var page = document.body.getAttribute('data-nav-current');
    if (alreadyShown() || (page && SKIP_PAGES[page])) return;

    if (timer) clearTimeout(timer);
    var wait = Math.max(0, DELAY - (Date.now() - sessionStart()));
    timer = setTimeout(open, wait);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // The popup markup lives in the footer partial, injected asynchronously.
  document.addEventListener('partials:loaded', init);
})();
