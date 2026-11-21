// src/core/generator.js — seeded level generator + verification pipeline (g2).
//
// construct(seed) is deterministic and cheap: same seed + GEN_VERSION → byte-identical level.
// evaluate(level) runs the expensive checks (solver, witness replay, metrics, fairness, band).
// A level is only ever served after evaluate() accepts it.
//
// Construction:
//  1. Pick a layout archetype — each one asks for a different kind of decision:
//       scatter : tangled blocking chains, read the lot
//       columns : single-colour columns guarded by a crossing row (which column to open, and when)
//       lanes   : alternating traffic lanes that only exit sideways, with vertical cars trapped between
//     plus modifiers: garages (a visible queue of vehicles that keeps refilling a lane) and cones (dead ends).
//  2. Place everything keeping the dependency graph acyclic (every vehicle can eventually leave).
//  3. Pick an intended drain order (a random topological order), colour vehicles (groups share colours).
//  4. Simulate the bays along that order and *emit* the passenger queue: some vehicles are left waiting in
//     their bay (bay pressure), seats are split into interleaved runs, and bays never overflow.

import { KINDS, COLORS, DIRS, isVertical } from './defs.js';
import { makeRng } from './rng.js';
import { cellsOf, validateLevel, garageSpawnPos } from './level.js';
import { replay, prepare } from './rules.js';
import { analyze } from './metrics.js';
import { GEN_VERSION } from './version.js';
import { BAND_PARAMS, BANDS, difficultyScore, bandForScore, rejectReason } from './bands.js';

export { GEN_VERSION };

export function makeSeed(band, n) {
    return `g${GEN_VERSION}-${band}-${n >>> 0}`;
}

export function parseSeed(seed) {
    const m = /^g(\d+)-([a-z]+)-(\d+)$/.exec(String(seed).trim());
    if (!m) return null;
    return { genVersion: +m[1], band: m[2], n: +m[3] };
}

// ------------------------------------------------------------------ geometry helpers

function rayOf(x, y, dir, len, cols, rows) {
    const [dx, dy] = DIRS[dir];
    const out = [];
    let cx, cy;
    if (dir === 'U') { cx = x; cy = y - 1; }
    else if (dir === 'D') { cx = x; cy = y + len; }
    else if (dir === 'L') { cx = x - 1; cy = y; }
    else { cx = x + len; cy = y; }
    while (cx >= 0 && cy >= 0 && cx < cols && cy < rows) { out.push(cy * cols + cx); cx += dx; cy += dy; }
    return out;
}

const cellIdx = (x, y, dir, len, cols) => cellsOf(x, y, dir, len).map(([cx, cy]) => cy * cols + cx);

/**
 * Board model during construction.
 * items = board vehicles then garage vehicles (same order the rules engine uses).
 * deps[i] = items that must leave before item i can (null if some item can never leave).
 */
class Board {
    constructor(cols, rows) {
        this.cols = cols; this.rows = rows;
        this.vs = [];               // board vehicles {kind, dir, x, y, len, group}
        this.garages = [];          // {x, y, dir, vehicles: [{kind, len}]}
        this.walls = [];
        this.static = new Set();    // walls + garage cells
        this.reserved = new Set();  // garage spawn lanes
        this.occ = new Map();       // cell → board vehicle index
    }

    inb(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows; }

    canPlaceCells(cells) {
        for (const c of cells) if (this.static.has(c) || this.reserved.has(c) || this.occ.has(c)) return false;
        return true;
    }

    items() {
        const out = this.vs.map((v) => ({ cells: cellIdx(v.x, v.y, v.dir, v.len, this.cols), ray: rayOf(v.x, v.y, v.dir, v.len, this.cols, this.rows), g: -1 }));
        this.garages.forEach((g, gi) => g.vehicles.forEach((gv, k) => {
            const [x, y] = garageSpawnPos(g, gv.len);
            out.push({ cells: cellIdx(x, y, g.dir, gv.len, this.cols), ray: rayOf(x, y, g.dir, gv.len, this.cols, this.rows), g: gi, k });
        }));
        return out;
    }

