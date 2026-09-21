/* =========================================================
   Two-step tattoo enquiry (booking.html).

   Step 1 posts to /api/enquiry/start the moment it validates, so an
   abandoned enquiry is still a lead the follow-up cron can reach. That
   call is fire-and-forget: if it fails the visitor never learns, and the
   final submit creates the record instead. Losing the enquiry because a
   background call failed would be the worst possible trade.

   Step 2 posts the whole form as multipart to /api/enquiry/submit.

   ES5 only — matches every other file in shared/js/.
   ========================================================= */
(function () {
  'use strict';

  var MAX_FILE_BYTES = 2 * 1024 * 1024;   // mirrored server-side
  var MAX_FILES = 3;
  var DRAFT_KEY = 'sm-enquiry-draft';
  var DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  // slug -> option label, for ?project=sleeve deep links from the portfolio.
  // Must stay identical to PROJECT_TYPES in api/_lib/enquiry.js.
  var PROJECT_BY_SLUG = {
    'sleeve': 'Sleeve',
    'half-sleeve': 'Half sleeve',
    'backpiece': 'Backpiece',
    'full-leg': 'Full leg',
    'chest': 'Chest',
    'ribs': 'Ribs / torso',
    'multiple': 'Multiple areas',
    'long-term': 'Long-term build',
    'bodysuit': 'Geometric bodysuit',
    'other': 'Other'
  };

  // Fields worth restoring from a draft. Files are never persisted.
  var DRAFT_FIELDS = [
    'name', 'email', 'country', 'instagram', 'projectType', 'scale', 'location',
    'idea', 'placement', 'existingTattoos', 'preferredTiming', 'heardFrom', 'additionalInfo'
  ];

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    if (!m) return '';
    try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return ''; }
  }

  function storage(kind) {
    try { return window[kind]; } catch (e) { return null; }
  }

  function init() {
    var form = qs('[data-enquiry-form]');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';

    var steps = qsa('.enquiry-step', form);
    var stepper = qsa('.stepper__step');
    var nextBtn = qs('[data-step-next]', form);
    var backBtn = qs('[data-step-back]', form);
    var submitBtn = qs('button[type="submit"]', form);
    var current = 1;

    // ---------------------------------------------------------------
    // Status + validation
    // ---------------------------------------------------------------

    function statusEl() {
      var step = steps[current - 1];
      return step ? qs('[data-form-status]', step) : null;
    }

    function setStatus(message, isError) {
      var el = statusEl();
      if (!el) return;
      el.textContent = message || '';
      el.className = 'form__status' + (isError ? ' form__status--error' : '');
    }

    function clearInvalid() {
      qsa('[aria-invalid="true"]', form).forEach(function (el) { el.removeAttribute('aria-invalid'); });
    }

    function fail(field, message) {
      if (field) {
        field.setAttribute('aria-invalid', 'true');
        try { field.focus(); } catch (e) { /* detached */ }
      }
      setStatus(message, true);
      return false;
    }

    function validEmail(value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function validateStep1() {
      clearInvalid();
      setStatus('');
      if (!form.name.value.trim()) return fail(form.name, 'Please add your name.');
      var email = form.email.value.trim();
      if (!email) return fail(form.email, 'Please add an email address I can reply to.');
      if (!validEmail(email)) return fail(form.email, "That email address doesn't look right — could you check it?");
      if (!form.country.value.trim()) return fail(form.country, 'Please tell me which country you’re in.');
      if (!form.projectType.value) return fail(form.projectType, 'Please choose the kind of project you have in mind.');
      if (!form.scale.value) return fail(form.scale, 'Please choose roughly how big the piece would be.');
      if (!form.location.value) return fail(form.location, 'Please let me know where this would happen.');
      return true;
    }

    function validateStep2() {
      clearInvalid();
      setStatus('');
      if (!form.idea.value.trim()) return fail(form.idea, 'Please tell me a little about the idea.');
      if (!form.existingTattoos.value) return fail(form.existingTattoos, 'Please let me know about any existing tattoos in the area.');
      if (!form.preferredTiming.value) return fail(form.preferredTiming, 'Please choose a rough timeframe.');
      if (!form.consent.checked) return fail(form.consent, 'Please confirm you’re 18 or over before sending.');

      var files = form.references && form.references.files;
      if (files && files.length) {
        if (files.length > MAX_FILES) return fail(form.references, 'Please choose up to ' + MAX_FILES + ' reference images.');
        for (var i = 0; i < files.length; i++) {
          if (files[i].size > MAX_FILE_BYTES) {
            return fail(form.references, '"' + files[i].name + '" is over 2MB — please compress it or choose a smaller image.');
          }
          if (files[i].type && files[i].type.indexOf('image/') !== 0) {
            return fail(form.references, '"' + files[i].name + '" is not an image — please attach photos only.');
          }
        }
      }
      return true;
    }

    // ---------------------------------------------------------------
    // Step switching
    // ---------------------------------------------------------------

    function showStep(n) {
      current = n;
      steps.forEach(function (step) {
        var isCurrent = String(n) === step.getAttribute('data-step');
        step.hidden = !isCurrent;
        step.classList.toggle('is-current', isCurrent);
      });
      stepper.forEach(function (item) {
        var idx = parseInt(item.getAttribute('data-step'), 10);
        item.classList.toggle('is-current', idx === n);
        item.classList.toggle('is-done', idx < n);
      });
      var legend = qs('legend', steps[n - 1]);
      if (legend) {
        // Focus the legend so the step change is announced and keyboard focus
        // does not stay on a button that is now hidden.
        legend.setAttribute('tabindex', '-1');
        try { legend.focus(); } catch (e) { /* older browsers */ }
      }
      try {
        history.replaceState(null, '', location.pathname + location.search + (n === 2 ? '#details' : ''));
      } catch (e) { /* replaceState unavailable */ }
    }

    // ---------------------------------------------------------------
    // Draft persistence
    // ---------------------------------------------------------------

    function saveDraft() {
      var s = storage('localStorage');
      if (!s) return;
      var data = { at: Date.now(), values: {} };
      DRAFT_FIELDS.forEach(function (name) {
        var el = form[name];
        if (el && typeof el.value === 'string') data.values[name] = el.value;
      });
      try { s.setItem(DRAFT_KEY, JSON.stringify(data)); } catch (e) { /* quota or private mode */ }
    }

    function restoreDraft() {
      var s = storage('localStorage');
      if (!s) return;
      var raw;
      try { raw = s.getItem(DRAFT_KEY); } catch (e) { return; }
      if (!raw) return;
      var data;
      try { data = JSON.parse(raw); } catch (e) { return; }
      if (!data || !data.values || !data.at || (Date.now() - data.at) > DRAFT_TTL_MS) {
        try { s.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
        return;
      }
      DRAFT_FIELDS.forEach(function (name) {
        var el = form[name];
        if (el && data.values[name] && !el.value) el.value = data.values[name];
      });
    }

    function clearDraft() {
      var s = storage('localStorage');
      if (!s) return;
      try { s.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
    }

    // ---------------------------------------------------------------
    // Prefill: attribution, ?project= deep link, signed resume link
    // ---------------------------------------------------------------

    function prefill() {
      var attr = (window.SM && typeof window.SM.attribution === 'function') ? window.SM.attribution() : {};
      function set(name, value) { if (form[name] && value) form[name].value = value; }
      set('utmSource', attr.utmSource);
      set('utmMedium', attr.utmMedium);
      set('utmCampaign', attr.utmCampaign);
      set('utmContent', attr.utmContent);
      set('utmTerm', attr.utmTerm);
      set('landingPage', attr.landingPage || location.href);
      set('referrer', attr.referrer);

      restoreDraft();

      // Deep link from a portfolio CTA. An unknown slug is ignored silently.
      var slug = param('project').toLowerCase();
      if (slug && PROJECT_BY_SLUG[slug]) form.projectType.value = PROJECT_BY_SLUG[slug];

      // Resume link from a reminder email. The signature is not verified here
      // — it cannot be, client-side. It is passed back to the server, which
      // re-computes it before trusting the reference; an invalid one simply
      // becomes a new enquiry.
      set('enquiryId', param('enquiry'));
      set('resumeSig', param('sig'));
      set('name', param('name'));
      set('email', param('email'));

      if (param('step') === '2' && validateStep1()) { showStep(2); }
      else { setStatus(''); }
    }

    // ---------------------------------------------------------------
    // Wire up
    // ---------------------------------------------------------------

    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        if (!validateStep1()) return;
        saveDraft();
        startEnquiry();
        showStep(2);
      });
    }

    if (backBtn) {
      backBtn.addEventListener('click', function () { setStatus(''); showStep(1); });
    }

    form.addEventListener('input', saveDraft);
    form.addEventListener('change', saveDraft);

    // Fire-and-forget: the visitor's progress never waits on this, and a
    // failure is not surfaced. The record it creates is what lets the 24-hour
    // reminder reach someone who leaves before step 2.
    function startEnquiry() {
      var payload = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        country: form.country.value.trim(),
        instagram: form.instagram.value.trim(),
        projectType: form.projectType.value,
        scale: form.scale.value,
        location: form.location.value,
        company: form.company ? form.company.value : '',
        enquiryId: form.enquiryId.value,
        resumeSig: form.resumeSig.value,
        utmSource: form.utmSource.value,
        utmMedium: form.utmMedium.value,
        utmCampaign: form.utmCampaign.value,
        utmContent: form.utmContent.value,
        utmTerm: form.utmTerm.value,
        landingPage: form.landingPage.value,
        referrer: form.referrer.value
      };
      try {
        fetch('/api/enquiry/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (res) {
          return res.ok ? res.json() : null;
        }).then(function (data) {
          if (data && data.ok && data.enquiryId) {
            form.enquiryId.value = data.enquiryId;
            if (data.resumeSig) form.resumeSig.value = data.resumeSig;
          }
        }).catch(function () { /* step 2 will create the record instead */ });
      } catch (e) { /* fetch unavailable */ }
    }

    function setLoading(on) {
      if (!submitBtn) return;
      submitBtn.disabled = on;
      submitBtn.textContent = on ? 'Sending…' : 'Send Enquiry';
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validateStep2()) return;
      setLoading(true);
      setStatus('');

      fetch('/api/enquiry/submit', { method: 'POST', body: new FormData(form) })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (!res.ok || !data.ok) {
              throw new Error((data && data.error) || 'Something went wrong — please try again.');
            }
            return data;
          });
        })
        .then(function (data) {
          clearDraft();
          var ss = storage('sessionStorage');
          if (ss) {
            try {
              ss.setItem('sm-enquiry-name', form.name.value.trim().split(/\s+/)[0] || '');
              if (data.enquiryId) ss.setItem('sm-enquiry-ref', data.enquiryId);
            } catch (err) { /* private mode — the page copes without a name */ }
          }
          window.location.href = 'enquiry-received.html';
        })
        .catch(function (err) {
          setLoading(false);
          setStatus(err.message || 'Something went wrong — please try again, or email studio@scottymassa.com directly.', true);
        });
    });

    prefill();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('partials:loaded', init);
})();
