// src/levels/source.js — where level N comes from, without ever making the player wait.
//
//  1. Levels 1..4: curated teaching levels.
//  2. Level N ≥ 5: a band from the sawtooth schedule. Once a level number is assigned a seed, the assignment
//     is saved, so reloads, undo-to-menu and "replay" always give the same puzzle.
//  3. New assignments take a freshly generated level from the worker buffer when one is ready for that band,
//     otherwise the next unused seed from the shipped, prevalidated pool (instant).
//  The worker keeps the buffer topped up for the next few bands while you play.

import { CURATED } from './curated.js';
import { POOL } from './pool.js';
import { bandFor, FIRST_GENERATED } from './schedule.js';
import { construct, parseSeed, GEN_VERSION } from '../core/generator.js';
import { store } from '../storage.js';
import { isNearDuplicate } from '../core/similarity.js';

const BUFFER_PER_BAND = 2;

export class LevelSource {
    constructor() {
        this.assign = store.get('assign', {});          // levelNumber → seed
        this.used = new Set(store.get('used', []));      // seeds already served
        this.buffer = { breather: [], easy: [], medium: [], hard: [], expert: [] };
        this.workerBase = store.get('workerBase', null);
        if (this.workerBase == null) {
            this.workerBase = 1_000_000 + Math.floor(Math.random() * 1_000_000_000);
            store.set('workerBase', this.workerBase);
        }
        this.stats = { fromWorker: 0, fromPool: 0, nearDupSkipped: 0, workerMode: 'none' };
        this.recentCache = new Map();
        this.pending = new Set();
        this.startWorker();
    }

    // ------------------------------------------------------------ worker

    startWorker() {
        try {
            if (typeof window !== 'undefined' && window.__WORKER_SRC__) {
                const url = URL.createObjectURL(new Blob([window.__WORKER_SRC__], { type: 'text/javascript' }));
                this.worker = new Worker(url);
                this.stats.workerMode = 'blob';
            } else {
                this.worker = new Worker(new URL('../worker/gen-worker.js', import.meta.url), { type: 'module' });
                this.stats.workerMode = 'module';
            }
            this.worker.onmessage = (ev) => this.onWorker(ev.data);
            this.worker.onerror = () => { this.worker = null; this.stats.workerMode = 'failed'; };
        } catch {
            this.worker = null;
            this.stats.workerMode = 'unavailable';
        }
    }

    onWorker(msg) {
        this.pending.delete(msg.band);
        store.set('workerBase', (this.workerBase = Math.max(this.workerBase, msg.nextN)));
        for (const r of msg.results) {
            if (this.used.has(r.seed)) continue;
            (this.buffer[r.band] ||= []).push(r);
        }
    }

    /** Ask the worker to top up the buffers for the bands of the next few levels. */
    prefetch(fromLevel) {
        if (!this.worker) return;
        const wanted = new Set();
        for (let n = fromLevel; n < fromLevel + 4; n++) { const b = bandFor(n); if (b) wanted.add(b); }
        for (const band of wanted) {
            if (this.pending.has(band) || this.buffer[band].length >= BUFFER_PER_BAND) continue;
            this.pending.add(band);
            const startN = this.workerBase;
            this.workerBase += 1000; // reserve a seed range per request
            store.set('workerBase', this.workerBase);
            this.worker.postMessage({ id: band + startN, band, startN, count: 1, timeMs: 150 });
        }
    }

    // ------------------------------------------------------------ levels

    /** Too close to one of the last 50 levels served? (recolours, mirrors, same layout) */
    tooSimilar(seed) {
        const c = construct(seed);
        if (c.fail) return true;
        const recent = Object.keys(this.assign).map(Number).sort((a, b) => b - a).slice(0, 50);
        for (const n of recent) {
            const a = this.assign[n];
            if (!a || !a.seed) continue;
            const o = this.recentCache.get(a.seed) || construct(a.seed).level;
            if (o) this.recentCache.set(a.seed, o);
            if (o && isNearDuplicate(o, c.level)) { this.stats.nearDupSkipped++; return true; }
        }
        return false;
    }

    /** Returns { seed, band, source } for a new level of the given measured band. */
    takeSeed(band) {
        // Fresh worker level if ready (and it measured into the wanted band)…
        while (this.buffer[band] && this.buffer[band].length) {
            const r = this.buffer[band].shift();
            if (!this.used.has(r.seed) && !this.tooSimilar(r.seed)) { this.stats.fromWorker++; return { seed: r.seed, band, source: 'fresh' }; }
        }
        // …otherwise the next unused prevalidated pool level for the band.
        const list = (POOL.levels[band] || []).map((e) => e.seed);
        const fresh = list.find((s) => !this.used.has(s) && !this.tooSimilar(s));
        this.stats.fromPool++;
        if (fresh) return { seed: fresh, band, source: 'pool' };
        // Pool exhausted for this band: recycle a random one (never happens before ~120 levels per band).
        return { seed: list[Math.floor(Math.random() * list.length)], band, source: 'pool' };
    }

    markUsed(seed) {
        this.used.add(seed);
        const arr = [...this.used];
        store.set('used', arr.slice(-3000));
    }

    /** Level entry for level number n: { level, info } (always synchronous). */
    get(n) {
        if (n < FIRST_GENERATED) {
            const lvl = CURATED[n - 1];
            if (!lvl) return null;
            this.prefetch(FIRST_GENERATED);
            return { level: lvl, info: { name: lvl.name, hint: lvl.hint, id: lvl.id } };
        }
        let a = this.assign[n];
        const p = a && typeof a === 'object' && parseSeed(a.seed);
        if (!p || p.genVersion !== GEN_VERSION) {
            a = this.takeSeed(bandFor(n));
            this.assign[n] = a;
            store.set('assign', this.assign);
            this.markUsed(a.seed);
        }
        this.prefetch(n + 1);
        return this.fromSeed(a.seed, a.band);
    }

    /** Build a level from any seed (also used for "play a seed"). Band = measured band if known. */
    fromSeed(seed, band = null) {
        const c = construct(seed);
        if (c.fail) return null;
        const b = band || this.bandOf(seed);
        return { level: c.level, info: { seed, band: b, name: b ? cap(b) : 'Custom seed' } };
    }

    bandOf(seed) {
        for (const b of Object.keys(POOL.levels)) if (POOL.levels[b].some((e) => e.seed === seed)) return b;
        for (const a of Object.values(this.assign)) if (a && a.seed === seed) return a.band;
        return null;
    }
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
