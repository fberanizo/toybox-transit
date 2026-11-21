// src/core/rules.js — the single source of truth for game rules.
// Used by the game view, the solver, the generator, the worker and the tests.
//
// Rules:
//  * Tap a vehicle in the lot. It may leave only if every cell from its nose to the board edge, along its
//    arrow, is free of lot vehicles, walls and garages, AND a bay is free. It takes the leftmost free bay.
//  * Passengers arrive in a fixed order (the line) and walk into the PLAZA, a loop that holds up to
//    `level.pool` people. Whenever someone in the plaza has the colour of a docked vehicle with a free seat,
//    they board it (longest-waiting first; leftmost matching vehicle). A full vehicle departs at once,
//    freeing its bay; the plaza refills from the line immediately.
//    pool = 1 is the classic rule where only the front passenger can board.
//  * When a lot vehicle leaves, every garage whose spawn lane is now clear releases its next vehicle.
//  * WIN when everyone has boarded. LOSS when no legal move remains (every bay holds a vehicle nobody in the
//    plaza can board = LOSS_BAYS; a free bay but nothing can drive out = LOSS_STUCK).

import { ST, OUTCOME, DIRS } from './defs.js';
import { normalizeLevel, cellsOf } from './level.js';

const WALL = -2;
const EMPTY = -1;

/** Prepare a level for play. Accepts raw levels (normalises them) or already-prepared ones. */
export function prepare(level) {
    if (level.__prepared) return level;
    const L = normalizeLevel(level);
    L.cells = L.vehicles.map((v) => cellsOf(v.x, v.y, v.dir, v.len).map(([x, y]) => y * L.cols + x));
    // Ray of cells from nose to edge, nearest first.
    L.rays = L.vehicles.map((v) => {
        const [dx, dy] = DIRS[v.dir];
        const ray = [];
        let x, y;
        if (v.dir === 'U') { x = v.x; y = v.y - 1; }
        else if (v.dir === 'D') { x = v.x; y = v.y + v.len; }
        else if (v.dir === 'L') { x = v.x - 1; y = v.y; }
        else { x = v.x + v.len; y = v.y; }
        while (x >= 0 && y >= 0 && x < L.cols && y < L.rows) { ray.push(y * L.cols + x); x += dx; y += dy; }
        return ray;
    });
    L.static = new Int16Array(L.cols * L.rows).fill(EMPTY);
    for (const [x, y] of L.walls) L.static[y * L.cols + x] = WALL;
    for (const g of L.garages) L.static[g.y * L.cols + g.x] = WALL;
    L.colorTotals = {};
    for (const c of L.queue) L.colorTotals[c] = (L.colorTotals[c] || 0) + 1;
    Object.defineProperty(L, '__prepared', { value: true });
    return L;
}

/** Initial state (plaza filled from the line; garages release their first vehicle if their lane is clear). */
export function initialState(level) {
    const L = prepare(level);
    const n = L.vehicles.length;
    const s = {
        st: new Uint8Array(n),
        boarded: new Uint8Array(n),
        bays: new Int16Array(L.bays).fill(-1),
        qi: 0,                 // next passenger in the line to enter the plaza
        pool: [],              // colours in the plaza, longest-waiting first
        done: 0,               // passengers who have boarded
        gptr: new Uint8Array(L.garages.length),
        occ: Int16Array.from(L.static),
        moves: 0
    };
    for (let i = 0; i < n; i++) {
        if (L.vehicles[i].garage === -1) {
            s.st[i] = ST.LOT;
            for (const c of L.cells[i]) s.occ[c] = i;
        }
    }
    spawnGarages(L, s, null);
    refill(L, s, null);
    return s;
}

export function cloneState(s) {
    return {
        st: s.st.slice(),
        boarded: s.boarded.slice(),
        bays: s.bays.slice(),
        qi: s.qi,
        pool: s.pool.slice(),
        done: s.done,
        gptr: s.gptr.slice(),
        occ: s.occ.slice(),
        moves: s.moves
    };
}

/** Is the path from vehicle i's nose to the edge clear? (ignores bay availability) */
export function pathClear(L, s, i) {
    if (s.st[i] !== ST.LOT) return false;
    for (const c of L.rays[i]) if (s.occ[c] !== EMPTY) return false;
    return true;
}

/** First blocker on vehicle i's path: { kind: 'vehicle'|'wall', index } or null. */
export function firstBlocker(L, s, i) {
    for (const c of L.rays[i]) {
        const o = s.occ[c];
        if (o === EMPTY) continue;
        return o === WALL ? { kind: 'wall', cell: c } : { kind: 'vehicle', index: o };
    }
    return null;
}

export function freeBay(s) {
    for (let b = 0; b < s.bays.length; b++) if (s.bays[b] === -1) return b;
    return -1;
}

/** Why a tap on vehicle i would fail, or null if it is legal. */
export function tapRejection(L, s, i) {
    if (s.st[i] !== ST.LOT) return 'NOT_IN_LOT';
    if (!pathClear(L, s, i)) return 'BLOCKED';
    if (freeBay(s) === -1) return 'BAYS_FULL';
    return null;
}

