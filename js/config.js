/* ============================================================
 * config.js — all tunables in one place. No logic here.
 * ============================================================ */

const GRID = {
  cols: 20,
  rows: 12,
  cell: 48,
};

GRID.width = GRID.cols * GRID.cell;   // 960
GRID.height = GRID.rows * GRID.cell;  // 576

/* Path waypoints in CELL coordinates.
 * Negative / over-max values sit offscreen so enemies slide in and out. */
const PATH_CELLS = [
  [-1, 1], [3, 1], [3, 5], [8, 5], [8, 1], [13, 1],
  [13, 8], [5, 8], [5, 10], [17, 10], [17, 5], [20, 5],
];

const START_MONEY = 190;
const START_LIVES = 20;

/* Curated build pads. Only these cells may hold a tower — placement is a
 * real decision instead of "fill every free tile". */
const BUILDABLE_PADS = [
  [0,0],[0,2],[2,0],[2,2],[4,1],[4,3],[2,4],[3,6],[5,6],[6,4],
  [7,6],[9,5],[9,3],[7,2],[8,0],[10,0],[11,2],[12,0],[14,1],[14,3],
  [12,4],[14,5],[12,6],[14,7],[13,9],[11,9],[10,7],[9,9],[7,9],[4,8],
  [5,11],[7,11],[9,11],[11,11],[13,11],[15,9],[15,11],[17,11],[18,9],[16,7],
  [18,7],[17,4],[19,4],
];

/* Tower definitions. `upgrades` lists the cost to reach level 2, 3, 4.
 * Per-level growth is applied by Tower.getStats(). */
const TOWERS = {
  gunner: {
    key: 'gunner', name: 'Gunner', color: '#5ad1ff', cost: 50,
    range: 112, damage: 9,  rate: 2.6, projectileSpeed: 620,
    antiAir: true, upgrades: [45, 85, 160],
    blurb: 'Cheap workhorse turret. Hits air too.',
  },
  cannon: {
    key: 'cannon', name: 'Cannon', color: '#ff9f43', cost: 120,
    range: 138, damage: 34, rate: 0.62, projectileSpeed: 300,
    splash: 58, antiAir: false, upgrades: [110, 190, 320],
    blurb: 'Slow, heavy splash. Ground only — shreds clusters.',
  },
  frost: {
    key: 'frost', name: 'Frost', color: '#7ee8fa', cost: 90,
    range: 104, damage: 4, rate: 1.15, projectileSpeed: 480,
    slow: 0.45, slowDuration: 1.6, antiAir: false, upgrades: [80, 150, 260],
    blurb: 'Slows ground units. Cannot reach fliers. Pair with damage.',
  },
  tesla: {
    key: 'tesla', name: 'Tesla', color: '#c77dff', cost: 185,
    range: 126, damage: 15, rate: 1.0, chain: 3, chainRange: 84,
    antiAir: true, upgrades: [160, 270, 440],
    blurb: 'Chains lightning. Hits air AND ground.',
  },
  sniper: {
    key: 'sniper', name: 'Sniper', color: '#ffe066', cost: 210,
    range: 300, damage: 78, rate: 0.34, projectileSpeed: 1500,
    antiAir: true, upgrades: [190, 320, 540],
    blurb: 'Enormous range, hits air. Useless up close.',
  },
};

/* Per-level multipliers applied cumulatively (level 1 = baseline). */
const LEVEL_GROWTH = {
  damage: 1.55,
  range: 1.10,
  rate: 1.14,
  splash: 1.12,
  slow: 1.10,      // slow % grows toward a cap
  chain: 1.0,    // handled specially: +1 target per 2 levels
};

const MAX_LEVEL = 4;
const SELL_RATIO = 0.7;   // fraction of total invested returned

/* Enemy definitions. armor is flat damage reduction per hit.
 * flying units can only be targeted by towers with antiAir: true. */
const ENEMIES = {
  grunt:  { key: 'grunt',  name: 'Grunt',  hp: 48,   speed: 58,  bounty: 7,   armor: 0, radius: 11, color: '#ff6b6b' },
  runner: { key: 'runner', name: 'Runner', hp: 34,   speed: 126, bounty: 8,  armor: 0, radius: 9,  color: '#ffd43b' },
  swarm:  { key: 'swarm',  name: 'Swarm',  hp: 24,   speed: 92,  bounty: 3,   armor: 0, radius: 7,  color: '#a0e548' },
  shield: { key: 'shield', name: 'Shield', hp: 150,  speed: 54,  bounty: 15,  armor: 6, radius: 13, color: '#4dabf7' },
  tank:   { key: 'tank',   name: 'Tank',   hp: 320,  speed: 36,  bounty: 26,  armor: 3, radius: 16, color: '#f783ac' },
  wraith: { key: 'wraith', name: 'Wraith', hp: 112,  speed: 108, bounty: 17,  armor: 1, radius: 11, color: '#b197fc', flying: true },
  harpy:  { key: 'harpy',  name: 'Harpy',  hp: 245,  speed: 84,  bounty: 30,  armor: 4, radius: 14, color: '#ff8787', flying: true },
  boss:   { key: 'boss',   name: 'BOSS',   hp: 2900, speed: 31,  bounty: 210, armor: 9, radius: 22, color: '#e03131' },
};

const TARGET_MODES = ['first', 'last', 'strongest', 'weakest'];

/* Wave composition. Waves past the table scale endlessly. */
const WAVES = [
  [['grunt', 8, 0.75]],
  [['grunt', 12, 0.62]],
  [['runner', 8, 0.5], ['grunt', 6, 0.7]],
  [['grunt', 14, 0.5], ['swarm', 10, 0.28]],
  [['shield', 6, 0.9], ['runner', 8, 0.45]],
  [['tank', 3, 1.6], ['grunt', 10, 0.5]],            // wave 6
  [['swarm', 26, 0.2], ['shield', 6, 0.8]],
  [['runner', 18, 0.34], ['tank', 4, 1.4]],
  [['wraith', 6, 1.0], ['grunt', 12, 0.45]],          // wave 9 — first fliers
  [['boss', 1, 1], ['grunt', 12, 0.5]],              // wave 10 — first boss
  [['tank', 8, 1.1], ['wraith', 8, 0.7]],
  [['swarm', 40, 0.16], ['shield', 12, 0.5]],
  [['wraith', 14, 0.5], ['tank', 6, 1.2]],
  [['harpy', 6, 1.3], ['runner', 24, 0.26]],          // wave 14 — heavy fliers
  [['boss', 2, 3.0], ['wraith', 10, 0.6]],           // wave 15
  [['tank', 14, 0.8], ['harpy', 8, 1.1]],
  [['harpy', 12, 0.7], ['runner', 24, 0.26]],
  [['tank', 18, 0.7], ['wraith', 18, 0.42]],
  [['harpy', 14, 0.6], ['tank', 12, 0.8]],
  [['boss', 3, 2.4], ['harpy', 10, 0.9]],             // wave 20
];

/* Endless scaling past WAVES.length */
const ENDLESS_HP_SCALE = 1.135;
const ENDLESS_COUNT_SCALE = 1.09;

const WAVE_BOUNTY_BASE = 10;   // + wave * 2 cleared bonus
const PREP_TIME = 12;          // seconds between waves (auto-start)

// Victory target. The endless curve past this is survival scoring.
const WIN_WAVE = WAVES.length + 7;   // wave 27
