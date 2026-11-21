// src/core/bands.js — difficulty bands: generation parameters and how measured metrics map to a band.
// Difficulty is scored from meaningful choices (traps, decisions, waits, blocking depth, random-play win
// rate), never from size alone. Weights/thresholds are calibrated against blind playtests.

export const BANDS = ['breather', 'easy', 'medium', 'hard', 'expert'];

/**
 * Generation parameters per band. kinds/archetypes/garages/walls are [value, weight] pairs.
 * archetypes: scatter (tangled chains) | columns (guarded colour columns) | lanes (sideways traffic lanes)
 * pool: plaza capacity (people who can wait and board any matching parked vehicle).
 * garages: how many garages (each releases 2–4 vehicles one by one); walls: traffic cones (dead ends).
 */
export const BAND_PARAMS = {
    breather: {
        pool: [8, 10],
        cols: [6, 6], rows: [7, 8], colors: [2, 3], vehicles: [6, 8], bays: [4, 4],
        kinds: [['car', 5], ['van', 3], ['bus', 1]], wait: 0.25, split: 0.2, density: 0.5, groupColor: 0.85,
        archetypes: [['scatter', 1], ['columns', 2], ['lanes', 1]], garages: [[0, 1]], walls: [[0, 3], [1, 1]]
    },
    easy: {
        pool: [6, 8],
        cols: [6, 7], rows: [8, 9], colors: [3, 3], vehicles: [8, 11], bays: [3, 4],
        kinds: [['car', 5], ['van', 3], ['bus', 1.5]], wait: 0.4, split: 0.3, density: 0.6, groupColor: 0.8,
        archetypes: [['scatter', 2], ['columns', 2], ['lanes', 1.5]], garages: [[0, 3], [1, 1]], walls: [[0, 2], [1, 1], [2, 0.5]]
    },
    medium: {
        pool: [5, 6],
        cols: [7, 7], rows: [9, 10], colors: [3, 4], vehicles: [11, 14], bays: [3, 3],
        kinds: [['car', 5], ['van', 3], ['bus', 2]], wait: 0.5, split: 0.4, density: 0.68, groupColor: 0.75,
        archetypes: [['scatter', 2], ['columns', 2], ['lanes', 2]], garages: [[0, 2], [1, 1.5]], walls: [[0, 2], [1, 1], [2, 1]]
    },
    hard: {
        pool: [4, 6],
        cols: [7, 8], rows: [10, 11], colors: [4, 4], vehicles: [13, 17], bays: [3, 3],
        kinds: [['car', 5], ['van', 3], ['bus', 2]], wait: 0.6, split: 0.45, density: 0.72, groupColor: 0.7,
        archetypes: [['scatter', 2], ['columns', 2], ['lanes', 2]], garages: [[0, 1.5], [1, 2], [2, 0.7]], walls: [[0, 1.5], [1, 1], [2, 1], [3, 0.5]]
    },
    expert: {
        pool: [4, 6],
        cols: [8, 8], rows: [11, 12], colors: [4, 5], vehicles: [16, 20], bays: [3, 3],
        kinds: [['car', 5], ['van', 3], ['bus', 2.5]], wait: 0.65, split: 0.5, density: 0.75, groupColor: 0.65,
        archetypes: [['scatter', 2], ['columns', 2], ['lanes', 2]], garages: [[0, 1], [1, 2], [2, 1]], walls: [[0, 1], [1, 1], [2, 1], [3, 1]]
    }
};

/**
 * Difficulty score 0..100 from metrics. Each term measures a kind of decision the player must make.
 *  - randomWin: how often blind random tapping wins (low = choices matter)
 *  - decisionRate: share of steps where some legal move loses
 *  - trapDensity: losing moves available per step
 *  - waits: vehicles that must sit in a bay before anyone boards them (bay pressure)
 *  - blockMax: longest blocking chain (planning depth)
 */
export function difficultyScore(m) {
    const clamp = (x) => Math.max(0, Math.min(1, x));
    const decisionRate = m.decisions / Math.max(1, m.steps);
    return Math.round(
        34 * clamp(1 - m.randomWin * 1.4) +
        22 * clamp(decisionRate * 1.6) +
        16 * clamp(m.trapDensity / 1.5) +
        14 * clamp(m.waits / 5) +
        8 * clamp((m.blockMax - 1) / 5) +
        6 * clamp(m.bayPressure)
    );
}

/** Score thresholds: a level belongs to the highest band whose minimum it reaches. */
export const BAND_MIN = { breather: 0, easy: 30, medium: 50, hard: 66, expert: 80 };

export function bandForScore(score) {
    let band = 'breather';
    for (const b of BANDS) if (score >= BAND_MIN[b]) band = b;
    return band;
}

/** Hard rejection rules regardless of band ("too trivial" and "unfair"). */
export function rejectReason(m, band) {
    if (!m.fair) return 'unfair';
    const maxRandom = { breather: 0.9, easy: 0.6, medium: 0.35, hard: 0.18, expert: 0.1 }[band];
    if (m.randomWin > maxRandom) return 'trivial';
    if (band !== 'breather' && m.decisions === 0) return 'trivial';
    return null;
}
