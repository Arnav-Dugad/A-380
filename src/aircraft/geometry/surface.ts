import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import type { Vec3 } from './math';

export interface GridOptions {
  /** Close the surface around the v direction (e.g. a fuselage cross-section). */
  wrapV?: boolean;
  /** Reverse triangle winding / normals (used for mirrored or inward-facing surfaces). */
  flip?: boolean;
  /** Optional texture coordinates; defaults to normalised grid indices. */
  uv?: (i: number, j: number) => [number, number];
}

/**
 * Build an indexed triangle surface from a structured grid of points.
 * Normals are computed from central differences across the grid (with wrap-around)
 * so closed loops have no shading seam, which `computeVertexNormals` cannot guarantee
 * when the seam column is duplicated for UVs.
 */
export function gridSurface(
  nu: number,
  nv: number,
  point: (i: number, j: number) => Vec3,
  opts: GridOptions = {},
): BufferGeometry {
  const { wrapV = false, flip = false } = opts;
  const cols = wrapV ? nv + 1 : nv + 1; // seam duplicated when wrapped
  const rows = nu + 1;
  const pts: Vec3[] = new Array(rows * cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      pts[i * cols + j] = wrapV && j === nv ? pts[i * cols]! : point(i, j);
    }
  }
  const P = (i: number, j: number): Vec3 => {
    const ii = Math.min(rows - 1, Math.max(0, i));
    const jj = wrapV ? ((j % nv) + nv) % nv : Math.min(cols - 1, Math.max(0, j));
    return pts[ii * cols + jj]!;
  };
  const pos = new Float32Array(rows * cols * 3);
  const nor = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const k = i * cols + j;
      const p = pts[k]!;
      pos.set(p, k * 3);
      let a = P(i + 1, j);
      let b = P(i - 1, j);
      let du: Vec3 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      // Collapsed rows (e.g. a nose tip) give zero du; look one row further.
      if (Math.hypot(du[0], du[1], du[2]) < 1e-9) {
        a = P(i + 2, j);
        b = P(i - 2, j);
        du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      }
      const c = P(i, j + 1);
      const d = P(i, j - 1);
      let dv: Vec3 = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
      if (Math.hypot(dv[0], dv[1], dv[2]) < 1e-9) {
        const i2 = i === 0 ? 1 : i - 1;
        const c2 = P(i2, j + 1);
        const d2 = P(i2, j - 1);
        dv = [c2[0] - d2[0], c2[1] - d2[1], c2[2] - d2[2]];
      }
      let n: Vec3 = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
      const len = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / len, n[1] / len, n[2] / len];
      if (flip) n = [-n[0], -n[1], -n[2]];
      nor.set(n, k * 3);
      const uv = opts.uv ? opts.uv(i, j) : [i / nu, j / nv];
      uvs.set(uv, k * 2);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * cols + j;
      const b = (i + 1) * cols + j;
      const c = (i + 1) * cols + j + 1;
      const d = i * cols + j + 1;
      if (flip) idx.push(a, d, b, b, d, c);
      else idx.push(a, b, d, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('uv', new BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

/** Fan-triangulated cap over a closed loop of points (assumed roughly planar & convex). */
export function capLoop(loop: Vec3[], normal: Vec3): BufferGeometry {
  const n = loop.length;
  const c: Vec3 = [0, 0, 0];
  for (const p of loop) {
    c[0] += p[0] / n;
    c[1] += p[1] / n;
    c[2] += p[2] / n;
  }
  const pos = new Float32Array((n + 1) * 3);
  const nor = new Float32Array((n + 1) * 3);
  const uv = new Float32Array((n + 1) * 2);
  pos.set(c, 0);
  for (let i = 0; i < n; i++) pos.set(loop[i]!, (i + 1) * 3);
  for (let i = 0; i <= n; i++) nor.set(normal, i * 3);
  const idx: number[] = [];
  // Orient triangles so their geometric normal agrees with `normal`.
  const a = loop[0]!;
  const b = loop[1 % n]!;
  const e1: Vec3 = [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
  const e2: Vec3 = [b[0] - c[0], b[1] - c[1], b[2] - c[2]];
  const cr: Vec3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const same = cr[0] * normal[0] + cr[1] * normal[1] + cr[2] * normal[2] >= 0;
  for (let i = 0; i < n; i++) {
    const i0 = i + 1;
    const i1 = ((i + 1) % n) + 1;
    if (same) idx.push(0, i0, i1);
    else idx.push(0, i1, i0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * Surface of revolution around the local +X axis (engine/wheel convention).
 * profile: [x, r] pairs; returns ring surface with outward normals.
 */
export function lathe(profile: readonly (readonly [number, number])[], segments: number, inward = false): BufferGeometry {
  const nu = profile.length - 1;
  return gridSurface(
    nu,
    segments,
    (i, j) => {
      const [x, r] = profile[i]!;
      const a = (j / segments) * Math.PI * 2;
      return [x, r * Math.cos(a), r * Math.sin(a)];
    },
    { wrapV: true, flip: !inward },
  );
}

/** Signed volume of a triangle mesh (positive when faces point outward). */
export function signedVolume(g: BufferGeometry): number {
  const p = g.getAttribute('position');
  const idx = g.getIndex();
  let v = 0;
  const n = idx ? idx.count : p.count;
  for (let t = 0; t < n; t += 3) {
    const a = idx ? idx.getX(t) : t;
    const b = idx ? idx.getX(t + 1) : t + 1;
    const c = idx ? idx.getX(t + 2) : t + 2;
    const ax = p.getX(a), ay = p.getY(a), az = p.getZ(a);
    const bx = p.getX(b), by = p.getY(b), bz = p.getZ(b);
    const cx = p.getX(c), cy = p.getY(c), cz = p.getZ(c);
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

/** Reverse winding and normals in place. */
export function flipGeometry(g: BufferGeometry): BufferGeometry {
  const idx = g.getIndex();
  if (idx) {
    const arr = idx.array as Uint32Array | Uint16Array;
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i + 1]!;
      arr[i + 1] = arr[i + 2]!;
      arr[i + 2] = t;
    }
    idx.needsUpdate = true;
  }
  const n = g.getAttribute('normal');
  if (n) for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

/** Ensure a closed body's faces point outward (robust to generator orientation). */
export function orientOutward(g: BufferGeometry): BufferGeometry {
  // Volume is translation invariant only for closed meshes; centre first to reduce error on near-closed ones.
  g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(new Vector3());
  g.translate(-c.x, -c.y, -c.z);
  const v = signedVolume(g);
  g.translate(c.x, c.y, c.z);
  return v < 0 ? flipGeometry(g) : g;
}

/** Merge geometries that share the same attribute layout (position/normal/uv + index). */
export function merge(geoms: BufferGeometry[]): BufferGeometry {
  let vCount = 0;
  let iCount = 0;
  for (const g of geoms) {
    vCount += g.getAttribute('position').count;
    iCount += g.getIndex()!.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of geoms) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    pos.set(p.array as Float32Array, vo * 3);
    nor.set(n.array as Float32Array, vo * 3);
    if (u) uv.set(u.array as Float32Array, vo * 2);
    const ix = g.getIndex()!;
    for (let i = 0; i < ix.count; i++) idx[io + i] = ix.getX(i) + vo;
    vo += p.count;
    io += ix.count;
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  out.setAttribute('normal', new BufferAttribute(nor, 3));
  out.setAttribute('uv', new BufferAttribute(uv, 2));
  out.setIndex(new BufferAttribute(idx, 1));
  return out;
}
