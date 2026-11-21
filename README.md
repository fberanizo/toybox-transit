# 🚌 Toybox Transit

A cosy little puzzle for your browser. Tap toy cars, vans and buses out of a packed lot and send them to the boarding bays. Passengers stroll into the plaza, and anyone whose colour matches a parked vehicle hops right on. The one thing to avoid: filling every bay with vehicles nobody can board. That's a jam.

- **No ads, no boosters, no timers, no lives.** Just you and the puzzle.
- **Free, unlimited undo.** Experiment as much as you like.
- **Nine teaching levels**, then an **endless track** of seeded levels, each one proven solvable before you see it.
- A soft bubble pop for every passenger, over looping background music (both can be switched off).

## ▶️ Play now

- **Online:** <https://fberanizo.github.io/toybox-transit/>
- **Locally:** from the repo folder run `python3 -m http.server 8000`, then open <http://localhost:8000>. No build step, no install.

## 🎮 How to play

1. Tap (or click) a vehicle with a clear road out of the lot. It drives to a free bay.
2. Passengers wait in a line and walk into the plaza, a small loop above the bays. Matching colours board automatically; the number by a parked vehicle shows the seats left.
3. Clear the lot without ever filling all the bays with the wrong colours.

The teaching levels introduce one idea at a time: vans and buses, garages that release cars one by one, cones that never move, and side lanes.

| Action | Button | Keys |
|---|---|---|
| Undo last move | ↶ | `U`, `Backspace`, `Ctrl+Z` |
| Restart level | ⟲ | `R` |
| Open menu | ☰ | |

**The menu** shows the current level's seed and lets you:

- **Copy seed** to share a level with a friend
- **Play a seed**, any seed, e.g. `g3-medium-1234`
- **☆ Favorite** levels you love and replay them later
- Toggle **Sound** and **Music** on or off

Your level and moves are saved, so a reload picks up right where you left off.

## 🔧 Under the hood

Every generated level is checked before it's served:

1. **Rules:** schema check against the one shared copy of the rules
2. **Solver:** proves the level winnable within a budget (timeouts are rejected)
3. **Witness replay:** the solver's winning sequence is replayed through the real game rules
4. **Metrics:** traps, decisions, bay pressure, blocking depth, random-play win rate
5. **Fairness:** a bot that sees only the visible queue and the "coming up" ribbon must be able to win
6. **Band + near-duplicate check:** matches its difficulty band and isn't too similar to recent levels

Seeds look like `g<version>-<recipe>-<n>` and are reproducible for a given generator version.

| Piece | File |
|---|---|
| Rules (used by game, solver, generator, tests) | `src/core/rules.js` |
| Level format + validation | `src/core/level.js` |
| Solver (SOLVED / UNSOLVABLE / INCONCLUSIVE) | `src/core/solver.js` |
| Difficulty + fair-play metrics | `src/core/metrics.js`, `src/core/bands.js` |
| Seeded generator | `src/core/generator.js` |
| Near-duplicate detection | `src/core/similarity.js` |
| Teaching levels | `src/levels/curated.js` |
| Endless track, pool fallback, worker | `src/levels/source.js`, `src/levels/pool.js`, `src/worker/gen-worker.js` |

## 🛠️ Development

The game is a plain static site. Node is used only for tooling (`npm install` once):

```
npm test                      # rules regressions, curated levels, generator determinism, pool
npm run validate -- --n=1000  # batch report -> reports/validation-g<version>.md
npm run pool                  # rebuild the shipped prevalidated pool
npm run artifact              # single-file build -> dist/toybox-transit-<buildId>.html
node scripts/analyze.mjs      # metrics for the teaching levels
```

- `tools/mobile-frame.html` previews a build at phone size.
- `.claude/agents/` holds project subagents for playtesting, visual review, level design and validation.

Contributions are welcome: new teaching levels, generator tuning, polish and bug reports all help.

## 💛 Credits

- Textures and the menu emblem in `assets/` were generated for this project in Google Flow.
- Sounds: “Bubble Pop 06” by Universfield and “Puzzle Game Music 3” by cartoon_music (Pixabay Content License), trimmed and re-encoded as `assets/bubble.mp3` and `assets/music.mp3`.

## 📄 License

MIT License.
