#!/usr/bin/env node
// Analyse levels with the real rules: validity, solvability, witness replay and difficulty metrics.
// Usage: node scripts/analyze.mjs [module-path=src/levels/curated.js] [--export=NAME]

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { validateLevel } from '../src/core/level.js';
import { analyze } from '../src/core/metrics.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--')) || 'src/levels/curated.js';
const exp = (args.find((a) => a.startsWith('--export=')) || '--export=CURATED').split('=')[1];
const mod = await import(pathToFileURL(resolve(file)).href);
const levels = mod[exp];

for (const lvl of levels) {
    const v = validateLevel(lvl);
    if (!v.ok) { console.log(`${lvl.id}: INVALID ${v.errors.join('; ')}`); continue; }
    const a = analyze(lvl, { randomTrials: 400 });
    const m = a.metrics || {};
    console.log(`${lvl.id} ${a.status}${a.replayOk === false ? ' REPLAY-FAIL' : ''} nodes=${a.nodes} ms=${a.solveMs}` +
        (a.metrics ? ` | veh=${m.vehicles} col=${m.colors} pax=${m.passengers} bays=${m.bays} choice=${m.choicePoints} dec=${m.decisions} traps=${m.traps} waits=${m.waits} peak=${m.peakBays} first=${m.winningFirst}/${m.firstMoves} block=${m.blockMax} rand=${m.randomWin} fair=${m.fair}` : ''));
}
