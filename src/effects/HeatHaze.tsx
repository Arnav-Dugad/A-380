/**
 * Engine exhaust heat haze: a screen-space refraction behind each running engine. Each plume
 * is projected to the screen as a widening segment from the nozzle aft; pixels near it are
 * displaced by animated noise, more strongly with fan speed and nearer the nozzle.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import { useMemo } from 'react';
import { Uniform, Vector2, Vector3, Vector4, type PerspectiveCamera } from 'three';
import { engineFrames } from '../aircraft/geometry/engine';
import { systems } from '../sim/systems';
import { worldFrame } from '../scene/worldFrame';

const FRAG = /* glsl */ `
uniform vec4 uSeg[4];
uniform vec4 uPar[4];
uniform float uTime;
uniform float uAspect;

float hn(vec2 p) {
  return sin(p.x * 1.7 + sin(p.y * 2.3 + uTime * 3.1)) * cos(p.y * 1.3 - uTime * 4.7 + sin(p.x * 0.9));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 off = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    float strength = uPar[i].y;
    if (strength <= 0.0) continue;
    vec2 a = uSeg[i].xy;
    vec2 b = uSeg[i].zw;
    vec2 ab = b - a;
    float t = clamp(dot(uv - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
    vec2 d = (uv - (a + ab * t)) * vec2(uAspect, 1.0);
    float w = uPar[i].x * mix(0.8, 2.6, t);
    float fall = smoothstep(w, 0.0, length(d)) * smoothstep(0.0, 0.06, t) * (1.0 - t);
    vec2 q = uv * vec2(uAspect, 1.0) * uPar[i].z;
    off += strength * fall * vec2(hn(q), hn(q.yx + 7.3));
  }
  outputColor = texture2D(inputBuffer, uv + off * 0.0035);
}
`;

class HeatHazeEffect extends Effect {
  constructor() {
    super('HeatHaze', FRAG, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['uSeg', new Uniform(Array.from({ length: 4 }, () => new Vector4()))],
        ['uPar', new Uniform(Array.from({ length: 4 }, () => new Vector4()))],
        ['uTime', new Uniform(0)],
        ['uAspect', new Uniform(1)],
      ]),
    });
  }
}

const frames = engineFrames();
const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();
const ndc = new Vector2();

export function HeatHaze() {
  const effect = useMemo(() => new HeatHazeEffect(), []);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  useFrame((st) => {
    const u = effect.uniforms;
    u.get('uTime')!.value = st.clock.elapsedTime;
    u.get('uAspect')!.value = size.width / Math.max(1, size.height);
    const seg = u.get('uSeg')!.value as Vector4[];
    const par = u.get('uPar')!.value as Vector4[];
    const ac = worldFrame.aircraft;
    frames.forEach((f, i) => {
      const e = systems.state.engines[i];
      const n1 = e?.n1 ?? 0;
      const k = Math.max(0, Math.min(1, (n1 - 12) / 70));
      if (!ac || k <= 0) {
        par[i]!.set(0, 0, 0, 0);
        return;
      }
      // nozzle (engine-local −9.0 m) and the end of the visible plume, in world space
      tmpA.set(f.origin[0] - 9.0, f.origin[1] - 0.15, f.origin[2]).applyMatrix4(ac.matrixWorld);
      tmpB.set(f.origin[0] - 9.0 - (14 + 26 * k), f.origin[1] - 0.6, f.origin[2]).applyMatrix4(ac.matrixWorld);
      tmpC.copy(tmpA).project(camera);
      if (tmpC.z > 1) {
        par[i]!.set(0, 0, 0, 0);
        return;
      }
      ndc.set(tmpC.x * 0.5 + 0.5, tmpC.y * 0.5 + 0.5);
      const near = tmpC.clone();
      tmpC.copy(tmpB).project(camera);
      seg[i]!.set(ndc.x, ndc.y, tmpC.x * 0.5 + 0.5, tmpC.y * 0.5 + 0.5);
      // plume radius at the nozzle (≈0.7 m) in screen units
      const d = Math.max(1, camera.position.distanceTo(tmpA));
      const halfH = Math.tan((camera.fov * Math.PI) / 360);
      const r = 0.7 / (d * halfH * 2);
      par[i]!.set(Math.min(0.2, r), k * (near.z < 1 ? 1 : 0), 18 / Math.max(0.02, r * 60), 0);
    });
  });
  return <primitive object={effect} />;
}
