/** Small, dependency-free numeric helpers shared by the geometry generators. */

export type Vec3 = [number, number, number];
export type Pt = readonly [number, number];

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const deg = (d: number): number => (d * Math.PI) / 180;

/**
 * Monotone piecewise cubic Hermite interpolation (Fritsch–Carlson). Used for
 * fuselage and nacelle profiles so the surfaces stay smooth without overshoot.
 */
export function pchip(points: readonly Pt[]): (x: number) => number {
  const n = points.length;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const h: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1]! - xs[i]!);
    d.push((ys[i + 1]! - ys[i]!) / h[i]!);
  }
  const m: number[] = new Array<number>(n).fill(0);
  m[0] = d[0] ?? 0;
  m[n - 1] = d[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) {
    const d0 = d[i - 1]!;
    const d1 = d[i]!;
    if (d0 * d1 <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i]! + h[i - 1]!;
      const w2 = h[i]! + 2 * h[i - 1]!;
      m[i] = (w1 + w2) / (w1 / d0 + w2 / d1);
    }
  }
  return (x: number) => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]!) i++;
    const t = (x - xs[i]!) / h[i]!;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i]! +
      (t3 - 2 * t2 + t) * h[i]! * m[i]! +
      (-2 * t3 + 3 * t2) * ys[i + 1]! +
      (t3 - t2) * h[i]! * m[i + 1]!
    );
  };
}

/** Piecewise linear interpolation over sorted control points. */
export function piecewise(points: readonly Pt[]): (x: number) => number {
  return (x: number) => {
    if (x <= points[0]![0]) return points[0]![1];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      if (x <= b[0]) return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0]));
    }
    return points[points.length - 1]![1];
  };
}

/** Distribute n+1 samples on [a,b] with optional clustering towards both ends. */
export function samples(a: number, b: number, n: number, cluster = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    let t = i / n;
    if (cluster > 0) t = lerp(t, 0.5 - 0.5 * Math.cos(Math.PI * t), cluster);
    out.push(lerp(a, b, t));
  }
  return out;
}

/** Merge several sorted breakpoint lists with a base distribution (used to align mesh rows with panel edges). */
export function withBreaks(base: number[], breaks: number[], eps = 1e-4): number[] {
  const all = [...base, ...breaks].sort((x, y) => x - y);
  const out: number[] = [];
  for (const v of all) if (out.length === 0 || Math.abs(v - out[out.length - 1]!) > eps) out.push(v);
  return out;
}
