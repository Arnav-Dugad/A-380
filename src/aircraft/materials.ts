/**
 * Runtime PBR material library. GLB files only carry material *keys*; this module builds the
 * actual physically based materials (with procedurally painted livery, panel-line bump maps
 * and roughness variation) and shares them across every mesh that uses the same key.
 */
import {
  CanvasTexture,
  Color,
  DoubleSide,
  LinearSRGBColorSpace,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Material,
  type Texture,
} from 'three';
import { L, MAIN_DECK_FLOOR, UPPER_DECK_FLOOR } from './geometry/layout';
import { fuselagePoint } from './geometry/fuselage';
import type { MaterialKey } from './geometry/parts';

const TEX_W = 4096;
const TEX_H = 1024;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

/** Map (station, θ) → texture pixel. θ runs from −π/2 (keel) through starboard, crown and port. */
const px = (s: number): number => (s / L) * TEX_W;
const py = (theta: number): number => TEX_H - ((theta + Math.PI / 2) / (Math.PI * 2)) * TEX_H;

/** θ (starboard) at which the section reaches height y. */
function thetaY(s: number, y: number): number {
  let lo = -Math.PI / 2;
  let hi = Math.PI / 2;
  for (let k = 0; k < 30; k++) {
    const m = (lo + hi) / 2;
    if (fuselagePoint(s, m)[1] < y) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** Fill a horizontal band between two heights on both sides, following the section. */
function band(ctx: CanvasRenderingContext2D, s0: number, s1: number, y0: (s: number) => number, y1: (s: number) => number, fill: string) {
  for (const side of [1, -1]) {
    ctx.beginPath();
    const steps = 160;
    for (let i = 0; i <= steps; i++) {
      const s = s0 + ((s1 - s0) * i) / steps;
      const t = thetaY(s, y0(s));
      const th = side === 1 ? t : Math.PI - t;
      if (i === 0) ctx.moveTo(px(s), py(th));
      else ctx.lineTo(px(s), py(th));
    }
    for (let i = steps; i >= 0; i--) {
      const s = s0 + ((s1 - s0) * i) / steps;
      const t = thetaY(s, y1(s));
      const th = side === 1 ? t : Math.PI - t;
      ctx.lineTo(px(s), py(th));
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
}

function text(ctx: CanvasRenderingContext2D, str: string, s: number, y: number, size: number, color: string, font: string, spacing = 0) {
  for (const side of [1, -1] as const) {
    const t = thetaY(s, y);
    const th = side === 1 ? t : Math.PI - t;
    ctx.save();
    ctx.translate(px(s), py(th));
    // Starboard: s runs right-to-left on screen → mirror horizontally. Port: θ runs downward → flip vertically.
    if (side === 1) ctx.scale(-1, 1);
    else ctx.scale(1, -1);
    ctx.font = `${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`;
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }
}

/** Fictional "Digital Twin" demonstrator livery (no real airline or manufacturer branding). */
export function makeLiveryTextures(): { map: Texture; bump: Texture; rough: Texture } {
  const [c, ctx] = canvas(TEX_W, TEX_H);
  ctx.fillStyle = '#f4f5f6';
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  // Light grey lower fuselage
  band(ctx, 0, L, () => 0, () => 3.15, '#c9ced3');
  // Graphite aft swoosh rising into the fin
  band(
    ctx,
    48,
    L,
    (s) => 10.6 - Math.pow(Math.max(0, s - 48) / 24.7, 1.6) * 3.8,
    () => 12,
    '#1d2329',
  );
  // Ice-blue pin stripe under the main deck windows
  band(ctx, 7.5, 60.5, (s) => MAIN_DECK_FLOOR + 0.62 + (s > 50 ? (s - 50) * 0.05 : 0), (s) => MAIN_DECK_FLOOR + 0.69 + (s > 50 ? (s - 50) * 0.05 : 0), '#6fd3ef');
  band(ctx, 52, L, (s) => 10.6 - Math.pow(Math.max(0, s - 48) / 24.7, 1.6) * 3.8 - 0.14, (s) => 10.6 - Math.pow(Math.max(0, s - 48) / 24.7, 1.6) * 3.8 - 0.08, '#6fd3ef');
  // Black anti-glare / cockpit window surround
  text(ctx, 'A380', 22.5, UPPER_DECK_FLOOR + 1.0, 64, '#1d2329', '300 "Inter", "Helvetica Neue", Arial, sans-serif', 18);
  text(ctx, 'DIGITAL TWIN', 33.5, UPPER_DECK_FLOOR + 1.0, 46, '#1d2329', '500 "Inter", "Helvetica Neue", Arial, sans-serif', 24);
  text(ctx, 'DT-A380', 60.6, MAIN_DECK_FLOOR + 1.15, 30, '#1d2329', '500 "Inter", Arial, sans-serif', 4);

  // Panel line bump map
  const [b, bctx] = canvas(TEX_W, TEX_H);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, TEX_W, TEX_H);
  bctx.strokeStyle = '#3a3a3a';
  bctx.lineWidth = 1.4;
  // Circumferential joints (major section breaks + regular skin panels)
  const joints = [2.3, 5.9, 11.8, 17.3, 22.8, 28.1, 33.5, 39.0, 44.4, 49.6, 54.8, 59.9, 64.6, 68.8];
  for (const s of joints) {
    bctx.beginPath();
    bctx.moveTo(px(s), 0);
    bctx.lineTo(px(s), TEX_H);
    bctx.stroke();
  }
  // Longitudinal lap joints at fixed heights
  bctx.lineWidth = 1.1;
  for (const y of [3.4, 4.6, MAIN_DECK_FLOOR + 1.8, UPPER_DECK_FLOOR + 0.25, UPPER_DECK_FLOOR + 1.75, 9.9]) {
    for (const side of [1, -1]) {
      bctx.beginPath();
      for (let s = 10; s <= 62; s += 0.5) {
        const t = thetaY(s, y);
        const th = side === 1 ? t : Math.PI - t;
        if (s === 10) bctx.moveTo(px(s), py(th));
        else bctx.lineTo(px(s), py(th));
      }
      bctx.stroke();
    }
  }
  // Access panels on the lower fuselage
  bctx.lineWidth = 1;
  for (let s = 13; s < 58; s += 3.7) {
    for (const side of [1, -1]) {
      const t = thetaY(s, 3.0);
      const th = side === 1 ? t : Math.PI - t;
      bctx.strokeRect(px(s), py(th) - 6, 26, 12);
    }
  }
  // Fastener rows: subtle dotted lines along joints
  bctx.fillStyle = '#6c6c6c';
  for (const s of joints) for (let y = 0; y < TEX_H; y += 5) bctx.fillRect(px(s) + 3, y, 1, 1);

  // Roughness: gloss paint with gentle variation
  const [r, rctx] = canvas(512, 128);
  const img = rctx.createImageData(512, 128);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 92 + rnd() * 26;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  rctx.putImageData(img, 0, 0);

  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  const bump = new CanvasTexture(b);
  bump.colorSpace = LinearSRGBColorSpace;
  bump.anisotropy = 8;
  const rough = new CanvasTexture(r);
  rough.colorSpace = LinearSRGBColorSpace;
  rough.wrapS = rough.wrapT = RepeatWrapping;
  return { map, bump, rough };
}

/** Small tiling noise used to break up uniform surfaces. */
function noiseTexture(size = 256, base = 128, amp = 40): Texture {
  const [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size);
  let seed = 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = base + (rnd() - 0.5) * amp;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = LinearSRGBColorSpace;
  return t;
}

export type MaterialLibrary = Record<MaterialKey | 'livery', Material>;

let library: MaterialLibrary | null = null;

export function getMaterials(): MaterialLibrary {
  if (library) return library;
  const livery = makeLiveryTextures();
  const noise = noiseTexture();
  const paint = (color: string, rough = 0.32, extra: Partial<MeshPhysicalMaterial> = {}) =>
    new MeshPhysicalMaterial({ color: new Color(color), roughness: rough, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.18, ...extra });
  const std = (color: string, roughness: number, metalness: number, extra: Partial<MeshStandardMaterial> = {}) =>
    new MeshStandardMaterial({ color: new Color(color), roughness, metalness, ...extra });
  const emissive = (color: string, intensity: number) =>
    new MeshStandardMaterial({ color: new Color('#111'), emissive: new Color(color), emissiveIntensity: intensity, roughness: 0.3 });

  library = {
    livery: new MeshPhysicalMaterial({
      map: livery.map,
      bumpMap: livery.bump,
      bumpScale: 0.6,
      roughness: 0.3,
      roughnessMap: livery.rough,
      metalness: 0,
      clearcoat: 0.7,
      clearcoatRoughness: 0.14,
    }),
    paint: paint('#f2f3f4', 0.34, { roughnessMap: noise }),
    paintBelly: paint('#b9bfc5', 0.42),
    paintTail: paint('#1d2329', 0.3),
    composite: paint('#dfe2e5', 0.48, { clearcoat: 0.2 }),
    leadingEdge: std('#cfd3d8', 0.36, 0.55, { roughnessMap: noise }),
    metal: std('#a9adb2', 0.34, 1),
    darkMetal: std('#3a3e43', 0.46, 0.65),
    chrome: std('#e6e8ea', 0.08, 1),
    tyre: std('#141516', 0.86, 0),
    hub: std('#9a9ea3', 0.36, 0.9),
    glass: new MeshPhysicalMaterial({ color: new Color('#0b1218'), roughness: 0.04, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 }),
    window: new MeshPhysicalMaterial({ color: new Color('#0a0f14'), roughness: 0.06, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 }),
    seal: std('#16191c', 0.6, 0.1),
    fan: std('#9ea5ad', 0.28, 1, { side: DoubleSide }),
    inlet: std('#1b1e22', 0.55, 0.4),
    exhaust: std('#5d5650', 0.5, 0.9),
    lightRed: emissive('#ff2a2a', 4),
    lightGreen: emissive('#2aff6a', 4),
    lightWhite: emissive('#ffffff', 5),
    lightAmber: emissive('#ffb347', 3),
    cabinWall: std('#e9e6df', 0.7, 0, { side: DoubleSide }),
    cabinFloor: std('#3d4148', 0.8, 0),
    carpet: std('#38404a', 0.95, 0),
    seatFabric: std('#3e4c5c', 0.9, 0),
    seatFabricBiz: std('#2c3138', 0.75, 0),
    seatFabricFirst: std('#6e5d4a', 0.7, 0),
    plastic: std('#d9d7d2', 0.55, 0),
    galley: std('#b9bcc0', 0.3, 0.8),
    cockpitPanel: std('#3b4148', 0.75, 0.1),
    cockpitTrim: std('#2a2e33', 0.6, 0.2),
    screen: std('#000000', 0.25, 0, { emissive: new Color('#ffffff'), emissiveIntensity: 1 }),
    structure: std('#7f8994', 0.5, 0.6),
    cargo: std('#8a8f96', 0.6, 0.5),
    emissiveCabin: emissive('#fff4e0', 1.6),
  };
  for (const m of Object.values(library)) m.name ||= 'lib';
  return library;
}
