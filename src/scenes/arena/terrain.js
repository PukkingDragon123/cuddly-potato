// Voxel terrain for the Arena island: a 1-unit cell grid with per-cell type & height,
// painted by the zone builders, then baked into a few chunked meshes (top faces +
// stepped sides with cheap corner AO). Also builds animated liquid surfaces.
import * as THREE from 'three';
import { GRID, HALF, ISLAND } from './layout.js';
import { hash3, clamp, lerp } from '../../core/util.js';

// type: tops (colour palette), pat (pattern), side, h (default height), walk, grassy (green lip on sides)
const TYPE_LIST = [
  ['deep', { tops: [0x1d4f78, 0x1f557f], pat: 'noise', h: -3.2, walk: false }],
  ['seabed', { tops: [0xd9c48a, 0xcfb97c, 0xd4bf84], pat: 'noise', h: -1.5, walk: false, side: 0xb39a62 }],
  ['sand', { tops: [0xf3dfa0, 0xecd592, 0xf6e6b0, 0xefd998], pat: 'noise', h: -0.3, walk: true, side: 0xd8bf7c }],
  ['grass', { tops: [0x6fc64b, 0x67bd45, 0x77cc52, 0x63b742, 0x6ac348], pat: 'noise', h: 0, walk: true, grassy: true }],
  ['lawn', { tops: [0x80d457, 0x6fc24a], pat: 'stripeX2', h: 0, walk: true, grassy: true }],
  ['darkgrass', { tops: [0x58a03c, 0x4f9636, 0x5ea842], pat: 'noise', h: 0, walk: true, grassy: true }],
  ['path', { tops: [0xdcc596, 0xd2b986, 0xe4cfa2, 0xd8c08e], pat: 'noise', h: 0, walk: true, side: 0xa88a5a }],
  ['road', { tops: [0xf2cd70, 0xe6bc5c], pat: 'checker', h: 0, walk: true, side: 0xb8894a }],
  ['roadEdge', { tops: [0xc8954a, 0xbd8a40], pat: 'checker', h: 0, walk: true, side: 0x9a6a30 }],
  ['plaza', { tops: [0xe8eef6, 0xd8e1ed], pat: 'checker', h: 0, walk: true, side: 0xa8b2c4 }],
  ['plazaBlue', { tops: [0x7fd0f5, 0x62bdea], pat: 'checker', h: 0, walk: true, side: 0x3c8ec0 }],
  ['plazaPink', { tops: [0xff7fb8, 0xf2629f], pat: 'checker', h: 0, walk: true, side: 0xb83a72 }],
  ['asphalt', { tops: [0x4b505d, 0x474b57, 0x4f5461], pat: 'noise', h: 0, walk: true, side: 0x30333c }],
  ['lineW', { tops: [0xf0f0ea], pat: 'flat', h: 0, walk: true, side: 0x30333c }],
  ['lineY', { tops: [0xffd23f], pat: 'flat', h: 0, walk: true, side: 0x30333c }],
  ['sidewalk', { tops: [0xcdd1d8, 0xc0c5cd], pat: 'checker', h: 0, walk: true, side: 0x8a8f9a }],
  ['cliff', { tops: [0x6fc64b, 0x67bd45, 0x77cc52], pat: 'noise', h: 2, walk: false, side: 0x8c919e, rocky: true, grassy: true }],
  ['rock', { tops: [0x9aa0ac, 0x8c929e, 0xa4aab6], pat: 'noise', h: 1, walk: false, side: 0x7d828e, rocky: true }],
  ['metal', { tops: [0x5d6880, 0x56617a], pat: 'checker', h: 0, walk: true, side: 0x3a4256 }],
  ['metalDark', { tops: [0x3c4458, 0x363d50], pat: 'checker', h: 0, walk: true, side: 0x262c3c }],
  ['toxic', { tops: [0x5b7540, 0x50693a, 0x627e44, 0x56703c], pat: 'noise', h: 0, walk: true, grassy: true }],
  ['hazard', { tops: [0xffd23f, 0x2a2a30], pat: 'diag', h: 0, walk: true, side: 0x6a5a20 }],
  ['choco', { tops: [0x9a6440, 0x8a5636], pat: 'checker', h: 0, walk: true, side: 0x5a3220 }],
  ['candy', { tops: [0xffb0d4, 0xffffff], pat: 'diag', h: 0, walk: true, side: 0xd06a98 }],
  ['chocoBed', { tops: [0x4a2818, 0x542e1c], pat: 'noise', h: -0.9, walk: false, side: 0x6e3e26 }],
  ['marble', { tops: [0xf7f4ec, 0xe8e2d4], pat: 'checker', h: 0, walk: true, side: 0xb8b0a0 }],
  ['gold', { tops: [0xffd23f, 0xf0bd2a], pat: 'checker', h: 0, walk: true, side: 0xb88a1a }],
  ['redcarpet', { tops: [0xd8283a, 0xc82232], pat: 'stripeZ', h: 0, walk: true, side: 0x8a1420 }],
  ['tile', { tops: [0xf6f6f2, 0xdfe3ea], pat: 'checker', h: 0, walk: true, side: 0x9aa0aa }],
  ['tilePink', { tops: [0xffd6e8, 0xffc2dc], pat: 'checker', h: 0, walk: true, side: 0xc08aa0 }],
  ['pondBed', { tops: [0x5d7d58, 0x52714e], pat: 'noise', h: -1.1, walk: false, side: 0x7a6a4a }],
  ['bridge', { tops: [0xb47c4a, 0xa66e3c], pat: 'stripeX', h: 0.08, walk: true, side: 0x7a4e28 }],
  ['dirt', { tops: [0x9c7650, 0x8f6a46, 0xa47e56], pat: 'noise', h: 0, walk: true, side: 0x7a5a3a }],
  ['flowerbed', { tops: [0x7a5236, 0x6e4a30], pat: 'noise', h: 0.12, walk: true, side: 0x5a3a22 }],
];
export const TYPES = {};
export const TYPE_DEFS = [];
TYPE_LIST.forEach(([name, def], i) => {
  def.name = name;
  def.id = i;
  TYPES[name] = i;
  TYPE_DEFS.push(def);
});

