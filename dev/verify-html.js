// Confirms the code inlined in index.html is exactly the tested code, then runs
// spec cases on the inline copy. Run: node dev/verify-html.js   (--fix copies dev/core.js in)
'use strict';
const path = require('path');
const vb = require('./vendor/verify-blocks.js');
const root = path.join(__dirname, '..');
if (process.argv.includes('--fix') && vb.syncCore(root)) console.log('Copied dev/core.js into index.html.');
let passed = 0, failed = 0;
const ok = (n, c, d) => { if (c) { passed++; console.log('  PASS ' + n); } else { failed++; console.log('  FAIL ' + n + (d ? ': ' + d : '')); } };
const near = (n, g, e) => ok(n, Math.abs(e) < 1 ? Math.abs(g - e) <= 0.01 : Math.abs(g - e) / Math.abs(e) <= 0.005, 'got ' + g + ', expected ' + e);

console.log('Inline blocks match dev/core.js and dev/vendor/');
const problems = vb.verify(root);
problems.forEach(p => ok(p, false));
ok('every inline block matches its tested copy', problems.length === 0);

console.log('Inline copy runs the spec cases');
const BeamCore = vb.loadInline(root, 'vendor:beam-core.js');
const ShaftTool = vb.loadInline(root, 'core', { BeamCore });
const st = o => Object.assign(ShaftTool.defaultState(), o);
const s1 = ShaftTool.solve(st({ mode: 'beam' }));
near('SB-1 R_A (inline)', s1.RA, 500); near('SB-1 |M|max (inline)', s1.MmaxAbs, 75.0);
const s6 = ShaftTool.solve(st({}));
near('SB-6 n (inline, default state)', s6.n, 4.10); near('SB-6 required d (inline)', s6.dReq, 15.7);
const s11 = ShaftTool.solve(st({ mode: 'beam', deflection: true }));
near('SB-11 δ_max (inline)', s11.defl.max, 0.358);
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
