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
node tools/sim-check.js     # 60 assertions: path, combat, art, audio, economy, win state
node tools/balance.js 27    # auto-plays N waves and reports the difficulty curve
```

## Sound

Every sound is **synthesised at runtime** with the Web Audio API — there are no
audio files to download and nothing to load. Gunfire is filtered noise bursts
layered with a pitch-swept oscillator, one distinct voice per tower type:

| | |
|---|---|
| Gunner | tight 70 ms crack, rapid-fire safe |
| Cannon | sub-bass thump (78→34 Hz) with a long noise tail |
| Frost | resonant bandpass shimmer, rising |
| Tesla | buzzy sawtooth arc + noisy discharge |
| Sniper | sharp 4.2 kHz report decaying to 260 Hz |

Plus placement thunks, upgrade chimes, coin sfx, enemy pops, a two-note breach
alarm, a rising war horn per wave, and distinct game-over / victory stings.

Details that matter: audio only starts after your first click (browser autoplay
policy), a compressor glues the bus so a screenful of cannons isn't harsh, and
a 28-voice cap plus per-sound minimum gaps stop 30 towers from melting the CPU.
Press `M` or use the 🔊 button to mute.

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
`Enter` call the next wave early for a bonus · `Space` pause · `+`/`-` speed · `M` mute

## Turret art

Towers are drawn procedurally — no sprites. Each type has its own silhouette and
they **visibly change as you level them up**:

- **Gunner** — twin barrels that become a triple at level 4, muzzle brake block,
  and the barrels glow amber-to-white-hot as they accumulate heat.
- **Cannon** — hydraulic stabiliser arms, mantlet, fat barrel with cooling slots
  that kicks back several pixels on every shot.
- **Frost** — rotating crystal shards (more at higher levels) around a pulsing
  cryo core with a radial bloom.
- **Tesla** — stacked coil rings, a breathing energy orb, and idle micro-arcs
  that snap to a full discharge when it fires.
- **Sniper** — bipod, tapered barrel, scope with a lens that lights up when it
  has a target, plus a dashed laser sight line.

Common to all: octagonal deck plate with a metal gradient, bevel highlight,
rivets, level chevrons, a coloured ambient glow that intensifies with level,
star-shaped muzzle flash with smoke, and a rotating dashed range ring with corner
brackets when selected. Heavy guns also traverse noticeably slower than gunners.

Projectiles are distinct too: spinning brass cannon shells, tumbling ice shards,
incendiary darts with a hard white core, and glowing tracer slugs.

## Layout

```
index.html          markup + script order
css/style.css       all styling
js/config.js        every tunable: grid, path, pads, towers, enemies, waves
js/utils.js         geometry — path arc-length lookup, pads, canvas sugar
js/audio.js         procedural SFX engine (Web Audio, no assets)
js/entities.js      Enemy, Tower, Projectile, particles, chain lightning
js/waves.js         wave composition + spawn scheduler
js/game.js          state machine, simulation step, map rendering
js/main.js          DOM wiring, input, HUD, requestAnimationFrame loop
tools/sim-check.js  headless smoke tests (stubbed canvas + no Web Audio)
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
