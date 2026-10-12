/**
 * Applies the per-vertex ambient occlusion baked by scripts/bake-ao.ts (`_ao` attribute).
 * Occlusion dims indirect light (sky, hemisphere and environment reflections) fully and
 * direct light only slightly, which is what a crevice, gear bay or wing root does in reality.
 */
import { BufferAttribute, type BufferGeometry, type Material, type Mesh } from 'three';

const patched = new WeakSet<Material>();

const FRAGMENT = /* glsl */ `
#include <aomap_fragment>
{
  // keep a floor: bounce light from the ground still reaches gear bays and wing roots
  float bakedOcc = mix(0.22, 1.0, smoothstep(0.0, 1.0, clamp(vBakedAO, 0.0, 1.0)));
  reflectedLight.indirectDiffuse *= bakedOcc;
  reflectedLight.directDiffuse *= mix(1.0, bakedOcc, 0.3);
  #if defined( USE_CLEARCOAT )
    clearcoatSpecularIndirect *= bakedOcc;
  #endif
  #if defined( USE_SHEEN )
    sheenSpecularIndirect *= bakedOcc;
  #endif
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    float bakedNV = saturate( dot( geometryNormal, geometryViewDir ) );
    reflectedLight.indirectSpecular *= computeSpecularOcclusion( bakedNV, bakedOcc, material.roughness );
  #endif
}
`;

/** Patch a material (idempotent). Clones must be patched again: onBeforeCompile is not copied. */
export function withBakedAO<T extends Material>(m: T): T {
  if (patched.has(m)) return m;
  patched.add(m);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    if (!shader.fragmentShader.includes('#include <aomap_fragment>')) return;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _ao;\nvarying float vBakedAO;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBakedAO = _ao;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBakedAO;')
      .replace('#include <aomap_fragment>', FRAGMENT);
  };
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${prevKey()}|bakedAO`;
  return m;
}

/** Meshes without baked data get a neutral attribute so shared, patched materials stay valid. */
export function ensureAOAttribute(mesh: Mesh): void {
  const g = mesh.geometry as BufferGeometry;
  if (g.getAttribute('_ao')) return;
  const n = g.getAttribute('position')?.count ?? 0;
  g.setAttribute('_ao', new BufferAttribute(new Float32Array(n).fill(1), 1));
}
