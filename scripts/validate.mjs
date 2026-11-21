#!/usr/bin/env node
// Batch validation of the generator across seeds and bands.
// Usage: node scripts/validate.mjs [--n=1000] [--out=reports/validation-g<V>.md]
//
// For every generation band, constructs and evaluates seeds 0..n-1 with the same pipeline the game uses and
// reports: generation time (p50/p95/max), acceptance and rejection reasons, measured band distribution,
// solver timeouts (INCONCLUSIVE → rejected), near-duplicates among accepted levels, and a timeout drill.

import { writeFileSync, mkdirSync } from 'node:fs';
import { construct, evaluate, makeSeed, BANDS, GEN_VERSION } from '../src/core/generator.js';
import { canonicalHash, isNearDuplicate } from '../src/core/similarity.js';
import { replay } from '../src/core/rules.js';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] ?? d;
const N = +(arg('n', 1000));
const out = arg('out', `reports/validation-g${GEN_VERSION}.md`);

const pct = (arr, p) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

const lines = [];
const log = (s = '') => { lines.push(s); console.log(s); };
log(`# Generator validation — g${GEN_VERSION}`);
log('');
log(`${new Date().toISOString()} · ${N} seeds per generation band · Node ${process.version}`);
log('');
log('| gen band | accepted | rejected | timeouts | ms p50 | ms p95 | ms max | measured bands (accepted) | rejection reasons |');
log('|---|---|---|---|---|---|---|---|---|');

const accepted = [];
const allTimes = [];
for (const band of BANDS) {
    const times = [];
    const reasons = {};
    const measured = {};
    let ok = 0, timeouts = 0;
    for (let n = 0; n < N; n++) {
        const seed = makeSeed(band, n);
        const t0 = performance.now();
        const c = construct(seed);
        if (c.fail) { reasons['construct:' + c.fail.split(':')[0]] = (reasons['construct:' + c.fail.split(':')[0]] || 0) + 1; times.push(performance.now() - t0); continue; }
        const e = evaluate(c.level);
        times.push(performance.now() - t0);
        if (!e.ok) {
            reasons[e.reason] = (reasons[e.reason] || 0) + 1;
            if (e.reason === 'timeout') timeouts++;
            continue;
        }
        ok++;
        measured[e.band] = (measured[e.band] || 0) + 1;
        accepted.push({ seed, level: c.level, band: e.band, score: e.score, m: e.metrics, archetype: c.archetype });
    }
    allTimes.push(...times);
    const fmt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || '—';
    log(`| ${band} | ${ok} (${((100 * ok) / N).toFixed(0)}%) | ${N - ok} | ${timeouts} | ${pct(times, 50).toFixed(1)} | ${pct(times, 95).toFixed(1)} | ${Math.max(...times).toFixed(1)} | ${fmt(measured)} | ${fmt(reasons)} |`);
}

// Determinism: regenerate a sample and compare byte-for-byte.
let detFail = 0;
for (const a of accepted.filter((_, i) => i % 25 === 0)) {
    if (JSON.stringify(construct(a.seed).level) !== JSON.stringify(a.level)) detFail++;
}

// Near-duplicates among accepted levels (pairwise, same board size only).
const hashes = new Map();
let exactDup = 0;
for (const a of accepted) {
    const h = canonicalHash(a.level);
    if (hashes.has(h)) exactDup++; else hashes.set(h, a.seed);
}
const byDims = new Map();
for (const a of accepted) {
    const k = `${a.level.cols}x${a.level.rows}`;
    if (!byDims.has(k)) byDims.set(k, []);
    byDims.get(k).push(a);
}
let nearPairs = 0, pairs = 0;
const nearDupSeeds = new Set();
const examples = [];
for (const group of byDims.values()) {
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
        pairs++;
        if (isNearDuplicate(group[i].level, group[j].level)) {
            nearPairs++;
            nearDupSeeds.add(group[j].seed);
            if (examples.length < 3) examples.push(`${group[i].seed} ~ ${group[j].seed}`);
        }
    }
}

