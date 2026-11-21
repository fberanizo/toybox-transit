// src/levels/schedule.js — which difficulty band level N gets. Sawtooth: within each block of 7 the
// difficulty climbs and then drops to a breather; every 3 blocks the baseline steps up (capped).

import { CURATED } from './curated.js';

// Calibration round 2: blind testers struggled with "medium" right after the lessons, so the first block
// eases in (easy/breather around one medium) before the baseline steps up every 21 levels.
const TIERS = [
    ['easy', 'breather', 'easy', 'medium', 'easy', 'medium', 'breather'],
    ['medium', 'medium', 'hard', 'medium', 'hard', 'hard', 'breather'],
    ['medium', 'hard', 'hard', 'expert', 'hard', 'hard', 'easy'],
    ['hard', 'hard', 'expert', 'hard', 'expert', 'expert', 'medium']
];

export const FIRST_GENERATED = CURATED.length + 1;

export function bandFor(n) {
    if (n < FIRST_GENERATED) return null;
    const k = n - FIRST_GENERATED;
    const tier = Math.min(TIERS.length - 1, Math.floor(k / 21));
    return TIERS[tier][k % 7];
}
