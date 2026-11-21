// src/core/similarity.js — "is this the same puzzle again?"
//
// Two checks:
//  * canonicalHash: identical after relabelling colours (by first appearance in the queue) and mirroring
//    left↔right. Catches pure recolours and mirror images.
//  * layoutSimilarity: Jaccard overlap of vehicle placements (anchor cell + kind + direction), best of
//    identity/mirror, on boards of the same size. ≥ NEAR_DUP with the same bay count and a similar queue
//    shape counts as a near-duplicate: the same decisions in a different coat of paint.

import { queueRuns } from './level.js';
import { KINDS } from './defs.js';

export const NEAR_DUP = 0.7;

const MIRROR_DIR = { L: 'R', R: 'L', U: 'U', D: 'D' };

function mirrorLevel(l) {
    return {
        ...l,
        vehicles: l.vehicles.map((v) => {
            const len = KINDS[v.kind].len;
            const horiz = v.dir === 'L' || v.dir === 'R';
            return { ...v, dir: MIRROR_DIR[v.dir], x: l.cols - v.x - (horiz ? len : 1) };
        })
    };
}

function colorMap(l) {
    const map = {};
    let k = 0;
    for (const c of l.queue) if (!(c in map)) map[c] = 'c' + k++;
    return map;
}

function serialize(l) {
    const cm = colorMap(l);
    const vs = l.vehicles.map((v) => `${v.x},${v.y},${v.kind[0]},${v.dir},${cm[v.color]}`).sort().join(';');
    const q = queueRuns(l.queue).map(([c, n]) => cm[c] + n).join('');
    return `${l.cols}x${l.rows}b${l.bays}|${vs}|${q}`;
}

function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
}

export function canonicalHash(level) {
    const a = serialize(level);
    const b = serialize(mirrorLevel(level));
    return hashStr(a < b ? a : b);
}

function tokens(l) {
    return new Set(l.vehicles.map((v) => `${v.x},${v.y},${v.kind},${v.dir}`));
}

function jaccard(a, b) {
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    return inter / Math.max(1, a.size + b.size - inter);
}

/** Queue "shape": run lengths relative to total, colour-agnostic. */
function queueShape(l) {
    return queueRuns(l.queue).map(([, n]) => n);
}

function shapeDistance(a, b) {
    const n = Math.max(a.length, b.length);
    let d = Math.abs(a.length - b.length);
    for (let i = 0; i < Math.min(a.length, b.length); i++) d += Math.abs(a[i] - b[i]) / Math.max(a[i], b[i]);
    return d / Math.max(1, n);
}

export function layoutSimilarity(a, b) {
    if (a.cols !== b.cols || a.rows !== b.rows) return 0;
    const ta = tokens(a);
    return Math.max(jaccard(ta, tokens(b)), jaccard(ta, tokens(mirrorLevel(b))));
}

export function isNearDuplicate(a, b) {
    if (canonicalHash(a) === canonicalHash(b)) return true;
    if (a.bays !== b.bays) return false;
    return layoutSimilarity(a, b) >= NEAR_DUP && shapeDistance(queueShape(a), queueShape(b)) < 0.35;
}

/** Feature vector used for "closest pair" reports and variety stats. */
export function features(level, metrics = {}) {
    const kinds = { car: 0, van: 0, bus: 0 };
    level.vehicles.forEach((v) => kinds[v.kind]++);
    const runs = queueRuns(level.queue);
    return {
        cols: level.cols, rows: level.rows, bays: level.bays,
        vehicles: level.vehicles.length, colors: new Set(level.vehicles.map((v) => v.color)).size,
        ...kinds,
        runs: runs.length, meanRun: +(level.queue.length / runs.length).toFixed(2),
        blockMax: metrics.blockMax, waits: metrics.waits, decisions: metrics.decisions
    };
}