    deps() {
        const items = this.items();
        const lane = new Map(); // cell → garage item indices
        items.forEach((it, i) => { if (it.g >= 0) for (const c of it.cells) { if (!lane.has(c)) lane.set(c, []); lane.get(c).push(i); } });
        const deps = items.map(() => new Set());
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            for (const c of it.ray) {
                if (this.static.has(c)) return null;                 // drives into a cone/garage forever
                if (this.occ.has(c)) deps[i].add(this.occ.get(c));
                if (lane.has(c)) for (const j of lane.get(c)) if (j !== i && items[j].g !== it.g) deps[i].add(j);
            }
            if (it.g >= 0) {
                if (it.k > 0) deps[i].add(i - 1);                        // released after the previous one left
                for (const c of it.cells) if (this.occ.has(c)) deps[i].add(this.occ.get(c));
            }
        }
        return deps.map((s) => [...s]);
    }

    acyclic() {
        const d = this.deps();
        if (!d) return false;
        const state = new Uint8Array(d.length);
        const visit = (i) => {
            if (state[i] === 1) return true;
            if (state[i] === 2) return false;
            state[i] = 1;
            for (const j of d[i]) if (visit(j)) return true;
            state[i] = 2;
            return false;
        };
        for (let i = 0; i < d.length; i++) if (visit(i)) return false;
        return true;
    }

    /** Try to add a board vehicle; keeps it only if everything can still drain. */
    tryVehicle(kind, dir, x, y, group = null) {
        const len = KINDS[kind].len;
        for (const [cx, cy] of cellsOf(x, y, dir, len)) if (!this.inb(cx, cy)) return false;
        const cells = cellIdx(x, y, dir, len, this.cols);
        if (!this.canPlaceCells(cells)) return false;
        const v = { kind, dir, x, y, len, group };
        this.vs.push(v);
        cells.forEach((c) => this.occ.set(c, this.vs.length - 1));
        if (!this.acyclic()) {
            cells.forEach((c) => this.occ.delete(c));
            this.vs.pop();
            return false;
        }
        return true;
    }

    tryGarage(x, y, dir, kinds) {
        if (!this.inb(x, y)) return false;
        const gc = y * this.cols + x;
        if (this.static.has(gc) || this.reserved.has(gc) || this.occ.has(gc)) return false;
        const maxLen = Math.max(...kinds.map((k) => KINDS[k].len));
        const [sx, sy] = garageSpawnPos({ x, y, dir }, maxLen);
        const laneCells = cellsOf(sx, sy, dir, maxLen);
        for (const [cx, cy] of laneCells) if (!this.inb(cx, cy)) return false;
        const lane = laneCells.map(([cx, cy]) => cy * this.cols + cx);
        if (!this.canPlaceCells(lane)) return false;
        this.garages.push({ x, y, dir, vehicles: kinds.map((k) => ({ kind: k, len: KINDS[k].len })) });
        this.static.add(gc);
        lane.forEach((c) => this.reserved.add(c));
        if (!this.acyclic()) {
            this.garages.pop();
            this.static.delete(gc);
            lane.forEach((c) => this.reserved.delete(c));
            return false;
        }
        return true;
    }

    tryWall(x, y) {
        if (!this.inb(x, y)) return false;
        const c = y * this.cols + x;
        if (this.static.has(c) || this.reserved.has(c) || this.occ.has(c)) return false;
        this.static.add(c);
        this.walls.push([x, y]);
        if (!this.acyclic()) { this.static.delete(c); this.walls.pop(); return false; }
        return true;
    }

    get count() { return this.vs.length + this.garages.reduce((s, g) => s + g.vehicles.length, 0); }
}

// ------------------------------------------------------------------ layout archetypes

const DIR_W = [['U', 3], ['L', 1.6], ['R', 1.6], ['D', 1.1]];

function scatterFill(rng, B, P, target, groupProb = 0) {
    let attempts = 0;
    while (B.count < target && attempts < target * 60) {
        attempts++;
        const kind = rng.weighted(P.kinds);
        const len = KINDS[kind].len;
        const dir = rng.weighted(DIR_W);
        let x, y;
        if (B.vs.length && rng.chance(P.density)) {
            const a = rng.pick(B.vs);
            const side = rng.int(0, 3);
            const vert = isVertical(dir);
            if (side === 0) { x = a.x + (isVertical(a.dir) ? 1 : a.len); y = a.y; }
            else if (side === 1) { x = a.x - (vert ? 1 : len); y = a.y; }
            else if (side === 2) { x = a.x; y = a.y + (isVertical(a.dir) ? a.len : 1); }
            else { x = a.x; y = a.y - (vert ? len : 1); }
        } else {
            x = rng.int(0, B.cols - 1);
            y = rng.int(0, B.rows - 1);
        }
        B.tryVehicle(kind, dir, x, y, groupProb && rng.chance(groupProb) ? 'scatter' + rng.int(0, 2) : null);
    }
}

