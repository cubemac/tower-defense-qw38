/* ============================================================
 * game.js — state, simulation, map rendering
 * ============================================================ */

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.reset();

    this.mouse = { x: -999, y: -999, col: -1, row: -1, over: false };
    this.buildType = null;      // tower key while in build mode
    this.selected = null;       // selected placed Tower
    this.speed = 1;
    this.paused = false;
    this.time = 0;
    this.floats = [];
  }

  reset() {
    this.money = START_MONEY;
    this.lives = START_LIVES;
    this.wave = 0;
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.fx = [];
    this.floats = [];
    this.spawner = new Spawner();
    this.prepTimer = PREP_TIME;
    this.inWave = false;
    this.state = 'ready';       // ready | prep | wave | over | won
    this.buildType = null;
    this.selected = null;
    this.kills = 0;
    this.leaks = 0;
    this.elapsed = 0;
    this.occupied = new Set();
  }

  /* ---------- derived ---------- */
  get towerMap() {
    const m = {};
    for (const t of this.towers) m[`${t.col},${t.row}`] = t;
    return m;
  }

  canBuild(col, row) {
    if (!inBounds(col, row)) return false;
    if (!BUILD_PADS.has(`${col},${row}`)) return false;   // curated pads only
    if (PATH_BLOCKED.has(`${col},${row}`)) return false;
    if (this.occupied.has(`${col},${row}`)) return false;
    return true;
  }

  /* ---------- flow ---------- */
  beginRun() {
    if (this.state === 'ready') this.toPrep();
  }

  toPrep() {
    if (this.state === 'over') return;
    this.state = 'prep';
    this.prepTimer = PREP_TIME;
  }

  startWave() {
    if (this.state === 'over' || this.inWave) return;
    this.wave++;
    this.spawner.start(this.wave);
    this.inWave = true;
    this.state = 'wave';
  }

  callWaveEarly() {
    if (this.state === 'prep') {
      // bonus for the unused prep time
      const bonus = Math.floor(this.prepTimer * 2);
      if (bonus > 0) { this.money += bonus; this.toast(`+${bonus} early call bonus`, '#ffe066'); }
      this.prepTimer = 0;
      this.startWave();
    }
  }

  spawnEnemy(key, scale) {
    const e = new Enemy(key, scale);
    this.enemies.push(e);
    return e;
  }

  /* ---------- building ---------- */
  selectBuildType(key) {
    this.buildType = this.buildType === key ? null : key;
    if (this.buildType) this.selected = null;
  }

  placeTower(col, row) {
    const key = this.buildType;
    if (!key) return false;
    const def = TOWERS[key];
    if (!this.canBuild(col, row)) { this.toast('Cannot build there', '#ff6b6b'); return false; }
    if (this.money < def.cost) { this.toast('Not enough credits', '#ff6b6b'); return false; }

    const t = new Tower(key, col, row);
    this.towers.push(t);
    this.occupied.add(`${col},${row}`);
    this.money -= def.cost;
    this.fx.push(new Burst(t.x, t.y, def.color, 12));
    if (!this.shiftHeld) this.buildType = null;
    return true;
  }

  upgradeSelected() {
    const t = this.selected;
    if (!t) return;
    const cost = t.upgradeCost();
    if (cost == null) { this.toast('Already max level', '#ffd43b'); return; }
    if (this.money < cost) { this.toast(`Need ${cost} credits`, '#ff6b6b'); return; }
    this.money -= cost;
    t.upgrade();
    this.fx.push(new Burst(t.x, t.y, '#ffe066', 16));
    this.toast(`${t.def.name} → Lv ${t.level}`, '#ffe066');
  }

  sellSelected() {
    const t = this.selected;
    if (!t) return;
    const v = t.sellValue();
    this.money += v;
    this.occupied.delete(`${t.col},${t.row}`);
    this.towers = this.towers.filter(x => x !== t);
    this.selected = null;
    this.fx.push(new Burst(t.x, t.y, '#868e96', 12));
    this.toast(`Sold for ${v}`, '#868e96');
  }

  cycleTargetMode() {
    const t = this.selected;
    if (!t) return;
    const i = TARGET_MODES.indexOf(t.mode);
    t.mode = TARGET_MODES[(i + 1) % TARGET_MODES.length];
  }

  /* ---------- combat ---------- */
  damageEnemy(e, amount, source, tower) {
    if (!e.alive) return 0;
    const dealt = e.applyDamage(amount);
    if (tower) tower.damageDealt += dealt;
    this.fx.push(new FloatText(e.x, e.y - e.radius - 12, fmt(dealt),
      source === 'cannon' ? '#ff9f43' : '#e9ecef'));

    if (!e.alive) this.onKill(e, tower);
    return dealt;
  }

  onKill(e, tower) {
    this.kills++;
    if (tower) tower.kills++;
    this.money += e.bounty;
    this.fx.push(new Burst(e.x, e.y, e.def.color, e.key === 'boss' ? 40 : 12));
    this.fx.push(new FloatText(e.x, e.y - e.radius - 20, `+${e.bounty}`, '#51cf66'));
    if (e.key === 'boss') this.toast(`${e.def.name} destroyed! +${e.bounty}`, '#ffe066');
  }

  fireChain(tower, first, stats) {
    const hit = new Set([first]);
    const pts = [{ x: tower.x, y: tower.y }, { x: first.x, y: first.y }];
    let cur = first;
    this.damageEnemy(first, stats.damage, 'tesla', tower);

    for (let i = 1; i < stats.chain; i++) {
      let best = null, bd = Infinity;
      for (const e of this.enemies) {
        if (!e.alive || hit.has(e)) continue;
        const d = dist(cur.x, cur.y, e.x, e.y);
        if (d <= stats.chainRange && d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      hit.add(best);
      pts.push({ x: best.x, y: best.y });
      this.damageEnemy(best, stats.damage * 0.72, 'tesla', tower);
      cur = best;
    }
    this.fx.push(new Chain(pts, tower.def.color));
  }

  /* ---------- loop ---------- */
  update(dt) {
    this.time += dt;
    if (this.paused || this.state === 'over') return;

    const step = dt * this.speed;
    this.elapsed += step;

    if (this.state === 'prep') {
      this.prepTimer -= step;
      if (this.prepTimer <= 0) this.startWave();
    }

    this.spawner.update(step, this);

    for (const t of this.towers) t.update(step, this);
    for (const p of this.projectiles) p.update(step, this);
    this.projectiles = this.projectiles.filter(p => p.alive);

    for (const e of this.enemies) {
      e.update(step);
      if (!e.alive && e.leaked) this.onLeak(e);
    }
    this.enemies = this.enemies.filter(e => e.alive);

    for (const f of this.fx) f.update(step);
    this.fx = this.fx.filter(f => f.alive);

    if (this.inWave && this.spawner.done && this.enemies.length === 0) {
      this.completeWave();
    }
  }

  onLeak(e) {
    this.leaks++;
    const dmg = e.key === 'boss' ? 5 : 1;
    this.lives -= dmg;
    this.toast(`${e.def.name} breached the line  -${dmg}`, '#ff6b6b');
    this.fx.push(new Burst(e.x, e.y, '#ff6b6b', 18));
    if (this.lives <= 0) {
      this.lives = 0;
      this.state = 'over';
    }
  }

  completeWave() {
    this.inWave = false;
    const bonus = WAVE_BOUNTY_BASE + this.wave * 2;
    this.money += bonus;
    this.toast(`Wave ${this.wave} cleared  +${bonus}`, '#51cf66');
    if (this.wave >= WIN_WAVE) {
      this.state = 'won';
    } else {
      this.toPrep();
    }
  }

  toast(text, color) {
    this.floats.push({ text, color, life: 2.6 });
    if (this.floats.length > 4) this.floats.shift();
  }

  /* ---------- rendering ---------- */
  drawMap(ctx) {
    const { width: W, height: H, cell } = GRID;

    // backdrop
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#141a2b');
    bg.addColorStop(1, '#0d1120');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // build pads — the only places a tower may stand
    ctx.lineWidth = 1;
    for (const key of BUILD_PADS) {
      if (PATH_BLOCKED.has(key)) continue;
      const [c, r] = key.split(',').map(Number);
      const taken = this.occupied.has(key);
      ctx.fillStyle = taken ? 'rgba(255,255,255,0.03)'
                            : 'rgba(120,170,255,0.085)';
      roundRect(ctx, c * cell + 5, r * cell + 5, cell - 10, cell - 10, 6);
      ctx.fill();
      if (!taken) {
        ctx.strokeStyle = 'rgba(140,190,255,0.22)';
        ctx.stroke();
      }
    }

    // path bed
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2b3450';
    ctx.lineWidth = cell * 0.86;
    ctx.beginPath();
    ctx.moveTo(PATH.pts[0].x, PATH.pts[0].y);
    for (let i = 1; i < PATH.pts.length; i++) ctx.lineTo(PATH.pts[i].x, PATH.pts[i].y);
    ctx.stroke();

    ctx.strokeStyle = '#39436a';
    ctx.lineWidth = cell * 0.72;
    ctx.stroke();

    // animated flow dashes
    ctx.save();
    ctx.strokeStyle = 'rgba(122,162,255,0.30)';
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 20]);
    ctx.lineDashOffset = -(this.time * 46) % 34;
    ctx.stroke();
    ctx.restore();

    // spawn + goal markers
    const s = PATH.pts[0], g = PATH.pts[PATH.pts.length - 1];
    ctx.fillStyle = '#51cf66';
    ctx.beginPath(); ctx.arc(clamp(s.x, 8, W), s.y, 9, 0, Math.PI * 2); ctx.fill();
    const pulse = 1 + Math.sin(this.time * 4) * 0.16;
    ctx.strokeStyle = withAlpha('#ff6b6b', 0.85);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(clamp(g.x, 0, W - 8), g.y, 13 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = withAlpha('#ff6b6b', 0.5);
    ctx.beginPath(); ctx.arc(clamp(g.x, 0, W - 8), g.y, 7, 0, Math.PI * 2); ctx.fill();
  }

  drawBuildOverlay(ctx) {
    if (!this.buildType) return;
    const def = TOWERS[this.buildType];
    const { col, row } = this.mouse;

    ctx.save();
    for (const key of BUILD_PADS) {
      const [c, r] = key.split(',').map(Number);
      if (!this.canBuild(c, r)) continue;
      ctx.fillStyle = 'rgba(90,209,255,0.10)';
      ctx.fillRect(c * GRID.cell + 3, r * GRID.cell + 3, GRID.cell - 6, GRID.cell - 6);
    }

    if (inBounds(col, row)) {
      const ok = this.canBuild(col, row) && this.money >= def.cost;
      const { x, y } = cellCenter(col, row);
      ctx.fillStyle = ok ? 'rgba(81,207,102,0.22)' : 'rgba(255,107,107,0.22)';
      ctx.fillRect(col * GRID.cell + 2, row * GRID.cell + 2, GRID.cell - 4, GRID.cell - 4);
      ctx.strokeStyle = ok ? '#51cf66' : '#ff6b6b';
      ctx.lineWidth = 2;
      ctx.strokeRect(col * GRID.cell + 2, row * GRID.cell + 2, GRID.cell - 4, GRID.cell - 4);

      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = ok ? 'rgba(81,207,102,0.75)' : 'rgba(255,107,107,0.6)';
      ctx.beginPath(); ctx.arc(x, y, def.range, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = ok ? def.color : '#ff6b6b';
      ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  draw(ctx) {
    this.drawMap(ctx);
    this.drawBuildOverlay(ctx);

    if (this.selected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.selected.col * GRID.cell + 1, this.selected.row * GRID.cell + 1,
        GRID.cell - 2, GRID.cell - 2);
    }

    for (const t of this.towers) t.draw(ctx, t === this.selected);
    for (const e of this.enemies) e.draw(ctx);
    for (const p of this.projectiles) p.draw(ctx);
    for (const f of this.fx) f.draw(ctx);

    // toasts
    ctx.save();
    ctx.font = 'bold 14px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.textAlign = 'center';
    let ty = 30;
    for (const t of this.floats) {
      ctx.globalAlpha = clamp(t.life / 2.6, 0, 1);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(t.text, GRID.width / 2, ty);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, GRID.width / 2, ty);
      ty += 20;
    }
    ctx.restore();

    // decay toasts on real time, not sim speed
    for (const t of this.floats) t.life -= 1 / 60;
    this.floats = this.floats.filter(t => t.life > 0);
  }
}
