# Tower Defense

A complete tower defense game in plain JavaScript. **No build step, no dependencies,
no network requests** — eight scripts loaded in order, all art drawn procedurally,
all sound synthesised at runtime.

🎮 **Play it:** <https://cubemac.github.io/tower-defense-1/>

```sh
git clone git@github.com:cubemac/tower-defense-1.git
cd tower-defense-1
open index.html        # works straight off the filesystem, no server needed
```

---

## Contents

- [The game in one paragraph](#the-game-in-one-paragraph)
- [Controls](#controls)
- [Towers](#towers)
- [Enemies](#enemies)
- [Waves](#waves)
- [Strategy notes](#strategy-notes)
- [Project layout](#project-layout)
- [Tuning in five minutes](#tuning-in-five-minutes)
- [Testing & tooling](#testing--tooling)
- [Browser support](#browser-support)
- [Troubleshooting](#troubleshooting)

Deeper docs: **[ARCHITECTURE](docs/ARCHITECTURE.md)** ·
**[TUNING](docs/TUNING.md)** · **[TESTING](docs/TESTING.md)**

---

## The game in one paragraph

Enemies walk a fixed 2832px serpentine track from the green spawn dot to your red
goal. You have **43 build pads** — lit plates on 18% of the 20×12 grid — and towers
only go on those plates, so *where* you spend is the whole game. Ground-only towers
cannot touch flying units, and fliers arrive at **wave 9**, which is where a
badly-balanced defence falls apart. Clear **wave 27** to win; past that the run
keeps scaling endlessly for score.

---

## Controls

| Key | Action |
|---|---|
| `1` – `5` | Select tower type (Gunner, Cannon, Frost, Tesla, Sniper) |
| `click` | Place on a lit pad · select an existing tower |
| `right-click` | Cancel build mode / deselect |
| `U` | Upgrade selected tower |
| `X` | Sell selected tower (70% of total invested) |
| `T` | Cycle targeting mode: first → last → strongest → weakest |
| `Enter` | Call the next wave early — banks 2 credits per unused second |
| `Space` | Pause / resume |
| `+` / `-` | Simulation speed (0.5× to 4×) |
| `M` | Mute / unmute |

Audio only starts after your **first click** — that's browser autoplay policy, not a
bug. The 🔊 button in the header mirrors the `M` key.

---

## Towers

Every tower has 4 levels. Costs below are **cumulative** (level 1 price, then total
spent to reach that level).

### Gunner — `50` · hits air
The workhorse. Cheap, fast, reliable, and the only affordable anti-air early on.
Twin barrels become a **triple at level 4**, and the barrels glow amber→white-hot
as they accumulate heat.

| lvl | total cost | damage | rate | DPS | range |
|---|---|---|---|---|---|
| 1 | 50 | 9.0 | 2.60/s | **23** | 112 |
| 2 | 95 | 14.0 | 2.96/s | 41 | 123 |
| 3 | 180 | 21.6 | 3.38/s | 73 | 136 |
| 4 | 340 | 33.5 | 3.85/s | **129** | 149 |

### Cannon — `120` · ground only
Slow, heavy splash. Damage falls off to 35–100% across the blast radius. Melts
tight ground clusters; completely useless against fliers.

| lvl | total cost | damage | rate | DPS | range | splash |
|---|---|---|---|---|---|---|
| 1 | 120 | 34.0 | 0.62/s | **21** | 138 | 58 |
| 2 | 230 | 52.7 | 0.71/s | 37 | 152 | 65 |
| 3 | 420 | 81.7 | 0.81/s | 66 | 167 | 73 |
| 4 | 740 | 126.6 | 0.92/s | **116** | 184 | 81 |

### Frost — `90` · ground only
Support. Terrible damage, excellent control — a level 4 frost slows ground units by
**60% for 2.35s**. Pair it under a cannon or sniper.

| lvl | total cost | damage | rate | DPS | range | slow |
|---|---|---|---|---|---|---|
| 1 | 90 | 4.0 | 1.15/s | **5** | 104 | 45% / 1.60s |
| 2 | 170 | 6.2 | 1.31/s | 8 | 114 | 50% / 1.85s |
| 3 | 320 | 9.6 | 1.49/s | 14 | 126 | 54% / 2.10s |
| 4 | 580 | 14.9 | 1.70/s | **25** | 138 | 60% / 2.35s |

### Tesla — `185` · hits air
Chain lightning, no projectile. Hits the primary target at full damage and up to
four bounces at 72%. Best anti-air value in the game.

| lvl | total cost | damage | rate | DPS | range | chains |
|---|---|---|---|---|---|---|
| 1 | 185 | 15.0 | 1.00/s | **15** | 126 | 3 |
| 2 | 345 | 23.3 | 1.14/s | 27 | 139 | 3 |
| 3 | 615 | 36.0 | 1.30/s | 47 | 152 | 4 |
| 4 | 1055 | 55.9 | 1.48/s | **83** | 168 | 5 |

### Sniper — `210` · hits air
Enormous range and burst, dreadful up close. Its scope lens lights up and a dashed
laser sight appears while it holds a target.

| lvl | total cost | damage | rate | DPS | range |
|---|---|---|---|---|---|
| 1 | 210 | 78.0 | 0.34/s | **27** | 300 |
| 2 | 400 | 120.9 | 0.39/s | 47 | 330 |
| 3 | 720 | 187.4 | 0.44/s | 83 | 363 |
| 4 | 1260 | 290.5 | 0.50/s | **146** | 399 |

> Heavy guns physically traverse slower than gunners — cannons and snipers visibly
> lag when a target swings behind them. That's intentional, and it's why range alone
> doesn't make a sniper good.

---

## Enemies

**Armour is flat damage reduction per hit**, not a percentage — which means many
small hits are heavily penalised and a single big hit barely notices it.

| enemy | HP | speed | traverse | bounty | armour | flying |
|---|---|---|---|---|---|---|
| Grunt | 48 | 58 px/s | 48.8s | 7 | 0 | — |
| Runner | 34 | 126 px/s | 22.5s | 8 | 0 | — |
| Swarm | 24 | 92 px/s | 30.8s | 3 | 0 | — |
| Shield | 150 | 54 px/s | 52.4s | 15 | **6** | — |
| Tank | 320 | 36 px/s | 78.7s | 26 | 3 | — |
| Wraith | 112 | 108 px/s | 26.2s | 17 | 1 | ✅ |
| Harpy | 245 | 84 px/s | 33.7s | 30 | 4 | ✅ |
| BOSS | 2900 | 31 px/s | 91.4s | 210 | **9** | — |

A level 1 gunner (9 dmg) against a Shield (6 armour) deals **3** per hit — one third
of its nominal DPS. A level 4 sniper (290 dmg) still deals **281**. This is why
armour waves punish spam and reward upgrades.

A boss that reaches the goal costs **5 lives**, not 1.

---

## Waves

Waves 1–20 are hand-authored; 21+ recycle the wave-20 pattern under escalating
scaling (`×1.135` HP and `×1.09` unit count per wave past the table).

| wave | composition | HP scale | units |
|---|---|---|---|
| 1 | 8× grunt | ×1.00 | 8 |
| 2 | 12× grunt | ×1.11 | 12 |
| 3 | 8× runner + 6× grunt | ×1.22 | 14 |
| 4 | 14× grunt + 10× swarm | ×1.33 | 24 |
| 5 | 6× shield + 8× runner | ×1.44 | 14 |
| 6 | 3× tank + 10× grunt | ×1.55 | 13 |
| 7 | 26× swarm + 6× shield | ×1.66 | 32 |
| 8 | 18× runner + 4× tank | ×1.77 | 22 |
| **9** | **6× wraith** + 12× grunt | ×1.88 | 18 |
| **10** | **1× BOSS** + 12× grunt | ×1.99 | 13 |
| 11 | 8× tank + 8× wraith | ×2.10 | 16 |
| 12 | 40× swarm + 12× shield | ×2.21 | 52 |
| 13 | 14× wraith + 6× tank | ×2.32 | 20 |
| **14** | **6× harpy** + 24× runner | ×2.43 | 30 |
| **15** | **2× BOSS** + 10× wraith | ×2.54 | 12 |
| 16 | 14× tank + 8× harpy | ×2.65 | 22 |
| 17 | 12× harpy + 24× runner | ×2.76 | 36 |
| 18 | 18× tank + 18× wraith | ×2.87 | 36 |
| 19 | 14× harpy + 12× tank | ×2.98 | 26 |
| **20** | **3× BOSS** + 10× harpy | ×3.09 | 13 |
| 21+ | *recycled wave 20, scaled* | ×3.51 → | 14+ |

**Known design consequence:** because endless mode recycles the *wave 20* pattern,
every post-table wave contains bosses. Runs therefore fall over around wave 28–30 —
by design the win condition sits at 27. If you want a gentler endless tail, change
the recycled index in `js/waves.js` (see [TUNING](docs/TUNING.md)).

---

## Strategy notes

- **Wave 9 is the real test.** If you spent your opening economy on cannons and
  frost, wraiths walk through you untouched. Keep at least one anti-air pad covered.
- **Upgrade over expand.** A level 3 gunner (73 DPS for 180 total) beats two
  level 1 gunners (46 DPS for 100) by a wide margin, and covers one pad instead of
  two.
- **Frost is not a damage tower.** Its job is to keep tanks under your cannons
  longer. Never fill more than a couple of pads with it.
- **Armour waves (5, 12) want high-damage single hits.** Snipers and levelled
  cannons; a swarm of gunners is nearly wasted on Shields.
- **Calling waves early pays.** 2 credits per unused prep second, up to 24 per wave.
  If your line is holding, bank it.
- **Sell and re-place** when a wave pattern shifts — 70% refund means repositioning
  costs 30% of a tower, which is cheap compared to leaking.

---

## Project layout

```
index.html              markup + script load order
css/style.css         all styling, no framework
js/config.js          EVERY tunable: grid, path, pads, towers, enemies, waves
js/utils.js           geometry — arc-length path lookup, pads, canvas helpers
js/audio.js           procedural SFX engine (Web Audio, zero assets)
js/entities.js        Enemy, Tower, Projectile, particles, chain lightning
js/waves.js           wave composition + spawn scheduler
js/game.js            state machine, simulation step, map rendering
js/main.js            DOM wiring, input, HUD, requestAnimationFrame loop
tools/sim-check.js    60 headless assertions (stubbed canvas, no Web Audio)
tools/balance.js      auto-player difficulty probe
```

The game logic never touches the DOM and the DOM layer never mutates game state
directly — `main.js` is the only bridge. That's what makes the headless tools
possible. See **[ARCHITECTURE](docs/ARCHITECTURE.md)**.

---

## Tuning in five minutes

Every number lives in `js/config.js`. Change it, refresh the browser, done.

```js
const START_MONEY = 190;        // opening credits
const START_LIVES = 20;
const PREP_TIME   = 12;         // seconds between waves
const WIN_WAVE    = WAVES.length + 7;   // wave 27

const ENDLESS_HP_SCALE    = 1.135;   // HP growth per wave past the table
const ENDLESS_COUNT_SCALE = 1.09;    // unit count growth
const WAVE_BOUNTY_BASE    = 10;      // + wave × 2 on clear
```

Then **verify instead of guessing**:

```sh
node tools/balance.js 27     # does a competent player still win?
node tools/sim-check.js      # did you break anything structural?
```

Full recipes — new tower, new enemy, new map path, new sound — are in
**[TUNING](docs/TUNING.md)**.

---

## Testing & tooling

```sh
node tools/sim-check.js     # 60 assertions, exits non-zero on failure
node tools/balance.js 27    # auto-plays N waves, prints the difficulty curve
```

Both load the **real** game sources into a VM sandbox with a stubbed 2D context, so
they exercise the same code the browser runs. No test framework, no install step.

```
✅ ALL CHECKS PASSED          ← 60 assertions
median wave reached : 27 / 27 · lives 17, 17, 17 · leaks 3
```

What they cover, and how to add your own assertion: **[TESTING](docs/TESTING.md)**.

---

## Browser support

Works in any current browser — Safari, Chrome, Firefox, Edge. Requires:

- **Canvas 2D** with `ellipse()` and `setLineDash()`
- **ES2020** syntax (optional chaining, classes, `Array.prototype.at`)
- **Web Audio API** — degrades to silence if absent; the game still plays

No polyfills, no transpilation, no bundler. Runs from `file://` because the scripts
are classic `<script>` tags, not ES modules (modules are blocked by CORS on
`file://` — that's deliberate).

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| **No sound** | Browsers block audio until you interact. Click the page once, then press `M` to confirm you're not muted. |
| **Blank canvas** | Check the console — a script failed to load. Confirm all 8 files in `js/` are present and `index.html` lists them in order. |
| **Can't place a tower** | Towers only go on the 43 lit pads. In build mode, valid pads light up blue; red means occupied or off-pad. |
| **Fliers walking through** | Your towers are ground-only (`GND` badge). Build a Gunner, Tesla or Sniper. |
| **Game "too hard" at wave 9** | First fliers. Lower `hpScale` in `js/waves.js` or raise `START_MONEY`. |
| **Runs always end ~wave 28** | Endless recycles the boss-heavy wave-20 pattern. See [TUNING](docs/TUNING.md#endless-tail). |
| **Choppy at 4× speed** | Expected on slower machines with many towers — the voice cap and particle counts are in [TUNING](docs/TUNING.md#performance). |

---

## License

No license file has been declared yet — which means **all rights reserved by
default**. Pick one before sharing widely (MIT is the usual default for a toy like
this); see [TUNING](docs/TUNING.md#adding-a-license).
