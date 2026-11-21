import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CURATED } from '../src/levels/curated.js';
import { validateLevel } from '../src/core/level.js';
import { analyze } from '../src/core/metrics.js';

for (const [idx, lvl] of CURATED.entries()) {
    test(`curated ${lvl.id} "${lvl.name}" is valid, solvable, replayable and fair`, () => {
        const v = validateLevel(lvl);
        assert.ok(v.ok, v.errors.join('; '));
        const a = analyze(lvl, { randomTrials: 300 });
        assert.equal(a.status, 'SOLVED');
        assert.equal(a.replayOk, true);
        assert.equal(a.metrics.fair, true, 'needs information the player cannot see');
        // Only the very first lesson may be trivially easy.
        if (idx > 0) assert.ok(a.metrics.randomWin < 0.5, `too easy: random play wins ${a.metrics.randomWin}`);
    });
}
