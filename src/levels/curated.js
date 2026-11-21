// src/levels/curated.js — the teaching track. Every level here is checked by test/curated.test.mjs:
// valid, solvable by the solver, witness replays to a win, fair, and not trivially easy (except lesson 1).
// Levels 1–5 are hand-built. Levels 6–9 were picked by hand from verified generator output (seed noted) for
// the one mechanic each teaches, then frozen here so they never change with generator versions.

import { expandRuns } from '../core/level.js';

const fill = (c, n) => Array(n).fill(c);
const car = (color, dir, x, y) => ({ kind: 'car', color, dir, x, y });
const van = (color, dir, x, y) => ({ kind: 'van', color, dir, x, y });
const bus = (color, dir, x, y) => ({ kind: 'bus', color, dir, x, y });

const LESSONS = [
    {
        id: 'c1', name: 'First Ride', hint: 'Tap a vehicle with a clear road. Anyone in the plaza who matches a parked vehicle hops on.',
        pool: 6, cols: 6, rows: 6, bays: 4,
        vehicles: [
            van('blue', 'R', 0, 0),
            car('red', 'U', 1, 2),
            car('blue', 'U', 4, 3),
            car('red', 'L', 2, 5)
        ],
        queue: [...fill('red', 4), ...fill('blue', 6), ...fill('blue', 4), ...fill('red', 4)]
    },
    {
        id: 'c2', name: 'Waiting Room', hint: 'The number by a parked vehicle is seats left. Never fill every bay with the wrong colour.',
        pool: 6, cols: 6, rows: 7, bays: 2,
        vehicles: [
            car('yellow', 'U', 0, 4),
            van('blue', 'R', 1, 1),
            van('yellow', 'U', 2, 2),
            car('blue', 'U', 4, 4),
            car('red', 'L', 3, 6)
        ],
        queue: [...fill('yellow', 4), ...fill('red', 4), ...fill('yellow', 6), ...fill('blue', 10)]
    },
    {
        id: 'c3', name: 'Crossroads', hint: 'The long vans guard the columns. Who goes first?',
        pool: 4, cols: 7, rows: 8, bays: 4,
        vehicles: [
            van('green', 'L', 0, 1),
            van('yellow', 'R', 4, 1),
            car('red', 'U', 0, 2), car('red', 'U', 0, 4),
            car('blue', 'U', 1, 2), car('blue', 'U', 1, 4),
            car('green', 'U', 2, 2),
            bus('yellow', 'U', 3, 3),
            car('yellow', 'U', 4, 2),
            car('red', 'U', 5, 2), car('blue', 'U', 5, 4),
            car('green', 'U', 6, 2),
            car('red', 'L', 0, 7),
            car('blue', 'R', 5, 7)
        ],
        queue: [
            ...fill('red', 4), ...fill('green', 6), ...fill('blue', 4), ...fill('yellow', 10),
            ...fill('red', 8), ...fill('blue', 8), ...fill('green', 8), ...fill('yellow', 10),
            ...fill('red', 4), ...fill('blue', 4)
        ]
    },
    {
        id: 'c4', name: 'Rush Hour', hint: 'Buses carry ten. Dig out the deep ones without clogging the bays.',
        pool: 4, cols: 7, rows: 10, bays: 3,
        vehicles: [
            bus('blue', 'R', 0, 0),
            van('red', 'D', 5, 0),
            car('yellow', 'L', 4, 4),
            bus('green', 'D', 0, 2),
            car('red', 'R', 0, 8),
            van('blue', 'U', 6, 5),
            car('yellow', 'U', 3, 6),
            car('green', 'L', 4, 9),
            car('red', 'U', 4, 6),
            car('blue', 'D', 5, 6)
        ],
        queue: [
            ...fill('red', 4), ...fill('green', 10), ...fill('yellow', 4), ...fill('red', 6), ...fill('blue', 10),
            ...fill('yellow', 4), ...fill('blue', 6), ...fill('green', 4), ...fill('red', 4), ...fill('blue', 4)
        ]
    },
    {
        id: 'c5', name: 'Garage Day', hint: 'Garages release their cars one at a time. The badge shows the next colour and how many are left.',
        pool: 4, cols: 6, rows: 7, bays: 2,
        garages: [{ x: 2, y: 6, dir: 'U', vehicles: [{ kind: 'car', color: 'red' }, { kind: 'car', color: 'blue' }, { kind: 'car', color: 'yellow' }] }],
        vehicles: [van('blue', 'R', 0, 1), car('yellow', 'U', 4, 3), car('red', 'U', 5, 4)],
        queue: expandRuns([['blue', 4], ['yellow', 4], ['red', 4], ['blue', 6], ['red', 4], ['yellow', 4]])
    },
    {
        id: 'c6', name: 'Cones', hint: 'Cones never move. Nobody parks facing one.', from: 'g2-easy-50110',
        pool: 2, cols: 6, rows: 8, bays: 4, walls: [[2, 1], [5, 6]],
        vehicles: [
            car('green', 'R', 3, 1), car('red', 'U', 5, 2), bus('red', 'L', 0, 5), car('pink', 'U', 4, 6), car('green', 'U', 3, 6),
            van('pink', 'L', 2, 2), van('pink', 'L', 2, 3), van('red', 'U', 0, 2), car('green', 'L', 1, 0)
        ],
        queue: expandRuns([['red', 3], ['green', 4], ['pink', 6], ['green', 2], ['red', 16], ['pink', 6], ['green', 2], ['pink', 3], ['green', 4], ['pink', 1], ['red', 1]])
    },
    {
        id: 'c7', name: 'Guarded Columns', hint: 'Two cars guard the columns. Open the column whose colour is coming up.', from: 'g2-easy-50348',
        pool: 4, cols: 6, rows: 8, bays: 4,
        vehicles: [
            car('blue', 'L', 1, 2), car('blue', 'R', 4, 2), car('red', 'U', 0, 3), van('red', 'U', 0, 5), van('blue', 'U', 1, 4),
            van('purple', 'U', 2, 4), car('purple', 'U', 3, 3), car('purple', 'U', 3, 5), car('red', 'U', 4, 3), car('red', 'U', 4, 5)
        ],
        queue: expandRuns([['red', 14], ['purple', 4], ['blue', 6], ['red', 4], ['blue', 6], ['purple', 10], ['blue', 2]])
    },
    {
        id: 'c8', name: 'Side Streets', hint: 'Lanes only drive out sideways. Watch who they trap.', from: 'g2-easy-50021',
        pool: 6, cols: 6, rows: 8, bays: 4,
        vehicles: [
            car('green', 'L', 0, 0), car('green', 'L', 2, 0), car('green', 'U', 5, 1), car('green', 'U', 4, 1), van('purple', 'D', 1, 1),
            car('green', 'R', 1, 4), van('purple', 'D', 3, 5), car('red', 'R', 4, 5), car('red', 'U', 0, 1)
        ],
        queue: expandRuns([['red', 2], ['purple', 6], ['green', 2], ['red', 2], ['purple', 6], ['green', 8], ['red', 4], ['green', 10]])
    },
    {
        id: 'c9', name: 'Shift Change', hint: 'Everything you have learned, together.', from: 'g2-easy-50052',
        pool: 3, cols: 6, rows: 8, bays: 4,
        vehicles: [
            car('red', 'U', 1, 2), car('red', 'U', 3, 4), car('green', 'R', 1, 1), car('yellow', 'U', 0, 2), car('yellow', 'U', 2, 3),
            bus('red', 'L', 2, 2), car('green', 'U', 0, 0), van('yellow', 'U', 1, 5)
        ],
        garages: [{ x: 5, y: 6, dir: 'L', vehicles: [{ kind: 'car', color: 'green' }, { kind: 'van', color: 'green' }] }],
        queue: expandRuns([['green', 11], ['yellow', 2], ['red', 4], ['yellow', 6], ['green', 6], ['yellow', 2], ['green', 1], ['red', 8], ['yellow', 2], ['red', 2], ['yellow', 2], ['red', 4]])
    }
];

// Teaching order. Rush Hour (3 bays, deep dig) moved late after playtest round 1: as lesson 4 it was a spike.
const ORDER = ['c1', 'c2', 'c3', 'c5', 'c6', 'c7', 'c8', 'c4', 'c9'];
export const CURATED = ORDER.map((id) => LESSONS.find((l) => l.id === id));