function layoutColumns(rng, B, P, target) {
    // A guard row of horizontal vehicles near the top, single-colour columns of up-facing vehicles beneath it.
    const gy = rng.int(0, 2);
    let x = rng.int(0, 1);
    while (x < B.cols && B.count < target) {
        const kind = rng.weighted([['car', 3], ['van', 2], ['bus', 1]]);
        const len = KINDS[kind].len;
        if (x + len > B.cols) break;
        B.tryVehicle(kind, rng.chance(0.5) ? 'L' : 'R', x, gy, 'guard');
        x += len + (rng.chance(0.25) ? 1 : 0);
    }
    for (let cx = 0; cx < B.cols && B.count < target; cx++) {
        if (rng.chance(0.25)) continue; // leave some open columns
        let y = gy + 1 + (rng.chance(0.3) ? 1 : 0);
        while (y < B.rows && B.count < target) {
            const kind = rng.weighted([['car', 4], ['van', 2], ['bus', 0.8]]);
            if (!B.tryVehicle(kind, 'U', cx, y, 'col' + cx)) { y++; continue; }
            y += KINDS[kind].len + (rng.chance(0.2) ? 1 : 0);
        }
    }
}

function layoutLanes(rng, B, P, target) {
    // Horizontal lanes with one direction each; vertical vehicles squeezed between lanes.
    let y = rng.int(0, 1);
    let lane = 0;
    while (y < B.rows && B.count < target) {
        const dir = (lane + rng.int(0, 1)) % 2 === 0 ? 'L' : 'R';
        let x = rng.int(0, 1);
        while (x < B.cols && B.count < target) {
            const kind = rng.weighted([['car', 3], ['van', 2], ['bus', 1.2]]);
            const len = KINDS[kind].len;
            if (x + len > B.cols) break;
            B.tryVehicle(kind, dir, x, y, 'lane' + lane);
            x += len + (rng.chance(0.3) ? 1 : 0);
        }
        // Between lanes: a few vertical vehicles.
        const gap = rng.int(1, 3);
        for (let k = 0; k < gap && B.count < target; k++) {
            const kind = rng.weighted([['car', 3], ['van', 1]]);
            B.tryVehicle(kind, rng.chance(0.7) ? 'U' : 'D', rng.int(0, B.cols - 1), y + 1);
        }
        y += 1 + (rng.chance(0.5) ? KINDS.van.len : KINDS.car.len);
        lane++;
    }
}

function placeGarages(rng, B, n) {
    let placed = 0, attempts = 0;
    while (placed < n && attempts++ < 40) {
        const side = rng.weighted([['bottom', 3], ['left', 1], ['right', 1]]);
        const count = rng.int(2, 4);
        const kinds = Array.from({ length: count }, () => rng.weighted([['car', 3], ['van', 1.5]]));
        let ok = false;
        if (side === 'bottom') ok = B.tryGarage(rng.int(0, B.cols - 1), B.rows - 1, 'U', kinds);
        else if (side === 'left') ok = B.tryGarage(0, rng.int(2, B.rows - 1), 'R', kinds);
        else ok = B.tryGarage(B.cols - 1, rng.int(2, B.rows - 1), 'L', kinds);
        if (ok) placed++;
    }
}

function placeWalls(rng, B, n) {
    let placed = 0, attempts = 0;
    while (placed < n && attempts++ < 60) {
        if (B.tryWall(rng.int(0, B.cols - 1), rng.int(1, B.rows - 1))) placed++;
    }
}

// ------------------------------------------------------------------ order, colours, queue

