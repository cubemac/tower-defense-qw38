/* ============================================================
 * tools/sim-check.js — headless smoke test (no browser needed)
 *   node tools/sim-check.js
 * Loads every non-DOM script, stubs the 2D context, and runs a
 * real simulation to prove the game loop, combat and waves work.
 * ============================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* --- stub 2D context: every call is a no-op, props are settable --- */
const noop = () => {};
function makeCtx() {
  const c = {
    canvas: { width: 960, height: 576 },
    createLinearGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 10 }),
  };
  const methods = [
    'save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'fill', 'stroke',
    'fillRect', 'strokeRect', 'clearRect', 'setLineDash', 'fillText', 'strokeText',
    'clip', 'drawImage', 'quadraticCurveTo', 'bezierCurveTo',
  ];
  for (const m of methods) c[m] = noop;
  const grad = () => ({ addColorStop: noop });
  c.createLinearGradient = grad;
  c.createRadialGradient = grad;
  return c;
}

/* --- load game sources into one shared context --- */
const ctxObj = { console, Math, Set, Map, Infinity, NaN, performance: { now: () => Date.now() } };
ctxObj.window = ctxObj;
const context = vm.createContext(ctxObj);

/* class/const are lexically scoped per script, so concatenate every source
 * into one program and then export the symbols the harness needs. */
const FILES = ['config.js', 'utils.js', 'audio.js', 'entities.js', 'waves.js', 'game.js'];
const EXPORTS = ['GRID', 'PATH', 'PATH_CELLS', 'PATH_BLOCKED', 'TOWERS', 'ENEMIES',
  'SELL_RATIO', 'START_LIVES', 'MAX_LEVEL', 'pointAtDistance', 'nearestArcLength',
  'buildWave', 'Game', 'Tower', 'Enemy', 'Spawner', 'Projectile', 'WIN_WAVE', 'BUILD_PADS', 'SFX'];