// Smooth value noise.
function vnoise(x, z, seed = 1) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash3(xi, seed, zi), b = hash3(xi + 1, seed, zi), c = hash3(xi, seed, zi + 1), d = hash3(xi + 1, seed, zi + 1);
  return lerp(lerp(a, b, s(fx)), lerp(c, d, s(fx)), s(fz));
}
export function fbm(x, z, seed = 1) {
  return vnoise(x, z, seed) * 0.6 + vnoise(x * 2.1, z * 2.1, seed + 7) * 0.3 + vnoise(x * 4.3, z * 4.3, seed + 13) * 0.1;
}

const _col = new THREE.Color();

export class Terrain {
  constructor() {
    const n = GRID * GRID;
    this.N = GRID;
    this.type = new Uint8Array(n);
    this.h = new Float32Array(n);
    this.block = new Uint8Array(n); // extra blocking (fences etc. are colliders, this is terrain only)
    this.meshes = [];
    this.shapeIsland();
  }

  // --- indexing --------------------------------------------------------------
  cell(x, z) {
    const i = Math.floor(x + HALF), j = Math.floor(z + HALF);
    if (i < 0 || j < 0 || i >= GRID || j >= GRID) return -1;
    return j * GRID + i;
  }
  heightAt(x, z) {
    const c = this.cell(x, z);
    return c < 0 ? -3.2 : this.h[c];
  }
  typeAt(x, z) {
    const c = this.cell(x, z);
    return c < 0 ? 'deep' : TYPE_DEFS[this.type[c]].name;
  }
  walkableCell(c) {
    if (c < 0) return false;
    return TYPE_DEFS[this.type[c]].walk && !this.block[c];
  }
  walkable(x, z) {
    return this.walkableCell(this.cell(x, z));
  }

