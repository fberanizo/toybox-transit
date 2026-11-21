import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare, initialState, applyMove, outcome } from '../src/core/rules.js';
import { solve } from '../src/core/solver.js';
import { OUTCOME } from '../src/core/defs.js';
import { randomWinRate } from '../src/core/metrics.js';

const fill = (c, n) => Array(n).fill(c);

// Three cars side by side, all free to leave. Line: 4 red, 4 blue, 4 yellow.
const base = {
    cols: 4, rows: 3, bays: 1,
    vehicles: [
        { kind: 'car', color: 'blue', dir: 'U', x: 0, y: 0 },
        { kind: 'car', color: 'red', dir: 'U', x: 1, y: 0 },
        { kind: 'car', color: 'yellow', dir: 'U', x: 2, y: 0 }
    ],
    queue: [...fill('red', 4), ...fill('blue', 4), ...fill('yellow', 4)]
};

test('plaza fills from the line at the start, up to its capacity', () => {
    const L = prepare({ ...base, pool: 6 });
    const s = initialState(L);
    assert.deepEqual(s.pool, [...fill('red', 4), ...fill('blue', 2)]);
    assert.equal(s.qi, 6);
});

test('with a plaza, a non-front colour boards a parked vehicle (classic rule would not)', () => {
    // Classic (pool 1): docking blue first leaves the red front passenger unserved → single bay full → loss.
    const classic = prepare({ ...base, pool: 1 });
    let c = applyMove(classic, initialState(classic), 0).state;
    assert.equal(outcome(classic, c), OUTCOME.LOSS_BAYS);
    // Plaza of 6: the two blues already waiting board at once, then the plaza refills.
    const L = prepare({ ...base, pool: 6 });
    const r = applyMove(L, initialState(L), 0);
    const boarded = r.events.filter((e) => e.type === 'board').map((e) => e.color);
    assert.ok(boarded.length >= 2 && boarded.every((x) => x === 'blue'));
    assert.ok(r.events.some((e) => e.type === 'enter'));
});

test('longest-waiting passenger boards first, and the vehicle leaves when full', () => {
    const L = prepare({ ...base, pool: 12, bays: 2 });
    let s = initialState(L);
    const r = applyMove(L, s, 1); // red car: the four reds board, it departs
    assert.deepEqual(r.events.filter((e) => e.type === 'board').map((e) => e.slot), [0, 0, 0, 0]);
    assert.ok(r.events.some((e) => e.type === 'depart' && e.vehicle === 1));
});

test('plaza levels solve and forgive more orders than the classic rule', () => {
    assert.equal(solve({ ...base, pool: 1 }).status, 'SOLVED');
    assert.equal(solve({ ...base, pool: 12 }).status, 'SOLVED');
    assert.ok(randomWinRate({ ...base, pool: 12 }, 200) > randomWinRate({ ...base, pool: 1 }, 200));
});
