// src/core/solver.js — deterministic depth-first solver over the real rules.
//
// solve(level, opts) → { status: 'SOLVED' | 'UNSOLVABLE' | 'INCONCLUSIVE', witness, nodes, ms }
//   * SOLVED: witness is a list of vehicle indices that reaches the goal when replayed through rules.js.
//   * UNSOLVABLE: the full search space was exhausted.
//   * INCONCLUSIVE: the node or time budget ran out. Callers must treat this as "unknown", never as solvable.
//
// opts.goalDone: stop as soon as this many passengers have boarded (used by the fair-play bot).

import { prepare, initialState, cloneState, legalMoves, applyMove, stateKey } from './rules.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Order moves: vehicles that the front passenger can board first, then by how soon their colour is needed. */
export function orderMoves(L, s, moves) {
    const nextNeed = {};
    // Colours waiting in the plaza are needed now (0); then the line, in order.
    for (const c of s.pool) nextNeed[c] = 0;
    for (let q = s.qi; q < L.queue.length && Object.keys(nextNeed).length < 8; q++) {
        const c = L.queue[q];
        if (!(c in nextNeed)) nextNeed[c] = 1 + q - s.qi;
    }
    return moves
        .map((i) => ({ i, k: (nextNeed[L.vehicles[i].color] ?? 1e6) * 4 - L.vehicles[i].cap * 0.01 }))
        .sort((a, b) => a.k - b.k || a.i - b.i)
        .map((o) => o.i);
}

export function solve(level, opts = {}) {
    const L = prepare(level);
    const maxNodes = opts.maxNodes ?? 200000;
    const deadline = opts.timeMs != null ? now() + opts.timeMs : Infinity;
    const goalDone = opts.goalDone ?? L.queue.length;
    const dead = opts.deadSet ?? new Set();
    const t0 = now();
    let nodes = 0;
    let aborted = false;
    const path = [];

    function dfs(s) {
        if (s.done >= goalDone) return true;
        if (++nodes > maxNodes || ((nodes & 255) === 0 && now() > deadline)) { aborted = true; return false; }
        const key = stateKey(s);
        if (dead.has(key)) return false;
        const moves = orderMoves(L, s, legalMoves(L, s));
        for (const m of moves) {
            const child = applyMove(L, s, m, { withEvents: false }).state;
            path.push(m);
            if (dfs(child)) return true;
            path.pop();
            if (aborted) return false;
        }
        if (!aborted) dead.add(key);
        return false;
    }

    const start = opts.startState ? cloneState(opts.startState) : initialState(L);
    const found = dfs(start);
    const ms = now() - t0;
    if (found) return { status: 'SOLVED', witness: path.slice(), nodes, ms };
    return { status: aborted ? 'INCONCLUSIVE' : 'UNSOLVABLE', witness: null, nodes, ms };
}

/** Is a given state still winnable? true / false / null (inconclusive). Shares a dead-state cache if given. */
export function winnableFrom(level, state, opts = {}) {
    const r = solve(level, { ...opts, startState: state });
    return r.status === 'SOLVED' ? true : r.status === 'UNSOLVABLE' ? false : null;
}
