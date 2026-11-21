# Generator validation — g1

2026-11-20T19:03:35.366Z · 1000 seeds per generation band · Node v26.13.1

| gen band | accepted | rejected | timeouts | ms p50 | ms p95 | ms max | measured bands (accepted) | rejection reasons |
|---|---|---|---|---|---|---|---|---|
| breather | 346 (35%) | 654 | 0 | 0.7 | 1.3 | 12.1 | breather 330, easy 13, medium 2, expert 1 | trivial 654 |
| easy | 806 (81%) | 194 | 0 | 1.0 | 1.7 | 3.9 | breather 655, easy 84, medium 47, hard 16, expert 4 | trivial 194 |
| medium | 679 (68%) | 321 | 0 | 1.6 | 3.3 | 35.7 | medium 242, hard 154, breather 143, easy 80, expert 60 | trivial 313, unsolvable 5, unfair 3 |
| hard | 726 (73%) | 274 | 0 | 2.4 | 7.3 | 102.3 | medium 290, hard 223, expert 153, easy 38, breather 22 | trivial 260, unfair 8, unsolvable 6 |
| expert | 873 (87%) | 127 | 0 | 4.0 | 17.5 | 161.9 | expert 330, hard 310, medium 219, easy 13, breather 1 | trivial 100, unfair 17, unsolvable 10 |

## Summary

- Accepted levels: **3430** of 5000 seeds (68.6%).
- Accepted by measured band: breather 1151, easy 228, medium 800, hard 703, expert 548.
- Generation + verification time per seed: p50 1.6 ms, p95 7.4 ms, max 161.9 ms.
- Exact duplicates (same after recolour/mirror): 0. Near-duplicate pairs: 0 of 733436 same-size pairs (0 levels would be filtered).
- Determinism: all sampled seeds regenerate byte-identically (0 mismatches).
- Re-verification of a 10% sample: 0 failures.
- Timeout drill (solver budget cut to 20 nodes on 40 hard/expert levels): 14 came back INCONCLUSIVE and were rejected (never served); the other 26 were genuinely solved within 20 nodes and replayed to a win.
- Runtime fallback: the game never waits on the generator. Level N takes a fresh worker level when one is buffered for its band, otherwise the next unused prevalidated pool seed (120 per band, shipped as seeds). Worker requests use a 150 ms solver budget per candidate; a timeout just means that candidate is skipped.
