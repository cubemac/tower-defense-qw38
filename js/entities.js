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

/* Cached metal gradients — rebuilt only when a tower levels up. */
function metalGrad(ctx, y0, y1, light, mid, dark) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, light);
  g.addColorStop(0.42, mid);
  g.addColorStop(1, dark);
  return g;
}

function radialGlow(ctx, r, color, alpha) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(0.55, withAlpha(color, alpha * 0.32));
  g.addColorStop(1, withAlpha(color, 0));
  return g;
}

/* Octagonal deck plate shared by every tower. */
function octagonPath(ctx, r) {
  const k = r * 0.4;
  ctx.beginPath();
  ctx.moveTo(-r + k, -r);
  ctx.lineTo(r - k, -r);
  ctx.lineTo(r, -r + k);
  ctx.lineTo(r, r - k);
  ctx.lineTo(r - k, r);
  ctx.lineTo(-r + k, r);
  ctx.lineTo(-r, r - k);
  ctx.lineTo(-r, -r + k);
  ctx.closePath();
}

/* Hot-barrel tint: cold steel -> amber -> white hot. */
function heatTint(ctx, baseGrad, heat) {
  if (heat <= 0.02) return baseGrad;
  const h = clamp(heat, 0, 1);
  const g = ctx.createLinearGradient(0, -6, 0, 6);
  g.addColorStop(0, `rgb(${255},${Math.round(210 - h * 60)},${Math.round(190 - h * 150)})`);
  g.addColorStop(0.5, `rgb(${Math.round(160 + h * 95)},${Math.round(120 + h * 40)},${Math.round(110 - h * 70)})`);
  g.addColorStop(1, `rgb(${Math.round(90 + h * 90)},${Math.round(80 + h * 30)},${Math.round(90 - h * 40)})`);
  return g;
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

    /* presentation state */
    this.muzzle = 0;        // seconds of muzzle flash remaining
    this.flashSize = 1;
    this.recoil = 0;        // barrel kick 0..1
    this.heat = 0;          // barrel glow 0..1
    this.spin = Math.random() * Math.PI * 2;
    this.pulse = Math.random() * Math.PI * 2;
    this.spawnIn = 1;       // build / upgrade pop animation
    this._grads = null;
    this._gradLevel = -1;
  }

  get maxLevel() { return MAX_LEVEL; }

  /* Geometry grows with level so upgrades are visible on the turret. */
  parts() {
    const L = this.level;
    return {
      barrels: this.type === 'gunner' ? (L >= 4 ? 3 : 2) : 1,
      barrelLen: (this.type === 'sniper' ? 30 : this.type === 'cannon' ? 21 : 17)
        + (L - 1) * (this.type === 'cannon' ? 3.5 : 2),
      barrelW: (this.type === 'cannon' ? 13 : this.type === 'sniper' ? 5.5 : 6)
        + (L - 1) * (this.type === 'cannon' ? 1.7 : 0.6),
      rings: this.type === 'tesla' ? 2 + L : 0,
      shards: this.type === 'frost' ? 3 + L : 0,
      plateR: GRID.cell * (0.36 + L * 0.017),
    };
  }

  grads(ctx) {
    if (this._gradLevel !== this.level) {
      const p = this.parts();
      this._gradLevel = this.level;
      this._grads = {
        plate: metalGrad(ctx, -p.plateR, p.plateR, '#526084', '#2f3956', '#151a29'),
        body: metalGrad(ctx, -11, 11, '#8b99b8', '#4b5674', '#222839'),
        barrel: metalGrad(ctx, -5, 5, '#a8b8d4', '#5d6a88', '#293044'),
        glow: radialGlow(ctx, p.plateR * 2.2, this.def.color, 0.45),
      };
    }
    return this._grads;
  }

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
    this.spawnIn = 1;              // replay the build-in pop
    this._gradLevel = -1;          // force gradient rebuild
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

  fire(game) {
    const s = this.stats();
    this.cool = 1 / s.rate;
    this.muzzle = 0.075;
    this.flashSize = this.type === 'cannon' ? 2.1 : this.type === 'sniper' ? 1.6 : 1;
    this.recoil = this.type === 'cannon' ? 1 : this.type === 'sniper' ? 0.8 : 0.5;
    this.heat = Math.min(1, this.heat + (this.type === 'gunner' ? 0.15 : 0.34));
    this.shotsFired++;

    if (this.type === 'tesla') {
      game.fireChain(this, this.target, s);
    } else {
      game.projectiles.push(new Projectile(this, this.target, s));
    }
    SFX.shoot(this.type);
  }

  update(dt, game) {
    // presentation decay
    this.muzzle = Math.max(0, this.muzzle - dt);
    this.recoil = Math.max(0, this.recoil - dt * 4.4);
    this.heat = Math.max(0, this.heat - dt * 0.4);
    this.spin += dt * (1.2 + this.level * 0.4);
    this.pulse += dt * 3.6;
    this.spawnIn = Math.max(0, this.spawnIn - dt * 3.6);

    this.cool -= dt;

    const t = this.pickTarget(game.enemies);
    if (t) {
      const want = Math.atan2(t.y - this.y, t.x - this.x);
      let diff = ((want - this.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      // heavy guns traverse noticeably slower
      const tr = (this.type === 'cannon' ? 5 : this.type === 'sniper' ? 4.2 : 12) * dt;
      this.angle += clamp(diff, -tr, tr);
    }

    if (this.cool <= 0 && t) this.fire(game);
  }

  draw(ctx, selected) {
    const s = this.stats();
    const p = this.parts();
    const g = this.grads(ctx);
    const pop = 1 + this.spawnIn * 0.28;

    ctx.save();
    ctx.translate(this.x, this.y);

    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(1.5, p.plateR * 0.5, p.plateR * 1.02, p.plateR * 0.44, 0, 0, Math.PI * 2);
    ctx.fill();

    // ambient glow in the tower's colour, stronger at higher levels
    ctx.fillStyle = g.glow;
    ctx.globalAlpha = 0.35 + this.level * 0.11 + (this.muzzle > 0 ? 0.3 : 0);
    ctx.beginPath();
    ctx.arc(0, 0, p.plateR * 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.scale(pop, pop);

    /* ---------- deck plate ---------- */
    octagonPath(ctx, p.plateR);
    ctx.fillStyle = g.plate;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = withAlpha(this.def.color, 0.5 + this.level * 0.1);
    ctx.stroke();

    // inner bevel highlight along the top edge
    ctx.beginPath();
    ctx.moveTo(-p.plateR * 0.6, -p.plateR * 0.86);
    ctx.lineTo(p.plateR * 0.6, -p.plateR * 0.86);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // rivets
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    const rv = p.plateR * 0.74;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.arc(sx * rv, sy * rv * 0.72, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // level chevrons on the front of the deck
    for (let i = 0; i < this.level; i++) {
      ctx.strokeStyle = withAlpha(this.def.color, 0.95);
      ctx.lineWidth = 2;
      ctx.beginPath();
      const y = p.plateR * 0.5 - i * 3.4;
      ctx.moveTo(-5, y + 2.6);
      ctx.lineTo(0, y - 1.4);
      ctx.lineTo(5, y + 2.6);
      ctx.stroke();
    }

    /* ---------- turret head ---------- */
    ctx.save();
    ctx.rotate(this.angle);
    const kick = -this.recoil * (this.type === 'cannon' ? 6 : 3.4);
    ctx.translate(kick, 0);

    const flash = this.muzzle > 0;
    const barrelGrad = heatTint(ctx, g.barrel, this.heat);

    if (this.type === 'gunner') {
      // chassis + twin/triple barrels with muzzle brakes
      roundRect(ctx, -9, -8.5, 17, 17, 4);
      ctx.fillStyle = g.body; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = withAlpha(this.def.color, 0.5);
      roundRect(ctx, -6.5, -3, 6, 6, 2); ctx.fill();

      const offs = p.barrels === 3 ? [-4.6, 0, 4.6] : [-3, 3];
      ctx.fillStyle = barrelGrad;
      for (const o of offs) {
        roundRect(ctx, 5, o - p.barrelW / 2 + 1.4, p.barrelLen, p.barrelW - 2.8, 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();
      }
      // muzzle brake block
      ctx.fillStyle = '#1c2233';
      roundRect(ctx, p.barrelLen + 3, -p.barrelW / 2 + 0.6, 4, p.barrelW - 1.2, 1.5);
      ctx.fill();

    } else if (this.type === 'cannon') {
      // hydraulic stabilisers, mantlet, fat stepped barrel
      ctx.strokeStyle = '#39435f'; ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(-6, -9); ctx.lineTo(-13, -13);
      ctx.moveTo(-6, 9); ctx.lineTo(-13, 13);
      ctx.stroke();

      roundRect(ctx, -10, -11, 20, 22, 5);
      ctx.fillStyle = g.body; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.6; ctx.stroke();

      ctx.fillStyle = barrelGrad;
      roundRect(ctx, 6, -p.barrelW / 2, p.barrelLen * 0.72, p.barrelW, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();

      // muzzle brake with cooling slots
      ctx.fillStyle = '#232a3d';
      roundRect(ctx, 6 + p.barrelLen * 0.72, -p.barrelW / 2 - 1.6, 8, p.barrelW + 3.2, 2.5);
      ctx.fill();
      ctx.strokeStyle = withAlpha(this.def.color, 0.55); ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const x = 8 + p.barrelLen * 0.72 + i * 2.4;
        ctx.beginPath(); ctx.moveTo(x, -p.barrelW / 2 - 0.6); ctx.lineTo(x, p.barrelW / 2 + 0.6);
        ctx.stroke();
      }

    } else if (this.type === 'frost') {
      // rotating crystal emitter around a pulsing cryo core
      roundRect(ctx, -8, -8, 15, 16, 4);
      ctx.fillStyle = g.body; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.4; ctx.stroke();

      const pulse = 0.55 + Math.sin(this.pulse) * 0.2;
      ctx.fillStyle = radialGlow(ctx, 17 + this.level, '#bff4ff', pulse);
      ctx.beginPath(); ctx.arc(2, 0, 17 + this.level, 0, Math.PI * 2); ctx.fill();

      ctx.save();
      ctx.translate(3, 0);
      ctx.rotate(this.spin);
      ctx.fillStyle = withAlpha('#d9f7ff', 0.9);
      ctx.strokeStyle = '#5fd0ea'; ctx.lineWidth = 1;
      for (let i = 0; i < p.shards; i++) {
        ctx.save();
        ctx.rotate((i / p.shards) * Math.PI * 2);
        ctx.beginPath();
        ctx.moveTo(0, -11 - this.level);
        ctx.lineTo(3.2, 0);
        ctx.lineTo(0, 4);
        ctx.lineTo(-3.2, 0);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, 3.4 + Math.sin(this.pulse) * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

    } else if (this.type === 'tesla') {
      // coil body, stacked rings, arcing orb
      roundRect(ctx, -8, -7.5, 15, 15, 4);
      ctx.fillStyle = g.body; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.4; ctx.stroke();

      ctx.strokeStyle = withAlpha(this.def.color, 0.75);
      ctx.lineWidth = 2;
      for (let i = 0; i < p.rings; i++) {
        ctx.beginPath();
        ctx.ellipse(3, 0, 6 + i * 3.4, 9 + i * 3.4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      const orb = 5 + Math.sin(this.pulse * 1.6) * 1.2 + (flash ? 3 : 0);
      ctx.fillStyle = radialGlow(ctx, orb * 2.6, flash ? '#ffffff' : '#e6d5ff', 0.95);
      ctx.beginPath(); ctx.arc(3, 0, orb * 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = flash ? '#ffffff' : '#f2e8ff';
      ctx.beginPath(); ctx.arc(3, 0, orb, 0, Math.PI * 2); ctx.fill();

      // idle micro-arcs between the prongs
      if (!flash) {
        ctx.strokeStyle = withAlpha(this.def.color, 0.45);
        ctx.lineWidth = 1;
        ctx.beginPath();
        let px = 3 - orb, py = -orb;
        ctx.moveTo(px, py);
        for (let i = 0; i < 3; i++) {
          px += rand(-2.5, 2.5) + orb * 0.6;
          py += rand(-orb, orb);
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

    } else if (this.type === 'sniper') {
      // bipod, tapered barrel, scope with lens glint
      ctx.strokeStyle = '#39435f'; ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(10, -3); ctx.lineTo(6, -9);
      ctx.moveTo(10, 3); ctx.lineTo(6, 9);
      ctx.stroke();

      roundRect(ctx, -9, -6.5, 17, 13, 4);
      ctx.fillStyle = g.body; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.4; ctx.stroke();

      ctx.fillStyle = barrelGrad;
      roundRect(ctx, 6, -p.barrelW / 2, p.barrelLen, p.barrelW, 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();

      // scope
      roundRect(ctx, -2, -10.5, 13, 5.5, 2.5);
      ctx.fillStyle = '#1a2033'; ctx.fill();
      ctx.strokeStyle = withAlpha(this.def.color, 0.6); ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = withAlpha('#8fe9ff', this.target ? 0.95 : 0.5);
      ctx.beginPath(); ctx.arc(10.5, -7.8, 2.1, 0, Math.PI * 2); ctx.fill();

      // laser sight while it has a target
      if (this.target) {
        ctx.save();
        ctx.strokeStyle = withAlpha('#ff6b6b', 0.28);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 6]);
        ctx.beginPath();
        ctx.moveTo(p.barrelLen + 4, 0);
        ctx.lineTo(s.range, 0);
        ctx.stroke();
        ctx.restore();
      }
    }

    /* ---------- muzzle flash ---------- */
    if (flash) {
      const t = this.muzzle / 0.075;
      const mx = (this.type === 'sniper' ? p.barrelLen + 4 : p.barrelLen + 8);
      const size = (7 + this.level * 1.6) * this.flashSize * t;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = radialGlow(ctx, size * 2.4, '#ffe9a8', 0.9 * t);
      ctx.beginPath(); ctx.arc(mx, 0, size * 2.4, 0, Math.PI * 2); ctx.fill();

      // star spikes
      ctx.fillStyle = withAlpha('#fff3c4', 0.92 * t);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + this.spin * 0.5;
        const rr = i % 2 ? size * 0.42 : size;
        ctx[i ? 'lineTo' : 'moveTo'](mx + Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = withAlpha('#ffffff', 0.85 * t);
      ctx.beginPath(); ctx.arc(mx, 0, size * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // smoke wisp
      ctx.fillStyle = withAlpha('#c9d3e8', 0.16 * t);
      ctx.beginPath(); ctx.arc(mx + 7 + (1 - t) * 12, -3 - (1 - t) * 9, 4 + (1 - t) * 7, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();   // turret rotation
    ctx.restore();   // tower translate

    /* ---------- selection ring ---------- */
    if (selected) {
      ctx.save();
      ctx.translate(this.x, this.y);
      const rot = this.spin * 0.35;
      ctx.fillStyle = withAlpha(this.def.color, 0.07);
      ctx.beginPath(); ctx.arc(0, 0, s.range, 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = withAlpha(this.def.color, 0.85);
      ctx.lineWidth = 2;
      ctx.setLineDash([9, 7]);
      ctx.lineDashOffset = -this.spin * 26;
      ctx.beginPath(); ctx.arc(0, 0, s.range, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      // corner brackets at the edge of range
      ctx.strokeStyle = withAlpha(this.def.color, 0.95);
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) {
        const a = rot + (i / 4) * Math.PI * 2;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(s.range - 9, -6); ctx.lineTo(s.range, 0); ctx.lineTo(s.range - 9, 6);
        ctx.stroke();
        ctx.restore();
      }
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
    this.radius = tower.type === 'cannon' ? 6.5 : tower.type === 'sniper' ? 3 : 4;
    this.alive = true;
    this.trail = [];
    this.spin = Math.random() * Math.PI * 2;
    this.age = 0;
  }

  update(dt, game) {
    this.age += dt;
    this.spin += dt * 14;
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
    ctx.save();

    // glowing tracer tail
    if (this.trail.length > 1) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i < this.trail.length; i++) {
        const a = (i / this.trail.length) * 0.5;
        ctx.strokeStyle = withAlpha(this.color, a);
        ctx.lineWidth = this.radius * (0.4 + (i / this.trail.length) * 0.9);
        ctx.beginPath();
        ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    const ang = Math.atan2(this.y - (this.trail.at(-1)?.y ?? this.y),
                           this.x - (this.trail.at(-1)?.x ?? this.x));
    ctx.translate(this.x, this.y);

    if (this.type === 'cannon') {
      // spinning shell: brass body, dark driving band
      ctx.rotate(ang);
      ctx.fillStyle = '#d9b45c';
      roundRect(ctx, -this.radius * 1.5, -this.radius * 0.72, this.radius * 3, this.radius * 1.44, 2);
      ctx.fill();
      ctx.fillStyle = '#8a6d2f';
      roundRect(ctx, -this.radius * 0.2, -this.radius * 0.78, this.radius * 0.9, this.radius * 1.56, 1.5);
      ctx.fill();
      ctx.fillStyle = '#f2d68a';
      ctx.beginPath(); ctx.arc(this.radius * 1.5, 0, this.radius * 0.62, 0, Math.PI * 2); ctx.fill();
    } else if (this.type === 'frost') {
      // tumouring ice shard
      ctx.rotate(this.spin);
      ctx.fillStyle = radialGlow(ctx, this.radius * 3.4, '#bff4ff', 0.85);
      ctx.beginPath(); ctx.arc(0, 0, this.radius * 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#eafcff';
      ctx.strokeStyle = '#6fd4ec'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -this.radius * 1.7); ctx.lineTo(this.radius * 0.8, 0);
      ctx.lineTo(0, this.radius * 1.7); ctx.lineTo(-this.radius * 0.8, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (this.type === 'sniper') {
      // superheated dart with a hard core
      ctx.rotate(ang);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = withAlpha(this.color, 0.5);
      roundRect(ctx, -16, -1.8, 22, 3.6, 1.8); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fffbe6';
      roundRect(ctx, -5, -1.4, 10, 2.8, 1.4); ctx.fill();
    } else {
      // gunner slug with a hot tip
      ctx.rotate(ang);
      ctx.fillStyle = '#c9d3e8';
      roundRect(ctx, -this.radius, -this.radius * 0.6, this.radius * 2, this.radius * 1.2, 1.5);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = withAlpha(this.color, 0.85);
      ctx.beginPath(); ctx.arc(this.radius * 0.9, 0, this.radius * 0.85, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
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
