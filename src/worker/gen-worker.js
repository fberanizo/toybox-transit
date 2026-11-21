// src/worker/gen-worker.js — generates and verifies fresh levels off the main thread.
// Message in:  { id, band, startN, count, timeMs }
// Message out: { id, band, results: [{ seed, band, score }], tried, rejected: { reason: n } }

import { generateForBand } from '../core/generator.js';

self.onmessage = (ev) => {
    const { id, band, startN, count = 1, timeMs = 150 } = ev.data;
    const results = [];
    const rejected = {};
    let n = startN, tried = 0;
    const deadline = performance.now() + timeMs * Math.max(1, count) * 4;
    while (results.length < count && performance.now() < deadline) {
        const r = generateForBand(band, n, {
            maxTries: 80,
            timeMs,                      // wall-clock solver budget per level; timeouts are rejected
            onReject: (_, why) => { rejected[why] = (rejected[why] || 0) + 1; }
        });
        tried += r ? r.tries : 80;
        n += r ? r.tries : 80;
        if (r) results.push({ seed: r.seed, band: r.eval.band, score: r.eval.score });
    }
    self.postMessage({ id, band, results, tried, nextN: n, rejected });
};
