// src/core/metrics.js — difficulty / fairness measurements, all computed with the real rules.

import { prepare, initialState, applyMove, legalMoves, outcome, freeBay, replay } from './rules.js';
import { solve } from './solver.js';
import { OUTCOME, ST } from './defs.js';
import { makeRng } from './rng.js';

export const VISIBLE_WINDOW = 14;   // passengers drawn in the queue
export const VISIBLE_RUNS = 6;      // colour runs shown on the "coming up" ribbon (colour × count)

/** How many passengers ahead the player can see from queue index qi (window or ribbon, whichever is longer). */
export function visibleHorizon(L, qi, window = VISIBLE_WINDOW, runs = VISIBLE_RUNS) {
    let q = qi, r = 0;
    while (q < L.queue.length && r < runs) {
        const c = L.queue[q];
        while (q < L.queue.length && L.queue[q] === c) q++;
        r++;
    }
    return Math.max(Math.min(L.queue.length - qi, window), q - qi);
}

/** Longest blocking chain at the start (1 = free to leave). Infinity if there is a cycle. */
export function blockDepth(level) {
    const L = prepare(level);
    const s = initialState(L);
    const memo = new Map();
    const visiting = new Set();
    const depth = (i) => {
        if (memo.has(i)) return memo.get(i);
        if (visiting.has(i)) return Infinity;
        visiting.add(i);
        let d = 1;
        for (const c of L.rays[i]) {
            const o = s.occ[c];
            if (o >= 0) d = Math.max(d, 1 + depth(o));
        }
        visiting.delete(i);
        memo.set(i, d);
        return d;
    };
    let max = 0, sum = 0, cnt = 0;
    const hist = {};
    for (let i = 0; i < s.st.length; i++) {
        if (s.st[i] !== ST.LOT) continue;
        const d = depth(i);
        max = Math.max(max, d);
        sum += d; cnt++;
        hist[d] = (hist[d] || 0) + 1;
    }
    return { max, mean: cnt ? sum / cnt : 0, hist };
}

/** Fraction of uniformly random playouts that win. */
export function randomWinRate(level, trials = 200, seed = 'rand') {
    const L = prepare(level);
    const rng = makeRng(seed);
    let wins = 0;
    for (let t = 0; t < trials; t++) {
        let s = initialState(L);
        for (;;) {
            const moves = legalMoves(L, s);
            if (moves.length === 0) break;
            s = applyMove(L, s, rng.pick(moves), { mutate: true, withEvents: false }).state;
        }
        if (outcome(L, s) === OUTCOME.WIN) wins++;
    }
    return wins / trials;
}

/**
 * Fair-play bot: sees the lot, the bays and only the next `window` passengers. At each step it keeps moves
 * from which the next `window` passengers can still all board, preferring moves that board people right away
 * and keep bays free. If it can win with only that horizon, the level never depends on hidden information.
 */
export function fairBotWins(level, { window = VISIBLE_WINDOW, runs = VISIBLE_RUNS, seeds = 8, subNodes = 15000 } = {}) {
    const L = prepare(level);
    let wins = 0;
    for (let k = 0; k < seeds; k++) {
        const rng = makeRng('fair' + k);
        let s = initialState(L);
        for (;;) {
            const moves = legalMoves(L, s);
            if (moves.length === 0) break;
            // Visible: everyone in the plaza, plus the line up to the window / ribbon horizon.
            const goal = s.done + s.pool.length + visibleHorizon(L, s.qi, window, runs);
            const scored = [];
            for (const m of moves) {
                const child = applyMove(L, s, m, { withEvents: false }).state;
                let ok = child.done >= goal;
                if (!ok && outcome(L, child) === OUTCOME.PLAYING) {
                    ok = solve(L, { startState: child, goalDone: goal, maxNodes: subNodes }).status === 'SOLVED';
                }
                const freeBays = child.bays.reduce((a, v) => a + (v < 0 ? 1 : 0), 0);
                scored.push({ m, child, ok, score: (child.done - s.done) * 10 + freeBays + rng.next() * 0.5 });
            }
            const pool = scored.some((o) => o.ok) ? scored.filter((o) => o.ok) : scored;
            pool.sort((a, b) => b.score - a.score);
            s = pool[0].child;
        }
        if (outcome(L, s) === OUTCOME.WIN) wins++;
        if (wins > 0) break; // one win proves the level is fair; save time
    }
    return wins > 0;
}

