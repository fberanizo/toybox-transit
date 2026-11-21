import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare, initialState, applyMove, legalMoves, outcome, tapRejection, replay, cloneState } from '../src/core/rules.js';
import { validateLevel } from '../src/core/level.js';
import { solve } from '../src/core/solver.js';
import { OUTCOME, ST } from '../src/core/defs.js';
import { LEGACY } from './fixtures/legacy-levels.mjs';

const fill = (c, n) => Array(n).fill(c);

test('audit #1: legacy level 2 is unwinnable (two top vans block each other)', () => {
    assert.equal(validateLevel(LEGACY[1]).ok, true);
    assert.equal(solve(LEGACY[1]).status, 'UNSOLVABLE');
});

test('audit #2: legacy level 3 has an overlap and a head-on deadlock', () => {
    const v = validateLevel(LEGACY[2]);
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes('overlaps') && e.includes('4,4')));
});

test('audit #3: legacy levels 1 and 4 are solvable', () => {
    assert.equal(solve(LEGACY[0]).status, 'SOLVED');
    assert.equal(solve(LEGACY[3]).status, 'SOLVED');
});

test('audit #5: stuck board is reported as a loss, not a silent soft-lock', () => {
    const L = prepare(LEGACY[1]);
    let s = initialState(L);
    // Only the two side cars can leave; send both, then nothing can move.
    for (const i of legalMoves(L, s)) s = applyMove(L, s, i).state;
    while (legalMoves(L, s).length) s = applyMove(L, s, legalMoves(L, s)[0]).state;
    assert.notEqual(outcome(L, s), OUTCOME.PLAYING);
    assert.equal(outcome(L, s), OUTCOME.LOSS_STUCK);
});

test('audit #6: a vehicle departs in the same step it fills, so a full bay row is never a false loss', () => {
    // 2 bays. Red car docks first, blue car second → bays full. The 4 reds board, red departs → bay frees.
    const lvl = {
        cols: 4, rows: 4, bays: 2,
        vehicles: [
            { kind: 'car', color: 'blue', dir: 'U', x: 0, y: 0 },
            { kind: 'car', color: 'red', dir: 'U', x: 1, y: 0 },
            { kind: 'car', color: 'blue', dir: 'U', x: 2, y: 0 }
        ],
        queue: [...fill('red', 4), ...fill('blue', 8)]
    };
    const L = prepare(lvl);
    let s = initialState(L);
    s = applyMove(L, s, 0).state; // blue waits
    const r = applyMove(L, s, 1);  // red docks, 4 board, departs
    assert.ok(r.events.some((e) => e.type === 'depart' && e.vehicle === 1));
    assert.equal(outcome(L, r.state), OUTCOME.PLAYING);
    assert.equal(r.state.st[1], ST.GONE);
});

test('loss when bays fill with vehicles the front passenger cannot board', () => {
    const lvl = {
        cols: 4, rows: 3, bays: 2,
        vehicles: [
            { kind: 'car', color: 'blue', dir: 'U', x: 0, y: 0 },
            { kind: 'car', color: 'blue', dir: 'U', x: 1, y: 0 },
            { kind: 'car', color: 'red', dir: 'U', x: 2, y: 0 }
        ],
        queue: [...fill('red', 4), ...fill('blue', 8)]
    };
    const L = prepare(lvl);
    let s = initialState(L);
    s = applyMove(L, s, 0).state;
    s = applyMove(L, s, 1).state;
    assert.equal(outcome(L, s), OUTCOME.LOSS_BAYS);
    assert.equal(tapRejection(L, s, 2), 'BAYS_FULL');
});

test('blocked vehicles cannot leave; blocker leaving frees them', () => {
    const lvl = {
        cols: 3, rows: 5, bays: 3,
        vehicles: [
            { kind: 'car', color: 'red', dir: 'U', x: 1, y: 3 },   // blocked by the van above
            { kind: 'van', color: 'blue', dir: 'R', x: 0, y: 1 }
        ],
        queue: [...fill('blue', 6), ...fill('red', 4)]
    };
    const L = prepare(lvl);
    let s = initialState(L);
    assert.equal(tapRejection(L, s, 0), 'BLOCKED');
    s = applyMove(L, s, 1).state;
    assert.equal(tapRejection(L, s, 0), null);
    s = applyMove(L, s, 0).state;
    assert.equal(outcome(L, s), OUTCOME.WIN);
});

test('applyMove never mutates its input (undo relies on immutable snapshots)', () => {
    const L = prepare(LEGACY[0]);
    const s0 = initialState(L);
    const copy = cloneState(s0);
    applyMove(L, s0, 0);
    assert.deepEqual(s0, copy);
});

test('garages release their next vehicle once the lane clears', () => {
    const lvl = {
        cols: 3, rows: 5, bays: 3,
        vehicles: [],
        garages: [{ x: 1, y: 4, dir: 'U', vehicles: [{ kind: 'car', color: 'red' }, { kind: 'car', color: 'blue' }] }],
        queue: [...fill('red', 4), ...fill('blue', 4)]
    };
    assert.equal(validateLevel(lvl).ok, true);
    const L = prepare(lvl);
    let s = initialState(L);
    assert.deepEqual(legalMoves(L, s), [0]);
    const r = applyMove(L, s, 0);
    assert.ok(r.events.some((e) => e.type === 'spawn' && e.vehicle === 1));
    s = applyMove(L, r.state, 1).state;
    assert.equal(outcome(L, s), OUTCOME.WIN);
});

test('solver witnesses replay to a win through the rules', () => {
    for (const lvl of [LEGACY[0], LEGACY[3]]) {
        const r = solve(lvl);
        const rp = replay(lvl, r.witness);
        assert.equal(rp.outcome, OUTCOME.WIN);
    }
});
