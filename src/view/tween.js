// src/view/tween.js — one central tween clock driven by the render loop (no per-object rAF chains),
// so undo / restart / level changes can cancel every running animation at once.

export const ease = {
    linear: (t) => t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inQuad: (t) => t * t,
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
};

export class Tweens {
    constructor() {
        this.items = [];
        this.time = 0; // seconds
    }

    /** Schedule fn(t in 0..1) to run from `delay` seconds from now for `duration` seconds. */
    add({ delay = 0, duration, update, done, easing = ease.linear, start }) {
        const item = { t0: this.time + delay, duration: Math.max(1e-4, duration), update, done, easing, start, started: false };
        this.items.push(item);
        return item;
    }

    /** Run fn after `delay` seconds. */
    after(delay, fn) {
        return this.add({ delay, duration: 1e-4, update: () => {}, done: fn });
    }

    tick(dt) {
        this.time += dt;
        const keep = [];
        // Iterate over a snapshot: callbacks may add new tweens.
        const items = this.items;
        this.items = [];
        for (const it of items) {
            if (this.time < it.t0) { keep.push(it); continue; }
            if (!it.started) { it.started = true; if (it.start) it.start(); }
            const t = Math.min(1, (this.time - it.t0) / it.duration);
            it.update(it.easing(t), t);
            if (t >= 1) { if (it.done) it.done(); } else keep.push(it);
        }
        this.items = keep.concat(this.items);
    }

    clear() { this.items = []; }

    get busy() { return this.items.length > 0; }
}
