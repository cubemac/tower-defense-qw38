/* ============================================================
 * tools/balance.js — auto-player balance probe
 *   node tools/balance.js [waves]
 * Plays with a simple greedy strategy and reports how far it gets,
 * so difficulty can be tuned without opening a browser.
 * ============================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
function makeCtx() {
  const c = { canvas: {}, createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }), measureText: () => ({ width: 10 }) };
  for (const m of ['save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'fill', 'stroke', 'fillRect',
    'strokeRect', 'clearRect', 'setLineDash', 'fillText', 'strokeText']) c[m] = noop;
  return c;
}

const context = vm.createContext({ console, Math, Set, Map, Infinity, NaN, performance: { now: () => Date.now() } });
const FILES = ['config.js', 'utils.js', 'audio.js', 'entities.js', 'waves.js', 'game.js'];
const EXPORTS = ['GRID', 'PATH', 'PATH_BLOCKED', 'BUILD_PADS', 'TOWERS', 'Game',
  'pointAtDistance', 'dist', 'MAX_LEVEL', 'WAVES'];
const bundle = FILES.map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n')
  + `\n;({ ${EXPORTS.join(', ')} })`;
const G = vm.runInContext(bundle, context, { filename: 'bundle.js' });

const canvas = { width: 960, height: 576, getContext: () => makeCtx() };
const dt = 1 / 60;

/* Candidate build spots: curated pads, sorted by how much of the path they
 * cover with a mid-range tower. */
function buildSpots() {
  const spots = [];
  for (const key of G.BUILD_PADS) {
    const [c, r] = key.split(',').map(Number);
    if (G.PATH_BLOCKED.has(key)) continue;
    const x = c * G.GRID.cell + 24, y = r * G.GRID.cell + 24;
    let cover = 0;
    for (let d = 0; d <= G.PATH.length; d += 6) {
      const p = G.pointAtDistance(d);
      if (Math.hypot(p.x - x, p.y - y) <= 150) cover++;
    }
    if (cover > 0) spots.push({ c, r, cover });
  }
  return spots.sort((a, b) => b.cover - a.cover);
}

const SPOTS = buildSpots();
const ROTATION = ['gunner', 'cannon', 'frost', 'tesla', 'sniper'];

function play(maxWaves, verbose) {
  const g = new G.Game(canvas);
  g.shiftHeld = false;
  g.toPrep();

  let spotIdx = 0, rotIdx = 0;
  const dt2 = dt;

  while (g.wave < maxWaves && g.state !== 'over' && g.state !== 'won') {
    if (g.state === 'prep') {
      // spend down: build at the best free spot, else upgrade the busiest tower
      let acted = true;
      while (acted) {
        acted = false;
        // realistic players upgrade a core before spamming cheap towers
        if (g.towers.length >= 4) {
          const up = g.towers.filter(t => t.level < G.MAX_LEVEL && t.upgradeCost() != null)
            .sort((a, b) => b.stats().range - a.stats().range);
          if (up[0] && g.money >= up[0].upgradeCost()) {
            g.selected = up[0]; g.upgradeSelected(); acted = true; continue;
          }
        }
        while (spotIdx < SPOTS.length) {
          const s = SPOTS[spotIdx];
          const key = ROTATION[rotIdx % ROTATION.length];
          if (!g.canBuild(s.c, s.r)) { spotIdx++; continue; }
          if (g.money < G.TOWERS[key].cost) break;
          g.buildType = key;
          g.placeTower(s.c, s.r);
          g.buildType = null;
          rotIdx++;
          acted = true;
          break;
        }
      }
      g.callWaveEarly();
    }

    let guard = 0;
    while (g.state === 'wave' && guard++ < 60 * 240) g.update(dt2);
    if (verbose) {
      console.log(`  wave ${String(g.wave).padStart(2)}  lives ${String(g.lives).padStart(3)}  ` +
        `credits ${String(Math.round(g.money)).padStart(5)}  towers ${String(g.towers.length).padStart(2)}  kills ${g.kills}`);
    }
  }
  return g;
}

const maxWaves = +(process.argv[2] || 34);
console.log(`\nauto-playing ${maxWaves} waves · ${SPOTS.length} viable build spots\n`);
const runs = [play(maxWaves, true), play(maxWaves), play(maxWaves)];
const avgWave = Math.round(runs.reduce((a, g) => a + g.wave, 0) / runs.length);
const avgLives = Math.round(runs.reduce((a, g) => a + g.lives, 0) / runs.length);

console.log(`\n  median wave reached : ${avgWave} / ${maxWaves}`);
console.log(`  lives remaining   : ${runs.map(g => g.lives).join(', ')}`);
console.log(`  leaks             : ${runs.map(g => g.leaks).join(', ')}`);
console.log(`  outcome           : ${runs.map(g => g.state).join(', ')}`);
console.log(`  avg kills         : ${Math.round(runs.reduce((a, g) => a + g.kills, 0) / runs.length)}\n`);
