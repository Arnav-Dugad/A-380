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
  Vector2,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Material,
  type Texture,
} from 'three';
import type { MaterialKey } from './geometry/parts';
import type { Quality } from '../state/ui';
import { disposeAtlas, initialAtlas, paintAtlas, type AtlasTextures } from './textures/atlases';
import type { AtlasKind } from './textures/atlas.worker';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
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
export const leatherBump = () =>
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

/** Cabin carpet: heathered taupe loop pile with a faint tonal motif. */
const carpetMap = () =>
  tile(512, [70, 9], true, (ctx, rnd) => {
    ctx.fillStyle = '#5b5852';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 26000; i++) {
      const v = rnd();
      ctx.fillStyle = v > 0.5 ? `rgba(120,114,104,${0.25 + rnd() * 0.3})` : `rgba(40,38,35,${0.25 + rnd() * 0.3})`;
      ctx.fillRect(rnd() * 512, rnd() * 512, 2, 2);
    }
    ctx.strokeStyle = 'rgba(150,140,120,0.16)';
    ctx.lineWidth = 3;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.arc(128 + (k % 2) * 256, 128 + Math.floor(k / 2) * 256, 70, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

/** Diamond-quilted upholstery: stitched lattice with padded cells (bump). */
const quiltBump = (repeat: number) =>
  tile(256, [repeat, repeat], false, (ctx) => {
    const S = 256;
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        // distance to the nearest diagonal stitch line (two diamonds per tile)
        const u = ((x + y) / S) * 2;
        const v = ((x - y + S) / S) * 2;
        const du = Math.abs(u - Math.round(u));
        const dv = Math.abs(v - Math.round(v));
        const d = Math.min(du, dv);
        const puff = Math.sin(Math.min(1, d / 0.5) * Math.PI * 0.5);
        const stitch = d < 0.025 ? 0.55 : 1;
        const g = (70 + 150 * puff) * stitch;
        const o = (y * S + x) * 4;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = g;
        img.data[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
  });

/** Economy fabric: pale grey fading to aqua towards the cushion, finely stippled. */
const economyFabricMap = () =>
  tile(512, [1, 1], true, (ctx, rnd) => {
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#d4dadd');
    g.addColorStop(0.55, '#b7cdd6');
    g.addColorStop(1, '#8fc0d1');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 3)
      for (let x = 0; x < 512; x += 3) {
        const k = rnd();
        if (k > 0.55) {
          ctx.fillStyle = k > 0.8 ? 'rgba(255,255,255,0.28)' : 'rgba(50,80,95,0.14)';
          ctx.fillRect(x, y, 2, 2);
        }
      }
  });

/** Printed cushion fabric: drifting leaf motif on taupe (headrest covers, pillows). */
const cushionMap = () =>
  tile(512, [2, 2], true, (ctx, rnd) => {
    ctx.fillStyle = '#8f8a84';
    ctx.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 220; k++) {
      ctx.save();
      ctx.translate(rnd() * 512, rnd() * 512);
      ctx.rotate(rnd() * Math.PI * 2);
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(78,64,52,0.65)' : 'rgba(200,190,175,0.5)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 6 + rnd() * 9, 2.5 + rnd() * 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });

/** Walnut veneer: long figured grain with lacquer depth. */
const woodMap = () =>
  tile(512, [1, 1], true, (ctx, rnd) => {
    ctx.fillStyle = '#6a4a31';
    ctx.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 140; k++) {
      const y0 = rnd() * 512;
      const amp = 4 + rnd() * 18;
      const ph = rnd() * 6;
      ctx.strokeStyle = rnd() > 0.5 ? `rgba(40,24,14,${0.2 + rnd() * 0.35})` : `rgba(160,118,80,${0.15 + rnd() * 0.25})`;
      ctx.lineWidth = 0.6 + rnd() * 2.6;
      ctx.beginPath();
      for (let x = 0; x <= 512; x += 8) {
        const y = y0 + Math.sin(x / 70 + ph) * amp + Math.sin(x / 23 + ph * 2) * amp * 0.2;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });

/** Pale stone with soft grey veining. */
const marbleMap = () =>
  tile(512, [1, 1], true, (ctx, rnd) => {
    ctx.fillStyle = '#ebe7e0';
    ctx.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 26; k++) {
      ctx.strokeStyle = `rgba(120,116,110,${0.08 + rnd() * 0.25})`;
      ctx.lineWidth = 0.5 + rnd() * 2;
      ctx.beginPath();
      let x = rnd() * 512;
      let y = rnd() * 512;
      ctx.moveTo(x, y);
      for (let s = 0; s < 20; s++) {
        x += (rnd() - 0.3) * 40;
        y += (rnd() - 0.5) * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });

/** Illuminated EXIT sign face. */
function exitSignMap(): Texture {
  const [c, ctx] = canvas(256, 96);
  ctx.fillStyle = '#c4161c';
  ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 64px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EXIT', 128, 52);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Acoustic liner: a fine grid of perforations. */
const linerBump = () =>
  tile(128, [60, 14], false, (ctx) => {
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#3a3a3a';
    for (let y = 0; y < 128; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < 128; x += 8) ctx.fillRect(x + 2, y + 2, 3, 3);
  });

/** Spinner: polished metal with a white spiral (reduces bird strikes, signals rotation to ground crew). */
function spinnerMap(): Texture {
  const [c, ctx] = canvas(256, 512);
  const img = ctx.createImageData(256, 512);
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 256; x++) {
      const u = x / 256; // along the spinner, tip at 1
      const v = y / 512; // around
      const f = (((v - u * 0.9) % 1) + 1) % 1;
      const white = f < 0.09 && u > 0.12;
      const o = (y * 256 + x) * 4;
      const g = white ? 245 : 120;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = g;
      img.data[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapT = RepeatWrapping;
  return t;
}

/** Seat-back entertainment screen: a welcome page with content tiles (fictional branding). */
function ifeTexture(): Texture {
  const [c, ctx] = canvas(512, 320);
  const bg = ctx.createLinearGradient(0, 0, 512, 320);
  bg.addColorStop(0, '#0d2033');
  bg.addColorStop(1, '#173a52');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 320);
  // hero banner: a sunset over a wing
  const sky = ctx.createLinearGradient(0, 40, 0, 170);
  sky.addColorStop(0, '#f2a65a');
  sky.addColorStop(1, '#5b3a6e');
  ctx.fillStyle = sky;
  ctx.fillRect(20, 46, 472, 124);
  ctx.fillStyle = 'rgba(20,20,30,0.85)';
  ctx.beginPath();
  ctx.moveTo(20, 150);
  ctx.lineTo(380, 118);
  ctx.lineTo(492, 124);
  ctx.lineTo(492, 170);
  ctx.lineTo(20, 170);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '300 34px Inter, Arial, sans-serif';
  ctx.fillText('Welcome aboard', 36, 92);
  ctx.font = '500 13px Inter, Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('A380 · DIGITAL TWIN', 38, 116);
  const tiles = ['Movies', 'TV', 'Music', 'Map', 'Games'];
  tiles.forEach((t, i) => {
    const x = 20 + i * 96;
    ctx.fillStyle = ['#2b6c8f', '#7a4d8f', '#3f8f6a', '#8f6a2b', '#8f2b4d'][i]!;
    ctx.fillRect(x, 190, 88, 84);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 13px Inter, Arial, sans-serif';
    ctx.fillText(t, x + 8, 290);
  });
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Previous idle screen, kept for reference. */
export function movingMapTexture(): Texture {
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

export type MaterialLibrary = Record<MaterialKey, Material>;

/** Atlas-textured skins: map + normal + packed roughness (G) / metalness (B). */
function atlasMaterial(t: AtlasTextures, o: { clearcoat: number; clearcoatRoughness: number; normal: number }): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    map: t.map,
    normalMap: t.normalMap,
    normalScale: new Vector2(o.normal, o.normal),
    roughnessMap: t.ormMap,
    metalnessMap: t.ormMap,
    roughness: 1,
    metalness: 1,
    clearcoat: o.clearcoat,
    clearcoatRoughness: o.clearcoatRoughness,
    clearcoatNormalMap: t.normalMap,
    clearcoatNormalScale: new Vector2(o.normal * 0.7, o.normal * 0.7),
  });
}

const atlasOwners: Partial<Record<AtlasKind, { tex: AtlasTextures; materials: MeshPhysicalMaterial[] }>> = {};
let atlasQuality: Quality | null = null;

/**
 * Repaint the skin atlases for a graphics preset and swap them into the shared materials.
 * Resolves once every atlas is in place (painting runs in a worker).
 */
export async function setAtlasQuality(q: Quality, onSwap?: () => void): Promise<void> {
  if (atlasQuality === q) return;
  atlasQuality = q;
  getMaterials();
  for (const kind of ['fuselage', 'wing', 'tail', 'nacelle', 'tyre'] as AtlasKind[]) {
    const t = await paintAtlas(kind, q);
    if (!t || atlasQuality !== q) {
      if (t) disposeAtlas(t);
      continue;
    }
    const owner = atlasOwners[kind];
    if (!owner) continue;
    for (const m of owner.materials) {
      if (m.map && t.map) m.map = t.map;
      m.normalMap = t.normalMap;
      if (m.clearcoatNormalMap) m.clearcoatNormalMap = t.normalMap;
      m.roughnessMap = t.ormMap;
      if (m.metalnessMap) m.metalnessMap = t.ormMap;
    }
    disposeAtlas(owner.tex);
    owner.tex = t;
    onSwap?.();
  }
}

let library: MaterialLibrary | null = null;

export function getMaterials(): MaterialLibrary {
  if (library) return library;
  const fus = initialAtlas('fuselage');
  const wingTex = initialAtlas('wing');
  const nac = initialAtlas('nacelle');
  const tailTex = initialAtlas('tail');
  const tyreTex = initialAtlas('tyre');
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
    livery: atlasMaterial(fus, { clearcoat: 0.85, clearcoatRoughness: 0.08, normal: 1 }),
    wingSkin: atlasMaterial(wingTex, { clearcoat: 0.35, clearcoatRoughness: 0.28, normal: 1 }),
    nacelle: atlasMaterial(nac, { clearcoat: 0.75, clearcoatRoughness: 0.1, normal: 1 }),
    tailSkin: atlasMaterial(tailTex, { clearcoat: 0.7, clearcoatRoughness: 0.12, normal: 1 }),
    lens: new MeshPhysicalMaterial({ color: new Color('#eef4f8'), roughness: 0.03, metalness: 0, transparent: true, opacity: 0.32, clearcoat: 1, clearcoatRoughness: 0.02, ior: 1.5, depthWrite: false }),
    liner: phys('#2b2f33', 0.7, 0.2, { bumpMap: linerBump(), bumpScale: 0.8 }),
    spinner: phys('#ffffff', 0.25, 0.85, { map: spinnerMap(), clearcoat: 0.4 }),
    paint: paint('#f1f2f3', 0.3),
    paintBelly: paint('#c3c8cd', 0.38, { clearcoat: 0.5 }),
    paintTail: paint('#1d2329', 0.28),
    composite: paint('#e2e5e8', 0.42, { clearcoat: 0.35 }),
    // painted leading edges and slats, slightly satin from erosion
    leadingEdge: paint('#d9dde1', 0.36, { clearcoat: 0.25, metalness: 0.08 }),
    inletLip: phys('#dde1e5', 0.3, 1, { anisotropy: 0.6, roughnessMap: fine }),
    metal: phys('#a9adb2', 0.32, 1, { anisotropy: 0.4 }),
    darkMetal: std('#3a3e43', 0.5, 0.6),
    gearPaint: phys('#d6d9dc', 0.34, 0, { clearcoat: 0.45, clearcoatRoughness: 0.25, roughnessMap: noise }),
    chrome: phys('#f3f5f7', 0.05, 1),
    tyre: phys('#18191a', 1, 0, { roughnessMap: tyreTex.ormMap, normalMap: tyreTex.normalMap, normalScale: new Vector2(1.2, 1.2), sheen: 0.25, sheenColor: new Color('#3a3a3a'), sheenRoughness: 0.8 }),
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
    cabinWall: std('#efe8dc', 0.62, 0, { side: DoubleSide, roughnessMap: noise }),
    cushion: new MeshPhysicalMaterial({ color: '#ffffff', map: cushionMap(), roughness: 0.95, sheen: 0.8, sheenColor: new Color('#d8cbb8'), sheenRoughness: 0.6, bumpMap: weaveBump(), bumpScale: 0.4 }),
    wood: phys('#ffffff', 0.32, 0, { map: woodMap(), clearcoat: 0.85, clearcoatRoughness: 0.12 }),
    marble: phys('#ffffff', 0.18, 0, { map: marbleMap(), clearcoat: 1, clearcoatRoughness: 0.05 }),
    bottle: new MeshPhysicalMaterial({ color: '#3a1c08', roughness: 0.08, emissive: new Color('#d08a3a'), emissiveIntensity: 0.9, clearcoat: 1, transparent: true, opacity: 0.92 }),
    exitSign: std('#ffffff', 0.4, 0, { map: exitSignMap(), emissive: new Color('#ffffff'), emissiveMap: exitSignMap(), emissiveIntensity: 1.6 }),
    pathLight: emissive('#ffcf7a', 1.2),
    sheepskin: new MeshPhysicalMaterial({ color: '#e9e0cf', roughness: 1, sheen: 1, sheenColor: new Color('#fffaf0'), sheenRoughness: 0.9, bumpMap: leatherBump(), bumpScale: 1.6 }),
    visor: new MeshPhysicalMaterial({ color: '#3a2f1a', roughness: 0.1, transparent: true, opacity: 0.55, clearcoat: 1, side: DoubleSide, depthWrite: false }),
    curtain: new MeshPhysicalMaterial({ color: '#8f8474', roughness: 0.9, sheen: 1, sheenColor: new Color('#cbbda8'), sheenRoughness: 0.5, side: DoubleSide, bumpMap: weaveBump(), bumpScale: 0.3 }),
    cabinFloor: std('#3d4148', 0.8, 0),
    carpet: std('#ffffff', 1, 0, { map: carpetMap() }),
    seatFabric: (() => {
      const m = fabric('#ffffff', '#cfe4ec');
      m.map = economyFabricMap();
      return m;
    })(),
    // business: cream leather, diamond quilted
    seatFabricBiz: phys('#e6dac4', 0.5, 0, { clearcoat: 0.2, clearcoatRoughness: 0.45, bumpMap: quiltBump(7), bumpScale: 1.4, sheen: 0.4, sheenColor: new Color('#fff4e2') }),
    // premium economy: cream quilted leather as in the references
    seatFabricFirst: phys('#ece2cf', 0.5, 0, { clearcoat: 0.2, clearcoatRoughness: 0.45, bumpMap: quiltBump(9), bumpScale: 1.4, sheen: 0.4, sheenColor: new Color('#fff6e6') }),
    leather: phys('#e8dcc6', 0.46, 0, { clearcoat: 0.25, clearcoatRoughness: 0.4, bumpMap: quiltBump(6), bumpScale: 1.2, sheen: 0.4, sheenColor: new Color('#fff2dc') }),
    plastic: phys('#e9e1d2', 0.42, 0, { clearcoat: 0.15, clearcoatRoughness: 0.5 }),
    bezel: phys('#d6c8af', 0.3, 0.35, { clearcoat: 0.3 }),
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
  library.tyre.userData.tyre = true; // X-ray/highlight variants keep the contact-patch squash
  const L = library as Record<MaterialKey, MeshPhysicalMaterial>;
  atlasOwners.fuselage = { tex: fus, materials: [L.livery] };
  atlasOwners.wing = { tex: wingTex, materials: [L.wingSkin] };
  atlasOwners.nacelle = { tex: nac, materials: [L.nacelle] };
  atlasOwners.tail = { tex: tailTex, materials: [L.tailSkin] };
  atlasOwners.tyre = { tex: tyreTex, materials: [L.tyre] };
  return library;
}