/**
 * Full analysis used by the generator and the curated-level checks.
 * Returns null fields when the level is not proven solvable.
 */
export function analyze(level, opts = {}) {
    const L = prepare(level);
    const solveNodes = opts.solveNodes ?? 200000;
    const solveMs = opts.solveMs ?? Infinity;
    const res = solve(L, { maxNodes: solveNodes, timeMs: solveMs });
    const out = { status: res.status, nodes: res.nodes, solveMs: +res.ms.toFixed(1), witness: res.witness };
    if (res.status !== 'SOLVED') return out;

    // Witness must replay to a win through the same rules.
    const rp = replay(L, res.witness);
    out.replayOk = rp.ok && rp.outcome === OUTCOME.WIN;
    if (!out.replayOk) return out;

    // Walk the witness; at each step count legal moves and how many still lead to a win (traps = the rest).
    const deadSet = new Set();
    let s = initialState(L);
    let decisions = 0, traps = 0, choicePoints = 0, waits = 0, peak = 0, inconclusive = 0;
    let firstMoves = 0, winningFirst = 0;
    const steps = res.witness.length;
    for (let step = 0; step < steps; step++) {
        const moves = legalMoves(L, s);
        let winning = 0;
        if (moves.length > 1 || step === 0) {
            for (const m of moves) {
                const child = applyMove(L, s, m, { withEvents: false }).state;
                const r = child.done >= L.queue.length ? 'SOLVED'
                    : solve(L, { startState: child, maxNodes: opts.trapNodes ?? 20000, deadSet }).status;
                if (r === 'SOLVED') winning++;
                else if (r === 'INCONCLUSIVE') { inconclusive++; winning++; } // never count unknowns as traps
            }
        } else winning = moves.length;
        if (step === 0) { firstMoves = moves.length; winningFirst = winning; }
        if (moves.length > 1) choicePoints++;
        if (winning < moves.length) { decisions++; traps += moves.length - winning; }
        // Peak bay use is measured at the moment of docking (before anyone boards or departs).
        let occupiedBefore = 0;
        for (let b = 0; b < s.bays.length; b++) if (s.bays[b] >= 0) occupiedBefore++;
        peak = Math.max(peak, occupiedBefore + 1);
        const vi = res.witness[step];
        const r = applyMove(L, s, vi, { withEvents: true });
        // A "wait": the vehicle docks but nobody boards it in this step.
        if (!r.events.some((e) => e.type === 'board' && e.vehicle === vi)) waits++;
        s = r.state;
    }
    const bd = blockDepth(L);
    out.metrics = {
        vehicles: L.vehicles.length,
        colors: new Set(L.vehicles.map((v) => v.color)).size,
        passengers: L.queue.length,
        bays: L.bays,
        steps,
        choicePoints,
        decisions,                     // steps where at least one legal move loses
        traps,                         // losing legal moves along the solution
        trapDensity: +(traps / Math.max(1, steps)).toFixed(3),
        waits,                         // vehicles that must park before anyone can board them
        peakBays: peak,
        bayPressure: +(peak / L.bays).toFixed(2),
        firstMoves,
        winningFirst,
        blockMax: bd.max,
        blockMean: +bd.mean.toFixed(2),
        inconclusive
    };
    if (opts.randomTrials !== 0) out.metrics.randomWin = +randomWinRate(L, opts.randomTrials ?? 200, 'r' + (L.meta.seed ?? '')).toFixed(3);
    if (opts.fairBot !== false) out.metrics.fair = fairBotWins(L);
    return out;
}
