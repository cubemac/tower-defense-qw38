/* ============================================================
 * entities.js — Enemy, Tower, Projectile, Particle, FX
 * ============================================================ */

class Enemy {
  constructor(key, waveScale = 1) {
    const d = ENEMIES[key];
    this.def = d;
    this.key = d.key;
    this.maxHp = Math.round(d.hp * waveScale);
    this.hp = this.maxHp;
    this.baseSpeed = d.speed;
    this.armor = d.armor;
    this.radius = d.radius;
    this.bounty = d.bounty;
    this.flying = !!d.flying;
    this.hover = Math.random() * Math.PI * 2;

    this.d = 0;                 // arc length travelled
    this.x = PATH.pts[0].x;
    this.y = PATH.pts[0].y;
    this.angle = 0;

    this.slowFactor = 1;        // 1 = normal, 0.55 = 45% slow
    this.slowTimer = 0;
    this.hitFlash = 0;
    this.alive = true;
    this.leaked = false;
    this.wobble = Math.random() * Math.PI * 2;
  }

  get speed() { return this.baseSpeed * this.slowFactor; }

  update(dt) {
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) this.slowFactor = 1;
    }
    if (this.hitFlash > 0) this.hitFlash -= dt;

    this.d += this.speed * dt;
    const p = pointAtDistance(this.d);
    this.x = p.x; this.y = p.y; this.angle = p.angle;
    this.wobble += dt * 8;

    if (this.d >= PATH.length) {
      this.alive = false;
      this.leaked = true;
    }
  }

  applyDamage(amount) {
    const eff = Math.max(1, amount - this.armor);
    this.hp -= eff;
    this.hitFlash = 0.09;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return eff;
  }

  applySlow(factor, duration) {
    // strongest slow wins
    if (factor < this.slowFactor || this.slowTimer <= 0) this.slowFactor = factor;
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  draw(ctx) {
    const r = this.radius;
    const lift = this.flying ? 16 + Math.sin(this.hover) * 4 : 0;
    ctx.save();
    ctx.translate(this.x, this.y - lift);

    // shadow stays on the deck; fliers cast a detached, fainter one
    ctx.save();
    ctx.translate(0, lift);
    ctx.fillStyle = this.flying ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(2, r * 0.75, this.flying ? r * 0.62 : r * 0.9, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const bob = Math.sin(this.wobble) * (r * 0.08);
    ctx.translate(0, bob);

    // body
    ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : this.def.color;
    ctx.strokeStyle = withAlpha('#000000', 0.5);
    ctx.lineWidth = 2;

    if (this.key === 'boss') {
      ctx.save();
      ctx.rotate(this.angle);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const rr = i % 2 ? r : r * 1.25;
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe066';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (this.key === 'tank' || this.key === 'shield') {
      roundRect(ctx, -r, -r * 0.8, r * 2, r * 1.6, 4);
      ctx.fill(); ctx.stroke();
      if (this.key === 'shield') {
        ctx.strokeStyle = withAlpha('#e7f5ff', 0.85);
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.32, -1.1, 1.1); ctx.stroke();
      }
    } else if (this.key === 'wraith' || this.key === 'harpy') {
      // diamond hull with swept wings
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.15); ctx.lineTo(r, 0);
      ctx.lineTo(0, r * 1.15); ctx.lineTo(-r, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      const flap = Math.sin(this.hover * 2.4) * r * 0.5;
      ctx.strokeStyle = withAlpha(this.def.color, 0.7);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, 0); ctx.lineTo(-r * 1.7, flap);
      ctx.moveTo(r * 0.4, 0); ctx.lineTo(r * 1.7, flap);
      ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }

    // frost tint
    if (this.slowTimer > 0) {
      ctx.fillStyle = 'rgba(126,232,250,0.34)';
      ctx.beginPath(); ctx.arc(0, 0, r + 2.5, 0, Math.PI * 2); ctx.fill();
    }

    // health bar
    const bw = Math.max(20, r * 2.1), bh = 4;
    const pct = this.hp / this.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    roundRect(ctx, -bw / 2 - 1, -r - 11, bw + 2, bh + 2, 2); ctx.fill();
    ctx.fillStyle = pct > 0.5 ? '#51cf66' : pct > 0.22 ? '#ffd43b' : '#ff6b6b';
    roundRect(ctx, -bw / 2, -r - 10, bw * pct, bh, 1.5); ctx.fill();

    ctx.restore();
  }
}

class Tower {
  constructor(typeKey, col, row) {
    const d = TOWERS[typeKey];
    this.def = d;
    this.type = typeKey;
    this.col = col;
    this.row = row;
    const c = cellCenter(col, row);
    this.x = c.x; this.y = c.y;

    this.level = 1;
    this.cool = 0;
    this.angle = -Math.PI / 2;
    this.target = null;
    this.mode = 'first';
    this.invested = d.cost;
    this.shotsFired = 0;
    this.damageDealt = 0;
    this.kills = 0;
    this.muzzle = 0;
  }

  get maxLevel() { return MAX_LEVEL; }

