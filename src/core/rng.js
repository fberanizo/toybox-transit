// src/core/rng.js — small deterministic PRNG (sfc32) seeded from strings.

/** cyrb128 string hash → four 32-bit seeds. */
export function hashString(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0; i < str.length; i++) {
        const k = str.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

export function makeRng(seed) {
    let [a, b, c, d] = hashString(String(seed));
    const next = () => {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
        let t = (a + b) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        d = (d + 1) | 0;
        t = (t + d) | 0;
        c = (c + t) | 0;
        return (t >>> 0) / 4294967296;
    };
    for (let i = 0; i < 12; i++) next();
    const rng = {
        next,
        int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),   // inclusive
        pick: (arr) => arr[Math.floor(next() * arr.length)],
        chance: (p) => next() < p,
        shuffle: (arr) => {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(next() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        },
        weighted: (pairs) => { // [[value, weight], ...]
            const total = pairs.reduce((s, p) => s + p[1], 0);
            let r = next() * total;
            for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; }
            return pairs[pairs.length - 1][0];
        }
    };
    return rng;
}