function topoOrder(rng, deps) {
    const n = deps.length;
    const removed = new Uint8Array(n);
    const order = [];
    while (order.length < n) {
        const ready = [];
        for (let i = 0; i < n; i++) if (!removed[i] && deps[i].every((j) => removed[j])) ready.push(i);
        if (!ready.length) return null;
        const pick = rng.pick(ready);
        removed[pick] = 1;
        order.push(pick);
    }
    return order;
}

/** items: [{kind, group}] → sets .color. Members of a group usually share a colour. */
function assignColors(rng, items, nColors, groupProb) {
    const palette = rng.shuffle(COLORS.slice()).slice(0, nColors);
    const seats = Object.fromEntries(palette.map((c) => [c, 0]));
    const groupColor = {};
    const lightest = () => {
        const min = Math.min(...palette.map((p) => seats[p]));
        return rng.pick(palette.filter((p) => seats[p] <= min + 6));
    };
    const order = rng.shuffle(items.map((_, i) => i));
    order.forEach((i, k) => {
        const it = items[i];
        let c;
        if (k < palette.length) c = palette[k];
        else if (it.group && groupColor[it.group] && rng.chance(groupProb)) c = groupColor[it.group];
        else c = lightest();
        if (it.group && !groupColor[it.group]) groupColor[it.group] = c;
        it.color = c;
        seats[c] += KINDS[it.kind].cap;
    });
}

function emitQueue(rng, items, order, B, P) {
    const bays = new Array(B).fill(-1);
    const seatsLeft = items.map((v) => KINDS[v.kind].cap);
    const queue = [];
    const docked = () => bays.filter((b) => b >= 0);
    const target = (color) => {
        for (const b of bays) if (b >= 0 && items[b].color === color && seatsLeft[b] > 0) return b;
        return -1;
    };
    const emit = (vi, count) => {
        const color = items[vi].color;
        for (let k = 0; k < count; k++) {
            const t = target(color);
            if (t < 0) return;
            queue.push(color);
            seatsLeft[t]--;
            if (seatsLeft[t] === 0) bays[bays.indexOf(t)] = -1;
        }
    };
    const chunk = (vi) => {
        const left = seatsLeft[vi];
        if (left <= 1 || !rng.chance(P.split)) return left;
        return rng.int(1, left - 1);
    };
    for (const vi of order) {
        while (!bays.includes(-1)) {
            const d = docked();
            const pickV = rng.chance(0.6) ? d[0] : rng.pick(d);
            emit(pickV, seatsLeft[pickV]);
        }
        bays[bays.indexOf(-1)] = vi;
        if (!rng.chance(P.wait)) emit(vi, chunk(vi));
        const others = docked().filter((b) => b !== vi);
        if (others.length && rng.chance(0.35)) {
            const o = rng.pick(others);
            emit(o, chunk(o));
        }
    }
    let guard = 0;
    while (docked().length && guard++ < 200) {
        const d = docked();
        const o = rng.chance(0.5) ? d[0] : rng.pick(d);
        emit(o, chunk(o));
    }
    return queue;
}

// ------------------------------------------------------------------ public API

