/**
 * Raster viewport shading modes. Each swaps in one override material for the whole scene, hides
 * the sky and weather shaders, and puts a neutral backdrop behind the model, as a modelling
 * application's viewport does. Material preview (the default) leaves the scene untouched.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { lazy, Suspense, useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, Color, Material, MeshBasicMaterial, MeshMatcapMaterial, MeshNormalMaterial, SRGBColorSpace, type Fog, type Mesh, type Object3D, type Texture } from 'three';
import { canvasRef, TONE_MAPS } from './output';
import { useRender, type Shading } from './renderState';

/** Soft clay matcap: warm key light from the upper left, cool fill and a gentle rim. */
function clayMatcap(): CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(s, s);
  const key = [-0.45, 0.6, 0.66];
  const kl = Math.hypot(key[0]!, key[1]!, key[2]!);
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const nx = (x / (s - 1)) * 2 - 1;
      const ny = 1 - (y / (s - 1)) * 2;
      const r2 = nx * nx + ny * ny;
      const i = (y * s + x) * 4;
      if (r2 > 1) {
        img.data[i + 3] = 255;
        continue;
      }
      const nz = Math.sqrt(1 - r2);
      const d = Math.max(0, (nx * key[0]! + ny * key[1]! + nz * key[2]!) / kl);
      const fill = Math.max(0, (-nx * 0.5 + nz * 0.5 - ny * 0.2) / 0.75) * 0.18;
      const rim = Math.pow(1 - nz, 3) * 0.22;
      const spec = Math.pow(d, 40) * 0.25;
      const v = 0.16 + d * 0.62 + fill + rim + spec;
      img.data[i] = Math.min(255, v * 238);
      img.data[i + 1] = Math.min(255, v * 232);
      img.data[i + 2] = Math.min(255, v * 226);
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Multiplies the output by the per-vertex baked occlusion (`_ao`, default 1 where absent). */
function withAO<T extends Material>(m: T, floor: number, gamma: number): T {
  (m as unknown as { defaultAttributeValues: Record<string, number[]> }).defaultAttributeValues = { _ao: [1] };
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float _ao;\nvarying float vAO;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAO = _ao;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAO;')
      .replace('#include <opaque_fragment>', `outgoingLight *= mix(${floor.toFixed(2)}, 1.0, pow(clamp(vAO, 0.0, 1.0), ${gamma.toFixed(2)}));\n#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `shadingAO${floor}${gamma}`;
  return m;
}

const BACKDROP: Partial<Record<Shading, string>> = { wireframe: '#1c2026', solid: '#3a3f46', ao: '#2c3036', normals: '#2a2d33' };

function isHideable(o: Object3D): boolean {
  if ((o as { isPoints?: boolean }).isPoints || (o as { isLine?: boolean }).isLine || (o as { isSprite?: boolean }).isSprite) return true;
  const m = (o as Mesh).material;
  if (!m) return false;
  return (Array.isArray(m) ? m : [m]).some((x) => (x as { isShaderMaterial?: boolean }).isShaderMaterial);
}

export function ShadingModes() {
  const shading = useRender((s) => s.shading);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const tone = useRender((s) => s.toneMapping);
  useEffect(() => {
    gl.toneMapping = TONE_MAPS[tone];
  }, [gl, tone]);
  useEffect(() => {
    canvasRef.el = gl.domElement;
  }, [gl]);
  const materials = useMemo(() => {
    const solid = withAO(new MeshMatcapMaterial({ matcap: clayMatcap(), color: '#e4e1dc' }), 0.45, 1.3);
    const ao = withAO(new MeshBasicMaterial({ color: '#ffffff' }), 0.0, 1.6);
    const wire = new MeshBasicMaterial({ color: '#9fb6cc', wireframe: true, transparent: true, opacity: 0.55, depthWrite: false });
    const normals = new MeshNormalMaterial();
    for (const m of [solid, ao, wire, normals]) m.toneMapped = false;
    return { solid, ao, wireframe: wire, normals } as Partial<Record<Shading, Material>>;
  }, []);
  const override = materials[shading];
  const state = useRef<{ hidden: Object3D[]; bg: Color | Texture | null; fog: Fog | null; mine: Color } | null>(null);

  useEffect(() => {
    if (!override) return;
    const mine = new Color(BACKDROP[shading] ?? '#2a2d33');
    state.current = { hidden: [], bg: scene.background as Color | Texture | null, fog: scene.fog as Fog | null, mine };
    scene.overrideMaterial = override;
    return () => {
      const s = state.current;
      scene.overrideMaterial = null;
      if (s) {
        for (const o of s.hidden) o.visible = true;
        if (scene.background === s.mine) scene.background = s.bg;
        if (!scene.fog) scene.fog = s.fog;
      }
      state.current = null;
    };
  }, [override, shading, scene]);

  // The world may change underneath (environment, weather): keep the backdrop and hidden set current
  const tick = useRef(0);
  useFrame(() => {
    const s = state.current;
    if (!s) return;
    if (scene.background !== s.mine) {
      s.bg = scene.background as Color | Texture | null;
      scene.background = s.mine;
    }
    if (scene.fog) {
      s.fog = scene.fog as Fog;
      scene.fog = null;
    }
    if (tick.current++ % 30 === 0)
      scene.traverse((o) => {
        if (o.visible && isHideable(o)) {
          o.visible = false;
          s.hidden.push(o);
        }
      });
  });
  return null;
}

const PathTracerImpl = lazy(() => import('./PathTracer'));

/** Rendered shading: the path tracer and its library load only when first used. */
export function PathTracer() {
  const shading = useRender((s) => s.shading);
  if (shading !== 'rendered') return null;
  return (
    <Suspense fallback={null}>
      <PathTracerImpl />
    </Suspense>
  );
}
