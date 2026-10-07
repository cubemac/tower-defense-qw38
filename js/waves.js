/* ============================================================
 * waves.js — wave composition + spawn scheduler
 * ============================================================ */

/**
 * Build the spawn schedule for a 1-based wave number.
 * Returns { entries: [{key, at}], hpScale, count }
 */
function buildWave(wave) {
  const idx = wave - 1;
  let groups, hpScale = 1;

  if (idx < WAVES.length) {
    groups = WAVES[idx];
    hpScale = 1 + idx * 0.11;              // ramp hard enough to bite by wave 12
  } else {
    // endless: recycle the final pattern, scale steadily (not exponentially)
    const over = idx - WAVES.length + 1;
    hpScale = (1 + (WAVES.length - 1) * 0.11) * Math.pow(ENDLESS_HP_SCALE, over);
    groups = WAVES[WAVES.length - 1].map(([k, n, g]) => [
      k, Math.round(n * Math.pow(ENDLESS_COUNT_SCALE, over)), g,
    ]);
  }

  const entries = [];
  let t = 0;
  for (const [key, count, gap] of groups) {
    for (let i = 0; i < count; i++) {
      entries.push({ key, at: t });
      t += gap;
    }
    t += 0.9; // breathing room between groups
  }
  return { entries, hpScale, count: entries.length };
}

class Spawner {
  constructor() {
    this.queue = [];
    this.timer = 0;
    this.active = false;
    this.spawned = 0;
  }

  start(wave) {
    const w = buildWave(wave);
    this.queue = w.entries.slice();
    this.hpScale = w.hpScale;
    this.total = w.count;
    this.spawned = 0;
    this.timer = 0;
    this.active = true;
  }

  /** Returns enemy keys to spawn this step. */
  update(dt, game) {
    if (!this.active) return;
    this.timer += dt;
    while (this.queue.length && this.queue[0].at <= this.timer) {
      const e = this.queue.shift();
      game.spawnEnemy(e.key, this.hpScale);
      this.spawned++;
    }
    if (!this.queue.length) this.active = false;
  }

  get done() { return !this.active && this.spawned >= this.total; }
}