/** Deterministic construction. Returns { level, witness, archetype } or { fail }. */
export function construct(seed) {
    const parsed = parseSeed(seed);
    if (!parsed) return { fail: 'bad-seed' };
    if (parsed.genVersion !== GEN_VERSION) return { fail: 'gen-version' };
    const P = BAND_PARAMS[parsed.band];
    if (!P) return { fail: 'bad-band' };
    const rng = makeRng(seed);
    const cols = rng.int(P.cols[0], P.cols[1]);
    const rows = rng.int(P.rows[0], P.rows[1]);
    const bays = rng.int(P.bays[0], P.bays[1]);
    const nColors = rng.int(P.colors[0], P.colors[1]);
    const archetype = rng.weighted(P.archetypes);
    const nGarages = rng.weighted(P.garages);
    const nWalls = rng.weighted(P.walls);
    const target = rng.int(P.vehicles[0], P.vehicles[1]);
    const pool = rng.int(P.pool[0], P.pool[1]);

    const B = new Board(cols, rows);
    placeGarages(rng, B, nGarages);
    placeWalls(rng, B, nWalls);
    if (archetype === 'columns') layoutColumns(rng, B, P, target);
    else if (archetype === 'lanes') layoutLanes(rng, B, P, target);
    scatterFill(rng, B, P, target, archetype === 'scatter' ? 0.3 : 0);

    if (B.count < Math.max(nColors + 1, P.vehicles[0] - 2)) return { fail: 'too-few-vehicles' };
    const deps = B.deps();
    if (!deps) return { fail: 'dead-end' };
    const order = topoOrder(rng, deps);
    if (!order) return { fail: 'cycle' };

    const items = [
        ...B.vs.map((v) => ({ kind: v.kind, group: v.group })),
        ...B.garages.flatMap((g, gi) => g.vehicles.map((gv) => ({ kind: gv.kind, group: 'garage' + gi })))
    ];
    assignColors(rng, items, nColors, P.groupColor ?? 0.75);
    const queue = emitQueue(rng, items, order, bays, P);

    let k = B.vs.length;
    const level = {
        id: seed,
        seed,
        genVersion: GEN_VERSION,
        band: parsed.band,
        archetype,
        cols, rows, bays, pool,
        vehicles: B.vs.map((v, i) => ({ kind: v.kind, color: items[i].color, dir: v.dir, x: v.x, y: v.y })),
        ...(B.walls.length ? { walls: B.walls.map(([x, y]) => [x, y]) } : {}),
        ...(B.garages.length ? {
            garages: B.garages.map((g) => ({ x: g.x, y: g.y, dir: g.dir, vehicles: g.vehicles.map((gv) => ({ kind: gv.kind, color: items[k++].color })) }))
        } : {}),
        queue
    };
    const valid = validateLevel(level);
    if (!valid.ok) return { fail: 'invalid:' + valid.errors[0] };
    const rp = replay(level, order);
    return { level, witness: order, archetype, intendedWins: rp.ok && rp.outcome === 'WIN' };
}

/**
 * Expensive acceptance checks. Deterministic (node budgets, not wall-clock) unless opts.timeMs is set.
 * Returns { ok, reason?, metrics, score, band }.
 */
export function evaluate(level, opts = {}) {
    const L = prepare(level);
    const a = analyze(L, {
        solveNodes: opts.solveNodes ?? 60000,
        solveMs: opts.timeMs,
        trapNodes: opts.trapNodes ?? 6000,
        randomTrials: opts.randomTrials ?? 160
    });
    if (a.status === 'INCONCLUSIVE') return { ok: false, reason: 'timeout' };
    if (a.status !== 'SOLVED') return { ok: false, reason: 'unsolvable' };
    if (!a.replayOk) return { ok: false, reason: 'solver-replay' };
    const m = a.metrics;
    const score = difficultyScore(m);
    const band = bandForScore(score);
    const reason = opts.randomTrials === 0 ? null : rejectReason(m, band);
    return { ok: !reason, reason, metrics: m, score, band, solveMs: a.solveMs, nodes: a.nodes };
}

/** Generation recipes that most often measure into each band (from validation runs). */
export const RECIPES = {
    breather: ['easy', 'medium', 'breather'],
    easy: ['medium', 'hard', 'easy'],
    medium: ['hard', 'medium', 'expert'],
    hard: ['expert', 'hard'],
    expert: ['expert', 'hard']
};

/**
 * Try seeds for a band until one is accepted *in that band* (or maxTries is hit).
 * Reports every rejection reason so batch validation can measure them.
 */
export function generateForBand(band, startN, { maxTries = 40, exactBand = true, onReject, isDuplicate, ...evalOpts } = {}) {
    const recipes = RECIPES[band] || [band];
    for (let k = 0; k < maxTries; k++) {
        const seed = makeSeed(recipes[k % recipes.length], startN + k);
        const c = construct(seed);
        if (c.fail) { onReject && onReject(seed, 'construct:' + c.fail.split(':')[0]); continue; }
        if (isDuplicate && isDuplicate(c.level)) { onReject && onReject(seed, 'near-duplicate'); continue; }
        const e = evaluate(c.level, evalOpts);
        if (!e.ok) { onReject && onReject(seed, e.reason); continue; }
        if (exactBand && e.band !== band) { onReject && onReject(seed, 'band:' + e.band); continue; }
        return { seed, level: { ...c.level, band: e.band, metrics: { ...e.metrics, score: e.score } }, eval: e, tries: k + 1 };
    }
    return null;
}

export { BANDS };