export const allBoarded = (L, s) => s.done >= L.queue.length;

/** Legal moves: indices of lot vehicles that can drive out right now. */
export function legalMoves(L, s) {
    if (allBoarded(L, s)) return [];
    if (freeBay(s) === -1) return [];
    const out = [];
    for (let i = 0; i < s.st.length; i++) if (s.st[i] === ST.LOT && pathClear(L, s, i)) out.push(i);
    return out;
}

function spawnGarages(L, s, events) {
    for (let g = 0; g < L.garages.length; g++) {
        const G = L.garages[g];
        const p = s.gptr[g];
        if (p >= G.ids.length) continue;
        const vi = G.ids[p];
        let clear = true;
        for (const c of L.cells[vi]) if (s.occ[c] !== EMPTY) { clear = false; break; }
        if (!clear) continue;
        s.gptr[g] = p + 1;
        s.st[vi] = ST.LOT;
        for (const c of L.cells[vi]) s.occ[c] = vi;
        if (events) events.push({ type: 'spawn', vehicle: vi, garage: g });
    }
}

/** Walk people from the line into the plaza while there is room. */
function refill(L, s, events) {
    while (s.pool.length < L.pool && s.qi < L.queue.length) {
        const color = L.queue[s.qi];
        s.pool.push(color);
        if (events) events.push({ type: 'enter', color, qi: s.qi });
        s.qi++;
    }
}

/** Board everyone who can board, longest-waiting first, refilling the plaza as people leave it. */
function board(L, s, events) {
    for (;;) {
        let found = false;
        for (let p = 0; p < s.pool.length; p++) {
            const color = s.pool[p];
            let target = -1;
            for (let b = 0; b < s.bays.length; b++) {
                const vi = s.bays[b];
                if (vi >= 0 && L.vehicles[vi].color === color && s.boarded[vi] < L.vehicles[vi].cap) { target = b; break; }
            }
            if (target === -1) continue;
            const vi = s.bays[target];
            s.pool.splice(p, 1);
            s.boarded[vi]++;
            s.done++;
            if (events) events.push({ type: 'board', vehicle: vi, bay: target, color, slot: p });
            if (s.boarded[vi] >= L.vehicles[vi].cap) {
                s.st[vi] = ST.GONE;
                s.bays[target] = -1;
                if (events) events.push({ type: 'depart', vehicle: vi, bay: target });
            }
            refill(L, s, events);
            found = true;
            break;
        }
        if (!found) return;
    }
}

/**
 * Apply a tap on vehicle i. Returns { ok, state, events, reason }.
 * The input state is never mutated unless mutate=true (solver hot path).
 */
export function applyMove(level, s, i, { mutate = false, withEvents = true } = {}) {
    const L = prepare(level);
    const reason = tapRejection(L, s, i);
    if (reason || allBoarded(L, s)) return { ok: false, reason: reason || 'GAME_OVER', state: s, events: [] };
    const n = mutate ? s : cloneState(s);
    const events = withEvents ? [] : null;
    const b = freeBay(n);
    n.st[i] = ST.BAY;
    n.bays[b] = i;
    for (const c of L.cells[i]) n.occ[c] = EMPTY;
    n.moves++;
    if (events) events.push({ type: 'exit', vehicle: i, bay: b });
    spawnGarages(L, n, events);
    board(L, n, events);
    if (events) events.push({ type: 'outcome', outcome: outcome(L, n) });
    return { ok: true, state: n, events: events || [] };
}

export function outcome(level, s) {
    const L = prepare(level);
    if (allBoarded(L, s)) return OUTCOME.WIN;
    if (legalMoves(L, s).length > 0) return OUTCOME.PLAYING;
    return freeBay(s) === -1 ? OUTCOME.LOSS_BAYS : OUTCOME.LOSS_STUCK;
}

/** Canonical key for memoisation. Plaza order only breaks ties between identical colours, so sort it. */
export function stateKey(s) {
    let k = '';
    for (let i = 0; i < s.st.length; i++) k += s.st[i];
    k += '|' + s.qi + '|' + s.pool.slice().sort().join('') + '|';
    for (let b = 0; b < s.bays.length; b++) {
        const v = s.bays[b];
        k += v < 0 ? '-,' : v + ':' + s.boarded[v] + ',';
    }
    return k;
}

/** Replay a sequence of vehicle indices from the start. Returns { ok, state, failedAt, outcome }. */
export function replay(level, moves) {
    const L = prepare(level);
    let s = initialState(L);
    for (let m = 0; m < moves.length; m++) {
        const r = applyMove(L, s, moves[m], { withEvents: false });
        if (!r.ok) return { ok: false, state: s, failedAt: m, reason: r.reason, outcome: outcome(L, s) };
        s = r.state;
    }
    return { ok: true, state: s, outcome: outcome(L, s) };
}

/** Passengers still waiting (plaza + line) per colour. */
export function remainingByColor(L, s) {
    const out = {};
    for (const c of s.pool) out[c] = (out[c] || 0) + 1;
    for (let q = s.qi; q < L.queue.length; q++) out[L.queue[q]] = (out[L.queue[q]] || 0) + 1;
    return out;
}