  // --- painting --------------------------------------------------------------
  setCell(c, type, h) {
    const t = typeof type === 'string' ? TYPES[type] : type;
    this.type[c] = t;
    this.h[c] = h ?? TYPE_DEFS[t].h;
  }
  /** Paint every cell whose centre is inside [x0,x1]x[z0,z1]. */
  rect(x0, z0, x1, z1, type, opts = {}) {
    for (let z = Math.floor(z0); z < Math.ceil(z1); z++)
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        const cx = x + 0.5, cz = z + 0.5;
        if (cx < x0 || cx > x1 || cz < z0 || cz > z1) continue;
        const c = this.cell(cx, cz);
        if (c < 0) continue;
        if (opts.onlyLand && this.h[c] < -0.05) continue;
        if (opts.filter && !opts.filter(cx, cz, c)) continue;
        this.setCell(c, typeof type === 'function' ? type(cx, cz) : type, typeof opts.h === 'function' ? opts.h(cx, cz) : opts.h);
      }
  }
  circle(cx, cz, r, type, opts = {}) {
    this.rect(cx - r, cz - r, cx + r, cz + r, type, {
      ...opts,
      filter: (x, z, c) => (x - cx) ** 2 + (z - cz) ** 2 <= r * r && (!opts.filter || opts.filter(x, z, c)),
    });
  }
  /** Thick polyline. */
  line(points, width, type, opts = {}) {
    const hw = width / 2;
    for (let k = 0; k < points.length - 1; k++) {
      const [ax, az] = points[k], [bx, bz] = points[k + 1];
      const x0 = Math.min(ax, bx) - hw, x1 = Math.max(ax, bx) + hw, z0 = Math.min(az, bz) - hw, z1 = Math.max(az, bz) + hw;
      this.rect(x0, z0, x1, z1, type, {
        ...opts,
        filter: (x, z) => distSeg(x, z, ax, az, bx, bz) <= hw && (!opts.filter || opts.filter(x, z)),
      });
    }
  }

  shapeIsland() {
    for (let j = 0; j < GRID; j++)
      for (let i = 0; i < GRID; i++) {
        const x = i - HALF + 0.5, z = j - HALF + 0.5;
        const ax = Math.abs(x), az = Math.abs(z);
        const d = Math.pow(Math.pow(ax, 5) + Math.pow(az, 5), 1 / 5);
        const n = (fbm(x * 0.08, z * 0.08, 3) - 0.5) * 6;
        const e = d + n;
        const c = j * GRID + i;
        if (e < ISLAND - 3.5) this.setCell(c, 'grass');
        else if (e < ISLAND) this.setCell(c, 'sand');
        else if (e < ISLAND + 7) this.setCell(c, 'seabed', -1.5 - (e - ISLAND) * 0.12);
        else this.setCell(c, 'deep');
        // northern cliffs
        if (z < -50 && e > ISLAND - 6.5 && e < ISLAND + 1) {
          const hh = 1 + Math.floor(fbm(x * 0.2, z * 0.2, 9) * 3.2);
          this.setCell(c, 'cliff', hh);
        }
      }
  }

  // --- meshing ---------------------------------------------------------------
  build(scene) {
    const CH = 32;
    const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (let cj = 0; cj < GRID; cj += CH)
      for (let ci = 0; ci < GRID; ci += CH) {
        const flat = new Builder(), raised = new Builder();
        for (let j = cj; j < cj + CH; j++)
          for (let i = ci; i < ci + CH; i++) this.meshCell(i, j, this.h[j * GRID + i] > 0.3 ? raised : flat);
        for (const [b, cast] of [[flat, false], [raised, true]]) {
          if (!b.count) continue;
          const m = new THREE.Mesh(b.geometry(), solidMat);
          m.receiveShadow = true;
          m.castShadow = cast;
          m.name = 'terrain';
          m.userData.disposable = true;
          scene.add(m);
          this.meshes.push(m);
        }
      }
  }

  hAt(i, j) {
    if (i < 0 || j < 0 || i >= GRID || j >= GRID) return -3.2;
    return this.h[j * GRID + i];
  }

  meshCell(i, j, B) {
    const c = j * GRID + i;
    const def = TYPE_DEFS[this.type[c]];
    const h = this.h[c];
    const x0 = i - HALF, z0 = j - HALF;
    // top colour by pattern
    const tops = def.tops;
    let col;
    switch (def.pat) {
      case 'checker': col = tops[(i + j) & 1]; break;
      case 'stripeX': col = tops[i & 1]; break;
      case 'stripeZ': col = tops[j & 1]; break;
      case 'stripeX2': col = tops[(i >> 1) & 1]; break;
      case 'diag': col = tops[((i + j) >> 1) & 1]; break;
      case 'flat': col = tops[0]; break;
      default: col = tops[Math.floor(hash3(i, 7, j) * tops.length) % tops.length];
    }
    const jit = 1 + (hash3(i, 3, j) - 0.5) * 0.07;
    // corner AO: neighbours higher than this cell darken the shared corner
    const hi = (di, dj) => (this.hAt(i + di, j + dj) > h + 0.05 ? 1 : 0);
    const ao = (a, b, d) => {
      const s = a + b + (a && b ? 1 : d);
      return [1, 0.82, 0.7, 0.6][Math.min(3, s)];
    };
    const n = hi(0, -1), s = hi(0, 1), w = hi(-1, 0), e = hi(1, 0);
    const aNW = ao(n, w, hi(-1, -1)), aNE = ao(n, e, hi(1, -1)), aSW = ao(s, w, hi(-1, 1)), aSE = ao(s, e, hi(1, 1));
    // quad corners: (x0,z0)=NW (x0+1,z0)=NE (x0+1,z0+1)=SE (x0,z0+1)=SW
    B.quad(
      [x0, h, z0 + 1], [x0 + 1, h, z0 + 1], [x0 + 1, h, z0], [x0, h, z0],
      [0, 1, 0], col, [aSW * jit, aSE * jit, aNE * jit, aNW * jit],
    );
    // sides
    const sideCol = def.side ?? 0x8b6a45;
    const sides = [
      [0, 1, [x0, z0 + 1], [x0 + 1, z0 + 1], [0, 0, 1]], // south face (+z)
      [0, -1, [x0 + 1, z0], [x0, z0], [0, 0, -1]], // north
      [1, 0, [x0 + 1, z0 + 1], [x0 + 1, z0], [1, 0, 0]], // east
      [-1, 0, [x0, z0], [x0, z0 + 1], [-1, 0, 0]], // west
    ];
    for (const [di, dj, a, b, nrm] of sides) {
      const hn = this.hAt(i + di, j + dj);
      if (hn >= h - 0.001) continue;
      const bottom = Math.max(hn, -3.4);
      const shadeK = nrm[2] > 0 ? 0.92 : nrm[0] !== 0 ? 0.8 : 0.7;
      if (def.grassy && h - bottom > 0.2) {
        const lip = h - 0.18;
        B.quad([a[0], lip, a[1]], [b[0], lip, b[1]], [b[0], h, b[1]], [a[0], h, a[1]], nrm, col, [shadeK * 0.95, shadeK * 0.95, shadeK, shadeK]);
        this.sideStrips(B, a, b, bottom, lip, nrm, def.rocky ? 0x8c919e : 0x8b6a45, shadeK, i, j, def.rocky);
      } else {
        this.sideStrips(B, a, b, bottom, h, nrm, sideCol, shadeK, i, j, def.rocky);
      }
    }
  }

  sideStrips(B, a, b, y0, y1, nrm, color, k, i, j, rocky) {
    // split tall sides into 0.5-unit bands with alternating tint (voxel strata)
    const band = rocky ? 0.5 : 1;
    let y = y1;
    let n = 0;
    while (y > y0 + 0.001) {
      const yb = Math.max(y0, y - band);
      const t = rocky ? 0.9 + hash3(i + n, 11, j) * 0.18 : 1;
      const depth = clamp(1 + yb * 0.12, 0.55, 1);
      B.quad([a[0], yb, a[1]], [b[0], yb, b[1]], [b[0], y, b[1]], [a[0], y, a[1]], nrm, color, [k * t * depth, k * t * depth, k * t, k * t]);
      y = yb;
      n++;
    }
  }
}

