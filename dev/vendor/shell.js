// ecosystem/shell/shell.js v1.0.0
// Shared tool frame for the Engineered by the Numbers tools (spec 00 §2–8):
// header, footer, help, themes, small-screen notice, predict-first, show the
// working, field validation, save/load, PNG export, printable report, the
// prediction log store, settings and Clear my data. A tool supplies its
// inputs, calculation, drawing and readouts through the config passed to
// Shell.create(). Needs PredictionLog and Schemas defined first.
const Shell = (function () {
  'use strict';
  const req = (a, b) => { try { return require(a); } catch (e) { return require(b); } };
  const PL = typeof PredictionLog !== 'undefined' ? PredictionLog : req('./prediction-log.js', '../prediction-log.js');
  const SC = typeof Schemas !== 'undefined' ? Schemas : req('./schemas.js', '../schemas.js');

  /* =================================================================
     PURE HELPERS (unit-tested in Node)
     ================================================================= */
  const isNum = v => typeof v === 'number' && isFinite(v);
  const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

  // Significant-figure display (00 §3). Keeps trailing zeros ("4.10"), groups
  // thousands, uses a true minus sign, never prints NaN or Infinity.
  function fmtSig(v, sig) {
    sig = sig || 3;
    if (!isNum(v)) return '—';
    if (v === 0 || Object.is(v, -0)) return '0';
    const a = Math.abs(v);
    let s;
    if (a >= 1e7 || a < 1e-4) {
      const [m, e] = v.toExponential(sig - 1).split('e');
      s = m + ' × 10' + String(Number(e)).split('').map(c => SUP[c] || c).join('');
    } else {
      // Round first so 99.96 at 3 s.f. becomes 100 (not "100.0").
      const r = Number(v.toPrecision(sig));
      const digitsBefore = Math.floor(Math.log10(Math.abs(r))) + 1;
      const decimals = Math.max(0, sig - digitsBefore);
      s = Math.abs(r).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      if (r < 0) s = '-' + s;
    }
    return s.replace(/^-/, '−');
  }
  // Plain number for an input box: up to 6 significant figures, no grouping.
  function fmtInput(v) { return isNum(v) ? String(Number(v.toPrecision(6))) : ''; }
  function fmtPct(p, sig) {
    if (!isNum(p)) return 'not defined';
    return (p > 0 ? '+' : '') + fmtSig(p, sig) + '%';
  }

  // Accepts "1,000", "1 000", "−3", ".5". Returns NaN for anything else.
  function parseNumber(str) {
    if (typeof str === 'number') return str;
    const s = String(str == null ? '' : str).trim().replace(/[−–]/g, '-').replace(/(\d)[,\s](?=\d{3}(\D|$))/g, '$1');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
    return Number(s);
  }

  // Field validation (00 §8). spec: { name, unit, min, max, gt (exclusive lower bound),
  // integer, check(v) -> message|null }. Returns { value, error }.
  function validateNumber(raw, spec) {
    const name = spec.name || 'This value';
    const u = spec.unit ? ' ' + spec.unit : '';
    if (String(raw == null ? '' : raw).trim() === '') return { value: NaN, error: 'Enter a value for ' + lc(name) + '.' };
    const v = parseNumber(raw);
    if (!isNum(v)) return { value: NaN, error: name + ' must be a number.' };
    if (spec.integer && Math.round(v) !== v) return { value: v, error: name + ' must be a whole number.' };
    if (spec.gt !== undefined && !(v > spec.gt)) return { value: v, error: name + ' must be greater than ' + spec.gt + u + '.' };
    if (spec.min !== undefined && spec.max !== undefined && (v < spec.min || v > spec.max)) return { value: v, error: name + ' must be between ' + fmtBound(spec.min) + ' and ' + fmtBound(spec.max) + u + '.' };
    if (spec.min !== undefined && v < spec.min) return { value: v, error: name + ' must be at least ' + fmtBound(spec.min) + u + '.' };
    if (spec.max !== undefined && v > spec.max) return { value: v, error: name + ' must be at most ' + fmtBound(spec.max) + u + '.' };
    if (spec.check) { const m = spec.check(v); if (m) return { value: v, error: m }; }
    return { value: v, error: null };
  }
  const fmtBound = v => Math.abs(v) >= 10000 ? v.toLocaleString('en-US') : String(v);
  const lc = s => s.charAt(0).toLowerCase() + s.slice(1);

  // 00 §6: <name>_<tool>_<challenge or sandbox>_<YYYY-MM-DD>.<ext>
  function safePart(s) { return String(s || '').trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, ''); }
  function exportName(o) {
    const base = [safePart(o.student) || 'unnamed', safePart(o.tool), safePart(o.context) || 'sandbox', o.dateISO].join('_');
    return o.ext ? base + '.' + o.ext : base;
  }
  function localDateISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // 00 §4.5 default bands: within 1% "Match", within 5% "Close".
  function verdictFor(pct, tol) {
    tol = tol || { match: 1, close: 5 };
    if (!isNum(pct)) return null;
    const a = Math.abs(pct);
    return a <= tol.match ? 'match' : a <= tol.close ? 'close' : 'off';
  }
  function predictionMessage(pred, model, unit, sig, reason) {
    const u = unit ? ' ' + unit : '';
    if (!isNum(model)) return 'You predicted ' + fmtSig(pred, sig) + u + '. The model value is not defined' + (reason ? ': ' + reason : '') + '.';
    const pct = PL.pctDiff(pred, model);
    return 'You predicted ' + fmtSig(pred, sig) + u + '. The model gives ' + fmtSig(model, sig) + u +
      (pct === null ? ' (difference not defined: the model value is 0).' : ' (' + fmtPct(pct, sig) + ' difference).');
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const util = { fmtSig, fmtInput, fmtPct, parseNumber, validateNumber, exportName, safePart, localDateISO, verdictFor, predictionMessage, esc };

  /* =================================================================
     BROWSER FRAME
     ================================================================= */
  const FEEDBACK = 'billvanloo.tech+feedback@gmail.com';

  function store(prefix) {
    return {
      get(k, dflt) { try { const s = localStorage.getItem(prefix + k); return s == null ? dflt : JSON.parse(s); } catch (e) { return dflt; } },
      set(k, v) { try { localStorage.setItem(prefix + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } },
      del(k) { try { localStorage.removeItem(prefix + k); } catch (e) { } },
      clearAll() { try { Object.keys(localStorage).filter(k => k.indexOf(prefix) === 0).forEach(k => localStorage.removeItem(k)); } catch (e) { } },
    };
  }
  function h(tag, attrs, html) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) { if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) el.setAttribute(k, attrs[k] === true ? '' : attrs[k]); }
    if (html !== undefined) el.innerHTML = html;
    return el;
  }
  function download(filename, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = h('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { }
      ta.remove(); return ok;
    }
  }

  function create(cfg) {
    const S = store('ebtn:' + cfg.slug + ':');
    const G = store('ebtn-');                       // shared across tools on one site: name, theme
    const app = {
      cfg, util, PL, SC,
      state: null, el: {},
      settings: Object.assign({ sig: 3, team: '', classPeriod: '', predictFirst: false }, cfg.defaultSettings || {}, S.get('settings', {})),
      pf: { revealed: false, fields: {}, messages: [] },
      invalid: {}, fields: [], log: S.get('log', []),
      sessionStart: Date.now(), working: [],
    };

    /* ---------------- state ---------------- */
    const saved = S.get('state', null);
    app.state = cfg.defaultState();
    if (saved && saved.schemaVersion === cfg.schemaVersion && saved.state) {
      try { app.state = Object.assign(cfg.defaultState(), saved.state); } catch (e) { app.state = cfg.defaultState(); }
    }

    /* ---------------- skeleton ---------------- */
    const repoUrl = 'https://github.com/billvanloo/' + cfg.repo;
    const mail = kind => 'mailto:' + FEEDBACK + '?subject=' + encodeURIComponent('[' + cfg.repo + '] ' + kind);
    document.body.innerHTML = '';
    const header = h('header', { class: 'sh-header' },
      '<div class="titleblock"><span class="t1">' + esc(cfg.tool) + '</span><span class="t2">' + esc(cfg.subtitle || '') + '</span></div>' +
      '<div id="shModes"></div><div class="spacer"></div>' +
      '<div class="namewrap"><label for="shName">Name</label><input id="shName" maxlength="40" placeholder="Your name" autocomplete="name"></div>' +
      '<div class="hbtns">' +
      '<button id="shPredict" aria-pressed="false" title="Hide results until you enter and check a prediction">Predict first</button>' +
      '<button id="shPng" title="Download a PNG of the drawing">Export image</button>' +
      '<button id="shReport" title="Printable report (print to PDF)">Report</button>' +
      '<button id="shSave" title="Save your design as a file">Save</button>' +
      '<button id="shLoad" title="Open a saved design or an import file">Load</button>' +
      '<button id="shLog" title="Your prediction log">Log</button>' +
      '<button id="shSettings" aria-label="Settings" title="Settings">⚙</button>' +
      '<button id="shTheme" aria-pressed="false" title="Switch light or dark theme">theme</button>' +
      '<button id="shHelp" aria-label="Help" title="How to use this tool (?)">?</button>' +
      '</div><input type="file" id="shFile" accept=".json,.csv,application/json,text/csv" hidden>');
    const small = h('div', { id: 'shSmall', class: 'sh-small', role: 'note' },
      '<span>This tool needs a larger screen, at least 1024 px wide, for full use. The readouts still work here.</span><button type="button">Dismiss</button>');
    const main = h('main', { class: 'sh-main' },
      '<section id="shInputs" class="sh-col sh-inputs" aria-label="Inputs"></section>' +
      '<section id="shStage" class="sh-col sh-stage" aria-label="Drawing"></section>' +
      '<section id="shResults" class="sh-col sh-results" aria-label="Results">' +
      '<div id="shResultsBody"></div>' +
      '<div id="shPfBox" class="pfbox" hidden></div>' +
      '<details id="shWorking" class="working"><summary>Show the working</summary><div id="shWorkingBody"></div></details>' +
      '</section>');
    const footer = h('footer', { class: 'sh-footer' },
      '<span class="foot-by">Designed by <a href="https://billvanloo.com" target="_blank" rel="noopener"><strong>Bill Van Loo</strong></a></span>' +
      '<span class="foot-ai">Developed using Claude — please don\'t use this tool if you\'re uncomfortable using tools built with AI assistance.</span>' +
      '<span class="foot-spacer"></span>' +
      '<a href="' + mail('Bug report') + '">Report a bug</a>' +
      '<a href="' + mail('Feature request') + '">Request a feature</a>' +
      '<a href="https://ko-fi.com/billvanloo" target="_blank" rel="noopener">Support on Ko-fi</a>' +
      '<a href="' + repoUrl + '/blob/main/LICENSE" target="_blank" rel="noopener">MIT License</a>' +
      '<a href="' + repoUrl + '" target="_blank" rel="noopener">View source</a>');
    const live = h('div', { id: 'shLive', class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    const desc = h('div', { id: 'shDesc', class: 'sr-only', 'aria-live': 'polite' });
    const toastEl = h('div', { id: 'shToast', class: 'sh-toast', role: 'status', 'aria-live': 'polite' });
    const report = h('div', { id: 'sh-report' });
    [header, small, main, footer, live, desc, toastEl, report].forEach(e => document.body.appendChild(e));
    const $ = id => document.getElementById(id);
    app.el = { inputs: $('shInputs'), stage: $('shStage'), results: $('shResultsBody'), pf: $('shPfBox'), working: $('shWorkingBody'), workingBox: $('shWorking') };

    /* ---------------- dialogs ---------------- */
    function dialog(id, title) {
      const d = h('dialog', { id, class: 'sh-dlg', 'aria-labelledby': id + 'T' },
        '<div class="dlg-h"><h2 id="' + id + 'T">' + esc(title) + '</h2><button class="btn small" data-close>Close</button></div><div class="dlg-b"></div>');
      d.querySelector('[data-close]').addEventListener('click', () => d.close());
      d.addEventListener('click', e => { if (e.target === d) d.close(); });
      document.body.appendChild(d);
      return { dlg: d, body: d.querySelector('.dlg-b') };
    }
    const helpD = dialog('shHelpDlg', 'How to use the ' + cfg.tool);
    const logD = dialog('shLogDlg', 'Prediction log');
    const setD = dialog('shSettingsDlg', 'Settings');

    /* ---------------- toast, live regions ---------------- */
    let toastT = 0;
    app.toast = (msg, ms) => {
      toastEl.textContent = msg; toastEl.classList.add('on');
      clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), ms || 3500);
    };
    app.announce = msg => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); };
    let descT = 0, lastDesc = '';
    app.describe = text => {
      if (text === lastDesc) return;
      lastDesc = text; clearTimeout(descT);
      descT = setTimeout(() => { desc.textContent = text; }, 450);
    };

    /* ---------------- theme ---------------- */
    const curTheme = () => document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    function syncTheme() {
      const t = curTheme();
      $('shTheme').textContent = t === 'light' ? '☾ Dark' : '☀ Light';
      $('shTheme').setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
    }
    $('shTheme').addEventListener('click', () => {
      const next = curTheme() === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      G.set('theme', next);
      syncTheme(); render();
    });
    // Palette for drawings, read from the CSS tokens.
    const PAL_KEYS = ['paper', 'grid-minor', 'grid-major', 'ink', 'ink-soft', 'line', 'steel', 'steel-edge', 'dykem', 'dykem-soft', 'brass', 'brass-ink', 'pass', 'fail', 'warn', 'pos-fill', 'neg-fill', 'field', 'panel', 'badge-text'];
    app.pal = () => {
      const cs = getComputedStyle(document.documentElement), p = {};
      PAL_KEYS.forEach(k => { p[k.replace(/-(\w)/g, (m, c) => c.toUpperCase())] = cs.getPropertyValue('--' + k).trim(); });
      p.fontUi = cs.getPropertyValue('--font-ui').trim(); p.fontMono = cs.getPropertyValue('--font-mono').trim();
      return p;
    };
    // Exports and reports are always ink on paper (00 §2).
    app.withLight = fn => {
      const root = document.documentElement, prev = root.getAttribute('data-theme');
      root.setAttribute('data-theme', 'light');
      try { return fn(); } finally { root.setAttribute('data-theme', prev || 'light'); }
    };

    /* ---------------- formatting ---------------- */
    app.fmt = v => fmtSig(v, app.settings.sig);
    app.fmtU = (v, unit) => isNum(v) ? fmtSig(v, app.settings.sig) + (unit ? ' ' + unit : '') : '—';

    /* ---------------- name ---------------- */
    const nameEl = $('shName');
    nameEl.value = G.get('name', '') || '';
    nameEl.addEventListener('input', () => G.set('name', nameEl.value));
    app.student = () => nameEl.value.trim();

    /* ---------------- small screen ---------------- */
    if (G.get('smallDismissed', false)) small.hidden = true;
    small.querySelector('button').addEventListener('click', () => { small.hidden = true; G.set('smallDismissed', true); });

    /* ---------------- modes ---------------- */
    if (cfg.modes) {
      const box = $('shModes');
      box.className = 'modes'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', cfg.modes.label || 'Mode');
      cfg.modes.options.forEach(o => {
        const b = h('button', { type: 'button', 'data-mode': o.id, 'aria-pressed': 'false' }, esc(o.label));
        b.addEventListener('click', () => { cfg.modes.set(app, o.id); app.changed(); });
        box.appendChild(b);
      });
    }
    function syncModes() {
      if (!cfg.modes) return;
      const cur = cfg.modes.get(app);
      document.querySelectorAll('#shModes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === cur ? 'true' : 'false'));
    }

    /* =================================================================
       FIELDS
       ================================================================= */
    // Numeric input row. o: { id, label, unit, name, get(app), set(app, v), min, max, gt, integer,
    // check(v, app), step, help, parent }
    app.numField = (parent, o) => {
      const row = h('div', { class: 'fld' });
      const errId = o.id + 'Err';
      row.innerHTML = '<label for="' + o.id + '">' + o.label + '</label>' +
        '<span class="ctl"><input type="text" inputmode="decimal" id="' + o.id + '" aria-describedby="' + errId + '" autocomplete="off">' +
        (o.unit ? '<span class="unit">' + esc(o.unit) + '</span>' : '') + '</span>' +
        '<div class="err" id="' + errId + '" role="alert"></div>';
      const input = row.querySelector('input'), err = row.querySelector('.err');
      const spec = () => ({ name: o.name || o.label.replace(/<[^>]+>/g, ''), unit: o.unit, min: typeof o.min === 'function' ? o.min(app) : o.min, max: typeof o.max === 'function' ? o.max(app) : o.max, gt: o.gt, integer: o.integer, check: o.check ? v => o.check(v, app) : null });
      function commit() {
        const r = validateNumber(input.value, spec());
        if (r.error) {
          err.textContent = r.error; input.setAttribute('aria-invalid', 'true'); app.invalid[o.id] = r.error;
        } else {
          err.textContent = ''; input.removeAttribute('aria-invalid'); delete app.invalid[o.id];
          o.set(app, r.value);
        }
        app.changed();
      }
      input.addEventListener('input', commit);
      input.addEventListener('keydown', e => {
        if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && o.step) {
          e.preventDefault();
          const cur = parseNumber(input.value);
          const base = isNum(cur) ? cur : o.get(app);
          const d = (e.key === 'ArrowUp' ? 1 : -1) * o.step * (e.shiftKey ? 10 : 1);
          input.value = fmtInput(Number((base + d).toFixed(10)));
          commit();
        }
      });
      const field = {
        o, input, err, row,
        sync() {
          if (document.activeElement === input || app.invalid[o.id]) return;
          const v = o.get(app); const s = fmtInput(v);
          if (input.value !== s && parseNumber(input.value) !== v) input.value = s;
          else if (input.value === '' && s !== '') input.value = s;
        },
        revalidate() { if (input.value !== '') { const r = validateNumber(input.value, spec()); if (r.error && !app.invalid[o.id]) { err.textContent = r.error; input.setAttribute('aria-invalid', 'true'); app.invalid[o.id] = r.error; } else if (!r.error && app.invalid[o.id]) { err.textContent = ''; input.removeAttribute('aria-invalid'); delete app.invalid[o.id]; o.set(app, r.value); } } },
        reset() { err.textContent = ''; input.removeAttribute('aria-invalid'); delete app.invalid[o.id]; input.value = fmtInput(o.get(app)); },
      };
      input.value = fmtInput(o.get(app));
      app.fields.push(field);
      parent.appendChild(row);
      return field;
    };
    // Select row. o: { id, label, options: [[value, label]] or fn(app), get, set }
    app.selectField = (parent, o) => {
      const row = h('div', { class: 'fld' });
      row.innerHTML = '<label for="' + o.id + '">' + o.label + '</label><span class="ctl"><select id="' + o.id + '"></select></span>';
      const sel = row.querySelector('select');
      const fill = () => {
        const opts = typeof o.options === 'function' ? o.options(app) : o.options;
        const html = opts.map(([v, l]) => '<option value="' + esc(v) + '">' + esc(l) + '</option>').join('');
        if (sel.innerHTML !== html) sel.innerHTML = html;
        sel.value = String(o.get(app));
      };
      fill();
      sel.addEventListener('change', () => { o.set(app, sel.value); app.changed(); });
      const field = { o, input: sel, row, sync: fill, reset: fill, revalidate() { } };
      app.fields.push(field);
      parent.appendChild(row);
      return field;
    };
    app.checkField = (parent, o) => {
      const row = h('label', { class: 'chk' }, '<input type="checkbox" id="' + o.id + '"> ' + o.label);
      const cb = row.querySelector('input');
      cb.checked = !!o.get(app);
      cb.addEventListener('change', () => { o.set(app, cb.checked); app.changed(); });
      const field = { o, input: cb, row, sync() { cb.checked = !!o.get(app); }, reset() { cb.checked = !!o.get(app); }, revalidate() { } };
      app.fields.push(field);
      parent.appendChild(row);
      return field;
    };
    app.removeFields = container => { app.fields = app.fields.filter(f => { if (container.contains(f.row)) { delete app.invalid[f.o.id]; return false; } return true; }); };
    app.hasInvalid = () => Object.keys(app.invalid).length > 0;
    app.invalidReason = () => 'not defined: fix the highlighted input' + (Object.keys(app.invalid).length > 1 ? 's' : '');

    /* =================================================================
       PREDICT FIRST (00 §4)
       ================================================================= */
    const pfOn = () => !!app.settings.predictFirst;
    app.masked = () => pfOn() && !app.pf.revealed;
    // Wrap a readout value: shows a blank box while hidden.
    app.show = (text) => app.masked() ? '<span class="masked" aria-label="hidden until you check your prediction">?</span>' : text;
    function clearPrediction() { app.pf.revealed = false; app.pf.fields = {}; app.pf.messages = []; }
    $('shPredict').addEventListener('click', () => {
      app.settings.predictFirst = !pfOn(); saveSettings(); clearPrediction(); render();
      app.announce(pfOn() ? 'Predict first is on. Results are hidden until you check a prediction.' : 'Predict first is off.');
    });
    function problemId() { return cfg.problemId ? cfg.problemId(app) : PL.sandboxProblemId(snapshot().values); }
    function snapshot() { return cfg.inputsSnapshot ? cfg.inputsSnapshot(app) : { values: {}, units: {} }; }
    function renderPf() {
      const box = app.el.pf;
      $('shPredict').setAttribute('aria-pressed', pfOn() ? 'true' : 'false');
      if (!pfOn()) { box.hidden = true; return; }
      box.hidden = false;
      const targets = cfg.predictTargets(app);
      const blocked = app.hasInvalid();
      let html = '<h3>Predict first</h3>';
      if (!app.pf.revealed) {
        html += '<p class="note">Enter your predictions, then press Check. Results stay hidden until you do.</p>';
        targets.forEach(t => {
          const id = 'shPf_' + t.key;
          html += '<div class="pfrow"><label for="' + id + '">' + t.label + '</label><input type="text" inputmode="decimal" id="' + id + '" data-key="' + esc(t.key) + '" value="' + esc(app.pf.fields[t.key] || '') + '" autocomplete="off"><span class="unit">' + esc(t.unit || '') + '</span></div>';
        });
        html += '<div class="btnrow"><button class="btn primary" id="shCheck" type="button"' + (blocked ? ' disabled' : '') + '>Check</button></div>';
        if (blocked) html += '<p class="note warn">Fix the highlighted input before checking.</p>';
      } else {
        app.pf.messages.forEach(m => { html += '<div class="pfmsg ' + (m.verdict || '') + '">' + m.html + '</div>'; });
        html += '<div class="btnrow"><button class="btn" id="shAgain" type="button">Predict again</button></div>';
      }
      box.innerHTML = html;
      box.querySelectorAll('input[data-key]').forEach(inp => inp.addEventListener('input', () => { app.pf.fields[inp.dataset.key] = inp.value; }));
      box.querySelectorAll('input[data-key]').forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') check(); }));
      const c = $('shCheck'); if (c) c.addEventListener('click', check);
      const a = $('shAgain'); if (a) a.addEventListener('click', () => { clearPrediction(); render(); const f = box.querySelector('input'); if (f) f.focus(); });
    }
    function check() {
      if (app.hasInvalid()) return;
      const targets = cfg.predictTargets(app);
      const student = app.student() || 'unnamed';
      const pid = problemId(), snap = snapshot();
      const msgs = [], recs = [];
      for (const t of targets) {
        const raw = app.pf.fields[t.key];
        if (raw === undefined || String(raw).trim() === '') continue;
        const p = parseNumber(raw);
        if (!isNum(p)) { app.toast(t.label.replace(/<[^>]+>/g, '') + ': enter a number.'); document.getElementById('shPf_' + t.key).focus(); return; }
        const model = isNum(t.model) ? t.model : null;
        const rec = PL.makeRecord({
          tool: cfg.tool, toolVersion: cfg.version, student, team: app.settings.team, classPeriod: app.settings.classPeriod,
          problemId: pid, quantity: t.quantity || t.key, unit: t.unit || '', predicted: p, model,
          attempt: PL.nextAttempt(app.log, student, pid, t.quantity || t.key), inputs: snap,
        });
        recs.push(rec);
        const v = verdictFor(rec.pctPredVsModel, cfg.tolerance);
        const tag = v === 'match' ? ' <span class="pftag match">Match</span>' : v === 'close' ? ' <span class="pftag close">Close</span>' : '';
        msgs.push({ verdict: v === 'match' ? 'match' : v === 'close' ? 'close' : '', html: '<b>' + t.label + '</b>' + tag + '<br>' + esc(predictionMessage(p, model, t.unit, app.settings.sig, t.reason)) });
      }
      if (!recs.length) msgs.push({ html: 'No prediction was entered, so nothing was logged. The results are shown below.' });
      app.log = app.log.concat(recs); saveLog();
      app.pf.revealed = true; app.pf.messages = msgs;
      render();
      app.announce(msgs.map(m => m.html.replace(/<[^>]+>/g, ' ')).join(' '));
      const again = $('shAgain'); if (again) again.focus();
    }
    app.check = check;

    /* =================================================================
       SHOW THE WORKING (00 §5)
       ================================================================= */
    app.setWorking = steps => { app.working = steps || []; };
    function renderWorking() {
      const body = app.el.working;
      if (app.masked()) { body.innerHTML = '<p class="note" style="padding:8px 10px">Hidden until you check your prediction.</p>'; return; }
      if (app.hasInvalid()) { body.innerHTML = '<p class="note" style="padding:8px 10px">' + esc(app.invalidReason()) + '.</p>'; return; }
      if (!app.working.length) { body.innerHTML = '<p class="note" style="padding:8px 10px">Nothing to show yet.</p>'; return; }
      body.innerHTML = '<ol class="wk">' + app.working.map(s =>
        '<li><div class="wt">' + s.title + '</div>' +
        (s.formula ? '<div class="wf">' + s.formula + '</div>' : '') +
        (s.sub ? '<div class="ws">= ' + s.sub + '</div>' : '') +
        (s.result ? '<div class="wr">= ' + s.result + '</div>' : '') +
        (s.note ? '<div class="note">' + s.note + '</div>' : '') +
        (s.source ? '<div class="wsrc">Source: ' + esc(s.source) + '</div>' : '') + '</li>').join('') + '</ol>';
    }

    /* =================================================================
       RENDER CYCLE
       ================================================================= */
    let saveT = 0;
    function saveState() { clearTimeout(saveT); saveT = setTimeout(() => S.set('state', { schemaVersion: cfg.schemaVersion, state: cfg.getState ? cfg.getState(app) : app.state }), 250); }
    function saveSettings() { S.set('settings', app.settings); }
    function saveLog() { S.set('log', app.log); }
    function render() {
      syncModes();
      app.fields.forEach(f => f.sync());
      cfg.render(app);
      renderPf();
      renderWorking();
    }
    app.render = render;
    // Call after any input change (00 §4.4: hides results and clears predictions).
    app.changed = (opts) => {
      if (!(opts && opts.keepPrediction) && pfOn()) clearPrediction();
      saveState(); render();
    };
    app.refreshFields = () => { app.fields.forEach(f => f.reset()); };

    /* =================================================================
       SAVE / LOAD / IMPORT (00 §6)
       ================================================================= */
    function context() { return cfg.context ? cfg.context(app) : 'sandbox'; }
    app.fileName = ext => exportName({ student: app.student(), tool: cfg.slug, context: context(), dateISO: localDateISO(), ext });
    $('shSave').addEventListener('click', () => {
      const f = SC.makeDesignFile({ tool: cfg.tool, toolVersion: cfg.version, schemaVersion: cfg.schemaVersion }, cfg.getState ? cfg.getState(app) : app.state);
      f.student = app.student();
      download(app.fileName('json'), JSON.stringify(f, null, 2), 'application/json');
      app.toast('Saved ' + app.fileName('json'));
    });
    $('shLoad').addEventListener('click', () => app.openFile());
    app.openFile = () => { $('shFile').value = ''; $('shFile').click(); };
    $('shFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) readFile(f); });
    document.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    document.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); readFile(e.dataTransfer.files[0]); } });
    function readFile(file) {
      const r = new FileReader();
      r.onload = () => app.loadText(String(r.result), file.name);
      r.onerror = () => app.toast('That file could not be read.', 6000);
      r.readAsText(file);
    }
    app.loadText = (text, name) => {
      try {
        const kind = /\.csv$/i.test(name || '') ? 'prediction-log' : SC.kindOf(text);
        if (kind === 'design') {
          const res = SC.readDesignFile(text, { tool: cfg.tool, schemaVersion: cfg.schemaVersion, migrate: cfg.migrate });
          app.state = Object.assign(cfg.defaultState(), res.value.state);
          if (cfg.afterLoad) cfg.afterLoad(app);
          app.invalid = {};
          clearPrediction(); app.refreshFields(); saveState(); render();
          app.toast(res.warnings.length ? res.warnings.join(' ') : 'Loaded ' + (name || 'design') + '.', res.warnings.length ? 8000 : 3500);
          return { ok: true, warnings: res.warnings };
        }
        if (kind === 'prediction-log') {
          const res = PL.parseFile(name || 'log.json', text);
          const d = PL.dedupe(app.log.concat(res.records));
          const added = d.records.length - app.log.length;
          app.log = d.records; saveLog();
          app.toast('Added ' + added + ' prediction record' + (added === 1 ? '' : 's') + ' to your log.' + (res.warnings.length ? ' Note: ' + res.warnings.join(' ') : ''), 6000);
          return { ok: true };
        }
        if (kind && cfg.imports && cfg.imports[kind]) { cfg.imports[kind](app, text, name); return { ok: true }; }
        throw new Error(kind ? 'The ' + cfg.tool + ' cannot open a ' + kind + ' file.' : 'This file is not a design, import or prediction log this tool can read.');
      } catch (err) {
        app.toast(err.message, 8000);
        return { ok: false, error: err.message };
      }
    };
    app.download = download;

    /* =================================================================
       EXPORT IMAGE (00 §6): 2× PNG, ink on paper, caption strip
       ================================================================= */
    function drawingForExport() { return app.withLight(() => cfg.drawing(app, { export: true })); }
    function captionText() {
      return 'Name: ' + (app.student() || 'unnamed') + '   ·   ' + cfg.tool + '   ·   ' + (cfg.contextLabel ? cfg.contextLabel(app) : 'Sandbox') + '   ·   ' + localDateISO();
    }
    app.exportImage = () => new Promise((resolve, reject) => {
      const d = drawingForExport();
      const img = new Image();
      img.onload = () => {
        try {
          const scale = 2, capH = 40, W = d.width, H = d.height + capH;
          const c = document.createElement('canvas'); c.width = W * scale; c.height = H * scale;
          const x = c.getContext('2d'); x.scale(scale, scale);
          x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);
          x.drawImage(img, 0, 0, d.width, d.height);
          x.strokeStyle = '#23272C'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, d.height + 0.75); x.lineTo(W, d.height + 0.75); x.stroke();
          x.fillStyle = '#23272C'; x.font = '600 13px "Avenir Next","Segoe UI",sans-serif'; x.textBaseline = 'middle';
          x.fillText(captionText(), 12, d.height + capH / 2);
          c.toBlob(blob => { download(app.fileName('png'), blob); resolve({ width: c.width, height: c.height }); }, 'image/png');
        } catch (e) { app.toast('The image could not be exported in this browser.', 6000); reject(e); }
      };
      img.onerror = () => { app.toast('The image could not be exported in this browser.', 6000); reject(new Error('svg load failed')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(d.svg);
    });
    $('shPng').addEventListener('click', () => { app.exportImage().catch(() => { }); });

    /* =================================================================
       REPORT (00 §6): printable page
       ================================================================= */
    app.buildReport = () => {
      const d = drawingForExport();
      const r = cfg.report(app);
      const rows = list => list.map(([k, v]) => '<tr><th style="width:45%">' + k + '</th><td class="mono">' + v + '</td></tr>').join('');
      const session = app.log.filter(x => Date.parse(x.timestamp) >= app.sessionStart - 1000);
      const wk = app.masked() ? '<p>Hidden until the prediction is checked.</p>' : app.working.length ? '<table><tr class="hd"><th>#</th><th>Step</th><th>Formula</th><th>With numbers</th><th>Result</th><th>Source</th></tr>' +
        app.working.map((s, i) => '<tr><td>' + (i + 1) + '</td><td>' + s.title + '</td><td class="mono">' + (s.formula || '') + '</td><td class="mono">' + (s.sub || '') + '</td><td class="mono">' + (s.result || '') + '</td><td>' + esc(s.source || '') + '</td></tr>').join('') + '</table>' : '<p>Nothing to show.</p>';
      const hist = session.length ? '<table><tr class="hd"><th>Time</th><th>Quantity</th><th>Predicted</th><th>Model</th><th>Difference</th><th>Attempt</th></tr>' +
        session.map(x => '<tr><td>' + esc(x.timestamp.slice(11, 19)) + '</td><td>' + esc(x.quantity) + '</td><td class="mono">' + fmtSig(x.predicted, app.settings.sig) + ' ' + esc(x.unit) + '</td><td class="mono">' + (x.model === null ? 'not defined' : fmtSig(x.model, app.settings.sig) + ' ' + esc(x.unit)) + '</td><td class="mono">' + fmtPct(x.pctPredVsModel, app.settings.sig) + '</td><td>' + x.attempt + '</td></tr>').join('') + '</table>' : '<p>No predictions checked this session.</p>';
      const sources = (cfg.help && cfg.help.sources || []).map(s => '<li>' + esc(s.title) + (s.url ? ': ' + esc(s.url) : '') + '</li>').join('');
      report.innerHTML = '<div class="rb"><h1>' + esc(cfg.tool) + ' — Report</h1><div class="sub">' + esc(cfg.subtitle || '') + '</div>' +
        '<table><tr class="hd"><th>Name</th><th>Date</th><th>Mode</th><th>Tool version</th></tr><tr><td>' + esc(app.student() || 'unnamed') + '</td><td>' + localDateISO() + '</td><td>' + esc(cfg.contextLabel ? cfg.contextLabel(app) : 'Sandbox') + '</td><td>' + esc(cfg.version) + '</td></tr></table>' +
        '<div class="fig">' + d.svg + '</div>' +
        '<h2>Inputs</h2><table>' + rows(r.inputs) + '</table>' +
        '<h2>Results</h2><table>' + rows(r.outputs) + '</table>' +
        (r.notes && r.notes.length ? '<h2>Notes</h2><ul>' + r.notes.map(n => '<li>' + n + '</li>').join('') + '</ul>' : '') +
        '<h2>Show the working</h2>' + wk +
        '<h2>Prediction history (this session)</h2>' + hist +
        '<h2>Sources</h2><ol>' + sources + '</ol>' +
        '<div class="sig"><span>Student signature</span><span>Teacher check</span></div></div>';
      return report;
    };
    $('shReport').addEventListener('click', () => {
      app.buildReport();
      const prev = document.title;
      document.title = app.fileName('');
      document.title = document.title.replace(/\.$/, '');
      const restore = () => { document.title = prev; window.removeEventListener('afterprint', restore); };
      window.addEventListener('afterprint', restore);
      window.print();
      setTimeout(restore, 1500);
    });

    /* =================================================================
       PREDICTION LOG DIALOG (07 §3.3)
       ================================================================= */
    function renderLog() {
      const b = logD.body, sig = app.settings.sig;
      const recs = app.log.map((r, i) => ({ r, i })).reverse();
      b.innerHTML = '<p>Every Check in predict-first mode adds a row here. You can add a measured lab value and a note to any row. Records stay in this browser until you clear them in Settings.</p>' +
        '<div class="btnrow"><button class="btn" id="shLogJson">Export JSON</button><button class="btn" id="shLogCsv">Export CSV</button><button class="btn" id="shLogCopy">Copy last row</button></div>' +
        (recs.length ? '<div style="overflow-x:auto"><table><thead><tr><th>Time</th><th>Problem</th><th>Quantity</th><th>Predicted</th><th>Model</th><th>Diff.</th><th>Try</th><th>Measured</th><th>Note</th></tr></thead><tbody>' +
          recs.map(({ r, i }) => '<tr><td>' + esc(r.timestamp.slice(5, 16).replace('T', ' ')) + '</td><td>' + esc(r.problemId) + '</td><td>' + esc(r.quantity) + '</td><td>' + fmtSig(r.predicted, sig) + ' ' + esc(r.unit) + '</td><td>' + (r.model === null ? 'not defined' : fmtSig(r.model, sig)) + '</td><td>' + fmtPct(r.pctPredVsModel, sig) + '</td><td>' + r.attempt + '</td>' +
            '<td><input data-i="' + i + '" data-f="measured" inputmode="decimal" aria-label="Measured value for ' + esc(r.quantity) + '" value="' + (r.measured === null ? '' : r.measured) + '"></td>' +
            '<td><input data-i="' + i + '" data-f="note" aria-label="Note for ' + esc(r.quantity) + '" maxlength="200" value="' + esc(r.note) + '"></td></tr>').join('') + '</tbody></table></div>'
          : '<p class="note">No predictions yet. Turn on Predict first, enter a prediction and press Check.</p>');
      b.querySelectorAll('input[data-i]').forEach(inp => inp.addEventListener('change', () => {
        const i = +inp.dataset.i, f = inp.dataset.f;
        if (f === 'measured') { const v = inp.value.trim() === '' ? null : parseNumber(inp.value); if (v !== null && !isNum(v)) { app.toast('Measured value must be a number.'); return; } app.log[i] = PL.annotate(app.log[i], { measured: v }); }
        else app.log[i] = PL.annotate(app.log[i], { note: inp.value });
        saveLog(); renderLog();
      }));
      const logName = ext => exportName({ student: app.student(), tool: cfg.slug, context: 'prediction-log', dateISO: localDateISO(), ext });
      $('shLogJson').addEventListener('click', () => download(logName('json'), JSON.stringify(PL.toJSON(app.log), null, 2), 'application/json'));
      $('shLogCsv').addEventListener('click', () => download(logName('csv'), PL.toCSV(app.log), 'text/csv;charset=utf-8'));
      $('shLogCopy').addEventListener('click', async () => {
        if (!app.log.length) { app.toast('The log is empty.'); return; }
        const ok = await copyText(PL.toTSVRow(app.log[app.log.length - 1]));
        app.toast(ok ? 'Copied the last row. Paste it into your class spreadsheet.' : 'Copy did not work in this browser. Use Export CSV instead.');
      });
    }
    $('shLog').addEventListener('click', () => { renderLog(); logD.dlg.showModal(); });

    /* =================================================================
       SETTINGS, CLEAR MY DATA
       ================================================================= */
    function renderSettings() {
      const b = setD.body;
      b.innerHTML = '<h3>Numbers</h3><div class="fld"><label for="shSig">Significant figures shown</label><span class="ctl"><select id="shSig"><option value="3">3</option><option value="4">4</option></select></span></div>' +
        '<p class="note">Calculations are never rounded; this only changes the display.</p>' +
        '<h3>Your class</h3><div class="fld"><label for="shTeam">Team (optional)</label><span class="ctl"><input type="text" id="shTeam" maxlength="40" style="text-align:left"></span></div>' +
        '<div class="fld"><label for="shPeriod">Class period (optional)</label><span class="ctl"><input type="text" id="shPeriod" maxlength="20" style="text-align:left"></span></div>' +
        '<div id="shSetExtra"></div>' +
        '<h3>Your data</h3><p>Your name, current design, predictions and settings are kept in this browser only.</p>' +
        '<div class="btnrow"><button class="btn danger" id="shClear">Clear my data</button></div><p class="note" id="shClearMsg"></p>';
      $('shSig').value = String(app.settings.sig);
      $('shSig').addEventListener('change', () => { app.settings.sig = +$('shSig').value; saveSettings(); render(); });
      $('shTeam').value = app.settings.team; $('shPeriod').value = app.settings.classPeriod;
      $('shTeam').addEventListener('input', () => { app.settings.team = $('shTeam').value; saveSettings(); });
      $('shPeriod').addEventListener('input', () => { app.settings.classPeriod = $('shPeriod').value; saveSettings(); });
      if (cfg.settingsExtra) cfg.settingsExtra(app, $('shSetExtra'));
      let armed = false;
      $('shClear').addEventListener('click', () => {
        if (!armed) { armed = true; $('shClear').textContent = 'Click again to clear everything'; $('shClearMsg').textContent = 'This removes your name, design, prediction log and settings from this browser.'; return; }
        app.clearData(); setD.dlg.close();
      });
    }
    app.clearData = () => {
      clearTimeout(saveT);                      // a pending autosave must not write the old design back
      S.clearAll(); G.del('name');
      app.settings = Object.assign({ sig: 3, team: '', classPeriod: '', predictFirst: false }, cfg.defaultSettings || {});
      app.log = []; app.state = cfg.defaultState(); nameEl.value = ''; app.invalid = {};
      if (cfg.afterLoad) cfg.afterLoad(app);
      clearPrediction(); app.refreshFields(); render();
      app.toast('Your data was cleared from this browser.');
    };
    app.saveSettings = saveSettings;
    $('shSettings').addEventListener('click', () => { renderSettings(); setD.dlg.showModal(); });

    /* =================================================================
       HELP (00 §2)
       ================================================================= */
    function renderHelp() {
      const hp = cfg.help || {};
      const keys = (hp.keys || []).concat([['?', 'Open this help'], ['Esc', 'Close a dialog'], ['↑ / ↓ in a number box', 'Step the value (hold Shift for ×10)'], ['Enter in a prediction box', 'Check']]);
      helpD.body.innerHTML = (hp.html || '') +
        '<h3>Predict first</h3><p>Turn on <strong>Predict first</strong> in the header. The results you are asked to predict are hidden. Type a prediction for each one and press <strong>Check</strong>. The tool shows how far off you were and saves the attempt to your prediction log (<strong>Log</strong> button). Change any input and the results hide again. Within 1% counts as a match and within 5% as close. Open <strong>Show the working</strong> to see each step of the calculation and find where a prediction went wrong.</p>' +
        '<h3>Numbers and units</h3><p>Results show 3 significant figures (4 in Settings). The tool never rounds in the middle of a calculation. ' + (hp.units || '') + '</p>' +
        '<h3>Saving your work</h3><p>Your name, design and predictions are kept in this browser. <strong>Save</strong> downloads a design file, and <strong>Load</strong> opens one (you can also drop a file onto the page). <strong>Export image</strong> downloads a picture of the drawing, and <strong>Report</strong> opens a printable page: choose "Save as PDF" in the print window. Exports always print ink on paper, whichever theme is on screen.</p>' +
        '<h3>Keyboard</h3><ul>' + keys.map(([k, a]) => '<li><kbd>' + esc(k) + '</kbd> ' + esc(a) + '</li>').join('') + '</ul>' +
        '<p>Screen readers hear a description of the drawing whenever it changes. With your system\'s reduce motion setting on, animations stop but numbers stay live. Use a laptop, Chromebook or full-size tablet; phone screens are too small for the drawing.</p>' +
        '<h3>Sources</h3><ol>' + (hp.sources || []).map(s => '<li>' + esc(s.title) + (s.url ? ': <a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.url) + '</a>' : '') + '</li>').join('') + '</ol>' +
        '<div class="teacher"><h3 style="margin-top:0">Teacher notes</h3>' + (hp.teacher || '') +
        '<p>The prediction log exports as JSON or CSV in the shared Engineered by the Numbers format, so a class set can be merged in the Prediction Log Collector. Nothing is sent anywhere; all data stays in the student\'s browser.</p></div>' +
        '<p class="note">' + esc(cfg.tool) + ' version ' + esc(cfg.version) + '.</p>';
    }
    app.openHelp = () => { renderHelp(); helpD.dlg.showModal(); };
    $('shHelp').addEventListener('click', app.openHelp);
    document.addEventListener('keydown', e => {
      const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === '?' && !typing && !document.querySelector('dialog[open]')) { e.preventDefault(); app.openHelp(); }
    });

    /* ---------------- go ---------------- */
    syncTheme();
    if (cfg.afterLoad) cfg.afterLoad(app);
    if (cfg.build) cfg.build(app);
    app.fields.forEach(f => f.revalidate());
    render();
    if (typeof window !== 'undefined') window.__app = app;
    return app;
  }

  return { create, util, version: '1.0.0' };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Shell;
