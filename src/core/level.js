// src/core/level.js — level format, normalisation and schema validation.
//
// Raw level format (what curated levels, the generator and the pool use):
// {
//   id, name, cols, rows, bays,
//   vehicles: [{ kind: 'car'|'van'|'bus', color, dir: 'U'|'D'|'L'|'R', x, y }],   // x,y = top-left cell
//   walls:    [[x, y], ...]                                                       // optional
//   garages:  [{ x, y, dir, vehicles: [{ kind, color }, ...] }],                   // optional
//   queue:    ['red', 'blue', ...]                                               // front first
//   seed?, genVersion?, band?, metrics?
// }

import { KINDS, DIRS, COLORS, isVertical } from './defs.js';

/** Cells covered by a vehicle with top-left (x, y). */
export function cellsOf(x, y, dir, len) {
    const out = [];
    for (let i = 0; i < len; i++) out.push(isVertical(dir) ? [x, y + i] : [x + i, y]);
    return out;
}

/** Top-left position for a vehicle spawned by a garage: it sits directly in front of the garage, facing out. */
export function garageSpawnPos(g, len) {
    if (g.dir === 'U') return [g.x, g.y - len];
    if (g.dir === 'D') return [g.x, g.y + 1];
    if (g.dir === 'L') return [g.x - len, g.y];
    return [g.x + 1, g.y];
}

/**
 * Normalise a raw level into the flat structure the rules engine works on.
 * Board vehicles come first; garage vehicles follow, in garage order.
 */
export function normalizeLevel(raw) {
    const vehicles = [];
    for (const v of raw.vehicles) {
        const k = KINDS[v.kind];
        if (!k) throw new Error(`Unknown vehicle kind "${v.kind}"`);
        vehicles.push({ kind: v.kind, color: v.color, dir: v.dir, x: v.x, y: v.y, len: k.len, cap: k.cap, garage: -1 });
    }
    const garages = (raw.garages || []).map((g, gi) => {
        const ids = [];
        for (const gv of g.vehicles) {
            const k = KINDS[gv.kind];
            if (!k) throw new Error(`Unknown vehicle kind "${gv.kind}"`);
            const [x, y] = garageSpawnPos(g, k.len);
            ids.push(vehicles.length);
            vehicles.push({ kind: gv.kind, color: gv.color, dir: g.dir, x, y, len: k.len, cap: k.cap, garage: gi });
        }
        return { x: g.x, y: g.y, dir: g.dir, ids };
    });
    return {
        id: raw.id ?? null,
        name: raw.name ?? '',
        cols: raw.cols,
        rows: raw.rows,
        bays: raw.bays,
        pool: raw.pool ?? 1,                 // plaza capacity; 1 = only the front passenger can board
        walls: (raw.walls || []).map(([x, y]) => [x, y]),
        garages,
        vehicles,
        queue: raw.queue.slice(),
        meta: {
            seed: raw.seed ?? null,
            genVersion: raw.genVersion ?? null,
            band: raw.band ?? null,
            metrics: raw.metrics ?? null,
            hint: raw.hint ?? null
        }
    };
}

/**
 * Validate a raw level. Returns { ok, errors[] }.
 * Checks: dimensions, bay count, known kinds/colours/dirs, bounds, overlaps (vehicles, walls, garages,
 * garage spawn lanes vs walls/garages), and that seats per colour equal passengers per colour.
 */
