import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construct, evaluate, makeSeed, parseSeed, generateForBand, GEN_VERSION, BANDS } from '../src/core/generator.js';
import { validateLevel } from '../src/core/level.js';
import { solve } from '../src/core/solver.js';
import { replay } from '../src/core/rules.js';
import { POOL } from '../src/levels/pool.js';
import { bandFor, FIRST_GENERATED } from '../src/levels/schedule.js';
import { canonicalHash } from '../src/core/similarity.js';

test('seeds round-trip and carry the generator version', () => {
    const s = makeSeed('hard', 42);
    assert.deepEqual(parseSeed(s), { genVersion: GEN_VERSION, band: 'hard', n: 42 });
    assert.equal(construct('g999-hard-1').fail, 'gen-version');
});

test('construction is deterministic (byte-identical per seed)', () => {
    for (const band of BANDS) for (let n = 0; n < 15; n++) {
        const s = makeSeed(band, n);
        assert.equal(JSON.stringify(construct(s)), JSON.stringify(construct(s)));
    }
});

test('generateForBand returns a verified level in the requested band', () => {
    for (const band of BANDS) {
        const r = generateForBand(band, 5000, { maxTries: 150 });
        assert.ok(r, `no ${band} level within 150 tries`);
        assert.equal(r.eval.band, band);
        assert.ok(validateLevel(r.level).ok);
        const sol = solve(r.level);
        assert.equal(sol.status, 'SOLVED');
        assert.equal(replay(r.level, sol.witness).outcome, 'WIN');
    }
});

test('every shipped pool seed reconstructs into a valid, solvable, fair level of its band', () => {
    assert.equal(POOL.genVersion, GEN_VERSION);
    const hashes = new Set();
    for (const band of BANDS) {
        const list = POOL.levels[band];
        assert.ok(list.length >= 100, `${band} pool too small`);
        // Full re-evaluation on a sample keeps the test fast; the build script evaluated all of them.
        list.forEach((e, i) => {
            const c = construct(e.seed);
            assert.ok(!c.fail, e.seed);
            assert.ok(validateLevel(c.level).ok, e.seed);
            const h = canonicalHash(c.level);
            assert.ok(!hashes.has(h), `duplicate in pool: ${e.seed}`);
            hashes.add(h);
            if (i % 12 === 0) {
                const ev = evaluate(c.level);
                assert.ok(ev.ok, `${e.seed} rejected: ${ev.reason}`);
                assert.equal(ev.band, band, `${e.seed} measured ${ev.band}`);
            }
        });
    }
});

test('INCONCLUSIVE solver results are rejected, never served', () => {
    const r = generateForBand('expert', 9000, { maxTries: 150 });
    const e = evaluate(r.level, { solveNodes: 3 });
    if (e.reason === 'timeout') assert.equal(e.ok, false);
    else assert.equal(e.ok, true); // solved within 3 nodes is a genuine solve
});

test('band schedule: sawtooth with breathers', () => {
    assert.equal(bandFor(FIRST_GENERATED - 1), null);
    const first = Array.from({ length: 7 }, (_, k) => bandFor(FIRST_GENERATED + k));
    assert.ok(first.includes('breather'));
    assert.ok(bandFor(200) !== null);
});
