// Shaft and Beam Workbench: every test case in spec 01 §8 (SB-1 to SB-15),
// run through the tool core in display units exactly as the interface uses it.
// Run: node dev/test.js
'use strict';
const ShaftTool = require('./core.js');
const Schemas = require('./vendor/schemas.js');
const PL = require('./vendor/prediction-log.js');
const Shell = require('./vendor/shell.js');

let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail ? ': ' + detail : '')); }
}
function near(name, got, exp) {   // spec 00 §10
  const good = typeof got === 'number' && isFinite(got) &&
    (Math.abs(exp) < 1 ? Math.abs(got - exp) <= 0.01 : Math.abs(got - exp) / Math.abs(exp) <= 0.005);
  ok(name, good, 'got ' + got + ', expected ' + exp);
}
const st = o => Object.assign(ShaftTool.defaultState(), o);
const beam = o => st(Object.assign({ mode: 'beam' }, o));
const f = v => Shell.util.fmtSig(v, 3), fu = (v, u) => f(v) + (u ? ' ' + u : '');

console.log('SB-1 to SB-3: beam mode statics');
{
  const s = ShaftTool.solve(beam({ L: 300, loads: [{ id: 1, label: 'Gear 1', P: 1000, a: 150 }] }));
  near('SB-1 R_A', s.RA, 500); near('SB-1 R_B', s.RB, 500);
  near('SB-1 |M|max', s.MmaxAbs, 75.0); near('SB-1 station', s.MmaxX, 150);
  const s2 = ShaftTool.solve(beam({ L: 2000, loads: [{ id: 1, label: 'P', P: 600, a: 500 }] }));
  near('SB-2 R_A', s2.RA, 450); near('SB-2 R_B', s2.RB, 150);
  near('SB-2 |M|max', s2.MmaxAbs, 225); near('SB-2 station', s2.MmaxX, 500);
  const s3 = ShaftTool.solve(beam({ L: 200, overhang: true, oR: 50, loads: [{ id: 1, label: 'P', P: 100, a: 250 }] }));
  near('SB-3 R_B', s3.RB, 125); near('SB-3 R_A', s3.RA, -25);
  ok('SB-3 R_A is negative (the bearing is pulled)', s3.RA < 0);
  near('SB-3 |M|max', s3.MmaxAbs, 5.00); near('SB-3 station', s3.MmaxX, 200);
}

console.log('SB-4, SB-5: M and T entered through the test hook');
{
  const tr = ShaftTool.sectionCheck({ M: 1000, T: 1000, d: 41.6, Sy: 400, n: 2, rule: 'tresca' });
  near('SB-4 required d (Tresca)', tr.dReq, 41.6);
  near('SB-4 σ at 41.6 mm', tr.sigma, 141.5); near('SB-4 τ at 41.6 mm', tr.tau, 70.7); near("SB-4 σ' at 41.6 mm", tr.sigmaVM, 187);
  near('SB-5 required d (von Mises)', ShaftTool.sectionCheck({ M: 1000, T: 1000, d: 40, Sy: 400, n: 2, rule: 'vonMises' }).dReq, 40.7);
}

