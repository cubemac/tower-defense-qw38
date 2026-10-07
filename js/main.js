/* ============================================================
 * main.js — bootstrap, input, HUD, game loop
 * ============================================================ */

(() => {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');

  // device-pixel-ratio crispness
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = GRID.width * dpr;
  canvas.height = GRID.height * dpr;
  canvas.style.width = GRID.width + 'px';
  canvas.style.height = GRID.height + 'px';
  ctx.scale(dpr, dpr);

  const game = new Game(canvas);
  game.shiftHeld = false;

  /* ---------- DOM refs ---------- */
  const $ = (id) => document.getElementById(id);
  const el = {
    money: $('hud-money'), lives: $('hud-lives'), wave: $('hud-wave'),
    kills: $('hud-kills'), prep: $('hud-prep'), speed: $('hud-speed'),
    shop: $('shop'), inspector: $('inspector'), overlay: $('overlay'),
    ovTitle: $('ov-title'), ovBody: $('ov-body'), ovBtn: $('ov-btn'),
  };

  /* ---------- shop ---------- */
  function buildShop() {
    el.shop.innerHTML = '';
    for (const key of Object.keys(TOWERS)) {
      const t = TOWERS[key];
      const b = document.createElement('button');
      b.className = 'shop-item';
      b.dataset.key = key;
      b.title = t.blurb;
      b.innerHTML = `
        <span class="swatch" style="--c:${t.color}"></span>
        <span class="si-name">${t.name}
          <i class="tag ${t.antiAir ? 'aa' : 'ground'}">${t.antiAir ? 'AIR' : 'GND'}</i></span>
        <span class="si-cost">${t.cost}</span>`;
      b.addEventListener('click', () => {
        game.selectBuildType(key);
        if (game.state === 'ready') game.beginRun();
        syncShop();
      });
      el.shop.appendChild(b);
    }
  }

  function syncShop() {
    for (const b of el.shop.children) {
      const t = TOWERS[b.dataset.key];
      b.classList.toggle('active', game.buildType === b.dataset.key);
      b.classList.toggle('poor', game.money < t.cost);
    }
  }

  /* ---------- inspector ---------- */
  function syncInspector() {
    const t = game.selected;
    if (!t) { el.inspector.classList.add('hidden'); return; }
    el.inspector.classList.remove('hidden');
    const s = t.stats();
    const dps = s.damage * s.rate * (t.type === 'tesla' ? Math.min(2, s.chain) : 1);
    $('ins-name').textContent = `${t.def.name}  Lv ${t.level}/${MAX_LEVEL}`;
    $('ins-name').style.color = t.def.color;
    $('ins-stats').innerHTML = `
      <div><span>DPS</span><b>${fmt(dps)}</b></div>
      <div><span>Damage</span><b>${fmt(s.damage)}</b></div>
      <div><span>Range</span><b>${fmt(s.range)}</b></div>
      <div><span>Rate</span><b>${s.rate.toFixed(2)}/s</b></div>
      ${s.splash ? `<div><span>Splash</span><b>${fmt(s.splash)}</b></div>` : ''}
      ${s.slow ? `<div><span>Slow</span><b>${Math.round(s.slow * 100)}%</b></div>` : ''}
      ${s.chain ? `<div><span>Chains</span><b>${s.chain}</b></div>` : ''}
      <div><span>Dealt</span><b>${fmt(t.damageDealt)}</b></div>`;

    const up = $('btn-upgrade'), cost = t.upgradeCost();
    if (cost == null) {
      up.textContent = 'MAX LEVEL';
      up.disabled = true;
    } else {
      up.textContent = `Upgrade  ${cost}`;
      up.disabled = game.money < cost;
    }
    $('btn-sell').textContent = `Sell  ${t.sellValue()}`;
    $('btn-mode').textContent = `Target: ${t.mode}`;
  }

  /* ---------- HUD ---------- */
  function syncHud() {
    el.money.textContent = fmt(game.money);
    el.lives.textContent = game.lives;
    el.wave.textContent = `${game.wave}`;
    el.kills.textContent = fmt(game.kills);
    el.speed.textContent = `${game.speed}×`;

    if (game.state === 'prep') {
      el.prep.textContent = `next wave in ${Math.ceil(game.prepTimer)}s`;
      el.prep.className = 'hud-prep live';
    } else if (game.state === 'wave') {
      el.prep.textContent = `${game.enemies.length} enemy(s) on track`;
      el.prep.className = 'hud-prep live warn';
    } else {
      el.prep.textContent = game.state === 'over' ? 'run ended' : 'press start';
      el.prep.className = 'hud-prep';
    }
    syncShop();
    syncInspector();
  }

  /* ---------- overlays ---------- */
  function showOverlay(title, body, btn) {
    el.ovTitle.textContent = title;
    el.ovBody.innerHTML = body;
    el.ovBtn.textContent = btn;
    el.overlay.classList.remove('hidden');
  }
  function hideOverlay() { el.overlay.classList.add('hidden'); }

  function endScreen() {
    const won = game.state === 'won';
    showOverlay(
      won ? 'VICTORY' : 'LINE BREACHED',
      `Survived <b>${game.wave}</b> waves · <b>${fmt(game.kills)}</b> kills ·
       <b>${game.leaks}</b> leaks · ${Math.floor(game.elapsed)}s<br>
       Towers standing: <b>${game.towers.length}</b>`,
      'Play again'
    );
  }

  /* ---------- input ---------- */
  function canvasPos(ev) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) * (GRID.width / r.width),
      y: (ev.clientY - r.top) * (GRID.height / r.height),
    };
  }

  canvas.addEventListener('mousemove', (ev) => {
    const p = canvasPos(ev);
    const c = pixelToCell(p.x, p.y);
    game.mouse.x = p.x; game.mouse.y = p.y;
    game.mouse.col = c.col; game.mouse.row = c.row;
    game.mouse.over = true;
  });

  canvas.addEventListener('mouseleave', () => {
    game.mouse.over = false;
    game.mouse.col = game.mouse.row = -1;
  });

  canvas.addEventListener('click', (ev) => {
    const p = canvasPos(ev);
    const c = pixelToCell(p.x, p.y);
    if (game.state === 'ready') game.beginRun();

    if (game.buildType) {
      game.placeTower(c.col, c.row);
      return;
    }
    const hit = game.towers.find(t => t.col === c.col && t.row === c.row);
    game.selected = hit || null;
  });

  canvas.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    if (game.buildType) game.buildType = null;
    else game.selected = null;
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Shift') game.shiftHeld = true;

    const k = ev.key.toLowerCase();
    if (k === 'escape') { game.buildType = null; game.selected = null; }
    if (k === ' ') { ev.preventDefault(); game.paused = !game.paused; }
    if (k === 'u') game.upgradeSelected();
    if (k === 'x') game.sellSelected();
    if (k === 't') game.cycleTargetMode();
    if (k === 'enter') game.callWaveEarly();

    if (k >= '1' && k <= '5') {
      const keys = Object.keys(TOWERS);
      const key = keys[+k - 1];
      if (key) { game.selectBuildType(key); if (game.state === 'ready') game.beginRun(); }
    }
    if (k === '-' || k === '_') game.speed = Math.max(0.5, game.speed - 0.5);
    if (k === '=' || k === '+') game.speed = Math.min(4, game.speed + 0.5);
  });

  document.addEventListener('keyup', (ev) => {
    if (ev.key === 'Shift') game.shiftHeld = false;
  });

  $('btn-pause').addEventListener('click', () => { game.paused = !game.paused; });
  $('btn-speed').addEventListener('click', () => {
    const steps = [1, 2, 3, 4, 0.5];
    game.speed = steps[(steps.indexOf(game.speed) + 1) % steps.length] || 1;
  });
  $('btn-call').addEventListener('click', () => {
    if (game.state === 'ready') game.beginRun();
    else game.callWaveEarly();
  });
  $('btn-upgrade').addEventListener('click', () => game.upgradeSelected());
  $('btn-sell').addEventListener('click', () => game.sellSelected());
  $('btn-mode').addEventListener('click', () => game.cycleTargetMode());

  el.ovBtn.addEventListener('click', () => {
    if (game.state === 'over' || game.state === 'won') {
      game.reset();
      game.toPrep();
    }
    hideOverlay();
  });

  /* ---------- loop ---------- */
  let last = performance.now();
  let ended = false;

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    game.update(dt);
    game.draw(ctx);
    syncHud();

    if ((game.state === 'over' || game.state === 'won') && !ended) {
      ended = true;
      setTimeout(endScreen, 650);
    }
    if (game.state !== 'over' && game.state !== 'won') ended = false;

    requestAnimationFrame(frame);
  }

  /* ---------- boot ---------- */
  buildShop();
  showOverlay(
    'TOWER DEFENSE',
    `Hold the line for <b>${WIN_WAVE}</b> waves.<br>
     <span class="ov-keys">1–5</span> pick tower · <span class="ov-keys">click</span> place ·
     <span class="ov-keys">U</span> upgrade · <span class="ov-keys">X</span> sell ·
     <span class="ov-keys">T</span> targeting · <span class="ov-keys">Enter</span> call wave ·
     <span class="ov-keys">Space</span> pause`,
    'Start'
  );
  requestAnimationFrame(frame);
})();
