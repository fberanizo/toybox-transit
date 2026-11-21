// src/core/defs.js — shared constants for rules, solver, generator and view.
// Pure module: no DOM, no THREE.

/** Vehicle kinds: length in grid cells and seat capacity. */
export const KINDS = Object.freeze({
    car: Object.freeze({ len: 2, cap: 4 }),
    van: Object.freeze({ len: 3, cap: 6 }),
    bus: Object.freeze({ len: 4, cap: 10 })
});

/** Direction unit vectors on the grid (x → right, y → down; the bays sit above row 0). */
export const DIRS = Object.freeze({
    U: Object.freeze([0, -1]),
    D: Object.freeze([0, 1]),
    L: Object.freeze([-1, 0]),
    R: Object.freeze([1, 0])
});

/** Colour keys, in the order the generator introduces them. */
export const COLORS = Object.freeze(['red', 'blue', 'yellow', 'green', 'purple', 'pink']);

/** Vehicle status values stored in state.st */
export const ST = Object.freeze({ PENDING: 0, LOT: 1, BAY: 2, GONE: 3 });

export const OUTCOME = Object.freeze({
    PLAYING: 'PLAYING',
    WIN: 'WIN',
    LOSS_BAYS: 'LOSS_BAYS',
    LOSS_STUCK: 'LOSS_STUCK'
});

export const isVertical = (dir) => dir === 'U' || dir === 'D';