console.log('SB-6 to SB-12: shaft mode');
const sb6 = o => st(Object.assign({ L: 300, loads: [{ id: 1, label: 'Gear 1', P: 1000, a: 150 }], torqueEntry: 'power', P: 500, N: 300, tFrom: 0, tTo: 150, tAuto: false, d: 20, Sy: 400, nTarget: 2, rule: 'tresca' }, o));
{
  const s = ShaftTool.solve(sb6());
  near('SB-6 T', s.T, 15.9);
  near('SB-6 σ', s.crit.sigma, 95.5); near('SB-6 τ', s.crit.tau, 10.1); near('SB-6 τ_max', s.crit.tauMax, 48.8);
  near('SB-6 n', s.n, 4.10); near('SB-6 required d for n = 2', s.dReq, 15.7);
  near('SB-6 critical section at 150 mm', s.crit.x, 150);
  ok('SB-6 passes the target', s.pass === true);
  const v = ShaftTool.solve(sb6({ rule: 'vonMises' }));
  near("SB-7 σ'", v.crit.sigmaVM, 97.1); near('SB-7 n', v.n, 4.12);
  const t8 = ShaftTool.solve(st({ L: 300, loads: [], torqueEntry: 'torque', T: 10, tFrom: 0, tTo: 300, tAuto: false, Sy: 100, nTarget: 1 }));
  near('SB-8 required d, torque only', t8.dReq, 10.06);
  const s9 = ShaftTool.solve(sb6({ d: 40 }));
  ok('SB-9 σ, τ, τ_max each exactly 1/8', ['sigma', 'tau', 'tauMax'].every(k => Math.abs(s9.crit[k] * 8 - s.crit[k]) < 1e-9));
  near('SB-9 n', s9.n, 32.8);
  const s10 = ShaftTool.solve(sb6({ Kb: 2, Kt: 2 }));
  near('SB-10 τ_max', s10.crit.tauMax, 97.6); near('SB-10 n', s10.n, 2.05);
  const s12 = ShaftTool.solve(sb6({ tFrom: 200, tTo: 300 }));
  const a150 = ShaftTool.station(s12, 150), a200 = ShaftTool.station(s12, 200);
  ok('SB-12 τ = 0 at 150 mm', a150.tau === 0);
  near('SB-12 τ_max = σ/2 at 150', a150.tauMax, 47.7); near('SB-12 n at 150', a150.n, 4.19);
  near('SB-12 M at 200', a200.M, 50.0); near('SB-12 T at 200', a200.T, 15.9); near('SB-12 n at 200', a200.n, 5.99);
  near('SB-12 critical section reported at 150', s12.crit.x, 150); near('SB-12 critical n', s12.n, 4.19);
}

console.log('SB-11: deflection');
{
  const s = ShaftTool.solve(beam({ L: 300, loads: [{ id: 1, label: 'P', P: 1000, a: 150 }], d: 20, E: 200, deflection: true }));
  near('SB-11 I (mm⁴)', s.defl.I, 7854); near('SB-11 δ_max (mm)', s.defl.max, 0.358); near('SB-11 station', s.defl.x, 150);
  const exact = 1000 * 300 ** 3 / (48 * 200000 * s.defl.I);
  ok('SB-11 within 0.5% of PL³/48EI', Math.abs(s.defl.max - exact) / exact < 0.005);
}

console.log('SB-13: validation messages');
{
  const V = Shell.util.validateNumber;
  ok('SB-13 diameter 0', V('0', ShaftTool.FIELDS.d).error === 'Diameter must be greater than 0 mm.', V('0', ShaftTool.FIELDS.d).error);
  ok('SB-13 span 0', V('0', ShaftTool.FIELDS.L).error === 'Span must be greater than 0 mm.', V('0', ShaftTool.FIELDS.L).error);
  ok('span below 20 mm', V('10', ShaftTool.FIELDS.L).error === 'Span must be between 20 and 3000 mm.');
}

console.log('SB-14: no load, no torque');
{
  const s = ShaftTool.solve(st({ loads: [], torqueEntry: 'torque', T: 0 }));
  ok('SB-14 n not defined, reason "no load"', s.n === null && s.nReason === 'no load');
  const n = ShaftTool.targets(s).find(t => t.key === 'n');
  ok('SB-14 prediction target model is null with a reason', n.model === null && n.reason === 'no load');
  const w = ShaftTool.working(s, f, fu).map(x => x.result || '').join(' ');
  ok('SB-14 working says "not defined: no load"', w.includes('not defined: no load'));
  ok('SB-14 no NaN or Infinity in working or description', !/NaN|Infinity/.test(w + ShaftTool.describe(s, fu, false)));
}