export function validateLevel(raw) {
    const errors = [];
    const err = (m) => errors.push(m);
    if (!Number.isInteger(raw.cols) || !Number.isInteger(raw.rows) || raw.cols < 3 || raw.rows < 3 || raw.cols > 14 || raw.rows > 18) {
        err(`bad grid size ${raw.cols}x${raw.rows}`);
        return { ok: false, errors };
    }
    if (!Number.isInteger(raw.bays) || raw.bays < 2 || raw.bays > 8) err(`bad bay count ${raw.bays}`);
    if (raw.pool != null && (!Number.isInteger(raw.pool) || raw.pool < 1 || raw.pool > 40)) err(`bad plaza size ${raw.pool}`);
    if (!Array.isArray(raw.queue) || raw.queue.length === 0) err('empty queue');

    const inb = (x, y) => x >= 0 && y >= 0 && x < raw.cols && y < raw.rows;
    const occ = new Map();
    const claim = (x, y, who) => {
        if (!inb(x, y)) { err(`${who} out of bounds at ${x},${y}`); return; }
        const k = `${x},${y}`;
        if (occ.has(k)) err(`${who} overlaps ${occ.get(k)} at ${k}`);
        else occ.set(k, who);
    };

    (raw.walls || []).forEach(([x, y], i) => claim(x, y, `wall#${i}`));
    (raw.garages || []).forEach((g, i) => {
        if (!DIRS[g.dir]) err(`garage#${i} bad dir ${g.dir}`);
        claim(g.x, g.y, `garage#${i}`);
        if (!g.vehicles || g.vehicles.length === 0) err(`garage#${i} is empty`);
    });
    raw.vehicles.forEach((v, i) => {
        const who = `vehicle#${i}`;
        if (!KINDS[v.kind]) { err(`${who} bad kind ${v.kind}`); return; }
        if (!DIRS[v.dir]) { err(`${who} bad dir ${v.dir}`); return; }
        if (!COLORS.includes(v.color)) err(`${who} bad colour ${v.color}`);
        for (const [x, y] of cellsOf(v.x, v.y, v.dir, KINDS[v.kind].len)) claim(x, y, who);
    });
    // Garage spawn lanes must stay in bounds and never cross walls/garages (they may overlap initial vehicles:
    // the garage simply waits until the lane is clear).
    (raw.garages || []).forEach((g, gi) => {
        if (!DIRS[g.dir]) return;
        for (const gv of g.vehicles || []) {
            const k = KINDS[gv.kind];
            if (!k) { err(`garage#${gi} bad kind ${gv.kind}`); continue; }
            if (!COLORS.includes(gv.color)) err(`garage#${gi} bad colour ${gv.color}`);
            const [sx, sy] = garageSpawnPos(g, k.len);
            for (const [x, y] of cellsOf(sx, sy, g.dir, k.len)) {
                if (!inb(x, y)) { err(`garage#${gi} spawn lane out of bounds at ${x},${y}`); continue; }
                const o = occ.get(`${x},${y}`);
                if (o && (o.startsWith('wall') || o.startsWith('garage'))) err(`garage#${gi} spawn lane blocked by ${o}`);
            }
        }
    });

    // Seats per colour must equal passengers per colour.
    const seats = {}, pax = {};
    raw.vehicles.forEach((v) => { if (KINDS[v.kind]) seats[v.color] = (seats[v.color] || 0) + KINDS[v.kind].cap; });
    (raw.garages || []).forEach((g) => (g.vehicles || []).forEach((v) => {
        if (KINDS[v.kind]) seats[v.color] = (seats[v.color] || 0) + KINDS[v.kind].cap;
    }));
    (raw.queue || []).forEach((c) => { pax[c] = (pax[c] || 0) + 1; });
    for (const c of new Set([...Object.keys(seats), ...Object.keys(pax)])) {
        if ((seats[c] || 0) !== (pax[c] || 0)) err(`colour ${c}: ${seats[c] || 0} seats vs ${pax[c] || 0} passengers`);
    }
    return { ok: errors.length === 0, errors };
}

/** Run-length encode a queue: [['red',4],['blue',6],...] */
export function queueRuns(queue) {
    const runs = [];
    for (const c of queue) {
        if (runs.length && runs[runs.length - 1][0] === c) runs[runs.length - 1][1]++;
        else runs.push([c, 1]);
    }
    return runs;
}

/** Expand runs back into a queue. */
export function expandRuns(runs) {
    const q = [];
    for (const [c, n] of runs) for (let i = 0; i < n; i++) q.push(c);
    return q;
}
