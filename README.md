# Tower Defense

A self-contained browser tower defense game. No build step, no dependencies, no
network calls — plain ES5-ish scripts loaded in order so it runs straight off
`file://`.

## Run

```sh
open index.html          # macOS — works directly from the filesystem
# or, if you prefer a server:
npx serve .
```

Verify the simulation without a browser:

```sh
node tools/sim-check.js     # 40+ assertions over path, combat, economy, win state
node tools/balance.js 30    # auto-plays N waves and reports the difficulty curve
```

## How it plays

Enemies walk a fixed serpentine track. You have **43 build pads** — towers only
go on the lit plates, so where you place them is the whole game.

| Tower | Cost | Hits air | Role |
|---|---|---|---|
| Gunner | 50 | ✅ | Cheap workhorse, steady single target |
| Cannon | 120 | ❌ | Slow, heavy splash — shreds ground clusters |
| Frost | 90 | ❌ | Slows ground units; zero anti-air |
| Tesla | 185 | ✅ | Chains lightning across several targets |
| Sniper | 210 | ✅ | Huge range and burst, weak up close |

| Enemy | Trait |
|---|---|
| Grunt / Runner / Swarm | Cheap, fast, or numerous |
| Shield / Tank | Flat armour — chip damage is reduced per hit |
| **Wraith / Harpy** | **Flying. Ground-only towers cannot touch them.** |
| BOSS | Waves 10, 15, 20. Heavy armour, 5 lives if it gets through |

Clear **wave 27** to win. Past that the run keeps scaling endlessly for score.

Fliers arrive at wave 9, which is where the game actually starts hurting: if you
spent everything on cannons and frost, they walk straight through you.

## Controls

`1`–`5` select tower · `click` place or inspect · `right-click` cancel
`U` upgrade · `X` sell · `T` cycle targeting (first/last/strongest/weakest)
`Enter` call the next wave early for a bonus · `Space` pause · `+`/`-` speed

## Layout

```
index.html          markup + script order
css/style.css       all styling
js/config.js        every tunable: grid, path, pads, towers, enemies, waves
js/utils.js         geometry — path arc-length lookup, pads, canvas sugar
js/entities.js      Enemy, Tower, Projectile, particles, chain lightning
js/waves.js         wave composition + spawn scheduler
js/game.js          state machine, simulation step, map rendering
js/main.js          DOM wiring, input, HUD, requestAnimationFrame loop
tools/sim-check.js  headless smoke tests (stubbed canvas)
tools/balance.js    auto-player difficulty probe
```

Tuning lives entirely in `js/config.js`. The two tools read the same sources the
browser does, so balance changes are testable without opening a window.

## Notes on the two real bugs found while building this

1. **`pointAtDistance()` was off by one segment.** Enemies were rendered a full
   leg behind where they should be, so tower range checks silently missed. The
   path was self-consistent enough that the game *appeared* to work. There is now
   a regression test asserting every sampled point lies exactly on the polyline
   (`max off-path error 0.0000px`).
2. **Projectile damage was never attributed to its tower.** Only Tesla reported
   damage in the inspector. `Projectile` now carries its owner and credits
   `damageDealt` / `kills` back to it.
