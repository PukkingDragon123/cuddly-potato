// 2D collision world for the Arena: static AABBs & circles in a spatial hash, terrain
// blocking from the cell grid, circle push-out resolution and grid A* pathfinding.
import { GRID, HALF } from './layout.js';

const CELL = 8;

export class World {
  constructor(terrain) {
    this.terrain = terrain;
    this.hash = new Map();
    this.all = new Set();
    this.blocked = null; // pathfinding grid
  }

  _keys(x0, z0, x1, z1) {
    const out = [];
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) out.push(i * 4096 + j);
    return out;
  }
  _insert(c) {
    c.keys = this._keys(c.x0, c.z0, c.x1, c.z1);
    for (const k of c.keys) {
      let s = this.hash.get(k);
      if (!s) this.hash.set(k, (s = []));
      s.push(c);
    }
    this.all.add(c);
    return c;
  }
  remove(c) {
    if (!c || !this.all.has(c)) return;
    for (const k of c.keys) {
      const s = this.hash.get(k);
      const i = s ? s.indexOf(c) : -1;
      if (i >= 0) s.splice(i, 1);
    }
    this.all.delete(c);
    this.dirtyPath = true;
  }
  /** Axis-aligned box collider. opts: tag, carts (default true), player (default true), onBump(info), data */
  box(x0, z0, x1, z1, opts = {}) {
    return this._insert({ type: 'box', x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), ...defaults(opts) });
  }
  /** Box centred at (x,z) with size (w,d), optionally rotated by multiples of 90deg. */
  boxAt(x, z, w, d, rot = 0, opts = {}) {
    const q = Math.round(rot / (Math.PI / 2)) & 1;
    const hw = (q ? d : w) / 2, hd = (q ? w : d) / 2;
    return this.box(x - hw, z - hd, x + hw, z + hd, opts);
  }
  circle(x, z, r, opts = {}) {
    return this._insert({ type: 'circle', x, z, r, x0: x - r, z0: z - r, x1: x + r, z1: z + r, ...defaults(opts) });
  }
  query(x, z, r) {
    const out = new Set();
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++)
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
        const s = this.hash.get(i * 4096 + j);
        if (s) for (const c of s) out.add(c);
      }
    return out;
  }

  /**
   * Push a circle (pos.x, pos.z, r) out of all colliders. who: 'player' | 'cart' | 'npc'.
   * Returns the list of contacts [{ c, nx, nz, depth }].
   */
  resolve(pos, r, who = 'player', contacts = []) {
    contacts.length = 0;
    // terrain cells
    const t = this.terrain;
    const ci = Math.floor(pos.x + HALF), cj = Math.floor(pos.z + HALF);
    for (let j = cj - 1; j <= cj + 1; j++)
      for (let i = ci - 1; i <= ci + 1; i++) {
        if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
        const c = j * GRID + i;
        if (t.walkableCell(c)) continue;
        const x0 = i - HALF, z0 = j - HALF;
        pushBox(pos, r, x0, z0, x0 + 1, z0 + 1, null, contacts);
      }
    for (const c of this.query(pos.x, pos.z, r + 0.1)) {
      if (who === 'cart' ? !c.carts : who === 'npc' ? !c.npc : !c.player) continue;
      if (c.enabled === false) continue;
      if (c.type === 'box') pushBox(pos, r, c.x0, c.z0, c.x1, c.z1, c, contacts);
      else pushCircle(pos, r, c.x, c.z, c.r, c, contacts);
    }
    return contacts;
  }

  /** Is a circle at (x,z) free of static obstacles? */
  free(x, z, r = 0.4, who = 'player') {
    const p = { x, z };
    this.resolve(p, r, who, _tmp);
    return _tmp.length === 0;
  }

  // ---------------------------------------------------------------------------
  // Pathfinding on the 1-unit terrain grid

  buildPathGrid(inflate = 0.35) {
    const N = GRID;
    const b = new Uint8Array(N * N);
    const t = this.terrain;
    for (let c = 0; c < N * N; c++) b[c] = t.walkableCell(c) ? 0 : 1;
    for (const c of this.all) {
      if (!c.player || c.enabled === false || c.dynamic) continue;
      const x0 = c.x0 - inflate, z0 = c.z0 - inflate, x1 = c.x1 + inflate, z1 = c.z1 + inflate;
      for (let j = Math.floor(z0 + HALF); j <= Math.floor(z1 + HALF); j++)
        for (let i = Math.floor(x0 + HALF); i <= Math.floor(x1 + HALF); i++) {
          if (i < 0 || j < 0 || i >= N || j >= N) continue;
          const cx = i - HALF + 0.5, cz = j - HALF + 0.5;
          if (c.type === 'box') {
            if (cx > x0 && cx < x1 && cz > z0 && cz < z1) b[j * N + i] = 1;
          } else if ((cx - c.x) ** 2 + (cz - c.z) ** 2 < (c.r + inflate) ** 2) b[j * N + i] = 1;
        }
    }
    this.blocked = b;
    this.dirtyPath = false;
  }

  cellFree(i, j) {
    return i >= 0 && j >= 0 && i < GRID && j < GRID && !this.blocked[j * GRID + i];
  }

  nearestFree(i, j, maxR = 6) {
    if (this.cellFree(i, j)) return [i, j];
    for (let r = 1; r <= maxR; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (this.cellFree(i + di, j + dj)) return [i + di, j + dj];
        }
    return null;
  }

  /** A* from world (ax,az) to (bx,bz). Returns smoothed array of [x,z] waypoints or null. */
  findPath(ax, az, bx, bz) {
    if (!this.blocked || this.dirtyPath) this.buildPathGrid();
    const N = GRID;
    const s = this.nearestFree(Math.floor(ax + HALF), Math.floor(az + HALF), 2);
    const g = this.nearestFree(Math.floor(bx + HALF), Math.floor(bz + HALF), 8);
    if (!s || !g) return null;
    const start = s[1] * N + s[0], goal = g[1] * N + g[0];
    if (start === goal) return [[bx, bz]];
    const gScore = new Float32Array(N * N).fill(Infinity);
    const came = new Int32Array(N * N).fill(-1);
    const closed = new Uint8Array(N * N);
    const heap = new Heap();
    const gx = g[0], gz = g[1];
    const hf = (c) => {
      const dx = Math.abs((c % N) - gx), dz = Math.abs(((c / N) | 0) - gz);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    gScore[start] = 0;
    heap.push(start, hf(start));
    let iter = 0;
    let found = false;
    while (heap.size && iter++ < 20000) {
      const cur = heap.pop();
      if (cur === goal) {
        found = true;
        break;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % N, cj = (cur / N) | 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di, nj = cj + dj;
          if (!this.cellFree(ni, nj)) continue;
          if (di && dj && (!this.cellFree(ci + di, cj) || !this.cellFree(ci, cj + dj))) continue;
          const nc = nj * N + ni;
          if (closed[nc]) continue;
          const ng = gScore[cur] + (di && dj ? Math.SQRT2 : 1);
          if (ng < gScore[nc]) {
            gScore[nc] = ng;
            came[nc] = cur;
            heap.push(nc, ng + hf(nc));
          }
        }
    }
    if (!found) return null;
    const cells = [];
    for (let c = goal; c !== -1; c = came[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => [(c % N) - HALF + 0.5, ((c / N) | 0) - HALF + 0.5]);
    // final target exact if its cell was free
    if (this.cellFree(Math.floor(bx + HALF), Math.floor(bz + HALF))) pts[pts.length - 1] = [bx, bz];
    // string pulling
    const out = [];
    let anchor = [ax, az];
    let k = 0;
    while (k < pts.length - 1) {
      let far = k + 1;
      for (let m = pts.length - 1; m > k + 1; m--) {
        if (this.lineFree(anchor[0], anchor[1], pts[m][0], pts[m][1])) {
          far = m;
          break;
        }
      }
      out.push(pts[far]);
      anchor = pts[far];
      k = far;
    }
    if (!out.length) out.push(pts[pts.length - 1]);
    return out;
  }

  lineFree(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / 0.35);
    for (let s = 0; s <= n; s++) {
      const t = s / Math.max(1, n);
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      // check a small cross to keep clearance
      for (const [ox, oz] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) {
        const i = Math.floor(x + ox + HALF), j = Math.floor(z + oz + HALF);
        if (!this.cellFree(i, j)) return false;
      }
    }
    return true;
  }
}

