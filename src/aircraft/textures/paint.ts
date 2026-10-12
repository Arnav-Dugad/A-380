/**
 * Shared machinery for the procedural texture atlases. Each atlas is painted into three
 * canvases: colour (sRGB), height (grey 128 = nominal skin; darker = recessed) and a
 * roughness/metal pair. `finish` turns height into a tangent-space normal map and packs
 * roughness and metalness into the G and B channels three.js reads them from. Everything here
 * runs on the main thread or in a worker with OffscreenCanvas.
 */
export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface Layers {
  W: number;
  H: number;
  color: Ctx;
  height: Ctx;
  rough: Ctx;
  metal: Ctx;
}

export interface AtlasBuffers {
  W: number;
  H: number;
  color: Uint8ClampedArray | null;
  normal: Uint8ClampedArray;
  orm: Uint8ClampedArray;
}

export function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function ctx2d(c: AnyCanvas): Ctx {
  const x = c.getContext('2d', { willReadFrequently: true }) as Ctx | null;
  if (!x) throw new Error('2D canvas unavailable');
  return x;
}

export function makeLayers(W: number, H: number, base: { color: string; rough: number; metal?: number }): Layers {
  const L: Layers = { W, H, color: ctx2d(makeCanvas(W, H)), height: ctx2d(makeCanvas(W, H)), rough: ctx2d(makeCanvas(W, H)), metal: ctx2d(makeCanvas(W, H)) };
  L.color.fillStyle = base.color;
  L.color.fillRect(0, 0, W, H);
  L.height.fillStyle = 'rgb(128,128,128)';
  L.height.fillRect(0, 0, W, H);
  const r = Math.round(base.rough * 255);
  L.rough.fillStyle = `rgb(${r},${r},${r})`;
  L.rough.fillRect(0, 0, W, H);
  const m = Math.round((base.metal ?? 0) * 255);
  L.metal.fillStyle = `rgb(${m},${m},${m})`;
  L.metal.fillRect(0, 0, W, H);
  return L;
}

/** Seeded generator (Park–Miller) so atlases are identical on every load. */
export function rng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export const grey = (v: number, a = 1): string => {
  const g = Math.max(0, Math.min(255, Math.round(v)));
  return a >= 1 ? `rgb(${g},${g},${g})` : `rgba(${g},${g},${g},${a})`;
};

/**
 * Convert the height layer to a normal map (Sobel), add an optional analytic height term,
 * flip rows so row 0 is v = 0 (textures are uploaded without flipY) and pack roughness/metal.
 */
export function finish(L: Layers, strength: number, extra?: (x: number, y: number) => number, withColor = true): AtlasBuffers {
  const { W, H } = L;
  const hImg = L.height.getImageData(0, 0, W, H).data;
  const h = new Float32Array(W * H);
  for (let i = 0, p = 0; i < h.length; i++, p += 4) h[i] = hImg[p]! - 128;
  if (extra) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) h[y * W + x]! += extra(x, y);
  const normal = new Uint8ClampedArray(W * H * 4);
  const at = (x: number, y: number) => h[Math.min(H - 1, Math.max(0, y)) * W + ((x + W) % W)]!;
  for (let y = 0; y < H; y++) {
    const row = H - 1 - y; // flipped
    for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / 8;
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) / 8;
      // tangent space: +x = +u (canvas right), +y = +v (canvas up, i.e. −canvas y)
      let nx = -dx * strength;
      let ny = dy * strength;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const o = (row * W + x) * 4;
      normal[o] = (nx * 0.5 + 0.5) * 255;
      normal[o + 1] = (ny * 0.5 + 0.5) * 255;
      normal[o + 2] = (nz * 0.5 + 0.5) * 255;
      normal[o + 3] = 255;
    }
  }
  const rImg = L.rough.getImageData(0, 0, W, H).data;
  const mImg = L.metal.getImageData(0, 0, W, H).data;
  const orm = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const src = y * W * 4;
    const dst = (H - 1 - y) * W * 4;
    for (let x = 0; x < W * 4; x += 4) {
      orm[dst + x] = 255;
      orm[dst + x + 1] = rImg[src + x]!;
      orm[dst + x + 2] = mImg[src + x]!;
      orm[dst + x + 3] = 255;
    }
  }
  let color: Uint8ClampedArray | null = null;
  if (withColor) {
    const cImg = L.color.getImageData(0, 0, W, H).data;
    color = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) color.set(cImg.subarray(y * W * 4, (y + 1) * W * 4), (H - 1 - y) * W * 4);
  }
  return { W, H, color, normal, orm };
}

/** Draw text centred at (x, y) with an affine frame: mirror and anisotropic scale. */
export function drawText(
  c: Ctx,
  str: string,
  x: number,
  y: number,
  sizePx: number,
  opts: { fill?: string; stroke?: string; lineWidth?: number; weight?: number; family?: string; spacing?: number; sx?: number; sy?: number; rotate?: number; align?: CanvasTextAlign; baseline?: CanvasTextBaseline },
): void {
  c.save();
  c.translate(x, y);
  if (opts.rotate) c.rotate(opts.rotate);
  c.scale(opts.sx ?? 1, opts.sy ?? 1);
  c.font = `${opts.weight ?? 500} ${sizePx}px ${opts.family ?? 'Inter, "Helvetica Neue", Arial, sans-serif'}`;
  c.textAlign = opts.align ?? 'center';
  c.textBaseline = opts.baseline ?? 'middle';
  if ('letterSpacing' in c) (c as Ctx & { letterSpacing: string }).letterSpacing = `${(opts.spacing ?? 0) * sizePx}px`;
  if (opts.fill) {
    c.fillStyle = opts.fill;
    c.fillText(str, 0, 0);
  }
  if (opts.stroke) {
    c.strokeStyle = opts.stroke;
    c.lineWidth = opts.lineWidth ?? 1;
    c.strokeText(str, 0, 0);
  }
  c.restore();
}

/** Elongated soft streak (grime, soot, oil) from (x, y) running along angle `a`. */
export function streak(c: Ctx, x: number, y: number, len: number, wid: number, a: number, color: string, alpha: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(a);
  const g = c.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, color.replace('ALPHA', String(alpha)));
  g.addColorStop(0.35, color.replace('ALPHA', String(alpha * 0.7)));
  g.addColorStop(1, color.replace('ALPHA', '0'));
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(len / 2, 0, len / 2, wid / 2, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** Soft round blotch. */
export function blotch(c: Ctx, x: number, y: number, rx: number, ry: number, color: string, alpha: number): void {
  const g = c.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, color.replace('ALPHA', String(alpha)));
  g.addColorStop(1, color.replace('ALPHA', '0'));
  c.save();
  c.fillStyle = g;
  c.translate(x, y);
  c.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
  c.translate(-x, -y);
  c.beginPath();
  c.arc(x, y, Math.max(rx, ry), 0, Math.PI * 2);
  c.fill();
  c.restore();
}