  /** Cumulative stats for the current level. */
  stats() {
    const L = this.level - 1;
    const g = LEVEL_GROWTH;
    const s = {
      damage: this.def.damage * Math.pow(g.damage, L),
      range: this.def.range * Math.pow(g.range, L),
      rate: this.def.rate * Math.pow(g.rate, L),
    };
    if (this.def.splash) s.splash = this.def.splash * Math.pow(g.splash, L);
    if (this.def.slow) s.slow = Math.min(0.8, this.def.slow * Math.pow(g.slow, L));
    if (this.def.slowDuration) s.slowDuration = this.def.slowDuration + L * 0.25;
    if (this.def.chain) s.chain = this.def.chain + Math.floor(L / 2) + (L >= 3 ? 1 : 0);
    if (this.def.chainRange) s.chainRange = this.def.chainRange * Math.pow(1.08, L);
    return s;
  }

  upgradeCost() {
    if (this.level >= MAX_LEVEL) return null;
    return this.def.upgrades[this.level - 1];
  }

  sellValue() { return Math.floor(this.invested * SELL_RATIO); }

  upgrade() {
    const c = this.upgradeCost();
    if (c == null) return false;
    this.level++;
    this.invested += c;
    return true;
  }

  pickTarget(enemies) {
    const s = this.stats();
    const aa = !!this.def.antiAir;
    let best = null, bestVal = -Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      if (e.flying && !aa) continue;          // ground towers cannot engage air
      if (dist(this.x, this.y, e.x, e.y) > s.range + e.radius) continue;
      let val;
      switch (this.mode) {
        case 'last': val = -e.d; break;
        case 'strongest': val = e.hp; break;
        case 'weakest': val = -e.hp; break;
        case 'first': default: val = e.d; break;
      }
      if (val > bestVal) { bestVal = val; best = e; }
    }
    this.target = best;
    return best;
  }

  update(dt, game) {
    if (this.muzzle > 0) this.muzzle -= dt;
    this.cool -= dt;

    const t = this.pickTarget(game.enemies);
    if (t) {
      const want = Math.atan2(t.y - this.y, t.x - this.x);
      let diff = ((want - this.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.angle += clamp(diff, -12 * dt, 12 * dt);
    }

    if (this.cool <= 0 && t) {
      const s = this.stats();
      this.cool = 1 / s.rate;
      this.muzzle = 0.07;
      this.shotsFired++;

      if (this.type === 'tesla') {
        game.fireChain(this, t, s);
      } else {
        game.projectiles.push(new Projectile(this, t, s));
      }
    }
  }

  draw(ctx, selected) {
    const s = this.stats();
    ctx.save();
    ctx.translate(this.x, this.y);

    // base plate
    ctx.fillStyle = '#20263a';
    roundRect(ctx, -GRID.cell * 0.42, -GRID.cell * 0.42, GRID.cell * 0.84, GRID.cell * 0.84, 7);
    ctx.fill();
    ctx.strokeStyle = withAlpha(this.def.color, 0.55);
    ctx.lineWidth = 2;
    ctx.stroke();

    // level pips
    for (let i = 0; i < this.level; i++) {
      ctx.fillStyle = this.def.color;
      ctx.beginPath();
      ctx.arc(-GRID.cell * 0.3 + i * 7, GRID.cell * 0.31, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // turret
    ctx.rotate(this.angle);
    const flash = this.muzzle > 0;
    ctx.fillStyle = flash ? '#fff6d8' : this.def.color;

    if (this.type === 'cannon') {
      roundRect(ctx, -4, -7, 22, 14, 4); ctx.fill();
      roundRect(ctx, 14, -5, 9, 10, 3); ctx.fill();
    } else if (this.type === 'sniper') {
      roundRect(ctx, -3, -3.5, 30, 7, 3); ctx.fill();
      ctx.fillStyle = '#20263a';
      roundRect(ctx, 4, -1.5, 8, 3, 1.5); ctx.fill();
    } else if (this.type === 'frost') {
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e7f5ff'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 15, Math.sin(a) * 15); ctx.stroke();
      }
    } else if (this.type === 'tesla') {
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = flash ? '#fff' : withAlpha(this.def.color, 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 15 + (flash ? 3 : 0), 0, Math.PI * 2); ctx.stroke();
    } else {
      roundRect(ctx, -4, -5, 18, 10, 3); ctx.fill();
    }

    if (flash) {
      ctx.fillStyle = 'rgba(255,236,150,0.75)';
      ctx.beginPath(); ctx.arc(24, 0, 7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    if (selected) {
      ctx.save();
      ctx.strokeStyle = withAlpha(this.def.color, 0.9);
      ctx.fillStyle = withAlpha(this.def.color, 0.07);
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y, s.range, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
}

class Projectile {
  constructor(tower, target, stats) {
    this.x = tower.x; this.y = tower.y;
    this.tower = tower;          // credit damage back to its owner
    this.target = target;
    this.type = tower.type;
    this.color = tower.def.color;
    this.damage = stats.damage;
    this.splash = stats.splash || 0;
    this.slow = stats.slow || 0;
    this.slowDuration = stats.slowDuration || 0;
    this.antiAir = !!tower.def.antiAir;
    this.speed = tower.def.projectileSpeed;
    this.radius = tower.type === 'cannon' ? 6 : tower.type === 'sniper' ? 3 : 4;
    this.alive = true;
    this.trail = [];
  }

  update(dt, game) {
    const t = this.target;
    // aim at the target if alive, else fly to its last known point
    const tx = t && t.alive ? t.x : this.lastX ?? this.x;
    const ty = t && t.alive ? t.y : this.lastY ?? this.y;
    if (t && t.alive) { this.lastX = t.x; this.lastY = t.y; }

    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;

    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 6) this.trail.shift();

    if (d <= step || d < 4) {
      this.x = tx; this.y = ty;
      this.impact(game, t && t.alive ? t : null);
      this.alive = false;
      return;
    }
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;

    if (this.x < -40 || this.x > GRID.width + 40 || this.y < -40 || this.y > GRID.height + 40) {
      this.alive = false;
    }
  }

  impact(game, target) {
    if (this.splash > 0) {
      game.fx.push(new Blast(this.x, this.y, this.splash, this.color));
      for (const e of game.enemies) {
        if (!e.alive) continue;
        if (e.flying && !this.antiAir) continue;   // ground blast misses air
        const d = dist(this.x, this.y, e.x, e.y);
        if (d <= this.splash + e.radius) {
          const falloff = 1 - 0.55 * (d / (this.splash + 1));
          game.damageEnemy(e, this.damage * clamp(falloff, 0.35, 1), this.type, this.tower);
        }
      }
    } else if (target) {
      game.damageEnemy(target, this.damage, this.type, this.tower);
      if (this.slow > 0) target.applySlow(this.slow, this.slowDuration);
    }
    game.fx.push(new Burst(this.x, this.y, this.color, this.splash > 0 ? 14 : 6));
  }

  draw(ctx) {
    if (this.trail.length > 1) {
      ctx.strokeStyle = withAlpha(this.color, 0.3);
      ctx.lineWidth = this.radius * 0.9;
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      for (const p of this.trail) ctx.lineTo(p.x, p.y);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
    }
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
  }
}

/* ---- transient FX ----------------------------------------------------- */

class Particle {
  constructor(x, y, color) {
    const a = Math.random() * Math.PI * 2;
    const sp = rand(30, 190);
    this.x = x; this.y = y;
    this.vx = Math.cos(a) * sp;
    this.vy = Math.sin(a) * sp;
    this.life = this.maxLife = rand(0.25, 0.6);
    this.color = color;
    this.r = rand(1.5, 3.5);
  }
  update(dt) {
    this.life -= dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vy += 210 * dt;
    this.vx *= 0.96;
  }
  draw(ctx) {
    ctx.fillStyle = withAlpha(this.color, clamp(this.life / this.maxLife, 0, 1));
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();
  }
  get alive() { return this.life > 0; }
}

class Burst {
  constructor(x, y, color, count = 8) {
    this.parts = Array.from({ length: count }, () => new Particle(x, y, color));
  }
  update(dt) { for (const p of this.parts) p.update(dt); }
  draw(ctx) { for (const p of this.parts) p.draw(ctx); }
  get alive() { return this.parts.some(p => p.alive); }
}

class Blast {
  constructor(x, y, radius, color) {
    this.x = x; this.y = y; this.max = radius; this.color = color;
    this.life = this.maxLife = 0.32;
  }
  update(dt) { this.life -= dt; }
  draw(ctx) {
    const t = 1 - this.life / this.maxLife;
    ctx.strokeStyle = withAlpha(this.color, (1 - t) * 0.9);
    ctx.lineWidth = 4 * (1 - t) + 1;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.max * (0.35 + t * 0.75), 0, Math.PI * 2);
    ctx.stroke();
  }
  get alive() { return this.life > 0; }
}

class Chain {
  constructor(points, color) {
    this.points = points; this.color = color;
    this.life = this.maxLife = 0.16;
  }
  update(dt) { this.life -= dt; }
  draw(ctx) {
    const a = this.life / this.maxLife;
    ctx.strokeStyle = withAlpha(this.color, a);
    ctx.lineWidth = 2.5;
    ctx.shadowColor = withAlpha(this.color, a);
    ctx.shadowBlur = 12;
    ctx.beginPath();
    for (let i = 0; i < this.points.length - 1; i++) {
      const p = this.points[i], q = this.points[i + 1];
      ctx.moveTo(p.x, p.y);
      const mx = (p.x + q.x) / 2 + rand(-9, 9);
      const my = (p.y + q.y) / 2 + rand(-9, 9);
      ctx.lineTo(mx, my); ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  get alive() { return this.life > 0; }
}

class FloatText {
  constructor(x, y, text, color) {
    this.x = x; this.y = y; this.text = text; this.color = color;
    this.life = this.maxLife = 0.75;
  }
  update(dt) { this.life -= dt; this.y -= 26 * dt; }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = clamp(this.life / this.maxLife, 0, 1);
    ctx.font = 'bold 13px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
  get alive() { return this.life > 0; }
}
