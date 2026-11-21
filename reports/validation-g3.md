# Generator validation — g3

2026-11-20T20:08:10.015Z · 1000 seeds per generation band · Node v26.13.1

| gen band | accepted | rejected | timeouts | ms p50 | ms p95 | ms max | measured bands (accepted) | rejection reasons |
|---|---|---|---|---|---|---|---|---|
| breather | 51 (5%) | 949 | 0 | 1.1 | 1.7 | 13.3 | breather 50, easy 1 | trivial 949 |
| easy | 564 (56%) | 436 | 0 | 1.6 | 2.6 | 13.6 | breather 514, easy 29, medium 17, hard 4 | trivial 435, unfair 1 |
| medium | 745 (75%) | 255 | 0 | 2.2 | 3.4 | 8.9 | breather 424, easy 151, medium 123, hard 40, expert 7 | trivial 253, unsolvable 2 |
| hard | 634 (63%) | 366 | 0 | 2.9 | 5.1 | 26.1 | medium 272, easy 120, breather 106, hard 101, expert 35 | trivial 363, unfair 3 |
| expert | 698 (70%) | 302 | 0 | 4.2 | 8.5 | 46.4 | medium 333, hard 186, easy 82, expert 75, breather 22 | trivial 296, unsolvable 3, unfair 3 |

## Summary

- Accepted levels: **2692** of 5000 seeds (53.8%).
- Accepted by measured band: breather 1116, easy 383, medium 745, hard 331, expert 117.

### Variety of accepted levels (by measured band)

| band | levels | scatter | columns | lanes | with garages | with cones | median vehicles | median passengers | median decisions | median waits |
|---|---|---|---|---|---|---|---|---|---|---|
| breather | 1116 | 392 | 353 | 371 | 380 | 525 | 11 | 54 | 0 | 0 |
| easy | 383 | 156 | 111 | 116 | 221 | 236 | 14 | 72 | 1 | 0 |
| medium | 745 | 283 | 263 | 199 | 441 | 490 | 16 | 82 | 3 | 1 |
| hard | 331 | 113 | 114 | 104 | 209 | 223 | 17 | 86 | 6 | 2 |
| expert | 117 | 49 | 34 | 34 | 79 | 81 | 17 | 92 | 10 | 2 |

- Generation + verification time per seed: p50 2.1 ms, p95 5.7 ms, max 46.4 ms.
- Exact duplicates (same after recolour/mirror): 0. Near-duplicate pairs: 0 of 513804 same-size pairs (0 levels would be filtered).
- Determinism: all sampled seeds regenerate byte-identically (0 mismatches).
- Re-verification of a 10% sample: 0 failures.
- Timeout drill (solver budget cut to 20 nodes on 40 hard/expert levels): 22 came back INCONCLUSIVE and were rejected (never served); the other 18 were genuinely solved within 20 nodes and replayed to a win.
- Runtime fallback: the game never waits on the generator. Level N takes a fresh worker level when one is buffered for its band, otherwise the next unused prevalidated pool seed (120 per band, shipped as seeds). Worker requests use a 150 ms solver budget per candidate; a timeout just means that candidate is skipped.