const _tmp = [];

function defaults(o) {
  return { player: o.player ?? true, carts: o.carts ?? true, npc: o.npc ?? true, tag: o.tag ?? null, onBump: o.onBump ?? null, data: o.data ?? null, bounce: o.bounce ?? 0.45, dynamic: o.dynamic ?? false };
}

function pushBox(pos, r, x0, z0, x1, z1, c, contacts) {
  const cx = Math.max(x0, Math.min(pos.x, x1));
  const cz = Math.max(z0, Math.min(pos.z, z1));
  let dx = pos.x - cx, dz = pos.z - cz;
  let d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  let nx, nz, depth;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    nx = dx / d;
    nz = dz / d;
    depth = r - d;
  } else {
    // centre inside box: push along the smallest axis
    const l = pos.x - x0, rr = x1 - pos.x, t = pos.z - z0, b = z1 - pos.z;
    const m = Math.min(l, rr, t, b);
    if (m === l) { nx = -1; nz = 0; depth = l + r; }
    else if (m === rr) { nx = 1; nz = 0; depth = rr + r; }
    else if (m === t) { nx = 0; nz = -1; depth = t + r; }
    else { nx = 0; nz = 1; depth = b + r; }
  }
  pos.x += nx * depth;
  pos.z += nz * depth;
  contacts.push({ c, nx, nz, depth });
}

function pushCircle(pos, r, x, z, cr, c, contacts) {
  const dx = pos.x - x, dz = pos.z - z;
  const d2 = dx * dx + dz * dz;
  const R = r + cr;
  if (d2 >= R * R) return;
  const d = Math.sqrt(d2) || 1e-4;
  const nx = dx / d, nz = dz / d, depth = R - d;
  pos.x += nx * depth;
  pos.z += nz * depth;
  contacts.push({ c, nx, nz, depth });
}

class Heap {
  constructor() {
    this.items = [];
    this.pri = [];
  }
  get size() {
    return this.items.length;
  }
  push(item, p) {
    const it = this.items, pr = this.pri;
    let i = it.length;
    it.push(item);
    pr.push(p);
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (pr[par] <= pr[i]) break;
      [it[par], it[i]] = [it[i], it[par]];
      [pr[par], pr[i]] = [pr[i], pr[par]];
      i = par;
    }
  }
  pop() {
    const it = this.items, pr = this.pri;
    const top = it[0];
    const li = it.pop(), lp = pr.pop();
    if (it.length) {
      it[0] = li;
      pr[0] = lp;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < it.length && pr[l] < pr[m]) m = l;
        if (r < it.length && pr[r] < pr[m]) m = r;
        if (m === i) break;
        [it[m], it[i]] = [it[i], it[m]];
        [pr[m], pr[i]] = [pr[i], pr[m]];
        i = m;
      }
    }
    return top;
  }
}
