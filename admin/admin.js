/* =========================================================
   Enquiry board.

   Every value rendered here came from a public form, so nothing is ever
   written with innerHTML — it is all textContent or createElement. This is
   the one page in the project where an escaping mistake would be exploitable
   by anyone who can reach booking.html.

   ES5, no framework, no external request.
   ========================================================= */
(function () {
  'use strict';

  var TOKEN_KEY = 'sm-admin-token';

  var COLUMNS = [
    { key: 'new', label: 'New' },
    { key: 'reviewing', label: 'Reviewing' },
    { key: 'qualified', label: 'Qualified' },
    { key: 'contacted', label: 'Contacted' },
    { key: 'consultation', label: 'Consultation' },
    { key: 'deposit', label: 'Deposit' },
    { key: 'booked', label: 'Booked' },
    { key: 'completed', label: 'Completed' },
    { key: 'lost', label: 'Lost' }
  ];

  // The brief's checklist. Each row is satisfied by any of its events.
  var CHECKLIST = [
    { label: 'Submitted', events: ['submitted'] },
    { label: 'Email delivered', events: ['email_delivered'] },
    { label: 'Email opened', events: ['email_opened'] },
    { label: 'Process link clicked', events: ['email_clicked'] }
  ];

  var el = {};
  var state = { token: '', enquiries: [], lastFocused: null, openRef: '' };

  function $(sel) { return document.querySelector(sel); }

  function text(tag, className, value) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined && value !== null && value !== '') node.textContent = String(value);
    return node;
  }

  function store() {
    try { return window.sessionStorage; } catch (e) { return null; }
  }

  function getToken() {
    var s = store();
    if (!s) return '';
    try { return s.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function setToken(value) {
    var s = store();
    if (!s) return;
    try { if (value) s.setItem(TOKEN_KEY, value); else s.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------
  // API
  // ---------------------------------------------------------------

  function api(path, options) {
    var opts = options || {};
    return fetch(path, {
      method: opts.method || 'GET',
      headers: (function () {
        var h = { Authorization: 'Bearer ' + state.token };
        if (opts.body) h['Content-Type'] = 'application/json';
        return h;
      })(),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      if (res.status === 401) {
        // A stale token is the common case — clear it and go back to the gate
        // rather than leaving the board in a half-loaded state.
        setToken('');
        state.token = '';
        showGate('That token was not accepted. Try again.');
        throw new Error('unauthorised');
      }
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || !data.ok) throw new Error((data && data.error) || 'Request failed.');
        return data;
      });
    });
  }

  // ---------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------

  function relative(iso) {
    if (!iso) return '';
    var then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    var mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.round(hrs / 24);
    if (days < 31) return days + 'd ago';
    return new Date(iso).toISOString().slice(0, 10);
  }

  function fullName(row) {
    return [row.first_name || '', row.last_name || ''].join(' ').trim() || '(no name)';
  }

  // ---------------------------------------------------------------
  // Board
  // ---------------------------------------------------------------

  function buildCard(row) {
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.setAttribute('data-ref', row.enquiry_ref || '');

    card.appendChild(text('strong', 'card__name', fullName(row)));
    if (row.project_type) card.appendChild(text('span', 'card__line', row.project_type));

    var where = [row.country, row.location].filter(Boolean).join(' · ');
    if (where) card.appendChild(text('span', 'card__line', where));
    if (row.preferred_timing) card.appendChild(text('span', 'card__line', row.preferred_timing));
    if (row.heard_from || row.utm_source) {
      card.appendChild(text('span', 'card__line', 'via ' + (row.utm_source || row.heard_from)));
    }

    var foot = text('span', 'card__foot');
    foot.appendChild(text('span', '', relative(row.created_at)));
    if (row.lead_score) foot.appendChild(text('span', 'card__score', row.lead_score + '/100'));
    card.appendChild(foot);

    card.addEventListener('click', function () { openPanel(row.enquiry_ref, card); });
    return card;
  }

  function renderBoard() {
    var board = el.board;
    board.textContent = '';

    COLUMNS.forEach(function (col) {
      var rows = state.enquiries.filter(function (r) { return (r.status || 'new') === col.key; });

      var section = text('section', 'col');
      var head = text('div', 'col__head');
      head.appendChild(text('span', 'col__name', col.label));
      head.appendChild(text('span', 'col__count', String(rows.length)));
      section.appendChild(head);

      if (!rows.length) {
        section.appendChild(text('p', 'col__empty', '—'));
      } else {
        rows.forEach(function (row) { section.appendChild(buildCard(row)); });
      }
      board.appendChild(section);
    });
  }

  // ---------------------------------------------------------------
  // Side panel (a drawer — the board stays usable behind it)
  // ---------------------------------------------------------------

  function kvRow(table, label, value) {
    if (!value) return;
    var tr = document.createElement('tr');
    tr.appendChild(text('td', '', label));
    tr.appendChild(text('td', '', value));
    table.appendChild(tr);
  }

  function renderPanel(data) {
    var row = data.enquiry || {};
    var events = data.events || [];
    var activity = data.emailActivity || [];
    var p = el.panel;
    p.textContent = '';

    var head = text('div', 'panel__head');
    var left = document.createElement('div');
    if (row.enquiry_ref) left.appendChild(text('p', 'panel__ref', row.enquiry_ref));
    left.appendChild(text('h2', 'panel__name', fullName(row)));
    left.appendChild(text('p', 'panel__sub', row.email || ''));
    head.appendChild(left);

    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.addEventListener('click', closePanel);
    head.appendChild(close);
    p.appendChild(head);

    // Status
    p.appendChild(text('h3', '', 'Status'));
    var select = document.createElement('select');
    COLUMNS.forEach(function (col) {
      var opt = document.createElement('option');
      opt.value = col.key;
      opt.textContent = col.label;
      if ((row.status || 'new') === col.key) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', function () {
      var value = select.value;
      select.disabled = true;
      api('/api/enquiries', { method: 'PATCH', body: { ref: row.enquiry_ref, status: value } })
        .then(function () { return load(); })
        .then(function () { select.disabled = false; })
        .catch(function () { select.disabled = false; });
    });
    p.appendChild(select);

    // Email activity checklist
    p.appendChild(text('h3', '', 'Email activity'));
    var seen = {};
    events.forEach(function (e) { seen[e.event] = true; });
    activity.forEach(function (a) {
      if (a.event_type) seen['email_' + String(a.event_type).replace('activity.', '')] = true;
    });

    var list = text('ul', 'check');
    CHECKLIST.forEach(function (item) {
      var done = item.events.some(function (name) { return seen[name]; });
      var li = text('li', done ? 'is-done' : 'is-pending');
      li.appendChild(text('span', 'check__mark', done ? '✓' : '○'));
      li.appendChild(text('span', '', item.label));
      list.appendChild(li);
    });
    var complete = !!row.submitted_at;
    var li = text('li', complete ? 'is-done' : 'is-pending');
    li.appendChild(text('span', 'check__mark', complete ? '✓' : '○'));
    li.appendChild(text('span', '', complete ? 'Application complete' : 'Application incomplete'));
    list.appendChild(li);
    p.appendChild(list);

    // The project
    p.appendChild(text('h3', '', 'Project'));
    var t1 = text('table', 'kv');
    kvRow(t1, 'Project', row.project_type);
    kvRow(t1, 'Scale', row.scale);
    kvRow(t1, 'Location', row.location);
    kvRow(t1, 'Placement', row.placement);
    kvRow(t1, 'Existing', row.existing_tattoos);
    kvRow(t1, 'Timing', row.preferred_timing);
    kvRow(t1, 'References', row.reference_count);
    p.appendChild(t1);

    if (row.idea) {
      p.appendChild(text('h3', '', 'The idea'));
      p.appendChild(text('div', 'prose-block', row.idea));
    }
    if (row.additional_info) {
      p.appendChild(text('h3', '', 'Additional'));
      p.appendChild(text('div', 'prose-block', row.additional_info));
    }

    // Who / where from
    p.appendChild(text('h3', '', 'Contact & source'));
    var t2 = text('table', 'kv');
    kvRow(t2, 'Email', row.email);
    kvRow(t2, 'Country', row.country);
    kvRow(t2, 'Instagram', row.instagram);
    kvRow(t2, 'Heard via', row.heard_from);
    kvRow(t2, 'Source', row.utm_source);
    kvRow(t2, 'Campaign', row.utm_campaign);
    kvRow(t2, 'Landing page', row.landing_page);
    kvRow(t2, 'Lead score', row.lead_score ? row.lead_score + '/100 · ' + (row.lead_label || '') : '');
    kvRow(t2, 'Segments', (row.segments || []).join(', '));
    p.appendChild(t2);

    // Timeline
    if (events.length) {
      p.appendChild(text('h3', '', 'Timeline'));
      var tl = text('ul', 'timeline');
      events.forEach(function (e) {
        var item = document.createElement('li');
        item.appendChild(text('span', '', String(e.event || '').replace(/_/g, ' ')));
        item.appendChild(text('span', 'timeline__when', relative(e.occurred_at)));
        tl.appendChild(item);
      });
      p.appendChild(tl);
    }
  }

  function openPanel(ref, origin) {
    if (!ref) return;
    state.lastFocused = origin || document.activeElement;
    state.openRef = ref;
    el.panel.classList.add('is-open');
    el.panel.textContent = '';
    el.panel.appendChild(text('p', 'status-msg', 'Loading…'));
    api('/api/enquiries?ref=' + encodeURIComponent(ref))
      .then(function (data) {
        if (state.openRef !== ref) return;   // another card was opened meanwhile
        renderPanel(data);
        var first = el.panel.querySelector('button, select');
        if (first) { try { first.focus(); } catch (e) { /* ignore */ } }
      })
      .catch(function (err) {
        if (err && err.message === 'unauthorised') return;
        el.panel.textContent = '';
        el.panel.appendChild(text('p', 'status-msg status-msg--error', err.message || 'Could not load that enquiry.'));
      });
  }

  function closePanel() {
    el.panel.classList.remove('is-open');
    state.openRef = '';
    if (state.lastFocused) { try { state.lastFocused.focus(); } catch (e) { /* ignore */ } }
  }

  // Focus stays inside the drawer while it is open, and Esc closes it.
  document.addEventListener('keydown', function (e) {
    if (!el.panel || !el.panel.classList.contains('is-open')) return;
    if (e.key === 'Escape') { closePanel(); return; }
    if (e.key !== 'Tab') return;
    var focusables = el.panel.querySelectorAll('button, select, a[href], input');
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // ---------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------

  function showGate(message) {
    el.gate.hidden = false;
    el.main.hidden = true;
    el.gateMsg.textContent = message || '';
    var input = $('#admin-token');
    if (input) { input.value = ''; try { input.focus(); } catch (e) { /* ignore */ } }
  }

  function showBoard() {
    el.gate.hidden = true;
    el.main.hidden = false;
  }

  function load() {
    return api('/api/enquiries?limit=300').then(function (data) {
      showBoard();
      if (data.storeConfigured === false) {
        el.board.textContent = '';
        el.notice.hidden = false;
        el.count.textContent = '';
        return;
      }
      el.notice.hidden = true;
      state.enquiries = data.enquiries || [];
      el.count.textContent = state.enquiries.length + ' enquiries';
      renderBoard();
    });
  }

  function init() {
    el.gate = $('#gate');
    el.gateMsg = $('#gate-msg');
    el.main = $('#board-main');
    el.board = $('#board');
    el.panel = $('#panel');
    el.notice = $('#store-notice');
    el.count = $('#count');

    $('#gate-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var value = $('#admin-token').value.trim();
      if (!value) return;
      state.token = value;
      setToken(value);
      load().catch(function (err) {
        if (err && err.message === 'unauthorised') return;
        el.gateMsg.textContent = err.message || 'Could not load the board.';
      });
    });

    $('#refresh').addEventListener('click', function () {
      load().catch(function () { /* surfaced by the gate or the panel */ });
    });

    $('#signout').addEventListener('click', function () {
      setToken('');
      state.token = '';
      state.enquiries = [];
      closePanel();
      showGate('Signed out.');
    });

    state.token = getToken();
    if (state.token) {
      load().catch(function (err) {
        if (err && err.message === 'unauthorised') return;
        showGate(err.message || 'Could not load the board.');
      });
    } else {
      showGate('');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