function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
export { distSeg };

/** Tiny indexed geometry builder for quads with per-corner shading. */
export class Builder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
    this.count = 0;
  }
  quad(a, b, c, d, n, color, shadeArr) {
    const v = this.count;
    _col.setHex(color);
    for (const [p, s] of [[a, shadeArr[0]], [b, shadeArr[1]], [c, shadeArr[2]], [d, shadeArr[3]]]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(_col.r * s, _col.g * s, _col.b * s);
    }
    this.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    this.count += 4;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ---------------------------------------------------------------------------
// Liquids: animated pixel textures (water, chocolate, toxic goo)

const liquidTex = {};
function makeLiquidTexture(kind) {
  if (liquidTex[kind]) return liquidTex[kind];
  const S = 32;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  const pal = {
    water: ['#3fb6e8', '#56c4ef', '#8fe0ff', '#e8fbff'],
    pond: ['#3aa6c8', '#4cb6d4', '#86d6ee', '#dff8ff'],
    choco: ['#6b3a22', '#7a4429', '#94593a', '#b07650'],
    goo: ['#5fe03a', '#7cff3a', '#b6ff7a', '#eaffcf'],
  }[kind];
  ctx.fillStyle = pal[0];
  ctx.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const v = Math.sin((x / S) * Math.PI * 2 * 2 + Math.sin((y / S) * Math.PI * 2) * 1.5) + Math.sin((y / S) * Math.PI * 2 * 3);
      if (v > 1.2) {
        ctx.fillStyle = pal[1];
        ctx.fillRect(x, y, 1, 1);
      }
      if (v > 1.62) {
        ctx.fillStyle = pal[2];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  // sparkles
  for (let k = 0; k < 7; k++) {
    const x = Math.floor(hash3(k, 1, 2) * S), y = Math.floor(hash3(k, 5, 9) * S);
    ctx.fillStyle = pal[3];
    ctx.fillRect(x, y, 2, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  liquidTex[kind] = t;
  return t;
}

/** Flat animated liquid surface. Returns { mesh, update(dt) }. */
export function makeLiquid(w, d, kind = 'water', opts = {}) {
  const base = makeLiquidTexture(kind);
  const tex = base.clone();
  tex.needsUpdate = true;
  const texel = opts.texel ?? 3; // world units per texture repeat
  tex.repeat.set(w / texel, d / texel);
  const mat = new THREE.MeshLambertMaterial({
    map: tex,
    transparent: opts.opacity !== undefined && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
    depthWrite: !(opts.opacity < 1),
  });
  if (opts.glow) {
    mat.emissive = new THREE.Color(opts.glow);
    mat.emissiveIntensity = 0.5;
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  const flow = opts.flow ?? [0.02, 0.012];
  let t = 0;
  return {
    mesh,
    update(dt) {
      t += dt;
      tex.offset.x = (tex.offset.x + flow[0] * dt) % 1;
      tex.offset.y = (tex.offset.y + flow[1] * dt + Math.sin(t * 0.7) * 0.0006) % 1;
    },
  };
}
