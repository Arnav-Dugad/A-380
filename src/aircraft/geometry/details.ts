/**
 * Small exterior details: static dischargers, light lenses, wipers, NACA vents, drain masts,
 * slat tracks and the like. Positions are representative (from photographs), not from
 * Airbus drawings.
 */
import { BufferAttribute, BufferGeometry, SphereGeometry } from 'three';
import { cylinder } from './gear';
import type { Vec3 } from './math';
import { merge } from './surface';

const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]) || 1;
const nrm3 = (a: Vec3): Vec3 => {
  const l = len3(a);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const add3 = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Static discharger: a thin rod with a fine tip, trailing aft from a trailing edge. */
export function staticWick(base: Vec3, dir: Vec3, length = 0.17): BufferGeometry {
  const d = nrm3(dir);
  const mid = add3(base, d, length * 0.75);
  return merge([cylinder(base, mid, 0.0065, 6, 0.005), cylinder(mid, add3(base, d, length), 0.004, 6, 0.0015), cylinder(add3(base, d, -0.02), add3(base, d, 0.03), 0.011, 6)]);
}

/** Clear lens as a flattened half-ellipsoid on a surface: `n` outward, `t` along the long axis. */
export function lensDome(c: Vec3, n: Vec3, t: Vec3, a: number, b: number, h: number, seg = 16): BufferGeometry {
  const N = nrm3(n);
  const T = nrm3(t);
  const B = nrm3(cross3(N, T));
  const g = new SphereGeometry(1, seg, Math.max(4, seg / 2), 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.getAttribute('position');
  const q = g.getAttribute('normal');
  for (let i = 0; i < p.count; i++) {
    // sphere +Y is the dome axis
    const x = p.getX(i) * a;
    const y = p.getY(i) * h;
    const z = p.getZ(i) * b;
    p.setXYZ(i, c[0] + T[0] * x + N[0] * y + B[0] * z, c[1] + T[1] * x + N[1] * y + B[1] * z, c[2] + T[2] * x + N[2] * y + B[2] * z);
    const nx = q.getX(i) / a;
    const ny = q.getY(i) / h;
    const nz = q.getZ(i) / b;
    const v = nrm3([T[0] * nx + N[0] * ny + B[0] * nz, T[1] * nx + N[1] * ny + B[1] * nz, T[2] * nx + N[2] * ny + B[2] * nz]);
    q.setXYZ(i, v[0], v[1], v[2]);
  }
  return g;
}

/** Flat quad (two triangles) from four corners, normal from winding. */
export function quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([...a, ...b, ...c, ...d]), 3));
  const n = nrm3(cross3([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [d[0] - a[0], d[1] - a[1], d[2] - a[2]]));
  g.setAttribute('normal', new BufferAttribute(new Float32Array([...n, ...n, ...n, ...n]), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** Thin flat strip between two points, offset along `n`, width `w` across. */
export function strip(a: Vec3, b: Vec3, n: Vec3, w: number, t = 0.01): BufferGeometry {
  const d = nrm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const s = nrm3(cross3(d, n));
  const h = w / 2;
  const N = nrm3(n);
  const top = (p: Vec3, k: number) => add3(add3(p, s, k * h), N, t);
  const bot = (p: Vec3, k: number) => add3(p, s, k * h);
  return merge([quad(top(a, -1), top(b, -1), top(b, 1), top(a, 1)), quad(bot(a, -1), top(a, -1), top(a, 1), bot(a, 1)), quad(bot(b, 1), top(b, 1), top(b, -1), bot(b, -1)), quad(bot(a, 1), top(a, 1), top(b, 1), bot(b, 1)), quad(bot(b, -1), top(b, -1), top(a, -1), bot(a, -1))]);
}

/** Polyline tube through points (slat tracks, actuator rods). */
export function tube(pts: Vec3[], r: number, seg = 8): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < pts.length - 1; i++) parts.push(cylinder(pts[i]!, pts[i + 1]!, r, seg));
  return merge(parts);
}
