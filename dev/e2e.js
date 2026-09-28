// Browser checks for the Shaft and Beam Workbench, driven in headless Chromium
// against the real index.html: the standard checks every tool passes (spec 00),
// then spec 01's cases, interactions and acceptance criteria through the interface.
//
// Needs Playwright (not a project dependency). Once, from the repo root:
//   npm i --no-save playwright && npx playwright install chromium
// Run: node dev/e2e.js     (set CHROMIUM_PATH to use an installed Chromium)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const kit = require('./vendor/e2e-kit.js');
const root = path.join(__dirname, '..');

(async () => {
  const t = await kit.start(root);
  const { page } = t;
  const txt = sel => page.textContent(sel);
  const res = () => page.textContent('#shResultsBody');
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__app.state)));
  const setState = async (patch, rebuild) => {
    await page.evaluate(({ p, rebuild }) => {
      const a = window.__app; Object.assign(a.state, p);
      if (rebuild) a.cfg.afterLoad(a);
      a.refreshFields(); a.changed();
    }, { p: patch, rebuild: !!rebuild });
  };
  const writeTmp = (name, obj) => { const f = path.join(os.tmpdir(), name); fs.writeFileSync(f, JSON.stringify(obj)); return f; };

  await kit.standard(t, {
    predictKeys: ['RA', 'Mmax', 'n', 'dReq'],
    change: async p => { await p.fill('#sbD', '22'); },
    mutate: async p => { await p.fill('#sbL', '400'); await p.fill('#lda1', '120'); },
    shotDir: path.join(root, 'docs', 'screenshots'), shotName: 'shaft-beam-workbench',
  });

  console.log('SB-6 in the interface (default state)');
  await t.fresh();
  let r = await res();
  t.ok('R_A / R_B 500 N / 500 N', r.includes('500 N / 500 N'));
  t.ok('|M|max 75.0 N·m at 150 mm', r.includes('75.0 N·m at 150 mm'));
  t.ok('T 15.9 N·m', r.includes('15.9 N·m'));
  t.ok('σ 95.5, τ 10.1, τ_max 48.8 MPa', ['95.5 MPa', '10.1 MPa', '48.8 MPa'].every(v => r.includes(v)));
  t.ok('n 4.10, meets target', r.includes('4.10') && r.includes('meets target'));
  t.ok('required d 15.7 mm', r.includes('15.7 mm'));
  await page.click('#shWorking summary');
  const wk = await txt('#shWorkingBody');
  t.ok('working lists reactions, moment, torque, stresses, n and d with numbers', ['Reaction at B', '1,000 N × 150 mm', '75,000 N·mm', 'T = P / ω', 'σ = 32', 'τ = 16', 'τmax', 'n = Sy / (2 τmax)', 'Required diameter', 'Source:'].every(s => wk.replace(/\s+/g, ' ').includes(s)), wk.slice(0, 300));
  await page.click('#sbUseD');
  t.ok('Use this diameter rounds 15.7 up to 16 mm', (await state()).d === 16 && (await page.inputValue('#sbD')) === '16');

  console.log('SB-7, SB-10, SB-11 in the interface');
  await t.fresh();
  await page.check('#sbExt'); await page.selectOption('#sbRule', 'vonMises');
  r = await res();
  t.ok("SB-7 von Mises σ' 97.1 MPa, n 4.12", r.includes('97.1 MPa') && r.includes('4.12'));
  await page.selectOption('#sbRule', 'tresca'); await page.fill('#sbKb', '2'); await page.fill('#sbKt', '2');
  r = await res();
  t.ok('SB-10 K = 2: τ_max 97.6 MPa, n 2.05', r.includes('97.6 MPa') && r.includes('2.05'));
  t.ok('stress concentration note shown', r.includes('Shoulders, keyways and holes raise local stress'));
  await page.fill('#sbKb', '1'); await page.fill('#sbKt', '1');
  await page.click('#shModes [data-mode="beam"]'); await page.check('#sbDef');
  r = await res();
  t.ok('SB-11 max deflection 0.358 mm at 150 mm', r.includes('0.358 mm at 150 mm'));
  t.ok('deflected shape drawn with its scale', (await txt('#sbDraw')).includes('× actual)'));
  t.ok('Beam mode hides torque inputs and diagram', await page.isHidden('#sbTq') && !(await txt('#sbDraw')).includes('Torque T (N·m)'));

  console.log('SB-3 overhang in the interface');
  await t.fresh();
  await page.click('#shModes [data-mode="beam"]');
  await page.check('#sbOv'); await page.fill('#sbL', '200'); await page.fill('#sbOR', '50');
  await page.fill('#ldP1', '100'); await page.fill('#lda1', '250');
  r = await res();
  t.ok('SB-3 R_A −25.0 N, R_B 125 N', r.includes('−25.0 N / 125 N'));
  t.ok('SB-3 |M|max 5.00 N·m at 200 mm', r.includes('5.00 N·m at 200 mm'));
  t.ok('pulled bearing note', r.includes('this bearing is pulled, not pushed'));
  t.ok('drawing labels the pulled reaction', (await txt('#sbDraw')).includes('(pulled)'));

  console.log('SB-13, SB-14: validation and no load');
  await t.fresh();
  await page.fill('#sbD', '0');
  t.ok('SB-13 diameter message', (await txt('#sbDErr')) === 'Diameter must be greater than 0 mm.');
  await kit.noBadNumbers(t, 'd = 0');
  await page.fill('#sbD', '20'); await page.fill('#sbL', '0');
  t.ok('SB-13 span message', (await txt('#sbLErr')) === 'Span must be greater than 0 mm.');
  await kit.noBadNumbers(t, 'L = 0');
  t.ok('results say what to fix', (await res()).includes('not defined: fix the highlighted input'));
  await page.fill('#sbL', '300');
  await page.click('#sbLoads .rm');
  await page.selectOption('#sbTE', 'torque'); await page.fill('#sbT', '0');
  r = await res();
  t.ok('SB-14 n shows "not defined: no load"', r.includes('not defined: no load'));
  await kit.noBadNumbers(t, 'no load');

  console.log('SB-15 and CD-10: importing shaft loads');
  await t.fresh();
  const two = { schema: 'shaft-loads', schemaVersion: 1, source: 'Gear Train Workbench', units: { force: 'N', torque: 'N·m' }, loads: [{ label: 'Mesh 1', magnitude: 44.3, angleDeg: 0, torque: 0.5 }, { label: 'Mesh 2', magnitude: 30, angleDeg: 90 }] };
  await page.setInputFiles('#shFile', writeTmp('sb15.json', two));
  await page.waitForSelector('#sbImport[open]');
  t.ok('SB-15 import dialog lists both loads', (await txt('#sbImport')).includes('Mesh 1') && (await txt('#sbImport')).includes('Mesh 2'));
  t.ok('SB-15 two-plane warning in the dialog', (await txt('#sbImpWarn')).includes('These loads push in different directions. Version 1 treats them as one plane, which is only exact when they line up. Your teacher may want the two-plane version.'));
  await page.fill('#sbImpPos0', '100'); await page.fill('#sbImpPos1', '220');
  await page.click('#sbImpGo');
  let s = await state();
  t.ok('SB-15 loads placed at the chosen stations', s.loads.length === 2 && s.loads[0].a === 100 && s.loads[1].a === 220 && s.loads[0].P === 44.3);
  t.ok('SB-15 warning stays in the results', (await res()).includes('These loads push in different directions'));
  await t.fresh();
  await page.fill('#sbL', '100'); await page.fill('#sbD', '8');
  const pulley = { schema: 'shaft-loads', schemaVersion: 1, source: 'Conveyor Designer', units: { force: 'N', torque: 'N·m' }, loads: [{ label: 'Drive pulley', magnitude: 51.4, angleDeg: 270, torque: 0.677 }] };
  await page.click('#sbImp');
  await page.setInputFiles('#shFile', writeTmp('cd10.json', pulley));
  await page.waitForSelector('#sbImport[open]');
  t.ok('single load: no two-plane warning', await page.locator('#sbImpWarn').count() === 0);
  t.ok('default position is mid-span', (await page.inputValue('#sbImpPos0')) === '50');
  await page.click('#sbImpGo');
  r = await res();
  t.ok('CD-10 matches CD-7: M 1.28 N·m, τ_max 14.4 MPa, n 13.8, reactions 25.7 N', ['1.28 N·m', '14.4 MPa', '13.8', '25.7 N / 25.7 N'].every(v => r.includes(v)), r);

  console.log('Keyboard-only session (acceptance)');
  await t.fresh();
  await page.focus('#sbSvg');
  await page.keyboard.press('a');
  s = await state();
  t.ok('A adds a load at mid-span', s.loads.length === 2 && s.loads[1].a === 150);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowRight');
  s = await state();
  t.ok('arrow keys move the load 1 mm and Shift 10 mm', s.loads[1].a === 161);
  await page.keyboard.press('ArrowUp');
  t.ok('up arrow adds 10 N', (await state()).loads[1].P === 1010);
  await page.keyboard.press('n');
  t.ok('N selects the next load', await page.evaluate(() => document.querySelector('#sbLoads .ldcard.sel').dataset.id) === '1');
  await page.keyboard.press('n'); await page.keyboard.press('Delete');
  t.ok('Delete removes the selected load', (await state()).loads.length === 1);
  t.ok('focus stays on the drawing', await page.evaluate(() => document.activeElement.id) === 'sbSvg');
  const before = await txt('#sbStRo');
  await page.keyboard.press('.'); await page.keyboard.press('Shift+.');
  const after = await txt('#sbStRo');
  t.ok('station readout moves with the keyboard', after !== before && after.startsWith('x = 161 mm'), after);
  t.ok('station readout shows V, M, T, σ, τ and n', ['V =', 'M =', 'T =', 'σ =', 'τ =', 'n ='].every(k => after.includes(k)));
  t.ok('keys listed in help', await page.evaluate(() => { window.__app.openHelp(); const x = document.getElementById('shHelpDlg').textContent; document.getElementById('shHelpDlg').close(); return x.includes('Add a load at mid-span') && x.includes('Move the station readout'); }));

  console.log('Pointer: add by clicking, drag, click a diagram');
  await t.fresh();
  const box = await page.locator('#sbSvg').boundingBox();
  const vb = await page.evaluate(() => { const v = document.getElementById('sbSvg').viewBox.baseVal; return { w: v.width, h: v.height }; });
  const toScreen = (xmm, sy) => ({ x: box.x + (80 + xmm / 300 * (700 - 80 - 48)) * box.width / vb.w, y: box.y + sy * box.height / vb.h });
  await page.click('#sbAdd');
  t.ok('Add load shows the placing hint', await page.isVisible('#sbDraw .hint'));
  let q = toScreen(60, 100);
  await page.mouse.click(q.x, q.y);
  s = await state();
  t.ok('clicking the shaft places the load there', s.loads.length === 2 && Math.abs(s.loads[1].a - 60) <= 2, JSON.stringify(s.loads));
  const h = await page.locator('#sbSvg [data-load="1"] rect').boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
  q = toScreen(230, 60); await page.mouse.move(q.x, q.y, { steps: 6 }); await page.mouse.up();
  s = await state();
  t.ok('dragging moves a load', Math.abs(s.loads[0].a - 230) <= 2, String(s.loads[0].a));
  const h2 = await page.locator('#sbSvg [data-load="1"] rect').boundingBox();
  await page.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2); await page.mouse.down();
  q = toScreen(360, 60); await page.mouse.move(q.x, q.y, { steps: 6 }); await page.mouse.up();
  t.ok('a load dragged past a support stops at the support', (await state()).loads[0].a === 300);
  t.ok('and a hint says why', (await txt('#shToast')).includes('Turn on overhangs'));
  const mp = await page.locator('#sbSvg [data-panel="M"] rect').first().boundingBox();
  await page.mouse.click(mp.x + mp.width * 0.25, mp.y + mp.height / 2);
  t.ok('clicking the moment diagram reads that station', /^x = [78]\d(\.\d)? mm/.test(await txt('#sbStRo')), await txt('#sbStRo'));

  console.log('Predict first hides the answers on the drawing');
  await t.fresh();
  t.ok('moment peak label shown normally', (await txt('#sbDraw')).includes('|M|max 75.0'));
  await page.click('#shPredict');
  const d1 = await txt('#sbDraw');
  t.ok('peak label, reactions and critical n hidden', !d1.includes('|M|max') && !d1.includes('500 N') && !d1.includes('critical'));
  t.ok('station readout hidden', (await txt('#sbStRo')).includes('hidden until you check'));
  await page.fill('#shPf_n', '3.8'); await page.click('#shCheck');
  t.ok('message for n', (await txt('#shPfBox')).includes('You predicted 3.80. The model gives 4.10 (−7.26% difference).'));
  t.ok('peak label back after Check', (await txt('#sbDraw')).includes('|M|max 75.0'));
  const rec = await page.evaluate(() => window.__app.log[window.__app.log.length - 1]);
  t.ok('log record has tool, quantity and SI inputs', rec.tool === 'Shaft and Beam Workbench' && rec.quantity === 'safety factor n' && rec.inputs.values.L === 0.3 && rec.problemId.startsWith('sandbox-'));
  await page.click('#shPredict');

  console.log('Performance (acceptance: under 50 ms per update)');
  await t.fresh();
  await setState({ loads: [1, 2, 3, 4, 5, 6].map(i => ({ id: i, label: 'L' + i, P: 500 * i, a: 40 * i })), nextId: 7, extension: true, deflection: true }, true);
  const ms = await kit.timeIt(page, 'const a = window.__app; a.state.loads[2].a = 120 + Math.random() * 20; a.changed();', 21);
  console.log('    median update with 6 loads and deflection: ' + ms.toFixed(1) + ' ms');
  t.ok('moving a load re-solves and redraws everything in under 50 ms', ms < 50, ms.toFixed(1) + ' ms');
  fs.writeFileSync(path.join(root, 'docs', 'screenshots', 'perf.txt'), 'Median full update (6 loads, deflection on), headless Chromium on the build machine: ' + ms.toFixed(1) + ' ms\n');

  await t.finish();
})().catch(e => { console.error(e); process.exit(1); });
