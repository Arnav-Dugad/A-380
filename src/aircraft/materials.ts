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
  // Weathering (kept subtle): panel-to-panel tone variation, grime on the lower fuselage and
  // behind the main-gear bays, and APU soot on the tail cone.
  {
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const joints = [2.3, 5.9, 11.8, 17.3, 22.8, 28.1, 33.5, 39.0, 44.4, 49.6, 54.8, 59.9, 64.6, 68.8, L];
    for (let k = 0; k < joints.length - 1; k++) {
      for (const [y0, y1] of [
        [0, 3.4],
        [3.4, MAIN_DECK_FLOOR + 1.8],
        [MAIN_DECK_FLOOR + 1.8, UPPER_DECK_FLOOR + 1.75],
        [UPPER_DECK_FLOOR + 1.75, 12],
      ] as const) {
        ctx.globalAlpha = 0.012 + rnd() * 0.02;
        band(ctx, joints[k]!, joints[k + 1]!, () => y0, () => y1, rnd() > 0.5 ? '#ffffff' : '#7d838a');
      }
    }
    for (let i = 0; i < 6; i++) {
      ctx.globalAlpha = 0.018;
      band(ctx, 31 + i * 0.6, 52 - i * 0.4, () => 0, () => 2.2 + i * 0.25, '#4b4f55');
    }
    for (let i = 0; i < 8; i++) {
      ctx.globalAlpha = 0.035;
      band(ctx, 64 + i * 0.9, L, () => 0, () => 12, '#2b2a28');
    }
    ctx.globalAlpha = 1;
  }
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
function noiseTexture(size = 256, base = 128, amp = 40, seed0 = 13): Texture {
  const [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size);
  let seed = seed0;
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

/** Tiling texture drawn by `paint`, with repeat and colour space set. */
function tile(size: number, repeat: [number, number], srgb: boolean, paint: (ctx: CanvasRenderingContext2D, rnd: () => number) => void): Texture {
  const [c, ctx] = canvas(size, size);
  let seed = 29;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  paint(ctx, rnd);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  t.colorSpace = srgb ? SRGBColorSpace : LinearSRGBColorSpace;
  return t;
}

/** Plain-weave upholstery: fine over/under threads as a bump map. */
const weaveBump = () =>
  tile(128, [10, 10], false, (ctx, rnd) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 4) {
      for (let x = 0; x < 128; x += 4) {
        const over = ((x + y) / 4) % 2 === 0;
        const v = (over ? 170 : 90) + (rnd() - 0.5) * 30;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, over ? 4 : 3, over ? 3 : 4);
      }
    }
  });

