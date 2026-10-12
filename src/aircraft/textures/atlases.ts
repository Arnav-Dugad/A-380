/**
 * Texture atlases for the aircraft skin. A small set is painted synchronously so materials
 * exist from the first frame; full-resolution atlases are then painted in a worker and swapped
 * in (same texture types, so no shader recompiles). Resolution follows the graphics preset.
 */
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType, type Texture } from 'three';
import type { Quality } from '../../state/ui';
import type { AtlasKind, AtlasRequest } from './atlas.worker';
import { paintFuselage } from './fuselage';
import { paintNacelle, paintTyre } from './nacelle';
import type { AtlasBuffers } from './paint';
import { paintWing } from './wing';
import { paintTail } from './tail';

export interface AtlasTextures {
  map: DataTexture | null;
  normalMap: DataTexture;
  ormMap: DataTexture;
}

/** Tyre lathe: 26 profile points; the sidewalls are segments 1→2 and 23→24. */
export const TYRE_SIDEWALL: [number, number][] = [
  [1 / 25, 2 / 25],
  [23 / 25, 24 / 25],
];

const SIZES: Record<Quality, Record<AtlasKind, [number, number]>> = {
  ultra: { fuselage: [8192, 2048], wing: [8192, 2048], tail: [4096, 2048], nacelle: [2048, 2048], tyre: [512, 2048] },
  high: { fuselage: [8192, 2048], wing: [8192, 2048], tail: [4096, 2048], nacelle: [2048, 1024], tyre: [512, 2048] },
  balanced: { fuselage: [4096, 1024], wing: [4096, 1024], tail: [2048, 1024], nacelle: [1024, 1024], tyre: [256, 1024] },
  performance: { fuselage: [2048, 512], wing: [2048, 512], tail: [1024, 512], nacelle: [1024, 512], tyre: [256, 1024] },
};
const INITIAL: Record<AtlasKind, [number, number]> = { fuselage: [2048, 512], wing: [2048, 512], tail: [1024, 512], nacelle: [512, 512], tyre: [128, 512] };

function tex(data: Uint8ClampedArray, W: number, H: number, srgb: boolean, wrapS = false): DataTexture {
  const t = new DataTexture(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), W, H, RGBAFormat, UnsignedByteType);
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.anisotropy = 8;
  if (wrapS) t.wrapS = RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

export function toTextures(b: AtlasBuffers, wrapS = false): AtlasTextures {
  return { map: b.color ? tex(b.color, b.W, b.H, true, wrapS) : null, normalMap: tex(b.normal, b.W, b.H, false, wrapS), ormMap: tex(b.orm, b.W, b.H, false, wrapS) };
}

function paintSync(kind: AtlasKind, W: number, H: number): AtlasBuffers {
  switch (kind) {
    case 'fuselage':
      return paintFuselage(W, H);
    case 'wing':
      return paintWing(W, H);
    case 'tail':
      return paintTail(W, H);
    case 'nacelle':
      return paintNacelle(W, H);
    case 'tyre':
      return paintTyre(W, H, TYRE_SIDEWALL);
  }
}

/** Small atlases painted on the main thread for the first frames. */
export function initialAtlas(kind: AtlasKind): AtlasTextures {
  const [W, H] = INITIAL[kind];
  return toTextures(paintSync(kind, W, H), kind === 'nacelle' || kind === 'tyre');
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (b: AtlasBuffers | null) => void>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  try {
    worker = new Worker(new URL('./atlas.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; out?: AtlasBuffers; error?: string }>) => {
      const cb = pending.get(e.data.id);
      pending.delete(e.data.id);
      if (e.data.error) console.warn('Atlas painting failed:', e.data.error);
      cb?.(e.data.out ?? null);
    };
    worker.onerror = () => {
      for (const cb of pending.values()) cb(null);
      pending.clear();
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

/** Paint one atlas at the preset's resolution (in a worker when possible). */
export function paintAtlas(kind: AtlasKind, quality: Quality): Promise<AtlasTextures | null> {
  const [W, H] = SIZES[quality][kind];
  const [w0] = INITIAL[kind];
  if (W <= w0) return Promise.resolve(null);
  const w = getWorker();
  const wrap = kind === 'nacelle' || kind === 'tyre';
  if (!w) {
    // no OffscreenCanvas: paint on the main thread at a moderate size
    const [Wm, Hm] = SIZES.balanced[kind];
    return new Promise((res) => window.setTimeout(() => res(toTextures(paintSync(kind, Wm, Hm), wrap)), 50));
  }
  const id = ++seq;
  const req: AtlasRequest = { id, kind, W, H, sidewall: TYRE_SIDEWALL };
  return new Promise((res) => {
    pending.set(id, (b) => res(b ? toTextures(b, wrap) : null));
    w.postMessage(req);
  });
}

/** Debug: paint an atlas and return its layers as PNG data URLs (colour, normal, roughness/metal). */
export function previewAtlas(kind: AtlasKind, W: number, H: number): Record<string, string> {
  const b = paintSync(kind, W, H);
  const out: Record<string, string> = {};
  for (const [k, data] of Object.entries({ color: b.color, normal: b.normal, orm: b.orm })) {
    if (!data) continue;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(W, H);
    // stored bottom-up; flip back for viewing
    for (let y = 0; y < H; y++) img.data.set(data.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    ctx.putImageData(img, 0, 0);
    out[k] = c.toDataURL('image/png');
  }
  return out;
}

export function disposeAtlas(t: AtlasTextures): void {
  t.map?.dispose();
  t.normalMap.dispose();
  t.ormMap.dispose();
}

export type { Texture };