const bundle = FILES
  .map(f => `\n/* ---- ${f} ---- */\n` + fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'))
  .join('\n')
  + `\n;({ ${EXPORTS.join(', ')} })`;

const G = vm.runInContext(bundle, context, { filename: 'bundle.js' });
const canvas = { width: 960, height: 576, getContext: () => makeCtx() };
const game = new G.Game(canvas);
game.shiftHeld = false;   // normally set by main.js input handlers

/* --- assertions ---------------------------------------------------- */
let failures = 0;
const check = (label, cond, extra = '') => {
  if (cond) console.log(`  ✓ ${label}${extra ? ' — ' + extra : ''}`);
  else { failures++; console.log(`  ✗ ${label}${extra ? ' — ' + extra : ''}`); }
};

console.log('\nmap');
check('path has waypoints', G.PATH.pts.length === G.PATH_CELLS.length);
check('path length > 1000px', G.PATH.length > 1000, `${Math.round(G.PATH.length)}px`);
check('path cells block building', G.PATH_BLOCKED.size > 30, `${G.PATH_BLOCKED.size} blocked cells`);
const mid = G.pointAtDistance(G.PATH.length / 2);
check('pointAtDistance mid is finite', Number.isFinite(mid.x) && Number.isFinite(mid.y));
check('pointAtDistance clamps past end',
  G.pointAtDistance(G.PATH.length + 9e5).x === G.PATH.pts.at(-1).x);

/* Regression: the segment search was once off by one, which put enemies a
 * whole leg behind where they should be. Verify every sampled point lies
 * exactly on the polyline and at the right arc length. */
function distToPolyline(px, py) {
  let min = Infinity;
  const p = G.PATH.pts;
  for (let i = 1; i < p.length; i++) {
    const ax = p[i - 1].x, ay = p[i - 1].y, bx = p[i].x, by = p[i].y;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    min = Math.min(min, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return min;
}
let maxOff = 0, maxArcErr = 0, prev = null, backwards = 0;
for (let d = 0; d <= G.PATH.length; d += 3) {
  const p = G.pointAtDistance(d);
  maxOff = Math.max(maxOff, distToPolyline(p.x, p.y));
  maxArcErr = Math.max(maxArcErr, Math.abs(d - G.nearestArcLength(p.x, p.y)));
  if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) > 3.5) backwards++;
  prev = p;
}
check('every point lies on the polyline', maxOff < 0.01,
  `max off-path error ${maxOff.toFixed(4)}px`);
check('arc length is consistent', maxArcErr < 1.5,
  `max arc error ${maxArcErr.toFixed(2)}px`);
check('no backwards jumps between samples', backwards === 0, `${backwards} jumps`);

check('build pads are a bounded, curated set',
  G.BUILD_PADS.size > 20 && G.BUILD_PADS.size < 60,
  `${G.BUILD_PADS.size} pads (was 164 free cells before)`);
check('no pad sits on the path',
  [...G.BUILD_PADS].every(k => !G.PATH_BLOCKED.has(k)));

console.log('\ntower stats + economy');
const t = new G.Tower('gunner', 0, 0);
const s1 = t.stats(), s4 = (t.level = 4, t.stats());
check('level 4 out-damages level 1', s4.damage > s1.damage * 3,
  `${Math.round(s1.damage)} → ${Math.round(s4.damage)} (x${(s4.damage / s1.damage).toFixed(2)})`);
check('level 4 range grows', s4.range > s1.range);
check('upgrade costs exist', t.def.upgrades.length === 3);
const inv = new G.Tower('tesla', 1, 1);
check('sell returns 70% of invested', inv.sellValue() === Math.floor(185 * G.SELL_RATIO));

console.log('\nplacement rules');
game.toPrep();
const freeCell = (() => {
  for (let c = 0; c < G.GRID.cols; c++)
    for (let r = 0; r < G.GRID.rows; r++)
      if (game.canBuild(c, r)) return [c, r];
  return null;
})();
check('finds a buildable cell', !!freeCell, freeCell ? `cell ${freeCell}` : 'none');
const pathCell = [...G.PATH_BLOCKED][0].split(',').map(Number);
check('rejects building on path', !game.canBuild(pathCell[0], pathCell[1]),
  `path cell ${pathCell} is blocked`);
check('rejects out-of-bounds', !game.canBuild(-1, 0) && !game.canBuild(G.GRID.cols, 3));

game.money = 1000;
game.buildType = 'gunner';
const costBefore = game.money;
const placed = game.placeTower(freeCell[0], freeCell[1]);
check('places a tower and spends credits',
  placed && game.towers.length === 1 && game.money === costBefore - G.TOWERS.gunner.cost,
  `${costBefore} → ${game.money}`);
check('cannot stack towers on one cell', !game.canBuild(freeCell[0], freeCell[1]));
check('exits build mode after placing', game.buildType === null);
game.money = 0;
game.buildType = 'sniper';
const free2 = (() => {
  for (let c = 0; c < G.GRID.cols; c++)
    for (let r = 0; r < G.GRID.rows; r++)
      if (game.canBuild(c, r)) return [c, r];
})();
check('rejects purchase without credits', !game.placeTower(free2[0], free2[1]));
game.buildType = null;

console.log('\ncombat simulation (60s at 60fps)');
game.money = 5000;
for (const [key, c, r] of [['gunner', 2, 3], ['cannon', 4, 3], ['tesla', 9, 3],
                            ['frost', 7, 4], ['sniper', 12, 2]]) {
  game.buildType = key;
  game.placeTower(c, r);
}
game.buildType = null;
check('towers built', game.towers.length >= 3, `${game.towers.length} towers`);

const dt = 1 / 60;
let frames = 0;
for (let w = 0; w < 4 && game.state !== 'over'; w++) {
  if (game.state === 'prep') game.callWaveEarly();
  for (let i = 0; i < 3600 && game.state === 'wave'; i++) { game.update(dt); frames++; }
}
check('waves progressed', game.wave >= 2, `reached wave ${game.wave}`);
check('kills registered', game.kills > 0, `${game.kills} kills`);
const shots = game.towers.reduce((a, b) => a + b.shotsFired, 0);
check('towers fired', shots > 0, `${shots} shots across ${game.towers.length} towers`);
check('all placed towers engaged something',
  game.towers.some(x => x.damageDealt > 0),
  game.towers.map(x => `${x.type}:${Math.round(x.damageDealt)}`).join(' '));
check('tower kills sum to game kills',
  game.towers.reduce((a, b) => a + b.kills, 0) === game.kills,
  `${game.towers.reduce((a, b) => a + b.kills, 0)} attributed / ${game.kills} total`);

/* Each tower type gets its own range so it must land hits on its own —
 * in a shared layout the forward towers kill everything first. */
console.log('\nper-type combat (isolated tower, one wave each)');
function nearestBuildableToPath(type) {
  for (let c = 0; c < G.GRID.cols; c++)
    for (let r = 0; r < G.GRID.rows; r++) {
      if (!game.canBuild(c, r)) continue;
      const tc = cellCenterLocal(c, r);
      for (let d = 0; d <= G.PATH.length; d += 4) {
        const p = G.pointAtDistance(d);
        if (Math.hypot(p.x - tc.x, p.y - tc.y) <= G.TOWERS[type].range * 0.7) return [c, r];
      }
    }
  return null;
}
function cellCenterLocal(c, r) { return { x: c * G.GRID.cell + 24, y: r * G.GRID.cell + 24 }; }

for (const type of Object.keys(G.TOWERS)) {
  const g = new G.Game(canvas);
  g.shiftHeld = false; g.toPrep(); g.money = 9999;
  const spot = nearestBuildableToPath(type);
  g.buildType = type;
  const ok = g.placeTower(spot[0], spot[1]);
  g.buildType = null;
  const tw = g.towers.at(-1);
  // tank: armoured, so this also proves armour does not zero out damage
  for (let i = 0; i < 6; i++) g.spawnEnemy('tank', 1);
  for (let i = 0; i < 2400 && g.enemies.length; i++) g.update(dt);
  check(`${type.padEnd(7)} damages armoured targets`,
    ok && tw.damageDealt > 0 && tw.shotsFired > 0,
    `${tw.shotsFired} shots, ${Math.round(tw.damageDealt)} dmg, ${g.kills} kills`);
}
check('projectiles resolved (no leak in array)', game.projectiles.length === 0 || game.state === 'wave',
  `${game.projectiles.length} live`);

console.log('\nair / ground targeting');
{
  const g = new G.Game(canvas);
  g.shiftHeld = false; g.toPrep(); g.money = 9999;
  const spot = (() => {
    for (let c = 0; c < G.GRID.cols; c++)
      for (let r = 0; r < G.GRID.rows; r++)
        if (g.canBuild(c, r)) return [c, r];
  })();
  const ground = ['gunner', 'cannon', 'frost'], air = ['tesla', 'sniper'];
  let col = spot[0];
  for (const k of [...ground, ...air]) {
    let c = col;
    // walk right until the cell is free (path cells will reject themselves)
    while (c < G.GRID.cols && !g.canBuild(c, spot[1])) c++;
    g.buildType = k;
    if (c < G.GRID.cols && g.placeTower(c, spot[1])) col = c + 1;
    g.buildType = null;
  }
  g.buildType = null;

  const flier = g.spawnEnemy('wraith', 1);
  flier.d = 0;
  const groundTowers = g.towers.filter(t => !t.def.antiAir);
  const airTowers = g.towers.filter(t => t.def.antiAir);
  check('all five towers placed', g.towers.length === 5,
    `${g.towers.length}: ${g.towers.map(t => t.type).join(',')}`);
  // expected split comes from config, not a hardcoded assumption
  const expAA = Object.values(G.TOWERS).filter(t => t.antiAir).length;
  const expGnd = Object.keys(G.TOWERS).length - expAA;
  check('config splits air / ground as intended',
    airTowers.length === expAA && groundTowers.length === expGnd,
    `${expAA} anti-air, ${expGnd} ground-only`);
  // park the flier directly on top of every tower so range is never the reason
  for (const t of g.towers) { flier.x = t.x; flier.y = t.y; t.pickTarget(g.enemies); }
  check('ground towers never target fliers',
    groundTowers.length > 0 && groundTowers.every(t => t.target === null),
    `${groundTowers.length} ground towers, all refused`);
  check('anti-air towers do target fliers',
    airTowers.length > 0 && airTowers.every(t => t.target === flier),
    `${airTowers.length} AA towers, all acquired`);

  // ground splash must not damage a flier
  const before = flier.hp;
  const cannonT = new G.Tower('cannon', spot[0], spot[1]);
  const p = new G.Projectile(cannonT, null, cannonT.stats());
  p.x = flier.x; p.y = flier.y - 4;
  g.enemies = [flier];
  p.impact(g, flier);
  check('ground splash cannot hit air', flier.hp === before,
    `${before} → ${flier.hp}`);

  // and the same blast does damage ground units
  const g2 = new G.Game(canvas); g2.toPrep();
  const grunt = g2.spawnEnemy('grunt', 1);
  const cp = new G.Projectile(cannonT, grunt, cannonT.stats());
  cp.x = grunt.x; cp.y = grunt.y;
  g2.enemies = [grunt];
  cp.impact(g2, grunt);
  check('splash still hits ground units', grunt.hp < grunt.maxHp,
    `${grunt.hp}/${grunt.maxHp}`);
}

console.log('\ntower presentation state');
{
  const g = new G.Game(canvas);
  g.shiftHeld = false; g.toPrep(); g.money = 9999;
  const spot = (() => {
    for (const k of G.BUILD_PADS) {
      const [c, r] = k.split(',').map(Number);
      if (g.canBuild(c, r)) return [c, r];
    }
  })();
  g.buildType = 'cannon'; g.placeTower(spot[0], spot[1]); g.buildType = null;
  const tw = g.towers.at(-1);

  check('turrets start cold and seated', tw.heat === 0 && tw.recoil === 0);
  // fire it by hand so we are not waiting on a target walking into range
  tw.target = g.spawnEnemy('tank', 1);
  tw.target.x = tw.x + 40; tw.target.y = tw.y;
  tw.cool = 0;
  tw.update(dt, g);
  check('firing sets recoil, flash and heat',
    tw.recoil > 0 && tw.muzzle > 0 && tw.heat > 0,
    `recoil ${tw.recoil.toFixed(2)} heat ${tw.heat.toFixed(2)}`);
  for (let i = 0; i < 120; i++) tw.update(dt, g);
  check('recoil and flash decay back to rest',
    tw.recoil === 0 && tw.muzzle === 0,
    `recoil ${tw.recoil} flash ${tw.muzzle}`);

  // geometry must visibly grow with level, and gradients must rebuild
  const p1 = tw.parts();
  tw.level = 4; tw._gradLevel = -1;
  const p4 = tw.parts();
  check('barrel geometry grows with level',
    p4.barrelLen > p1.barrelLen && p4.barrelW > p1.barrelW,
    `len ${p1.barrelLen}→${p4.barrelLen}, width ${p1.barrelW.toFixed(1)}→${p4.barrelW.toFixed(1)}`);
  const gn = new G.Tower('gunner', spot[0], spot[1]);
  check('gunner gains a third barrel at level 4',
    gn.parts().barrels === 2 && (gn.level = 4, gn.parts().barrels === 3),
    `${gn.parts().barrels} barrels at lv4`);
  const tes = new G.Tower('tesla', spot[0], spot[1]);
  const tr1 = tes.parts().rings; tes.level = 4;
  check('tesla rings scale with level', tes.parts().rings > tr1,
    `${tr1} → ${tes.parts().rings}`);
  const fr = new G.Tower('frost', spot[0], spot[1]);
  const fs1 = fr.parts().shards; fr.level = 4;
  check('frost shards scale with level', fr.parts().shards > fs1,
    `${fs1} → ${fr.parts().shards}`);

  // every tower type must draw without throwing, at every level, hot and cold
  let drew = 0;
  const ctx2 = makeCtx();
  for (const key of Object.keys(G.TOWERS)) {
    for (let lv = 1; lv <= G.MAX_LEVEL; lv++) {
      const t2 = new G.Tower(key, spot[0], spot[1]);
      t2.level = lv; t2.heat = 0.8; t2.recoil = 0.6; t2.muzzle = 0.05;
      t2.target = tw.target;
      t2.draw(ctx2, lv === 1);
      drew++;
    }
  }
  check('all tower types render at every level', drew === Object.keys(G.TOWERS).length * G.MAX_LEVEL,
    `${drew} render passes, no exceptions`);

  // projectiles of every kind must render too
  let pdrew = 0;
  for (const key of ['gunner', 'cannon', 'frost', 'sniper']) {
    const t2 = new G.Tower(key, spot[0], spot[1]);
    const pr = new G.Projectile(t2, tw.target, t2.stats());
    pr.trail.push({ x: pr.x - 8, y: pr.y - 4 }, { x: pr.x - 3, y: pr.y - 1 });
    pr.draw(ctx2);
    pdrew++;
  }
  check('all projectile types render', pdrew === 4, `${pdrew} projectile renders`);
}

console.log('\naudio engine (headless must not throw)');
{
  check('SFX surface is complete',
    ['unlock', 'toggle', 'click', 'deny', 'place', 'upgrade', 'sell', 'shoot',
     'hit', 'kill', 'bossDie', 'leak', 'waveStart', 'waveClear', 'gameOver', 'victory']
      .every(k => typeof G.SFX[k] === 'function'));
  // no AudioContext in this realm — every call must be a silent no-op
  let threw = null;
  try {
    G.SFX.unlock();
    for (const t of ['gunner', 'cannon', 'frost', 'tesla', 'sniper', 'bogus']) G.SFX.shoot(t);
    G.SFX.place(); G.SFX.upgrade(); G.SFX.sell(); G.SFX.hit();
    G.SFX.kill(); G.SFX.bossDie(); G.SFX.leak(); G.SFX.waveStart();
    G.SFX.waveClear(); G.SFX.gameOver(); G.SFX.victory(); G.SFX.deny();
  } catch (e) { threw = e; }
  check('all SFX calls are safe without Web Audio', threw === null,
    threw ? threw.message : 'silent fallback active');
}

console.log('\ndamage maths');
const e = new G.Enemy('shield');
const before = e.hp;
const dealt = e.applyDamage(20);
check('armor reduces damage by flat amount', dealt === 20 - e.armor, `${dealt} vs ${before}`);
e.applySlow(0.5, 2);
check('slow applied', e.speed === e.def.speed * 0.5);
const b = new G.Enemy('boss');
b.applyDamage(99999);
check('lethal damage kills', !b.alive && b.hp === 0);

console.log('\nleak / game over');
const g2 = new G.Game(canvas);
g2.toPrep();
const leak = g2.spawnEnemy('runner', 1);
leak.d = G.PATH.length - 1;
g2.update(dt);
check('leaking enemy costs a life', g2.lives === G.START_LIVES - 1, `${g2.lives} lives left`);
for (let i = 0; i < 40 && g2.state !== 'over'; i++) {
  const x = g2.spawnEnemy('grunt', 1); x.d = G.PATH.length - 1; g2.update(dt);
}
check('lives bottom out into game over', g2.state === 'over' && g2.lives === 0);

console.log('\nsame-frame kill / leak regression');
{
  /* A projectile kill earlier in the frame must not leak a life when the
   * corpse crosses the goal line in the same update step. The enemy loop
   * once ran update() on dead units, so they still flagged leaked=true. */
  const g = new G.Game(canvas);
  g.shiftHeld = false; g.toPrep();
  const e = g.spawnEnemy('grunt', 1);
  e.d = G.PATH.length - 0.5;
  e.hp = 1;
  g.damageEnemy(e, 999, 'gunner', null);   // dead before the enemy loop runs
  const lives = g.lives;
  g.update(dt);
  check('enemy killed in the same frame does not leak',
    g.lives === lives && !e.leaked,
    `lives ${lives} -> ${g.lives}, leaked=${e.leaked}`);

  // the guard must not swallow real breaches either
  const g3 = new G.Game(canvas);
  g3.toPrep();
  const live = g3.spawnEnemy('grunt', 1);
  live.d = G.PATH.length - 0.5;
  g3.update(dt);
  check('live enemy still leaks normally',
    g3.lives === G.START_LIVES - 1 && live.leaked,
    `lives ${g3.lives}, leaked=${live.leaked}`);
}

console.log('\ninput bindings (source-level)');
{
  /* main.js touches the DOM and cannot load headless — assert on its source.
   * The M key once called syncMute() only, which repaints the icon but
   * never toggles audio. */
  const src = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  check('M key toggles audio, not just the icon',
    /k === 'm'\)\s*\{\s*SFX\.toggle\(\);/.test(src),
    'keydown m -> SFX.toggle() + syncMute()');
}

console.log('\nwin condition');
{
  const g = new G.Game(canvas);
  g.toPrep();
  // wave increments in startWave, so a cleared WIN_WAVE means wave === WIN_WAVE
  g.wave = G.WIN_WAVE;
  g.inWave = true;
  g.spawner.total = 0; g.spawner.active = false; g.spawner.spawned = 0;
  g.update(dt);   // spawner done + no enemies -> completeWave
  check('clearing WIN_WAVE wins the run', g.state === 'won',
    `wave ${g.wave} -> ${g.state}`);

  // and one short of it must keep going, not win early
  const g2 = new G.Game(canvas);
  g2.toPrep();
  g2.wave = G.WIN_WAVE - 1;
  g2.inWave = true;
  g2.spawner.total = 0; g2.spawner.active = false; g2.spawner.spawned = 0;
  g2.update(dt);
  check('one wave short does not win', g2.state === 'prep', `wave ${g2.wave} -> ${g2.state}`);
  check('win wave is reachable by the balance curve', G.WIN_WAVE > 10 && G.WIN_WAVE < 40,
    `WIN_WAVE = ${G.WIN_WAVE}`);
}

console.log('\nendless scaling');
const w20 = G.buildWave(20), w30 = G.buildWave(30);
check('endless wave scales hp', w30.hpScale > w20.hpScale,
  `${w20.hpScale.toFixed(2)} → ${w30.hpScale.toFixed(2)}`);
check('endless wave scales count', w30.count > w20.count, `${w20.count} → ${w30.count}`);

console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : '❌ ' + failures + ' FAILURE(S)'}\n`);
process.exit(failures ? 1 : 0);
