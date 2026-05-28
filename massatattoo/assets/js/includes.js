(function () {
  'use strict';

  function resolveCurrentNav(hint) {
    if (hint) return hint;
    var path = window.location.pathname.replace(/\/+$/, '');
    var file = path.split('/').pop() || 'index';
    if (file.indexOf('.') !== -1) file = file.replace(/\.html?$/, '');
    if (!file) file = 'index';
    return file;
  }

  function markActiveNav(root, current) {
    var links = root.querySelectorAll('[data-nav]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('data-nav') === current) {
        links[i].classList.add('is-active');
      }
    }
  }

  function stampYear(root) {
    var el = root.querySelector('#year');
    if (el) el.textContent = new Date().getFullYear();
  }

  function inject(target, html) {
    var wrapper = document.createElement('div');
    wrapper.innerHTML = html.trim();
    var fragment = document.createDocumentFragment();
    while (wrapper.firstChild) fragment.appendChild(wrapper.firstChild);
    target.replaceWith(fragment);
    return fragment;
  }

  function loadPartial(target) {
    var src = target.getAttribute('data-include');
    if (!src) return Promise.resolve();
    return fetch(src, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load ' + src + ': ' + res.status);
        return res.text();
      })
      .then(function (html) {
        var placeholder = document.createElement('div');
        placeholder.innerHTML = html.trim();
        var nodes = Array.prototype.slice.call(placeholder.childNodes);
        var parent = target.parentNode;
        nodes.forEach(function (n) { parent.insertBefore(n, target); });
        parent.removeChild(target);
        return nodes;
      })
      .catch(function (err) {
        console.error('[includes]', err);
      });
  }

  function init() {
    var navHintEl = document.querySelector('[data-nav-current]');
    var navHint = navHintEl ? navHintEl.getAttribute('data-nav-current') : null;

    var targets = document.querySelectorAll('[data-include]');
    var jobs = [];
    for (var i = 0; i < targets.length; i++) jobs.push(loadPartial(targets[i]));

    Promise.all(jobs).then(function () {
      var current = resolveCurrentNav(navHint);
      markActiveNav(document, current);
      stampYear(document);
      document.dispatchEvent(new CustomEvent('partials:loaded'));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
