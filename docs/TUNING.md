# Tuning & Content Recipes

Everything you can change, and how to prove it didn't break the game.

---

## Contents

- [The golden rule](#the-golden-rule)
- [Difficulty knobs](#difficulty-knobs)
- [Recipe: rebalance the curve](#recipe-rebalance-the-curve)
- [Recipe: add a tower](#recipe-add-a-tower)
- [Recipe: add an enemy](#recipe-add-an-enemy)
- [Recipe: change a wave](#recipe-change-a-wave)
- [Recipe: build a new map](#recipe-build-a-new-map)
- [Endless tail](#endless-tail)
- [Recipe: add a sound](#recipe-add-a-sound)
- [Recipe: change how a tower looks](#recipe-change-how-a-tower-looks)
- [Performance](#performance)
- [Changing the license](#changing-the-license)

---

## The golden rule

> **Change a number in `js/config.js`, then run the tools. Never eyeball balance.**

```sh
node tools/balance.js 27     # does a competent player still win?
node tools/sim-check.js      # did you break anything structural?
```

`balance.js` plays the game with a greedy bot against your real sources and prints
the curve. It is the difference between "this feels harder" and "the bot now dies at
wave 22 instead of 28".

⚠️ **The bot is superhuman in two ways** — perfect target selection and instant
spending. Tune so the bot wins *narrowly*, and humans will find it fair. If you tune
until the bot loses, you have almost certainly made a game that is frustrating to
play.

---

## Difficulty knobs

All in `js/config.js` unless noted.

| knob | current | raises difficulty when you… |
|---|---|---|
| `START_MONEY` | `190` | lower it |
| `START_LIVES` | `20` | lower it |
| `PREP_TIME` | `12` | shorten it |
| `hpScale = 1 + idx * 0.11` | in **`waves.js`** | increase `0.11` (table ramp) |
| `ENDLESS_HP_SCALE` | `1.135` | increase (post-table HP) |
| `ENDLESS_COUNT_SCALE` | `1.09` | increase (post-table unit count) |
| `WAVE_BOUNTY_BASE` | `10` | lower it (plus the `× 2` in `game.js`) |
| `bounty` per enemy | in `ENEMIES` | lower them |
| `hp` / `speed` per enemy | in `ENEMIES` | raise / raise |
| `damage` / `range` / `rate` | in `TOWERS` | lower them |
| `LEVEL_GROWTH.damage` | `1.55` | lower it (weakens upgrades) |
| `SELL_RATIO` | `0.7` | lower it (punishes repositioning) |
| `WIN_WAVE` | `WAVES.length + 7` | raise it |

---

## Recipe: rebalance the curve

The current curve, measured:

```
median wave reached : 27 / 27   ·   lives remaining 17, 17, 17   ·   leaks 3
```

That is the target shape — pressure but survivable. To move it:

**Too hard?**
```js
// config.js
const START_MONEY = 240;                 // +50 opening
hpScale = 1 + idx * 0.09;              // waves.js — gentler table ramp
const ENDLESS_HP_SCALE = 1.11;         // softer endless
```

**Too easy?**
```js
const WAVE_BOUNTY_BASE = 6;            // starve the economy
hpScale = 1 + idx * 0.13;              // waves.js
```

Then re-measure. Iterate 2–3 times, not ten — the bot's variance is low (identical
results across runs), so each change is readable.

> **History:** the first tuning pass produced *zero leaks for 29 waves then instant
> death at wave 30* — a cliff, not a curve. The fix was cutting income and steepening
> the mid-game ramp simultaneously, then setting `WIN_WAVE` where the curve actually
> supports a win.

---

## Recipe: add a tower

**1. Declare it in `config.js`:**

```js
mortar: {
  key: 'mortar', name: 'Mortar', color: '#ff8787', cost: 260,
  range: 340, damage: 60, rate: 0.28, projectileSpeed: 260,
  splash: 92, antiAir: false, upgrades: [240, 400, 650],
  blurb: 'Lobbed artillery. Huge splash, never touches air.',
},
```

Rules:
- `key` **must** equal the object key.
- `antiAir: true` is what lets it hit fliers — omit it and the targeting gate
  refuses air units permanently.
- `upgrades` needs exactly `MAX_LEVEL - 1` entries (currently 3).
- Anything you add to `LEVEL_GROWTH` handling must be mirrored in
  `Tower.stats()` — see step 3.

**2. Give it a look.** Add a branch in `Tower.draw()`'s turret section:

```js
} else if (this.type === 'mortar') {
  roundRect(ctx, -10, -9, 20, 18, 5);
  ctx.fillStyle = g.body; ctx.fill();
  // … your geometry here
}
```

Reuse the cached gradients (`g.body`, `g.barrel`, `g.plate`) so you inherit the
metal look and the per-level invalidation for free.

**3. Optional special stats.** If it has a new mechanic, extend `Tower.stats()`:

```js
if (this.def.lobHeight) s.lobHeight = this.def.lobHeight + L * 4;
```

**4. Verify.** `node tools/sim-check.js` — the "all tower types render at every
level" assertion iterates `Object.keys(TOWERS)`, so a new tower is render-tested
automatically at all 4 levels. The per-type combat test will cover it too.

---

## Recipe: add an enemy

**1. Declare it in `config.js`:**

```js
bomber: { key: 'bomber', name: 'Bomber', hp: 180, speed: 70, bounty: 24,
          armor: 2, radius: 13, color: '#ffa94d', flying: true },
```

- `flying: true` → only `antiAir` towers may target it. Ground splash also misses it;
  that gate is enforced in **two** places (`pickTarget` and `Projectile.impact`).
- `armor` is **flat per hit**. `armor: 20` makes a level 1 gunner (9 dmg) deal the
  minimum 1 damage per shot — brutal by design.
- `radius` affects both hit detection (`range + e.radius`) and the health bar width.

**2. Add it to a wave** in the `WAVES` table:

```js
[['bomber', 8, 0.7], ['grunt', 10, 0.5]],   // wave N
```

Tuple format: `[enemyKey, count, gapSeconds]`. Groups spawn sequentially with a
0.9s breath between them (`waves.js`).

**3. Optional custom art.** `Enemy.draw()` branches on `this.key` for boss/tank/
shield/fliers. Unrecognised keys fall through to the default circle, so a new enemy
**works without any art** — add a branch only if you want a distinct silhouette.

---

## Recipe: change a wave

Edit the `WAVES` array in `config.js`. Index 0 = wave 1.

```js
const WAVES = [
  [['grunt', 8, 0.75]],                        // 1
  [['runner', 8, 0.5], ['grunt', 6, 0.7]],   // 3 — two groups, sequential
];
```

- **Shorten a group's pressure:** reduce the gap (third value).
- **Add a wave:** append a row. `WIN_WAVE` is derived from `WAVES.length`, so the
  win condition moves with you automatically.
- **Change HP ramp:** `hpScale = 1 + idx * 0.11` in `waves.js`.

---

## Recipe: build a new map

Two edits, both in `config.js`, plus regenerating the pads.

**1. Redraw the path** in cell coordinates. First and last entries should be
offscreen (`-1` or `>= cols`) so enemies slide in and out cleanly:

```js
const PATH_CELLS = [
  [-1, 6], [4, 6], [4, 2], [10, 2], [10, 9], [15, 9], [15, 4], [20, 4],
];
```

Keep legs axis-aligned (horizontal or vertical). Diagonal legs work but the blocked
-cell rasterisation rounds, so corners get fuzzy.

**2. Regenerate the build pads.** Run this from the project root — it walks the new
path, collects adjacent free cells, and thins them so pads are spread apart:

```sh
node -e '
const fs=require("fs"),vm=require("vm");
const ctx=vm.createContext({console,Math,Set,Map,Infinity,NaN,performance:{now:()=>Date.now()}});
const b=["config.js","utils.js"].map(f=>fs.readFileSync("js/"+f,"utf8")).join("\n")
      +"\n;({GRID,PATH,PATH_BLOCKED,pointAtDistance})";
const G=vm.runInContext(b,ctx,{filename:"b.js"});
const seen=new Set(),cand=[];
for(let d=0;d<=G.PATH.length;d+=24){
  const p=G.pointAtDistance(d);
  const c=Math.floor(p.x/G.GRID.cell),r=Math.floor(p.y/G.GRID.cell);
  for(const [dc,dr] of [[0,-1],[0,1],[-1,0],[1,0]]){
    const cc=c+dc,rr=r+dr;
    if(cc<0||cc>=G.GRID.cols||rr<0||rr>=G.GRID.rows) continue;
    const k=cc+","+rr;
    if(G.PATH_BLOCKED.has(k)||seen.has(k)) continue;
    seen.add(k); cand.push([cc,rr]);
  }
}
const kept=[];
for(const [c,r] of cand){
  if(kept.some(([kc,kr])=>Math.max(Math.abs(kc-c),Math.abs(kr-r))<2)) continue;
  kept.push([c,r]);
}
console.log("pads:",kept.length);
console.log(JSON.stringify(kept));
'
```

Paste the output over `BUILDABLE_PADS`.

**3. Size the difficulty to the new track.** A longer path means more tower coverage
time and an easier game. Check it:

```sh
node tools/balance.js 27
```

If the bot finishes with 20/20 lives, your track is too long or the pads too
generous — thin the pads (raise the spacing threshold from `2` to `3`) or steepen
`hpScale`.

> **Why pads matter:** the original map had 164 free cells and the bot won with zero
> leaks because it could simply fill everything. Cutting to 43 pads (18% of the grid)
> turned placement into a real decision without touching a single damage number.

---

## Endless tail

Past `WAVES.length`, `buildWave()` **recycles the final row** (wave 20 =
`3×boss + 10×harpy`) and scales it:

```js
hpScale = (1 + (WAVES.length - 1) * 0.11) * Math.pow(ENDLESS_HP_SCALE, over);
groups  = WAVES[WAVES.length - 1].map(([k, n, g]) =>
            [k, Math.round(n * Math.pow(ENDLESS_COUNT_SCALE, over)), g]);
```

**Consequence:** every endless wave contains bosses, which is why runs fall over
around wave 28–30. To soften it, recycle a lighter row:

```js
groups = WAVES[Math.max(0, WAVES.length - 4)].map(/* … */);   // wave 17 pattern
```

Or make endless genuinely progressive by cycling several rows:

```js
groups = WAVES[(idx % WAVES.length)].map(/* … */);
```

---

## Recipe: add a sound

All audio is synthesised in `js/audio.js`. No files, ever.

```js
laser() {
  if (!canPlay('laser', 0.05)) return;              // throttle: name + min gap
  noise({ dur: 0.18, gain: 0.16, f0: 3200, f1: 500, q: 4, type: 'bandpass' });
  tone({ freq: 1800, to: 300, dur: 0.2, type: 'sawtooth', gain: 0.12 });
},
```

Two primitives cover everything:

| primitive | parameters | use it for |
|---|---|---|
| `tone()` | `freq`, `to` (pitch sweep), `dur`, `type` (sine/square/saw/triangle), `gain`, `attack` | pitched content: thumps, chimes, horns |
| `noise()` | `dur`, `gain`, `f0`→`f1` (filter sweep), `q`, `type` (lowpass/bandpass/highpass) | impacts, gunfire, explosions |

**Always** start with `if (!canPlay('name', minGap)) return;` — it checks that audio
is enabled, the context is actually running, and the voice budget isn't exhausted.
Skipping it is how you get 30 simultaneous cannons and a distorted mess.

Then call it from `game.js` (`SFX.laser()`) or from `Tower.fire()` if it's
per-tower-type, where the existing `SFX.shoot(this.type)` switch already dispatches.

Layer 2–3 short sounds rather than one long one — a `noise` burst for the body plus a
`sine` sweep for the low end is what makes the cannon sound like a cannon.

---

## Recipe: change how a tower looks

- **Colour:** `color` in the tower definition drives the deck ring, ambient glow,
  muzzle tint, selection ring and shop swatch. One value, five places.
- **Silhouette:** add an `else if (this.type === '…')` branch in `Tower.draw()`.
- **Level-based geometry:** extend `parts()` — it already returns `barrels`,
  `barrelLen`, `barrelW`, `rings`, `shards`, `plateR` derived from `level`.
- **Metal look:** reuse the cached `g.plate` / `g.body` / `g.barrel` gradients.
  If you create your own, add it to the `grads()` cache object and bump
  `_gradLevel` in `upgrade()`, or you'll leak gradients every frame.
- **Barrel heat:** `heatTint(ctx, this.heat) || g.barrel` — pass the tower's
  `heat` (0–1) for cold→amber→white-hot; it returns `null` when cold so the
  caller falls back to the cached metal gradient.

---

## Performance

If frame rate suffers at 4× with many towers:

| knob | file | effect |
|---|---|---|
| `MAX_VOICES = 28` | `audio.js` | fewer concurrent sounds |
| per-sound `minGap` values | `audio.js` | fewer sound triggers |
| `Burst(…, count)` | `entities.js` | fewer particles per kill |
| trail length (`trail.length > 6`) | `entities.js` | shorter tracer tails |
| muzzle flash spike count (8) | `entities.js` | cheaper flashes |
| `dpr` clamp (`Math.min(dpr, 2)`) | `main.js` | big win on 3× displays |

The dominant cost is per-frame gradient creation — which is why `grads()` memoises
per level. If you add gradients, cache them the same way.

---

## Changing the license

This project is released under the **MIT License** (`LICENSE`, © 2026 Robin Weiss).
MIT is deliberately permissive: anyone may use, copy, modify, merge, publish,
distribute, sublicense and sell it, provided the copyright and permission notice stay
intact. There is no warranty, and you cannot hold the author liable.

If MIT isn't what you want, replace `LICENSE` and update the license section in both
`README.md` and this file:

| goal | license to use |
|---|---|
| maximum adoption, no obligations beyond attribution | **MIT** (current) |
| permissive, but with an explicit **patent grant** | Apache-2.0 |
| derivatives must stay open under the same terms | GPL-3.0 |
| derivatives must stay open, network use counts as distribution | AGPL-3.0 |
| no license at all — refuse everything by default | delete `LICENSE` and the README section |

If you ever add third-party code or art, check its license first — GPL-licensed
snippets would require the whole game to become GPL, which is why MIT-only
dependencies are worth preferring here.

```sh
# swap to Apache-2.0, for example
curl -o LICENSE https://www.apache.org/licenses/LICENSE-2.0.txt
```
