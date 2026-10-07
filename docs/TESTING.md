# Testing & Tooling

Two scripts, zero dependencies, no test framework. Both load the **real** game
sources and run them headlessly.

```sh
node tools/sim-check.js     # 60 assertions — exits non-zero on failure
node tools/balance.js 27    # auto-player difficulty probe
```

---

## Contents

- [Why this exists](#why-this-exists)
- [sim-check.js — what it covers](#sim-checkjs--what-it-covers)
- [balance.js — the difficulty probe](#balancejs--the-difficulty-probe)
- [Adding an assertion](#adding-an-assertion)
- [Gotchas](#gotchas)
- [Bugs this suite found](#bugs-this-suite-found)

---

## Why this exists

Because a browser is a terrible place to find out that your path maths is wrong.

Both tools build one bundle from the shipped sources and evaluate it in a Node `vm`
sandbox with a stubbed 2D canvas:

```js
const FILES = ['config.js','utils.js','audio.js','entities.js','waves.js','game.js'];
const bundle = FILES.map(f => fs.readFileSync('js/' + f, 'utf8')).join('\n')
  + '\n;({ GRID, PATH, TOWERS, Game, Tower, Enemy, … })';
const G = vm.runInContext(bundle, ctx);
```

Same code the browser runs. No mocks of game logic — only the canvas and Web Audio
are stubbed, and both are stubbed to be *inert*, not fake.

---

## sim-check.js — what it covers

Run it and you get grouped, self-documenting output with real numbers:

| group | assertions | what it proves |
|---|---|---|
| **map** | 10 | waypoints exist; track is 2832px; 60 cells blocked; **every sampled point lies exactly on the polyline** (`0.0000px` error); arc length consistent; no backwards jumps; 43 pads, bounded, none on the path |
| **tower stats + economy** | 4 | level 4 out-damages level 1 (×3.72); range grows; upgrade ladder complete; sell returns exactly 70% of invested |
| **placement rules** | 7 | finds a legal pad; rejects on-path; rejects out-of-bounds; places and spends the right amount; rejects stacking; exits build mode after placing; rejects purchase without credits |
| **combat simulation** | 6 | a real multi-wave run: waves progress, kills register, towers fire, damage attributed, `tower.kills` sums exactly to `game.kills` |
| **per-type combat** | 6 | each of the 5 towers, isolated against armoured tanks, must land hits — proves no type is silently dead |
| **air / ground targeting** | 6 | config split matches; ground towers **never** acquire fliers; AA towers do; ground splash cannot damage air; splash still hits ground |
| **tower presentation** | 9 | turrets start cold; firing sets recoil/flash/heat; all decay to rest; barrel geometry grows with level; gunner gains a 3rd barrel at lv4; tesla rings and frost shards scale; **all 5 types × 4 levels render without throwing**; all 4 projectile types render |
| **audio engine** | 2 | full method surface present; every call is a safe no-op with no `AudioContext` |
| **damage maths** | 3 | armour subtracts flat; slow applies multiplicatively; lethal damage zeroes HP and flags dead |
| **leak / game over** | 2 | a leaked unit costs exactly one life; lives bottom out into `state: 'over'` at 0, never negative |
| **win condition** | 3 | clearing `WIN_WAVE` sets `'won'`; one wave short does **not** win early; win wave is in a sane range |
| **endless scaling** | 2 | HP and unit count both increase past the table |

### The two assertions that matter most

```
✓ every point lies on the polyline — max off-path error 0.0000px
✓ tower kills sum to game kills — 58 attributed / 58 total
```

The first is the regression test for a bug that made the game *look* fine while being
fundamentally broken. The second catches silent damage-attribution leaks — any new
damage path that bypasses `Game.damageEnemy` fails it immediately.

---

## balance.js — the difficulty probe

Drives `Game` with a greedy bot and prints the curve:

```
auto-playing 27 waves · 43 viable build pads

  wave  9  lives  18  credits   265  towers   8  kills 155
  wave 10  lives  13  credits   206  towers   9  kills 167
  wave 13  lives   1  credits   314  towers  13  kills 243
  ...

  median wave reached : 27 / 27
  lives remaining   : 17, 17, 17
  outcome           : won, won, won
```

**Bot strategy:** during each prep phase it upgrades its longest-range tower first,
then builds at the highest-coverage free pad, rotating through all five types so it
necessarily maintains anti-air. Runs three times and reports the median.

### Reading the output

| pattern | meaning |
|---|---|
| lives stay at 20 until a cliff, then 0 | **bad** — a wall, not a curve. Steepen the mid-game ramp. |
| lives bleed steadily from wave 9–15 | **good** — pressure with recovery room |
| wins with 20/20 and thousands unspent | **too easy** — cut income, not damage |
| dies before the win wave every run | **too hard** — raise `START_MONEY` or soften `hpScale` |

> ⚠️ **The bot is better than you at this game.** Perfect targeting, zero hesitation,
> instant spending. Tune until it wins *narrowly* — if you tune until the bot loses,
> you've built a frustrating game.

---

## Adding an assertion

The harness uses one tiny helper:

```js
const check = (label, cond, extra = '') => {
  if (cond) console.log(`  ✓ ${label}${extra ? ' — ' + extra : ''}`);
  else { failures++; console.log(`  ✗ ${label}${extra ? ' — ' + extra : ''}`); }
};
```

Add a block anywhere in `tools/sim-check.js`:

```js
console.log('\nmy new mechanic');
{
  const g = new G.Game(canvas);
  g.toPrep(); g.money = 9999;
  // … drive it …
  check('does the thing I expect', g.someValue === 42, `got ${g.someValue}`);
}
```

Guidelines that keep the suite honest:

- **Assert behaviour, not implementation.** "ground towers never target fliers"
  survives a rewrite; "pickTarget returns null at index 3" does not.
- **Derive expectations from config, never hardcode.** This suite failed once because
  it asserted `airTowers.length === 2` after Gunner quietly became anti-air. Write
  `Object.values(G.TOWERS).filter(t => t.antiAir).length` instead.
- **Always pass the `extra` diagnostic.** When it fails you want `112 → 112` in the
  output, not a bare ✗ and a debugging session.
- **Iterate over `Object.keys(TOWERS)` / `ENEMIES`.** New content is then
  automatically render-tested and combat-tested with no extra work.

---

## Gotchas

**1. You must concatenate the sources.**
`class` and `const` are lexically scoped *per script* inside a VM realm. Separate
`runInContext()` calls cannot see each other's declarations — you'll get
`TypeError: G.Game is not a constructor`. One concatenated program shares one scope;
export what you need with a trailing `;({ Game, Tower, … })`.

**2. The stub canvas must grow with the renderer.**
Any new canvas API used inside a `draw()` has to be added to `makeCtx()`, or tests
throw where the browser is fine. Currently stubbed:

```
save restore translate rotate scale beginPath closePath moveTo lineTo arc arcTo
ellipse rect fill stroke fillRect strokeRect clearRect setLineDash fillText
strokeText clip drawImage quadraticCurveTo bezierCurveTo
createLinearGradient createRadialGradient measureText
```

**3. `buildType` must be set before `placeTower()`.**
`placeTower()` reads `this.buildType`; it does not take a type argument. Five tests
failed the first time this harness was written because placement was attempted with
`buildType === null`.

**4. `wave` increments in `startWave()`, not `completeWave()`.**
So "cleared wave 27" means `game.wave === 27`. A test that sets
`wave = WIN_WAVE - 1` and expects a win is wrong, not the game.

**5. Audio must be silent, not absent.**
`audio.js` guards on `typeof window === 'undefined'` and flips itself off. If you
add a sound that touches `ac` before checking `canPlay()`, the headless suite will
crash — which is exactly the guard being there to catch.

---

## Bugs this suite found

Not hypothetical — these were real, shipped-in-progress defects:

1. **`pointAtDistance()` off-by-one segment.** Enemies were positioned a full leg
   behind where they should be (`d=450` → `(168,330)` instead of `(294,264)`).
   Because towers read the same function, everything was self-consistent enough that
   the game *appeared* to work. The visible symptom was frost firing **once** in four
   waves. Now pinned by the polyline assertion.
2. **Projectile damage never attributed to its tower.** Only Tesla reported damage in
   the inspector; gunner/cannon/frost/sniper showed `0` despite 200+ shots fired.
   Now pinned by `tower kills sum to game kills`.
3. **Dangling DOM reference.** `$('hint')` pointed at an element that never existed in
   `index.html`. Caught by a script/ID cross-check, not the assertion suite — worth
   re-running whenever you touch markup:

   ```sh
   node -e '
   const fs=require("fs");
   const ids=new Set([...fs.readFileSync("index.html","utf8").matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
   const used=new Set([...fs.readFileSync("js/main.js","utf8").matchAll(/\$\(.([a-zA-Z0-9_-]+).\)/g)].map(m=>m[1]));
   const missing=[...used].filter(i=>!ids.has(i));
   console.log(missing.length?"MISSING: "+missing.join(", "):"DOM wiring OK ✓");
   '
   ```
