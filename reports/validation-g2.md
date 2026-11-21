# Generator validation — g2

2026-11-20T19:10:57.067Z · 1000 seeds per generation band · Node v26.13.1

| gen band | accepted | rejected | timeouts | ms p50 | ms p95 | ms max | measured bands (accepted) | rejection reasons |
|---|---|---|---|---|---|---|---|---|
| breather | 351 (35%) | 649 | 0 | 0.7 | 1.2 | 7.5 | breather 333, easy 12, medium 4, hard 2 | trivial 649 |
| easy | 787 (79%) | 213 | 0 | 1.0 | 1.6 | 4.7 | breather 653, medium 58, easy 57, hard 14, expert 5 | trivial 213 |
| medium | 646 (65%) | 354 | 0 | 1.5 | 3.0 | 23.6 | medium 234, breather 143, hard 134, easy 82, expert 53 | trivial 349, unfair 4, unsolvable 1 |
| hard | 656 (66%) | 344 | 0 | 2.2 | 4.9 | 26.6 | medium 276, hard 209, expert 96, easy 50, breather 25 | trivial 334, unsolvable 5, unfair 5 |
| expert | 857 (86%) | 143 | 0 | 3.1 | 9.1 | 48.6 | hard 302, medium 284, expert 248, easy 23 | trivial 121, unsolvable 12, unfair 10 |

## Summary

- Accepted levels: **3297** of 5000 seeds (65.9%).
- Accepted by measured band: breather 1154, easy 224, medium 856, hard 661, expert 402.

### Variety of accepted levels (by measured band)

| band | levels | scatter | columns | lanes | with garages | with cones | median vehicles | median passengers | median decisions | median waits |
|---|---|---|---|---|---|---|---|---|---|---|
| breather | 1154 | 355 | 499 | 300 | 245 | 444 | 9 | 46 | 0 | 0 |
| easy | 224 | 85 | 66 | 73 | 102 | 125 | 13 | 64 | 2 | 2 |
| medium | 856 | 311 | 289 | 256 | 494 | 515 | 15 | 76 | 3 | 2 |
| hard | 661 | 250 | 230 | 181 | 410 | 436 | 16 | 82 | 6 | 2 |
| expert | 402 | 155 | 127 | 120 | 245 | 282 | 17 | 88 | 10 | 2 |

- Generation + verification time per seed: p50 1.4 ms, p95 4.8 ms, max 48.6 ms.
- Exact duplicates (same after recolour/mirror): 0. Near-duplicate pairs: 0 of 664725 same-size pairs (0 levels would be filtered).
- Determinism: all sampled seeds regenerate byte-identically (0 mismatches).
- Re-verification of a 10% sample: 0 failures.
- Timeout drill (solver budget cut to 20 nodes on 40 hard/expert levels): 15 came back INCONCLUSIVE and were rejected (never served); the other 25 were genuinely solved within 20 nodes and replayed to a win.
- Runtime fallback: the game never waits on the generator. Level N takes a fresh worker level when one is buffered for its band, otherwise the next unused prevalidated pool seed (120 per band, shipped as seeds). Worker requests use a 150 ms solver budget per candidate; a timeout just means that candidate is skipped.

## In-browser runtime check (Chrome, desktop, module worker)

One fresh level requested per band from the generator worker (150 ms solver budget per candidate), measured from request to verified result:

| band | ms to a verified level | candidates tried | rejected on the way |
|---|---|---|---|
| breather | 3 | 2 | trivial 1 |
| easy | 16 | 8 | wrong band 4, trivial 3 |
| medium | 12 | 6 | trivial 4, wrong band 1 |
| hard | 18 | 5 | trivial 2, wrong band 1, unfair 1 |
| expert | 14 | 3 | wrong band 2 |

Switching to the next level (construct from seed + build the 3D board): 4–12 ms over five switches. The worker keeps two levels buffered per upcoming band; if it is busy or unavailable, the next unused prevalidated pool seed is used instantly.
