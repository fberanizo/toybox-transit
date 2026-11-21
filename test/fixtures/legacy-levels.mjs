// The four levels shipped in commit 934a80b, converted 1:1 to the new format (old 3-cell/6-seat "bus" = van).
// Kept as regression fixtures for the audit findings; the playable game no longer uses them as-is.

const D = { UP: 'U', DOWN: 'D', LEFT: 'L', RIGHT: 'R' };
const v = (kind, color, dir, x, y) => ({ kind, color, dir: D[dir], x, y });
const fill = (c, n) => Array(n).fill(c);

export const LEGACY = [
    {
        id: 'legacy-1', cols: 6, rows: 6, bays: 6,
        vehicles: [v('car', 'blue', 'UP', 1, 0), v('car', 'blue', 'UP', 3, 0), v('van', 'yellow', 'LEFT', 0, 4), v('van', 'yellow', 'RIGHT', 3, 4)],
        queue: [...fill('blue', 8), ...fill('yellow', 12)]
    },
    {
        id: 'legacy-2', cols: 8, rows: 8, bays: 6,
        vehicles: [
            v('van', 'yellow', 'RIGHT', 1, 0), v('van', 'red', 'LEFT', 4, 0),
            v('car', 'blue', 'UP', 1, 2), v('car', 'blue', 'UP', 2, 2), v('car', 'yellow', 'UP', 4, 2), v('car', 'red', 'UP', 5, 2),
            v('car', 'red', 'LEFT', 0, 5), v('car', 'yellow', 'RIGHT', 5, 5)
        ],
        queue: [...fill('yellow', 6), ...fill('blue', 8), ...fill('red', 14), ...fill('yellow', 8)]
    },
    {
        id: 'legacy-3', cols: 9, rows: 12, bays: 7,
        vehicles: [
            v('van', 'blue', 'RIGHT', 1, 0), v('van', 'yellow', 'RIGHT', 5, 0),
            v('car', 'yellow', 'UP', 1, 2), v('car', 'red', 'UP', 2, 2), v('van', 'blue', 'DOWN', 4, 2), v('car', 'red', 'UP', 6, 2), v('car', 'yellow', 'UP', 7, 2),
            v('car', 'red', 'LEFT', 1, 4), v('van', 'red', 'LEFT', 3, 4), v('car', 'red', 'RIGHT', 6, 4),
            v('car', 'yellow', 'LEFT', 0, 6), v('car', 'blue', 'LEFT', 2, 6), v('car', 'red', 'DOWN', 4, 6), v('car', 'blue', 'RIGHT', 5, 6), v('car', 'yellow', 'RIGHT', 7, 6),
            v('car', 'blue', 'LEFT', 0, 8), v('car', 'blue', 'LEFT', 2, 8), v('car', 'yellow', 'UP', 4, 8), v('car', 'blue', 'RIGHT', 5, 8), v('car', 'blue', 'RIGHT', 7, 8),
            v('van', 'yellow', 'LEFT', 2, 10), v('van', 'blue', 'RIGHT', 5, 10)
        ],
        queue: [...fill('blue', 14), ...fill('yellow', 16), ...fill('red', 18), ...fill('blue', 16), ...fill('yellow', 16), ...fill('red', 8), ...fill('blue', 12)]
    },
    {
        id: 'legacy-4', cols: 8, rows: 9, bays: 6,
        vehicles: [
            v('van', 'green', 'UP', 1, 0), v('van', 'yellow', 'UP', 6, 0), v('car', 'blue', 'LEFT', 0, 3), v('car', 'red', 'RIGHT', 5, 3),
            v('van', 'blue', 'RIGHT', 2, 4), v('car', 'green', 'LEFT', 1, 6), v('car', 'yellow', 'RIGHT', 4, 6), v('van', 'red', 'DOWN', 3, 6)
        ],
        queue: [...fill('green', 6), ...fill('yellow', 6), ...fill('blue', 10), ...fill('red', 10), ...fill('green', 4), ...fill('yellow', 4)]
    }
];
