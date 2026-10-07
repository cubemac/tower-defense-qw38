/* ============================================================
 * utils.js — geometry + small helpers
 * ============================================================ */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/** Cell corner -> pixel centre of that cell. */
const cellCenter = (col, row) => ({
  x: col * GRID.cell + GRID.cell / 2,
  y: row * GRID.cell + GRID.cell / 2,
});

const pixelToCell = (x, y) => ({
  col: Math.floor(x / GRID.cell),
  row: Math.floor(y / GRID.cell),
});

/* ---- Path geometry ---------------------------------------------------- */

/** Pixel-space waypoints + cumulative arc length. */
const PATH = (() => {
  const pts = PATH_CELLS.map(([c, r]) => cellCenter(c, r));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y));
  }
  return { pts, cum, length: cum[cum.length - 1] };
})();

/** Position + heading (radians) at arc length `d` along the path. */
function pointAtDistance(d) {
  const pts = PATH.pts, cum = PATH.cum;
  if (d <= 0) {
    const a = pts[0], b = pts[1];
    return { x: a.x, y: a.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  if (d >= PATH.length) {
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    return { x: b.x, y: b.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  // find the segment [i-1, i] whose cumulative span contains d
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const a = pts[i - 1], b = pts[i];
  const segLen = cum[i] - cum[i - 1] || 1;
  const t = clamp((d - cum[i - 1]) / segLen, 0, 1);
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

/** Arc length of the closest point on the polyline to (px,py). */
function nearestArcLength(px, py) {
  const pts = PATH.pts;
  let best = 0, bestD = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x, ay = pts[i - 1].y;
    const bx = pts[i].x, by = pts[i].y;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
    const cx = ax + t * dx, cy = ay + t * dy;
    const d = Math.hypot(px - cx, py - cy);
    if (d < bestD) { bestD = d; best = PATH.cum[i - 1] + t * (PATH.cum[i] - PATH.cum[i - 1]); }
  }
  return best;
}

/** Set of "col,row" keys covered by the path — building is blocked here. */
const PATH_BLOCKED = (() => {
  const set = new Set();
  for (let i = 1; i < PATH_CELLS.length; i++) {
    const [c0, r0] = PATH_CELLS[i - 1];
    const [c1, r1] = PATH_CELLS[i];
    const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0));
    for (let s = 0; s <= steps; s++) {
      const c = Math.round(lerp(c0, c1, steps ? s / steps : 0));
      const r = Math.round(lerp(r0, r1, steps ? s / steps : 0));
      set.add(`${c},${r}`);
    }
  }
  return set;
})();

const inBounds = (col, row) =>
  col >= 0 && col < GRID.cols && row >= 0 && row < GRID.rows;

/** Lookup set for the curated build pads. */
const BUILD_PADS = new Set(BUILDABLE_PADS.map(([c, r]) => `${c},${r}`));

/* ---- Canvas sugar ----------------------------------------------------- */

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function withAlpha(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');
