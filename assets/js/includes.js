(function () {
  'use strict';

  function loadPartial(target) {
    var src = target.getAttribute('data-include');
    if (!src) return Promise.resolve();
    return fetch(src, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load ' + src + ': ' + res.status);
        return res.text();
      })
      .then(function (html) {
        var wrapper = document.createElement('div');
        wrapper.innerHTML = html.trim();
        var nodes = Array.prototype.slice.call(wrapper.childNodes);
        var parent = target.parentNode;
        nodes.forEach(function (n) { parent.insertBefore(n, target); });
        parent.removeChild(target);
      })
      .catch(function (err) { console.error('[includes]', err); });
  }

  function init() {
    var targets = document.querySelectorAll('[data-include]');
    if (!targets.length) return;
    var jobs = [];
    for (var i = 0; i < targets.length; i++) jobs.push(loadPartial(targets[i]));

    Promise.all(jobs).then(function () {
      var hint = document.body.getAttribute('data-nav-current');
      if (hint) {
        document.querySelectorAll('[data-nav]').forEach(function (a) {
          if (a.getAttribute('data-nav') === hint) a.classList.add('is-active');
        });
      }
      var year = document.getElementById('year');
      if (year) year.textContent = new Date().getFullYear();
      document.dispatchEvent(new CustomEvent('partials:loaded'));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
