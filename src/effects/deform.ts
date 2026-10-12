/**
 * Vertex-shader deformations shared by every exterior material:
 *  - wing bending: outboard of the wing root the skin (and everything hung from it: engines,
 *    pylons, slats, flaps) is lifted by a quadratic of span. On the ground the full tanks make
 *    the tips droop; in flight lift bends them up by a few metres, more with load factor.
 *  - tyre squash: tyre vertices below the ground plane are flattened onto it, giving each
 *    loaded tyre a contact patch.
 * The aircraft frame is passed in so the effect is independent of where the aircraft is.
 */
import { Matrix4, Vector3, type Material } from 'three';

export const deform = {
  uFlex: { value: -0.28 },
  uAircraftInv: { value: new Matrix4() },
  uAircraftUp: { value: new Vector3(0, 1, 0) },
  uGround: { value: 0.045 },
};

/** Model-space wing-bending offset at span |z| (metres, up positive) — for CPU-side helpers. */
export function flexAt(z: number, x = 0): number {
  if (x < -23 || Math.abs(z) < 3.4) return 0;
  const t = Math.min(1, (Math.abs(z) - 3.4) / 36.4);
  return deform.uFlex.value * t * t;
}

const VERT_DECL = /* glsl */ `
uniform float uFlex;
uniform mat4 uAircraftInv;
uniform vec3 uAircraftUp;
uniform float uGround;
`;

const FLEX = /* glsl */ `
{
  vec4 wpF = modelMatrix * vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wpF = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  #endif
  vec3 ap = (uAircraftInv * wpF).xyz;
  float az = abs(ap.z);
  if (ap.x > -23.0 && az > 3.4) {
    float t = min(1.0, (az - 3.4) / 36.4);
    mvPosition.xyz += (viewMatrix * vec4(uAircraftUp * (uFlex * t * t), 0.0)).xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
}
`;

const SQUASH = /* glsl */ `
{
  vec4 wpS = modelMatrix * vec4(transformed, 1.0);
  float lift = uGround - wpS.y;
  if (lift > 0.0 && lift < 0.2) {
    mvPosition.xyz += (viewMatrix * vec4(0.0, lift, 0.0, 0.0)).xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
}
`;

const patched = new WeakSet<Material>();

/** Add the deformations to a material (idempotent; chains any existing onBeforeCompile). */
export function withDeform<T extends Material>(m: T, kind: 'flex' | 'tyre'): T {
  if (patched.has(m)) return m;
  patched.add(m);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    if (!shader.vertexShader.includes('#include <project_vertex>')) return;
    Object.assign(shader.uniforms, deform);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${FLEX}${kind === 'tyre' ? SQUASH : ''}`);
  };
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${prevKey()}|deform-${kind}`;
  return m;
}