console.log('SB-15: import two loads at 0° and 90°');
{
  const file = Schemas.readShaftLoads(JSON.stringify(Schemas.makeShaftLoads('Gear Train Workbench', [
    { label: 'Mesh 1', magnitude: 44.3, angleDeg: 0, torque: 0.5 }, { label: 'Mesh 2', magnitude: 30, angleDeg: 90 }])));
  ok('SB-15 two-plane warning raised', file.multiPlane === true);
  const s = st({ L: 300 });
  const notes = ShaftTool.importLoads(s, file, [100, 220], true);
  ok('SB-15 warning text matches the spec', notes.includes('These loads push in different directions. Version 1 treats them as one plane, which is only exact when they line up. Your teacher may want the two-plane version.'));
  ok('SB-15 loads placed at the chosen stations', s.loads.length === 2 && s.loads[0].a === 100 && s.loads[1].a === 220);
  ok('SB-15 magnitudes used', s.loads[0].P === 44.3 && s.loads[1].P === 30);
  ok('imported torque carried from A to its load', s.torqueEntry === 'torque' && s.T === 0.5 && s.tFrom === 0 && s.tTo === 100);
  ok('default stations spread evenly', ShaftTool.defaultStations(2, 300).join() === '100,200');
}

console.log('CD-10 cross-check: a conveyor pulley shaft import matches CD-7');
{
  const file = Schemas.readShaftLoads(Schemas.makeShaftLoads('Conveyor Designer', [{ label: 'Drive pulley', magnitude: 51.4, angleDeg: 270, torque: 0.677 }]));
  const s = st({ L: 100, d: 8, Sy: 400 });
  ShaftTool.importLoads(s, file, [50], true);
  const r = ShaftTool.solve(s);
  ok('no two-plane warning for one load', file.multiPlane === false);
  near('CD-7 M', r.MmaxAbs, 1.28); near('CD-7 τ_max', r.crit.tauMax, 14.4); near('CD-7 n', r.n, 13.8);
  near('CD-7 bearing loads', r.RA, 25.7);
}

console.log('Interface helpers');
{
  ok('Use this diameter rounds up to the next 0.5 mm', ShaftTool.roundUpHalf(15.747) === 16 && ShaftTool.roundUpHalf(15.2) === 15.5 && ShaftTool.roundUpHalf(15.5) === 15.5);
  const s = st({ L: 300, loads: [{ id: 1, label: 'Gear 1', P: 1000, a: 280 }] });
  s.L = 200; const notes = ShaftTool.clampToModel(s);
  ok('shortening the span keeps loads on the shaft', s.loads[0].a === 200 && notes.length === 1);
  const h = st({ loads: [{ id: 1, label: 'a', P: 100, a: 50 }, { id: 2, label: 'b', P: -900, a: 250 }] });
  ok('torque output follows the heaviest load', ShaftTool.heaviestStation(h) === 250);
  const sol = ShaftTool.solve(sb6());
  const steps = ShaftTool.working(sol, f, fu);
  const need = ['Reaction at B', 'Reaction at A', 'Largest bending moment', 'Torque', 'Bending stress', 'Torsional shear stress', 'Combined shear stress', 'Safety factor', 'Required diameter'];
  ok('show the working lists every step in 01 §9', need.every(n => steps.some(x => x.title.startsWith(n))), steps.map(x => x.title).join(' | '));
  ok('working substitutes numbers with units', steps.find(x => x.title.startsWith('Reaction at B')).sub.includes('1,000 N × 150 mm'));
  ok('working steps name their source', steps.filter(x => x.sub).every(x => x.source));
  const tg = ShaftTool.targets(sol);
  ok('predict-first targets are R_A, |M|max, n and d', tg.map(t => t.key).join() === 'RA,Mmax,n,dReq');
  near('target n model value', tg[2].model, 4.10);
  const rec = PL.makeRecord({ tool: 'Shaft and Beam Workbench', toolVersion: '1.0.0', student: 'A', problemId: PL.sandboxProblemId(ShaftTool.snapshot(sb6()).values), quantity: tg[2].quantity, unit: '', predicted: 3.8, model: tg[2].model, attempt: 1, inputs: ShaftTool.snapshot(sb6()) });
  near('prediction record for n uses the unrounded model 4.0975 (ERRATA: PL-1)', rec.pctPredVsModel, -7.26);
  ok('snapshot is SI with a units map', ShaftTool.snapshot(sb6()).values.L === 0.3 && ShaftTool.snapshot(sb6()).units.Sy === 'Pa');
  const d = ShaftTool.describe(sol, fu, false);
  ok('description reads the model', d.includes('Critical section at 150 mm') && d.includes('4.10'));
  ok('masked description hides results', !ShaftTool.describe(sol, fu, true).includes('4.10'));
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