/** Leather grain: soft cellular pebbling. */
const leatherBump = () =>
  tile(256, [6, 6], false, (ctx, rnd) => {
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = 80 + rnd() * 90;
      ctx.fillStyle = `rgba(${v},${v},${v},0.55)`;
      ctx.beginPath();
      ctx.arc(rnd() * 256, rnd() * 256, 1.5 + rnd() * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

/** Cabin carpet: heathered loop pile with a quiet repeating motif. */
const carpetMap = () =>
  tile(512, [70, 9], true, (ctx, rnd) => {
    ctx.fillStyle = '#2f3845';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 26000; i++) {
      const v = rnd();
      ctx.fillStyle = v > 0.5 ? `rgba(70,84,102,${0.25 + rnd() * 0.3})` : `rgba(20,25,32,${0.25 + rnd() * 0.3})`;
      ctx.fillRect(rnd() * 512, rnd() * 512, 2, 2);
    }
    ctx.strokeStyle = 'rgba(111,160,190,0.22)';
    ctx.lineWidth = 3;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.arc(128 + (k % 2) * 256, 128 + Math.floor(k / 2) * 256, 70, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

/** Seat-back entertainment screen: a moving-map style idle screen. */
function ifeTexture(): Texture {
  const [c, ctx] = canvas(256, 160);
  const g = ctx.createLinearGradient(0, 0, 0, 160);
  g.addColorStop(0, '#0c2a4a');
  g.addColorStop(1, '#06121f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = 'rgba(62,120,96,0.55)';
  for (const [x, y, r] of [
    [60, 70, 34],
    [100, 92, 22],
    [182, 60, 40],
    [205, 112, 18],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.4, r, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#ffd27a';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(40, 110);
  ctx.quadraticCurveTo(128, 20, 215, 88);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 13px "Inter", Arial, sans-serif';
  ctx.fillText('A380 · DIGITAL TWIN', 12, 22);
  ctx.font = '11px "Inter", Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('Time to destination 6:42', 12, 148);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export type MaterialLibrary = Record<MaterialKey | 'livery', Material>;

let library: MaterialLibrary | null = null;

export function getMaterials(): MaterialLibrary {
  if (library) return library;
  const livery = makeLiveryTextures();
  const noise = noiseTexture();
  const fine = noiseTexture(256, 128, 70, 41);
  fine.repeat.set(24, 24);
  const paint = (color: string, rough = 0.3, extra: Partial<MeshPhysicalMaterial> = {}) =>
    new MeshPhysicalMaterial({ color: new Color(color), roughness: rough, metalness: 0, clearcoat: 0.75, clearcoatRoughness: 0.12, roughnessMap: noise, ...extra });
  const phys = (color: string, roughness: number, metalness: number, extra: Partial<MeshPhysicalMaterial> = {}) => new MeshPhysicalMaterial({ color: new Color(color), roughness, metalness, ...extra });
  const std = (color: string, roughness: number, metalness: number, extra: Partial<MeshStandardMaterial> = {}) =>
    new MeshStandardMaterial({ color: new Color(color), roughness, metalness, ...extra });
  const emissive = (color: string, intensity: number) =>
    new MeshStandardMaterial({ color: new Color('#111'), emissive: new Color(color), emissiveIntensity: intensity, roughness: 0.3 });
  const fabric = (color: string, sheen: string) =>
    new MeshPhysicalMaterial({ color: new Color(color), roughness: 0.92, metalness: 0, sheen: 1, sheenColor: new Color(sheen), sheenRoughness: 0.55, bumpMap: weaveBump(), bumpScale: 0.6 });
  const ife = ifeTexture();

  library = {
    livery: new MeshPhysicalMaterial({
      map: livery.map,
      bumpMap: livery.bump,
      bumpScale: 0.55,
      roughness: 0.26,
      roughnessMap: livery.rough,
      metalness: 0,
      clearcoat: 0.85,
      clearcoatRoughness: 0.1,
    }),
    paint: paint('#f1f2f3', 0.3),
    paintBelly: paint('#c3c8cd', 0.38, { clearcoat: 0.5 }),
    paintTail: paint('#1d2329', 0.28),
    composite: paint('#e2e5e8', 0.42, { clearcoat: 0.35 }),
    // painted leading edges and slats, slightly satin from erosion
    leadingEdge: paint('#d9dde1', 0.36, { clearcoat: 0.25, metalness: 0.08 }),
    inletLip: phys('#dde1e5', 0.12, 1, { anisotropy: 0.6, roughnessMap: fine }),
    metal: phys('#a9adb2', 0.32, 1, { anisotropy: 0.4 }),
    darkMetal: std('#3a3e43', 0.5, 0.6),
    gearPaint: phys('#d6d9dc', 0.34, 0, { clearcoat: 0.45, clearcoatRoughness: 0.25, roughnessMap: noise }),
    chrome: phys('#f3f5f7', 0.05, 1),
    tyre: phys('#18191a', 0.78, 0, { roughnessMap: fine, sheen: 0.25, sheenColor: new Color('#3a3a3a'), sheenRoughness: 0.8 }),
    hub: phys('#b6babf', 0.3, 1, { anisotropy: 0.3 }),
    glass: new MeshPhysicalMaterial({ color: new Color('#0d171d'), roughness: 0.02, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.01, specularIntensity: 1, ior: 1.6, envMapIntensity: 2.2 }),
    window: new MeshPhysicalMaterial({ color: new Color('#0b1116'), roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, ior: 1.55, envMapIntensity: 1.8 }),
    seal: std('#16191c', 0.6, 0.1),
    fan: phys('#9aa1a9', 0.24, 1, { side: DoubleSide, anisotropy: 0.5 }),
    inlet: std('#2a2e33', 0.62, 0.3),
    exhaust: phys('#6a5e54', 0.42, 0.95, { roughnessMap: noise }),
    lightRed: emissive('#ff2a2a', 4),
    lightGreen: emissive('#2aff6a', 4),
    lightWhite: emissive('#ffffff', 5),
    lightAmber: emissive('#ffb347', 3),
    cabinWall: std('#ece9e3', 0.62, 0, { side: DoubleSide, roughnessMap: noise }),
    cabinFloor: std('#3d4148', 0.8, 0),
    carpet: std('#ffffff', 1, 0, { map: carpetMap() }),
    seatFabric: fabric('#2c3a4e', '#7f93ad'),
    seatFabricBiz: fabric('#2a2e35', '#8a929c'),
    seatFabricFirst: fabric('#6d5c49', '#c9b79f'),
    leather: phys('#7a5f45', 0.48, 0, { clearcoat: 0.25, clearcoatRoughness: 0.4, bumpMap: leatherBump(), bumpScale: 0.5, sheen: 0.4, sheenColor: new Color('#b49a7e') }),
    plastic: phys('#e3e0da', 0.42, 0, { clearcoat: 0.15, clearcoatRoughness: 0.5 }),
    bezel: phys('#dcd9d3', 0.36, 0, { clearcoat: 0.2 }),
    galley: phys('#c9ccd0', 0.3, 1, { anisotropy: 0.7 }),
    cockpitPanel: std('#4f5862', 0.72, 0.05, { roughnessMap: noise }),
    cockpitTrim: std('#23272c', 0.55, 0.15),
    screen: std('#000000', 0.25, 0, { emissive: new Color('#ffffff'), emissiveIntensity: 1 }),
    ifeScreen: std('#000000', 0.2, 0, { map: ife, emissive: new Color('#ffffff'), emissiveMap: ife, emissiveIntensity: 0.85 }),
    structure: std('#7f8994', 0.5, 0.6),
    cargo: std('#8a8f96', 0.6, 0.5),
    emissiveCabin: emissive('#fff4e0', 1.6),
  };
  for (const m of Object.values(library)) m.name ||= 'lib';
  return library;
}
