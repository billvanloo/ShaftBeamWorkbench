// Shaft and Beam Workbench core (spec 01). Sits between the interface and the
// shared BeamCore model: converts the display-unit state (mm, N, N·m, MPa, GPa,
// rpm) to SI at the edges, finds torque from power and speed, keeps loads on the
// modeled length, builds the show-the-working steps and the drawing description,
// and places imported shaft loads. Pure functions, no DOM; tested in dev/test.js.
const ShaftTool = (function () {
  'use strict';
  const BC = typeof BeamCore !== 'undefined' ? BeamCore : require('./vendor/beam-core.js');
  const PI = Math.PI;
  const isNum = v => typeof v === 'number' && isFinite(v);

  const SOURCES = {
    statics: 'OpenStax College Physics 2e, 9.2',
    beam: 'Optimal Beam, simply supported beam',
    power: 'OpenStax University Physics Vol. 1, 10.8',
    shaft: 'Omni Calculator, shaft size',
    reuven: 'Reuven Engineering Tools, shaft design',
    vm: 'Steltech, combined torsion and bending',
    I: 'Engineering Hulk, column buckling (I = πd⁴/64)',
    kt: 'Fiveable, shaft design and analysis',
  };

  // Placeholder material presets (00 §9, QUESTIONS Q4). The teacher replaces these.
  const MATERIALS = [
    { id: 'steel', label: 'Placeholder steel', Sy: 400, E: 200 },
    { id: 'aluminum', label: 'Placeholder aluminum', Sy: 250, E: 69 },
    { id: 'brass', label: 'Placeholder brass', Sy: 200, E: 100 },
    { id: 'custom', label: 'Custom (my own values)', Sy: null, E: null },
  ];

  const MAX_LOADS = 6;

  function defaultState() {
    return {
      mode: 'shaft', L: 300, overhang: false, oL: 0, oR: 0,
      loads: [{ id: 1, label: 'Gear 1', P: 1000, a: 150 }],
      torqueEntry: 'power', T: 15.9, P: 500, N: 300, tFrom: 0, tTo: 150, tAuto: true,
      d: 20, material: 'steel', Sy: 400, E: 200, nTarget: 2, Kb: 1, Kt: 1,
      rule: 'tresca', extension: false, deflection: false, nextId: 2,
    };
  }

  // Validation specs for the numeric fields (00 §8). Shared with the interface.
  const FIELDS = {
    L: { name: 'Span', unit: 'mm', gt: 0, min: 20, max: 3000 },
    oL: { name: 'Left overhang', unit: 'mm', min: 0 },
    oR: { name: 'Right overhang', unit: 'mm', min: 0 },
    P: { name: 'Load', unit: 'N', min: -20000, max: 20000 },
    a: { name: 'Load position', unit: 'mm' },
    T: { name: 'Torque', unit: 'N·m', min: 0, max: 5000 },
    power: { name: 'Power', unit: 'W', min: 0, max: 100000 },
    N: { name: 'Speed', unit: 'rpm', gt: 0, min: 1, max: 20000 },
    station: { name: 'Station', unit: 'mm' },
    d: { name: 'Diameter', unit: 'mm', gt: 0, max: 500 },
    Sy: { name: 'Yield strength', unit: 'MPa', gt: 0, min: 1, max: 3000 },
    E: { name: 'Elastic modulus', unit: 'GPa', min: 0.1, max: 400 },
    nTarget: { name: 'Target safety factor', unit: '', min: 1, max: 10 },
    K: { name: 'Stress concentration factor', unit: '', min: 1, max: 5 },
  };

  const range = s => [s.overhang ? -s.oL : 0, s.L + (s.overhang ? s.oR : 0)];

  // Torque in N·m from the state; ω in rad/s when power and speed are used (§3.3).
  function torque(s) {
    if (s.mode === 'beam') return { T: 0, omega: null, from: 'none' };
    if (s.torqueEntry === 'power') { const omega = s.N * 2 * PI / 60; return { T: s.P / omega, omega, from: 'power' }; }
    return { T: s.T, omega: null, from: 'direct' };
  }

  function heaviestStation(s) {
    if (!s.loads.length) return s.L / 2;
    let best = s.loads[0];
    for (const l of s.loads) if (Math.abs(l.P) > Math.abs(best.P)) best = l;
    return best.a;
  }

  // Keep loads and torque stations on the modeled length after a span or overhang change.
  // Returns a list of plain-language notes about anything that moved.
  function clampToModel(s) {
    const [lo, hi] = range(s), notes = [];
    const clamp = v => Math.min(hi, Math.max(lo, v));
    for (const l of s.loads) {
      const c = clamp(l.a);
      if (c !== l.a) { notes.push(l.label + ' moved to ' + round(c) + ' mm to stay on the shaft.'); l.a = c; }
    }
    s.tFrom = clamp(s.tFrom); s.tTo = clamp(s.tTo);
    if (s.tAuto) s.tTo = heaviestStation(s);
    return notes;
  }
  const round = v => Math.round(v * 1000) / 1000;

  // Display-unit state -> BeamCore input (SI).
  function toSI(s) {
    const t = torque(s);
    const [lo, hi] = range(s);
    return {
      L: s.L / 1000, overhangLeft: -lo / 1000, overhangRight: (hi - s.L) / 1000,
      loads: s.loads.map(l => ({ P: l.P, a: l.a / 1000, label: l.label })),
      mode: s.mode, torque: s.mode === 'shaft' ? { T: t.T, from: s.tFrom / 1000, to: s.tTo / 1000 } : null,
      d: s.d / 1000, Sy: s.Sy * 1e6, E: s.deflection ? s.E * 1e9 : undefined,
      Kb: s.Kb, Kt: s.Kt, nTarget: s.nTarget, rule: s.rule === 'vonMises' ? 'vonMises' : 'tresca',
    };
  }

  // Everything the interface shows, in display units.
  function solve(s) {
    const t = torque(s);
    const si = toSI(s);
    const r = BC.analyze(si);
    const c = r.critical;
    const out = {
      state: s, t, r, range: range(s),
      RA: r.RA, RB: r.RB,
      Mmax: r.Mmax.M, MmaxAbs: Math.abs(r.Mmax.M), MmaxX: r.Mmax.x * 1000,
      T: r.torque,
      crit: c ? {
        x: c.x * 1000, M: c.M, T: c.T, sigma: c.sigma / 1e6, tau: c.tau / 1e6,
        tauMax: c.tauMax / 1e6, sigmaVM: c.sigmaVM / 1e6, n: c.n,
      } : null,
      n: r.n, nReason: r.nReason, pass: r.pass,
      dReq: r.dReq === null ? null : r.dReq * 1000, dReqX: r.dReqX === null ? null : r.dReqX * 1000,
      defl: r.deflection ? { max: r.deflection.max * 1000, x: r.deflection.x * 1000, I: r.deflection.I * 1e12, signed: r.deflection.maxSigned * 1000 } : null,
    };
    return out;
  }

  // Values at one station, in display units (for the station readout).
  function station(sol, xmm) {
    const s = sol.state, r = sol.r, x = xmm / 1000;
    const loads = s.loads.map(l => ({ P: l.P, a: l.a / 1000 }));
    const M = BC.momentAt(x, s.L / 1000, loads, r.R);
    const Vl = BC.shearAt(x, s.L / 1000, loads, r.R, 'left'), Vr = BC.shearAt(x, s.L / 1000, loads, r.R, 'right');
    const T = s.mode === 'shaft' ? BC.torqueAt(x, { T: sol.T, from: s.tFrom / 1000, to: s.tTo / 1000 }) : 0;
    const sec = BC.section({ M, T, d: s.d / 1000, Sy: s.Sy * 1e6, Kb: s.Kb, Kt: s.Kt, rule: s.rule });
    return { x: xmm, Vl, Vr, M, T, sigma: sec.sigma / 1e6, tau: sec.tau / 1e6, tauMax: sec.tauMax / 1e6, sigmaVM: sec.sigmaVM / 1e6, n: isFinite(sec.n) ? sec.n : null };
  }

  // Test hook for SB-4 and SB-5: M and T entered directly (N·m), d in mm, Sy in MPa.
  function sectionCheck(o) {
    const sec = BC.section({ M: o.M, T: o.T, d: o.d / 1000, Sy: o.Sy * 1e6, Kb: o.Kb, Kt: o.Kt, rule: o.rule, nTarget: o.n });
    return { sigma: sec.sigma / 1e6, tau: sec.tau / 1e6, tauMax: sec.tauMax / 1e6, sigmaVM: sec.sigmaVM / 1e6, n: sec.n, dReq: sec.dReq === null ? null : sec.dReq * 1000 };
  }

  // "Use this diameter" rounds up to the next 0.5 mm (§5.6).
  const roundUpHalf = d => Math.ceil(d * 2 - 1e-9) / 2;

  // Predict-first targets (§6): model values in display units.
  function targets(sol) {
    return [
      { key: 'RA', quantity: 'reaction R_A', label: 'Reaction R<sub>A</sub>', unit: 'N', model: sol.RA },
      { key: 'Mmax', quantity: 'max bending moment |M|max', label: '|M|<sub>max</sub>', unit: 'N·m', model: sol.MmaxAbs },
      { key: 'n', quantity: 'safety factor n', label: 'Safety factor n', unit: '', model: sol.n, reason: sol.nReason },
      { key: 'dReq', quantity: 'required diameter d', label: 'd for target n', unit: 'mm', model: sol.dReq, reason: sol.dReq === null ? 'no load' : null },
    ];
  }

  function snapshot(s) {
    const si = toSI(s);
    return {
      values: {
        mode: s.mode, L: si.L, overhangLeft: si.overhangLeft, overhangRight: si.overhangRight,
        loads: si.loads.map(l => ({ label: l.label, P: l.P, a: l.a })),
        T: si.torque ? si.torque.T : 0, torqueFrom: si.torque ? si.torque.from : null, torqueTo: si.torque ? si.torque.to : null,
        d: si.d, Sy: si.Sy, E: s.E * 1e9, Kb: s.Kb, Kt: s.Kt, nTarget: s.nTarget, rule: si.rule,
      },
      units: { L: 'm', overhangLeft: 'm', overhangRight: 'm', 'loads.P': 'N', 'loads.a': 'm', T: 'N·m', torqueFrom: 'm', torqueTo: 'm', d: 'm', Sy: 'Pa', E: 'Pa' },
    };
  }

  /* ------------------------------------------------------------ show the working (§9) */
  // f(v) formats a number; fu(v, unit) adds a unit. Returns [{title, formula, sub, result, source}].
  function working(sol, f, fu) {
    const s = sol.state, steps = [];
    const Nmm = v => fu(v * 1000, 'N·mm');
    if (!s.loads.length) steps.push({ title: 'Reactions', formula: 'No loads on the shaft, so R<sub>A</sub> = R<sub>B</sub> = 0.', source: SOURCES.statics });
    else {
      const terms = s.loads.map(l => '(' + fu(l.P, 'N') + ' × ' + fu(l.a, 'mm') + ')').join(' + ');
      steps.push({ title: 'Reaction at B (moments about A)', formula: 'R<sub>B</sub> = Σ(P<sub>i</sub> · a<sub>i</sub>) / L', sub: '[' + terms + '] / ' + fu(s.L, 'mm'), result: fu(sol.RB, 'N') + (sol.RB < 0 ? ' (pulls down)' : ''), source: SOURCES.statics });
      steps.push({ title: 'Reaction at A (vertical balance)', formula: 'R<sub>A</sub> = ΣP<sub>i</sub> − R<sub>B</sub>', sub: fu(sol.r.R.sumP, 'N') + ' − ' + fu(sol.RB, 'N'), result: fu(sol.RA, 'N') + (sol.RA < 0 ? ' (pulls down)' : ''), source: SOURCES.statics });
    }
    steps.push({ title: 'Largest bending moment', formula: 'M(x) = Σ moments about x of the forces to the left of x', sub: momentTerms(sol, sol.MmaxX, fu), result: Nmm(sol.Mmax) + ' = ' + fu(sol.Mmax, 'N·m') + ' at x = ' + fu(sol.MmaxX, 'mm') + (sol.Mmax < 0 ? ' (hogging)' : ''), source: SOURCES.beam });
    if (s.mode === 'shaft') {
      if (sol.t.from === 'power') {
        steps.push({ title: 'Angular speed', formula: 'ω = 2πN / 60', sub: '2π × ' + fu(s.N, 'rpm') + ' / 60', result: fu(sol.t.omega, 'rad/s'), source: SOURCES.power });
        steps.push({ title: 'Torque', formula: 'T = P / ω', sub: fu(s.P, 'W') + ' / ' + fu(sol.t.omega, 'rad/s'), result: fu(sol.T, 'N·m') + ', carried from ' + fu(s.tFrom, 'mm') + ' to ' + fu(s.tTo, 'mm'), source: SOURCES.power });
      } else steps.push({ title: 'Torque', formula: 'T entered directly', result: fu(sol.T, 'N·m') + ', carried from ' + fu(s.tFrom, 'mm') + ' to ' + fu(s.tTo, 'mm') });
    }
    const c = sol.crit;
    if (!c) {
      steps.push({ title: 'Safety factor', formula: 'n = S<sub>y</sub> / (2 τ<sub>max</sub>)', result: 'not defined: ' + (sol.nReason || 'no load'), source: SOURCES.reuven });
      return steps;
    }
    const d3 = 'π × (' + fu(s.d, 'mm') + ')³';
    steps.push({ title: 'Critical section', formula: 'The station with the lowest safety factor, found by checking every station', result: 'x = ' + fu(c.x, 'mm') + ': M = ' + fu(c.M, 'N·m') + ', T = ' + fu(c.T, 'N·m') });
    if (Math.abs(c.x - sol.MmaxX) > 1e-6) steps.push({ title: 'Moment at the critical section', formula: 'M(x) = Σ moments about x of the forces to the left of x', sub: momentTerms(sol, c.x, fu), result: Nmm(c.M) + ' = ' + fu(c.M, 'N·m'), source: SOURCES.beam });
    steps.push({ title: 'Bending stress', formula: 'σ = 32 K<sub>b</sub> M / (π d³)', sub: '32 × ' + f(s.Kb) + ' × ' + Nmm(Math.abs(c.M)) + ' / [' + d3 + ']', result: fu(c.sigma, 'MPa'), source: SOURCES.shaft });
    if (s.mode === 'shaft') steps.push({ title: 'Torsional shear stress', formula: 'τ = 16 K<sub>t</sub> T / (π d³)', sub: '16 × ' + f(s.Kt) + ' × ' + Nmm(c.T) + ' / [' + d3 + ']', result: fu(c.tau, 'MPa'), source: SOURCES.shaft });
    if (s.rule === 'vonMises') {
      steps.push({ title: 'Combined stress (von Mises)', formula: 'σ′ = √(σ² + 3τ²)', sub: '√[(' + fu(c.sigma, 'MPa') + ')² + 3 × (' + fu(c.tau, 'MPa') + ')²]', result: fu(c.sigmaVM, 'MPa'), source: SOURCES.vm });
      steps.push({ title: 'Safety factor', formula: 'n = S<sub>y</sub> / σ′', sub: fu(s.Sy, 'MPa') + ' / ' + fu(c.sigmaVM, 'MPa'), result: f(c.n) + (sol.pass ? ' ≥ ' : ' < ') + f(s.nTarget) + (sol.pass ? ', passes' : ', fails'), source: SOURCES.vm });
    } else {
      steps.push({ title: 'Combined shear stress (maximum shear stress rule)', formula: 'τ<sub>max</sub> = 16 / (π d³) × √[(K<sub>b</sub>M)² + (K<sub>t</sub>T)²]', sub: '16 / [' + d3 + '] × √[(' + Nmm(s.Kb * Math.abs(c.M)) + ')² + (' + Nmm(s.Kt * c.T) + ')²]', result: fu(c.tauMax, 'MPa'), source: SOURCES.shaft });
      steps.push({ title: 'Safety factor', formula: 'n = S<sub>y</sub> / (2 τ<sub>max</sub>)', sub: fu(s.Sy, 'MPa') + ' / (2 × ' + fu(c.tauMax, 'MPa') + ')', result: f(c.n) + (sol.pass ? ' ≥ ' : ' < ') + f(s.nTarget) + (sol.pass ? ', passes' : ', fails'), source: SOURCES.reuven });
    }
    if (sol.dReq !== null) {
      const M = Math.abs(BC.momentAt(sol.dReqX / 1000, s.L / 1000, s.loads.map(l => ({ P: l.P, a: l.a / 1000 })), sol.r.R));
      const T = s.mode === 'shaft' ? BC.torqueAt(sol.dReqX / 1000, { T: sol.T, from: s.tFrom / 1000, to: s.tTo / 1000 }) : 0;
      if (s.rule === 'vonMises') {
        steps.push({ title: 'Required diameter for n = ' + f(s.nTarget), formula: 'd = ∛{ (32 n / (π S<sub>y</sub>)) × √[(K<sub>b</sub>M)² + 0.75 (K<sub>t</sub>T)²] }', sub: '∛{ (32 × ' + f(s.nTarget) + ' / (π × ' + fu(s.Sy, 'MPa') + ')) × √[(' + Nmm(s.Kb * M) + ')² + 0.75 × (' + Nmm(s.Kt * T) + ')²] }', result: fu(sol.dReq, 'mm'), source: SOURCES.reuven });
      } else {
        steps.push({ title: 'Required diameter for n = ' + f(s.nTarget), formula: 'd = ∛{ 16 √[(K<sub>b</sub>M)² + (K<sub>t</sub>T)²] / (π S<sub>y</sub> / (2n)) }', sub: '∛{ 16 × √[(' + Nmm(s.Kb * M) + ')² + (' + Nmm(s.Kt * T) + ')²] / (π × ' + fu(s.Sy, 'MPa') + ' / (2 × ' + f(s.nTarget) + ')) }', result: fu(sol.dReq, 'mm'), source: SOURCES.reuven });
      }
    }
    if (sol.defl) {
      steps.push({ title: 'Second moment of area', formula: 'I = π d⁴ / 64', sub: 'π × (' + fu(s.d, 'mm') + ')⁴ / 64', result: fu(sol.defl.I, 'mm⁴'), source: SOURCES.I });
      const one = s.loads.length === 1 && !s.overhang && Math.abs(s.loads[0].a - s.L / 2) < 1e-9;
      steps.push({
        title: 'Maximum deflection', formula: 'y″ = M(x) / (E I), integrated twice with y = 0 at both supports',
        result: fu(sol.defl.max, 'mm') + ' at x = ' + fu(sol.defl.x, 'mm'),
        note: one ? 'Check with the closed form for a centered load: δ = PL³/(48EI) = ' + fu(BC.centeredDeflection(s.loads[0].P, s.L, s.E * 1000, sol.defl.I), 'mm') + '.' : '',
        source: SOURCES.beam,
      });
    }
    return steps;
  }
  // Substituted moment sum at station x (mm): R_A·x + R_B·(x − L) − ΣP·(x − a), in N·mm.
  function momentTerms(sol, xmm, fu) {
    const s = sol.state, terms = [];
    if (xmm > 0) terms.push([sol.RA, xmm]);
    if (xmm > s.L) terms.push([sol.RB, xmm - s.L]);
    for (const l of s.loads) if (l.a < xmm) terms.push([-l.P, xmm - l.a]);
    if (!terms.length) return '0';
    return terms.map(([F, arm], i) => (i === 0 ? (F < 0 ? '−' : '') : (F < 0 ? ' − ' : ' + ')) + fu(Math.abs(F), 'N') + ' × ' + fu(arm, 'mm')).join('');
  }

  /* ------------------------------------------------------------ description (00 §7) */
  function describe(sol, fu, masked) {
    const s = sol.state;
    const loads = s.loads.length ? s.loads.map(l => l.label + ', ' + fu(Math.abs(l.P), 'N') + (l.P >= 0 ? ' down' : ' up') + ' at ' + fu(l.a, 'mm')).join('; ') : 'no loads';
    let t = (s.mode === 'shaft' ? 'Shaft' : 'Beam') + ', ' + fu(s.L, 'mm') + ' between pin A and roller B' + (s.overhang && (s.oL || s.oR) ? ', overhangs ' + fu(s.oL, 'mm') + ' left and ' + fu(s.oR, 'mm') + ' right' : '') + '. Loads: ' + loads + '.';
    if (s.mode === 'shaft') t += ' Torque ' + fu(sol.T, 'newton meters') + ' from ' + fu(s.tFrom, 'mm') + ' to ' + fu(s.tTo, 'mm') + '.';
    if (!masked) {
      t += ' Reactions: A ' + fu(Math.abs(sol.RA), 'N') + (sol.RA >= 0 ? ' up' : ' down') + ', B ' + fu(Math.abs(sol.RB), 'N') + (sol.RB >= 0 ? ' up' : ' down') + '.';
      t += ' Largest bending moment ' + fu(sol.MmaxAbs, 'newton meters') + ' at ' + fu(sol.MmaxX, 'mm') + '.';
      if (sol.crit) t += ' Critical section at ' + fu(sol.crit.x, 'mm') + ', safety factor ' + fu(sol.n, '') + ', ' + (sol.pass ? 'passes' : 'fails') + ' the target.';
    } else t += ' Results are hidden until you check your prediction.';
    return t.replace(/ \./g, '.').replace(/ ,/g, ',');
  }

  /* ------------------------------------------------------------ import (§5.5, §7) */
  // Default stations: spread evenly across the span.
  function defaultStations(n, L) { return Array.from({ length: n }, (_, i) => Math.round(L * (i + 1) / (n + 1))); }
  // file: result of Schemas.readShaftLoads(). positions in mm. Returns notes.
  function importLoads(s, file, positions, replace) {
    const notes = [];
    const room = replace ? MAX_LOADS : MAX_LOADS - s.loads.length;
    const incoming = file.value.loads.slice(0, Math.max(0, room));
    if (incoming.length < file.value.loads.length) notes.push('Only ' + MAX_LOADS + ' loads fit on the shaft; ' + (file.value.loads.length - incoming.length) + ' were left out.');
    if (replace) s.loads = [];
    incoming.forEach((l, i) => { s.loads.push({ id: s.nextId++, label: l.label.slice(0, 20), P: l.magnitude, a: positions[i] }); });
    const torques = incoming.map((l, i) => ({ T: l.torque, a: positions[i] })).filter(x => isNum(x.T) && x.T !== 0);
    if (torques.length && s.mode === 'shaft') {
      const big = torques.reduce((a, b) => Math.abs(b.T) > Math.abs(a.T) ? b : a);
      s.torqueEntry = 'torque'; s.T = Math.abs(big.T); s.tFrom = 0; s.tTo = big.a; s.tAuto = false;
      notes.push('Torque ' + round(Math.abs(big.T)) + ' N·m from the file is carried from A to ' + round(big.a) + ' mm. Move the torque stations if your drive comes in elsewhere.');
    }
    if (file.multiPlane) notes.push(MULTIPLANE);
    clampToModel(s);
    return notes;
  }
  const MULTIPLANE = 'These loads push in different directions. Version 1 treats them as one plane, which is only exact when they line up. Your teacher may want the two-plane version.';

  return {
    SOURCES, MATERIALS, MAX_LOADS, FIELDS, MULTIPLANE, defaultState, range, torque, heaviestStation, clampToModel,
    toSI, solve, station, sectionCheck, roundUpHalf, targets, snapshot, working, describe, defaultStations, importLoads,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ShaftTool;
