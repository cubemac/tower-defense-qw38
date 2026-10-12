# Architecture

How the game is put together, and why it's shaped this way.

---

## Contents

- [Layering](#layering)
- [Load order and the shared scope](#load-order-and-the-shared-scope)
- [The game loop](#the-game-loop)
- [Coordinate systems and path parameterisation](#coordinate-systems-and-path-parameterisation)
- [Entity lifecycle](#entity-lifecycle)
- [Targeting rules](#targeting-rules)
- [The damage model](#the-damage-model)
- [Rendering order](#rendering-order)
- [Presentation state and gradient caching](#presentation-state-and-gradient-caching)
- [Audio engine](#audio-engine)
- [State machine](#state-machine)
- [Why the headless tools work](#why-the-headless-tools-work)

---

## Layering

Dependencies point strictly downward. Nothing below ever reaches up.

```
        ┌───────────────────────────────────────────────┐
        │  main.js      DOM, input, HUD, rAF loop      │   ← the only
        └──────────────────────┬────────────────────────┘      bridge
        ┌──────────────────────▼────────────────────────┐
        │  game.js      state machine, simulation, map   │
        └───────┬───────────────┬───────────────┬───────┘
        ┌───────▼──────┐ ┌──────▼──────┐ ┌─────▼────────┐
        │ entities.js  │ │ waves.js    │ │ audio.js     │
        └───────┬──────┘ └──────┬──────┘ └───────────────┘
        ┌───────▼─────────────────▼───────────────────────┐
        │  utils.js       pure geometry helpers           │
        └──────────────────────┬───────────────────────────┘
        ┌──────────────────────▼───────────────────────────┐
        │  config.js      plain data, zero logic          │
        └───────────────────────────────────────────────────┘
```

Consequences that matter:

- `config.js` contains **no functions** — it is data you can diff and tune safely.
- `utils.js` is pure: same input, same output, no state. Trivially testable.
- `entities.js` and `waves.js` never touch the DOM. They receive a `ctx` or a
  `game` reference and draw/spawn through it.
- `main.js` is the only file that calls `document.getElementById`. If the DOM layer
  breaks, the simulation still runs — which is exactly what the test harness relies on.

---

## Load order and the shared scope

`index.html` loads classic `<script>` tags in dependency order:

```
config → utils → audio → entities → waves → game → main
```

Classic scripts, **not ES modules**, on purpose:

| | classic `<script>` | `<script type="module">` |
|---|---|---|
| works from `file://` | ✅ | ❌ blocked by CORS |
| shared global scope | ✅ | ❌ isolated per module |
| needs a server | no | yes (for local dev) |

Every top-level `const`/`class` lands in one shared global lexical scope, so
`entities.js` can use `GRID`, `TOWERS` and `clamp()` without imports. The trade-off
is a single flat namespace — hence the disciplined naming (`PATH_BLOCKED`,
`BUILD_PADS`, `LEVEL_GROWTH`) and the rule that `config.js` declares no behaviour.

---

## The game loop

`main.js` owns the frame clock; `game.js` owns the simulation.

```js
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);   // clamp: no 30s tab-stall jump
  last = now;

  game.update(dt);     // advance simulation
  game.draw(ctx, dt);  // render current state (dt = real frame time, drives toast decay)
  syncHud();           // push numbers into the DOM

  requestAnimationFrame(frame);
}
```

Three deliberate choices:

1. **`dt` is clamped to 50 ms.** Without it, returning to a backgrounded tab after
   30 seconds teleports every enemy straight to your goal and ends the run.
2. **Speed is a multiplier on the step, not extra substeps:**
   `const step = dt * this.speed`. Cheap and smooth. The cost is that at 4× a
   sniper round travels ~100 px per frame — see
   [known limitations](#known-limitations).
3. **`update` then `draw`, never interleaved.** Nothing can render a half-applied
   simulation step.

`update()` runs in this fixed order, and the order is load-bearing:

```js
spawner.update()      // new enemies exist before anything targets them
towers.update()       // towers acquire + fire at existing enemies
projectiles.update()  // in-flight shots resolve, may kill
enemies.update()      // survivors move; leaks detected here
fx.update()           // particles/flash/text age out
→ filter all arrays   // dead things removed once, in one pass
→ wave completion check
```

If enemies moved before towers fired, towers would aim at last frame's positions.

---

## Coordinate systems and path parameterisation

Two coordinate spaces:

```js
cellCenter(col, row) → { x: col*48 + 24, y: row*48 + 24 }
pixelToCell(x, y)    → { col: floor(x/48), row: floor(y/48) }
```

The track is defined in **cell** coordinates in `config.js` (`PATH_CELLS`, 12
waypoints, first and last offscreen so enemies slide in and out), then converted to
pixels once at load into `PATH`:

```js
PATH = {
  pts:  [ {x,y}, … ],   // pixel waypoints
  cum:  [ 0, 192, … ],  // cumulative arc length at each waypoint
  length: 2832,         // total px
}
```

Enemies store a single scalar — `d`, distance travelled along the track — and derive
position from it:

```js
update(dt) { this.d += this.speed * dt; const p = pointAtDistance(this.d); … }
```

This is why enemies can't cut corners or drift off the path: there is no free
position to drift to. It also gives free, correct "who is furthest along" targeting
(`d` *is* progress) and exact leak detection (`d >= PATH.length`).

### The segment search

`pointAtDistance(d)` finds which leg contains `d`:

```js
let i = 1;
while (i < cum.length - 1 && cum[i] < d) i++;
const a = pts[i - 1], b = pts[i];
const t = clamp((d - cum[i-1]) / (cum[i] - cum[i-1]), 0, 1);
```

> ⚠️ **This was originally off by one** (`while (cum[i+1] < d)` with
> `a = pts[i-1], b = pts[i]`), which returned a point **one full leg behind** —
> `d=450` gave `(168,330)` instead of `(294,264)`. Because towers read the same
> function, positions were self-consistent and the game *looked* fine; the actual
> symptom was that frost fired once in four waves because enemies were never where
> its range said they'd be. There is now a regression test asserting every sampled
> point lies exactly on the polyline (`max off-path error 0.0000px`).

`nearestArcLength(px, py)` is the inverse projection — used to answer "how far
along the track is this point".

### Buildable space

Two sets, both computed once at load:

- `PATH_BLOCKED` — 60 cells the track covers, rasterised by walking waypoints in cell
  space. Blocks building.
- `BUILD_PADS` — 43 curated cells from `config.BUILDABLE_PADS`, intersected against
  bounds and the path in `canBuild()`. Only these may hold a tower.

`canBuild()` is the single authority; rendering, input and the bot all consult it, so
they can never disagree about what's legal.

---

## Entity lifecycle

```
Spawner.start(wave)          buildWave() → [{key, at}, …]
      │  timer crosses `at`
      ▼
new Enemy(key, hpScale)     pushed to game.enemies
      │  update(): move along path, tick slow/flash
      │  damageEnemy() → applyDamage() → hp -= max(1, dmg - armour)
      ├── hp <= 0 ──► onKill() ──► bounty, burst, float text, SFX
      └── d >= PATH.length ──► leaked ──► onLeak() ──► lives -= 1 (boss: 5)
      │
      ▼  end of frame
enemies = enemies.filter(e => e.alive)
```

Projectiles hold a **reference** to their target, not a snapshot. If the target dies
mid-flight they fall back to `lastX/lastY` and still detonate on arrival — which is
what makes cannon splash feel right against a cluster that dies early.

---

## Targeting rules

`Tower.pickTarget(enemies)` filters, then scores:

```js
if (!e.alive) continue;
if (e.flying && !this.def.antiAir) continue;      // hard gate, before range
if (dist(...) > s.range + e.radius) continue;      // range includes target size
```

Then the mode picks among candidates: `first` = highest `d`, `last` = lowest `d`,
`strongest` = highest current HP, `weakest` = lowest.

The air gate is evaluated **before** range, so a ground tower will never even
consider a flier overhead — and `Projectile.impact()` re-checks it so cannon splash
cannot accidentally damage air units it was never allowed to target.

---

## The damage model

Three distinct reductions, all multiplicative/flat by design:

| mechanism | formula | where |
|---|---|---|
| Armour | `max(1, damage - armour)` | `Enemy.applyDamage` — flat per hit |
| Splash falloff | `damage × clamp(1 - 0.55·d/splash, 0.35, 1)` | `Projectile.impact` |
| Chain decay | `damage × 0.72` per bounce | `Game.fireChain` |

Armour being **flat** is the important one: it makes many small hits disproportionately
bad and single large hits disproportionately good, which is what creates the
"upgrade instead of spam" pressure on armour waves.

Every damage event routes through `Game.damageEnemy(e, amount, source, tower)` so
credit is always attributed — that's the fix for the bug where only Tesla reported
damage in the inspector.

---

## Rendering order

Back to front, in `Game.draw()`:

```
map backdrop gradient
build pads (lit plates; dimmed if occupied)
path bed  — three strokes: dark casing, lighter deck, animated dashed flow
spawn / goal markers (goal pulses)
build overlay (if in build mode: valid pads, hover cell, range ghost)
selection box
towers          (each: shadow → ambient glow → deck plate → turret → muzzle flash)
enemies         (fliers drawn lifted, with a detached shadow on the deck)
projectiles     (additive tracer tails)
fx              (bursts, blasts, chain lightning, floating damage numbers)
toasts          (top-centre, decay on real time)
```

Towers draw *before* enemies so a unit passing in front of a barrel reads correctly.
Muzzle flashes and tracer tails use `globalCompositeOperation = 'lighter'` for a real
additive bloom rather than a flat yellow blob.

---

## Presentation state and gradient caching

Towers carry pure-cosmetic state that never feeds back into gameplay:

| field | purpose |
|---|---|
| `recoil` | barrel kick on fire, decays at 4.4/s; heavier guns kick further |
| `heat` | barrel glow, accumulates per shot, cools at 0.4/s |
| `muzzle` | seconds of flash remaining; drives star spike + smoke |
| `spin` / `pulse` | continuous idle motion for frost crystals, tesla orb, range ring |
| `spawnIn` | scale-pop on build **and** on upgrade, so upgrades are visible |
| `parts()` | geometry derived from level — barrel count, length, width, rings, shards |

`grads(ctx)` builds the metal gradients **once per level** and caches them;
`upgrade()` invalidates via `_gradLevel = -1`. Creating four gradients per tower per
frame across 30 towers is real, measurable garbage — this is why it's memoised.

---

## Audio engine

`audio.js` synthesises everything at runtime; there are no audio files.

```
oscillators ┐
             ├─► per-voice gain (AD envelope) ─┐
noise bursts┤                                 ├─► master gain ─► high-shelf ─► compressor ─► destination
            └─► biquad filter (LP/BP/HP) ────┘
```

Design decisions:

- **Noise bursts are generated per call** into an `AudioBuffer` — cheap, and lets
  every shot have a unique filter sweep so gunfire doesn't phase into a drone.
- **Voice cap of 28** with `onended` bookkeeping, plus a per-sound minimum interval
  (`lastPlay[name]`). Thirty towers firing at 4× would otherwise spawn hundreds of
  voices and distort badly.
- **Compressor + −3.5 dB high shelf** on the master bus so stacked cannons aren't
  piercing.
- **`unlock()` on first `pointerdown`/`keydown`** — browsers refuse to start an
  `AudioContext` without a gesture. Every call is guarded by `canPlay()`, which
  returns `false` until the context is genuinely `running`.
- **Degrades to silence, never throws.** If `AudioContext` is missing, `enabled`
  flips off and every method becomes a no-op. The game is fully playable muted, and
  the headless test suite depends on this.

---

## State machine

```
        beginRun()
  ready ─────────► prep ──prepTimer≤0──► wave ──spawner done & no enemies──┐
                   ▲                                                          │
                   └──────────────── toPrep() ◄──── bonus, wave<WIN_WAVE ◄──┤
                                                                             │
                                              wave ≥ WIN_WAVE ──► won         │
                                                    lives ≤ 0 ──► over ◄──────┘ (leaks)
```

`update()` early-returns while `paused` or `over`, so the world freezes without the
loop having to special-case anything. `callWaveEarly()` only works from `prep` and
pays 2 credits per unused second — a real risk/reward decision, not a free bonus.

---

## Known limitations

- **Projectile tunnelling at 4×.** A sniper round covers ~100 px/frame at `speed: 4`
  with a clamped `dt`. Homing re-aim plus the `d <= step` impact check mostly
  absorbs it, but a very small enemy crossing the muzzle at the wrong moment can be
  skipped. Fixed by substepping `step` if this ever bites.
- **Toast decay is real-time, not sim-time.** `draw()` decrements toast life by
  `1/60` per frame, so messages linger longer at high simulation speed. Cosmetic.
- **No spatial partitioning.** Targeting is O(towers × enemies) per frame. Fine at
  the ~50 units this game reaches; would need a grid or quadtree for hundreds.
- **Endless recycles wave 20**, so every post-table wave contains bosses. See
  [TUNING](TUNING.md#endless-tail).

---

## Why the headless tools work

Because `game.js` and `entities.js` never touch the DOM, `tools/sim-check.js` can
load the **real** sources into a Node `vm` sandbox with a stubbed 2D context:

```js
const bundle = FILES.map(f => fs.readFileSync('js/' + f, 'utf8')).join('\n')
  + '\n;({ GRID, PATH, TOWERS, Game, Tower, Enemy, … })';
const G = vm.runInContext(bundle, ctx);
```

Two subtleties worth knowing if you extend the harness:

1. **Concatenation is mandatory.** `class` and `const` are lexically scoped *per
   script* in a VM realm — separate `runInContext` calls would not see each other's
   declarations. One concatenated program shares one scope, then exports what the
   harness needs via a trailing object literal.
2. **The stub context must grow with the renderer.** Any new canvas API used in a
   `draw()` — `createRadialGradient`, `ellipse`, `setLineDash` — has to be added to
   the stub, or tests throw where the browser wouldn't.

`tools/balance.js` uses the same bundle and drives `Game` with a greedy bot, which is
how the difficulty curve is measured rather than guessed.