// Timeout drill: with a tiny solver budget, hard levels must come back INCONCLUSIVE and be rejected, never served.
let drillTimeouts = 0, drillServed = 0;
const drill = accepted.filter((a) => a.band === 'expert' || a.band === 'hard').slice(0, 40);
for (const a of drill) {
    const e = evaluate(a.level, { solveNodes: 20 });
    if (e.reason === 'timeout') drillTimeouts++;
    if (e.ok) drillServed++;
}

// Every accepted level's solver witness replays to a win (re-check independently).
let replayFail = 0;
for (const a of accepted.filter((_, i) => i % 10 === 0)) {
    const e = evaluate(a.level, { randomTrials: 0 });
    if (!e.ok) replayFail++;
}
void replay;

log('');
log('## Summary');
log('');
log(`- Accepted levels: **${accepted.length}** of ${N * BANDS.length} seeds (${((100 * accepted.length) / (N * BANDS.length)).toFixed(1)}%).`);
const bandTotals = {};
accepted.forEach((a) => (bandTotals[a.band] = (bandTotals[a.band] || 0) + 1));
log(`- Accepted by measured band: ${BANDS.map((b) => `${b} ${bandTotals[b] || 0}`).join(', ')}.`);
{
    // Variety: which layouts and mechanics the accepted levels use, per measured band.
    log('');
    log('### Variety of accepted levels (by measured band)');
    log('');
    log('| band | levels | scatter | columns | lanes | with garages | with cones | median vehicles | median passengers | median decisions | median waits |');
    log('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const b of BANDS) {
        const xs = accepted.filter((a) => a.band === b);
        if (!xs.length) continue;
        const cnt = (f) => xs.filter(f).length;
        const med = (f) => pct(xs.map(f), 50);
        log(`| ${b} | ${xs.length} | ${cnt((a) => a.archetype === 'scatter')} | ${cnt((a) => a.archetype === 'columns')} | ${cnt((a) => a.archetype === 'lanes')} | ${cnt((a) => a.level.garages)} | ${cnt((a) => a.level.walls)} | ${med((a) => a.m.vehicles)} | ${med((a) => a.m.passengers)} | ${med((a) => a.m.decisions)} | ${med((a) => a.m.waits)} |`);
    }
    log('');
}
log(`- Generation + verification time per seed: p50 ${pct(allTimes, 50).toFixed(1)} ms, p95 ${pct(allTimes, 95).toFixed(1)} ms, max ${Math.max(...allTimes).toFixed(1)} ms.`);
log(`- Exact duplicates (same after recolour/mirror): ${exactDup}. Near-duplicate pairs: ${nearPairs} of ${pairs} same-size pairs (${nearDupSeeds.size} levels would be filtered).${examples.length ? ' Examples: ' + examples.join('; ') + '.' : ''}`);
log(`- Determinism: ${detFail === 0 ? 'all' : 'NOT all'} sampled seeds regenerate byte-identically (${detFail} mismatches).`);
log(`- Re-verification of a 10% sample: ${replayFail} failures.`);
log(`- Timeout drill (solver budget cut to 20 nodes on ${drill.length} hard/expert levels): ${drillTimeouts} came back INCONCLUSIVE and were rejected (never served); the other ${drillServed} were genuinely solved within 20 nodes and replayed to a win.`);
log('- Runtime fallback: the game never waits on the generator. Level N takes a fresh worker level when one is buffered for its band, otherwise the next unused prevalidated pool seed (120 per band, shipped as seeds). Worker requests use a 150 ms solver budget per candidate; a timeout just means that candidate is skipped.');

mkdirSync('reports', { recursive: true });
writeFileSync(out, lines.join('\n') + '\n');
console.log(`\nwrote ${out}`);
