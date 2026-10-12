/**
 * World and lighting environments: studio, airport apron, golden-hour runway, blue-hour
 * hangar and night inspection, plus weather (overcast, rain, fog, wind) and the flight
 * world with an endless ground plane. A floating origin keeps the aircraft near the render
 * origin so precision never degrades in flight.
 */
import { Environment, Lightformer, MeshReflectorMaterial, Sky, Stars } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import {
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  ShaderMaterial,
  Vector3,
  type Mesh,
} from 'three';
import { useRender } from '../render/renderState';
import { useUI, type EnvPreset, type Weather } from '../state/ui';
import { Airport } from './airport/Airport';
import { STAND } from './airport/layout';
import { worldFrame } from './worldFrame';

export interface EnvLook {
  sunElevation: number; // degrees
  sunAzimuth: number; // degrees from north, clockwise
  sunIntensity: number;
  sunColor: string;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fog: string;
  exposure: number;
  outdoor: boolean;
  night: boolean;
}

const LOOKS: Record<EnvPreset, EnvLook> = {
  studio: { sunElevation: 55, sunAzimuth: 135, sunIntensity: 2.2, sunColor: '#ffffff', hemiSky: '#c8d6e5', hemiGround: '#1a1e24', hemiIntensity: 0.25, fog: '#0d1014', exposure: 1.0, outdoor: false, night: false },
  apron: { sunElevation: 52, sunAzimuth: 210, sunIntensity: 3.0, sunColor: '#fff6e8', hemiSky: '#b9d3f0', hemiGround: '#6b6a62', hemiIntensity: 0.55, fog: '#c9d8e6', exposure: 0.82, outdoor: true, night: false },
  golden: { sunElevation: 8, sunAzimuth: 268, sunIntensity: 3.4, sunColor: '#ffb36b', hemiSky: '#ffc999', hemiGround: '#3d3026', hemiIntensity: 0.45, fog: '#e7b48a', exposure: 1.05, outdoor: true, night: false },
  hangar: { sunElevation: -4, sunAzimuth: 280, sunIntensity: 0.0, sunColor: '#9fbaff', hemiSky: '#9fb6d9', hemiGround: '#2b3038', hemiIntensity: 0.35, fog: '#1b2433', exposure: 1.0, outdoor: false, night: false },
  night: { sunElevation: 38, sunAzimuth: 150, sunIntensity: 0.25, sunColor: '#9fb3ff', hemiSky: '#1b2a44', hemiGround: '#0b0d10', hemiIntensity: 0.18, fog: '#070b12', exposure: 0.9, outdoor: true, night: true },
};

/**
 * Image-based lighting: CC0 HDR panoramas (Poly Haven, via the three.js examples and
 * @pmndrs/assets) light and reflect on the aircraft. `sunU` is the horizontal texture
 * coordinate of the sun in the panorama; the panorama is rotated so it agrees with the
 * shadow-casting sun. `ground` paints a concrete disc into the probe below the horizon.
 */
interface Hdri {
  file: string;
  intensity: number;
  sunU?: number;
  ground?: string;
}
const HDRI: Partial<Record<EnvPreset | 'interior', Hdri>> = {
  apron: { file: 'sky.exr', intensity: 0.9, sunU: 0.594, ground: '#77756f' },
  golden: { file: 'blouberg_sunrise_2_1k.hdr', intensity: 1.0, sunU: 0.056 },
  night: { file: 'moonless_golf_1k.hdr', intensity: 1.6 },
  hangar: { file: 'warehouse.exr', intensity: 0.7 },
  interior: { file: 'warehouse.exr', intensity: 0.6 },
};
const HDRI_BASE = `${import.meta.env.BASE_URL}hdri/`;

const WEATHER: Record<Weather, { fogFar: number; sunK: number; cloud: number; rain: number; wind: number; gust: number; turb: number; grey: number }> = {
  clear: { fogFar: 26000, sunK: 1, cloud: 0.15, rain: 0, wind: 6, gust: 0, turb: 0.05, grey: 0 },
  overcast: { fogFar: 9000, sunK: 0.35, cloud: 0.95, rain: 0, wind: 10, gust: 5, turb: 0.2, grey: 0.6 },
  lightRain: { fogFar: 5000, sunK: 0.25, cloud: 1, rain: 0.35, wind: 12, gust: 6, turb: 0.3, grey: 0.7 },
  heavyRain: { fogFar: 1800, sunK: 0.15, cloud: 1, rain: 1, wind: 18, gust: 12, turb: 0.55, grey: 0.85 },
  fog: { fogFar: 450, sunK: 0.3, cloud: 0.6, rain: 0, wind: 3, gust: 0, turb: 0, grey: 0.75 },
  windy: { fogFar: 20000, sunK: 0.9, cloud: 0.4, rain: 0, wind: 28, gust: 14, turb: 0.6, grey: 0.15 },
};
export const weatherParams = WEATHER;

/** Sun direction (unit vector, pointing from the scene towards the sun) in world axes. */
export function sunDirection(elevDeg: number, azDeg: number): Vector3 {
  const e = MathUtils.degToRad(elevDeg);
  const a = MathUtils.degToRad(azDeg);
  // azimuth from north (−Z) clockwise towards east (+X)
  return new Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
}

/** Look for the current preset, with flight-mode time of day overriding the sun. */
export function currentLook(): EnvLook & { weather: (typeof WEATHER)[Weather] } {
  const ui = useUI.getState();
  const base = { ...LOOKS[ui.env] };
  if (ui.section === 'flight') {
    // time of day drives the sun in flight mode (simple diurnal arc)
    const h = ui.timeOfDay;
    const elev = 62 * Math.sin((Math.PI * (h - 6)) / 12);
    base.sunElevation = elev;
    base.sunAzimuth = 90 + ((h - 6) / 12) * 180;
    base.outdoor = true;
    base.night = elev < -4;
    base.sunIntensity = elev > 0 ? 3 * Math.min(1, elev / 15 + 0.2) : 0.15;
    base.sunColor = elev < 12 ? '#ffb877' : '#fff6e8';
    base.hemiSky = base.night ? '#1b2a44' : '#b9d3f0';
    base.hemiIntensity = base.night ? 0.16 : 0.5;
    base.fog = base.night ? '#070b12' : elev < 10 ? '#e7b48a' : '#c9d8e6';
    base.exposure = base.night ? 1.2 : 0.95;
  }
  return { ...base, weather: WEATHER[ui.weather] };
}

// ------------------------------------------------------------------ ground
function grassTexture(): CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#56663f';
  ctx.fillRect(0, 0, size, size);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9000; i++) {
    const g = 70 + rnd() * 60;
    ctx.fillStyle = `rgba(${g * 0.75 | 0},${g | 0},${g * 0.55 | 0},${0.25 + rnd() * 0.3})`;
    ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 4, 1 + rnd() * 4);
  }
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${90 + rnd() * 50 | 0},${95 + rnd() * 40 | 0},${50 + rnd() * 20 | 0},0.18)`;
    ctx.beginPath();
    ctx.arc(rnd() * size, rnd() * size, 20 + rnd() * 70, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Endless ground: a large plane that follows the camera; texture is anchored to absolute world coordinates. */
function Ground({ wet }: { wet: number }) {
  const ref = useRef<Mesh>(null);
  const mat = useMemo(() => {
    // Drawn first without writing depth: paved surfaces always cover it, whatever the depth precision at grazing angles
    const m = new MeshStandardMaterial({ map: grassTexture(), roughness: 0.95, color: '#a6b28f', depthWrite: false });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uGround = { value: new Vector3() };
      m.userData.shader = sh;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uGround;\nvarying vec2 vMacro;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvec2 absXZ = position.xz + uGround.xz;\nvMapUv = absXZ / 38.0;\nvMacro = absXZ / 2300.0;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vMacro;')
        .replace('#include <map_fragment>', '#include <map_fragment>\nvec4 macro = texture2D(map, vMacro);\ndiffuseColor.rgb *= mix(0.78, 1.18, macro.g);');
    };
    return m;
  }, []);
  const geo = useMemo(() => {
    const g = new PlaneGeometry(60000, 60000, 1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const m = ref.current;
    const group = worldFrame.world;
    if (!m || !group) return;
    // camera position expressed in the world group's (absolute) frame
    const local = group.worldToLocal(camera.position.clone());
    m.position.set(Math.round(local.x / 200) * 200, -0.25, Math.round(local.z / 200) * 200);
    const sh = mat.userData.shader as { uniforms: { uGround: { value: Vector3 } } } | undefined;
    if (sh) sh.uniforms.uGround.value.copy(m.position);
    mat.roughness = 0.95 - wet * 0.5;
  });
  return <mesh ref={ref} geometry={geo} material={mat} receiveShadow renderOrder={-10} />;
}

// ------------------------------------------------------------------ rain
function Rain({ amount, wind }: { amount: number; wind: number }) {
  const count = 7000;
  const mesh = useMemo(() => {
    const g = new PlaneGeometry(0.02, 0.9);
    const offsets = new Float32Array(count * 3);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) offsets.set([rnd() * 60 - 30, rnd() * 40, rnd() * 60 - 30], i * 3);
    g.setAttribute('aOffset', new InstancedBufferAttribute(offsets, 3));
    const m = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new Vector3() }, uWind: { value: 0 }, uAmount: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 aOffset; uniform float uTime; uniform vec3 uCam; uniform float uWind; varying float vA;
        void main(){
          vec3 o = aOffset;
          float fall = mod(o.y - uTime * 11.0, 40.0);
          vec3 p = vec3(mod(o.x + uWind * uTime * 0.6 - uCam.x, 60.0) - 30.0 + uCam.x, fall - 20.0 + uCam.y, mod(o.z - uCam.z, 60.0) - 30.0 + uCam.z);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          mv.xy += position.xy;
          vA = 0.55;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `uniform float uAmount; varying float vA; void main(){ gl_FragColor = vec4(0.75,0.82,0.9, vA * uAmount * 0.6); }`,
    });
    const im = new InstancedMesh(g, m, count);
    im.frustumCulled = false;
    return im;
  }, []);
  const camera = useThree((s) => s.camera);
  useFrame((st) => {
    const m = mesh.material as ShaderMaterial;
    m.uniforms.uTime!.value = st.clock.elapsedTime;
    m.uniforms.uCam!.value.copy(camera.position);
    m.uniforms.uWind!.value = wind * 0.2;
    m.uniforms.uAmount!.value = amount;
    mesh.count = Math.round(count * Math.min(1, amount));
  });
  return <primitive object={mesh} />;
}

// ------------------------------------------------------------------ clouds
/** Tileable fractal (value-noise) cumulus field: soft billows with darker undersides. */
function cloudTexture(): CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const octaves = [8, 16, 32, 64, 128].map((n) => ({ n, v: Array.from({ length: n * n }, rnd) }));
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise = (o: { n: number; v: number[] }, x: number, y: number) => {
    const fx = x * o.n;
    const fy = y * o.n;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const g = (i: number, j: number) => o.v[((j + o.n) % o.n) * o.n + ((i + o.n) % o.n)]!;
    const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * tx;
    const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let f = 0;
      let amp = 0.5;
      for (const o of octaves) {
        f += noise(o, x / S, y / S) * amp;
        amp *= 0.5;
      }
      const a = Math.max(0, Math.min(1, (f - 0.42) / 0.3));
      const shade = 200 + 55 * Math.min(1, (f - 0.4) * 2.2);
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = shade;
      img.data[i + 2] = Math.min(255, shade + 6);
      img.data[i + 3] = a * a * (3 - 2 * a) * 255;
    }
  ctx.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
}

function Clouds({ cover, night }: { cover: number; night: boolean }) {
  const tex = useMemo(() => cloudTexture(), []);
  const ref = useRef<Mesh>(null);
  const camera = useThree((s) => s.camera);
  useFrame((st) => {
    const m = ref.current;
    if (!m) return;
    m.position.x = camera.position.x;
    m.position.z = camera.position.z;
    tex.offset.set(st.clock.elapsedTime * 0.0008 + camera.position.x / 30000, camera.position.z / 30000);
    (m.material as MeshBasicMaterial).opacity = Math.min(0.92, 0.25 + cover * 0.75);
  });
  if (cover < 0.05) return null;
  tex.repeat.set(10, 10);
  return (
    <mesh ref={ref} position={[0, 2100, 0]} rotation-x={Math.PI / 2}>
      <planeGeometry args={[30000, 30000]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} color={night ? '#2a3140' : cover > 0.8 ? '#b8bec6' : '#ffffff'} side={2} fog />
    </mesh>
  );
}

// ------------------------------------------------------------------ studio & hangar sets
/** Large-scale mottling for the studio floor's roughness. */
function floorRoughness(): CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(0, 0, size, size);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 420; i++) {
    const v = 120 + rnd() * 110;
    ctx.fillStyle = `rgba(${v},${v},${v},0.08)`;
    ctx.beginPath();
    ctx.arc(rnd() * size, rnd() * size, 10 + rnd() * 70, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

function Studio({ reflective }: { reflective: boolean }) {
  const floorRough = useMemo(floorRoughness, []);
  return (
    <group>
      <mesh position={[0, 60, 0]}>
        <sphereGeometry args={[260, 48, 24]} />
        <shaderMaterial
          side={1}
          depthWrite={false}
          uniforms={{ top: { value: new Color('#11151a') }, bottom: { value: new Color('#2b3139') } }}
          vertexShader="varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} "
          fragmentShader="uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp((vP.y+60.0)/240.0,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, pow(h,0.6)),1.0);} "
        />
      </mesh>
      {/* Seamless polished epoxy floor: mottled roughness keeps reflections soft and real */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[220, 96]} />
        {reflective ? (
          <MeshReflectorMaterial resolution={1024} blur={[500, 160]} mixBlur={1.2} mixStrength={1.6} roughness={0.7} roughnessMap={floorRough} depthScale={0.5} minDepthThreshold={0.25} maxDepthThreshold={1.3} color="#20252b" metalness={0.25} mirror={0.35} />
        ) : (
          <meshStandardMaterial color="#20252b" roughness={0.5} roughnessMap={floorRough} metalness={0.2} />
        )}
      </mesh>
    </group>
  );
}

function Hangar() {
  const span = 110;
  const depth = 100;
  const height = 34;
  const trusses = useMemo(() => Array.from({ length: 9 }, (_, i) => -depth / 2 + 6 + i * ((depth - 12) / 8)), []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[span, depth]} />
        <meshStandardMaterial color="#8c949c" roughness={0.28} metalness={0.15} />
      </mesh>
      {/* safety lines */}
      {[-30, 30].map((z) => (
        <mesh key={z} rotation-x={-Math.PI / 2} position={[0, 0.01, z]}>
          <planeGeometry args={[span - 10, 0.3]} />
          <meshStandardMaterial color="#e2b93b" />
        </mesh>
      ))}
      {/* back wall and side walls */}
      <mesh position={[-span / 2, height / 2, 0]} rotation-y={Math.PI / 2} receiveShadow>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial color="#5a626c" roughness={0.8} side={2} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, height / 2, (s * depth) / 2]} receiveShadow>
          <planeGeometry args={[span, height]} />
          <meshStandardMaterial color="#4c545e" roughness={0.85} side={2} />
        </mesh>
      ))}
      {/* roof with trusses and light panels */}
      <mesh position={[0, height, 0]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[span, depth]} />
        <meshStandardMaterial color="#2b3038" roughness={0.9} side={2} />
      </mesh>
      {trusses.map((z) => (
        <group key={z}>
          <mesh position={[0, height - 1.5, z]}>
            <boxGeometry args={[span, 0.5, 0.5]} />
            <meshStandardMaterial color="#6f7882" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, height - 2.6, z]}>
            <boxGeometry args={[span * 0.7, 0.15, 2.2]} />
            <meshStandardMaterial color="#000" emissive="#e8f1ff" emissiveIntensity={2.4} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* open doors to the blue-hour sky (east side, in front of the nose) */}
      <mesh position={[span / 2 + 0.1, height / 2, 0]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[depth, height]} />
        <meshBasicMaterial color="#2c4570" toneMapped={false} />
      </mesh>
      <pointLight position={[0, height - 4, 0]} intensity={900} distance={120} decay={1.6} color="#f2f6ff" />
      <pointLight position={[30, 8, 0]} intensity={180} distance={60} decay={1.6} color="#6f8fd6" />
    </group>
  );
}

const pushTmp = new Matrix4();
const isIdentity = (m: Matrix4) => m.elements.every((v, i) => v === (i % 5 === 0 ? 1 : 0));

// ------------------------------------------------------------------ main
export function World() {
  const env = useUI((s) => s.env);
  const weather = useUI((s) => s.weather);
  const section = useUI((s) => s.section);
  const quality = useUI((s) => s.quality);
  const timeOfDay = useUI((s) => s.timeOfDay);
  const exposure = useUI((s) => s.exposure);
  const shading = useRender((s) => s.shading);
  const flight = section === 'flight';
  const look = useMemo(() => currentLook(), [env, weather, section, timeOfDay]); // eslint-disable-line react-hooks/exhaustive-deps
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const sun = useRef<DirectionalLight>(null);
  const world = useRef<Group>(null);
  const w = look.weather;
  const outdoor = look.outdoor || flight;
  const setStudio = !flight && env === 'studio';
  const setHangar = !flight && env === 'hangar';
  const sunDir = useMemo(() => sunDirection(look.sunElevation, look.sunAzimuth), [look]);
  const interior = section === 'cabin' || section === 'cockpit';
  const hdri = flight ? undefined : interior ? HDRI.interior : HDRI[env];
  // rotate the panorama so its sun sits where the shadow-casting light is
  const envRotY = hdri?.sunU !== undefined ? (hdri.sunU - 0.5) * Math.PI * 2 - Math.atan2(sunDir.z, sunDir.x) : 0;
  const hdriSky = !!hdri && !interior && env !== 'hangar' && env !== 'studio';

  useEffect(() => {
    worldFrame.world = world.current;
    return () => {
      worldFrame.world = null;
    };
  }, []);

  useEffect(() => {
    const far = outdoor ? w.fogFar * (look.night ? 0.6 : 1) : setHangar ? 400 : 600;
    const col = new Color(look.fog).lerp(new Color('#9aa3ad'), outdoor ? w.grey * (look.night ? 0.1 : 1) : 0);
    scene.fog = new Fog(col, outdoor ? Math.min(far * 0.15, 800) : 200, far);
    scene.background = outdoor ? col : new Color(setHangar ? '#141b26' : '#0d1014');
    gl.toneMappingExposure = look.exposure * exposure;
  }, [look, outdoor, w, scene, gl, exposure, setHangar]);

  // World placement: stand (nose-in, north) for explore modes, floating origin in flight.
  useFrame(() => {
    const g = world.current;
    if (!g) return;
    if (flight) {
      g.rotation.set(0, 0, 0);
      g.position.set(-worldFrame.origin.x, 0, -worldFrame.origin.z);
    } else {
      g.rotation.set(0, -Math.PI / 2, 0);
      // render = R·(world − stand); R = rotY(−90°): (x, z) → (z·(−1)… ) computed via matrix
      g.position.set(0, 0, 0);
      g.updateMatrix();
      const p = new Vector3(STAND.x, 0, STAND.z).applyEuler(g.rotation);
      g.position.set(-p.x, 0, -p.z);
      // pushback: the aircraft stays at the origin, so the world moves by the inverse pose
      if (!isIdentity(worldFrame.push)) {
        g.updateMatrix();
        pushTmp.copy(worldFrame.push).invert().multiply(g.matrix).decompose(g.position, g.quaternion, g.scale);
      }
    }
    // keep the shadow frustum centred on the aircraft
    const s = sun.current;
    if (s) {
      const c = worldFrame.aircraftRenderPos;
      s.position.copy(c).addScaledVector(sunDir, 260);
      s.target.position.copy(c);
      s.target.updateMatrixWorld();
    }
  });

  const shadowSize = quality === 'ultra' ? 4096 : quality === 'high' ? 2048 : 1024;
  const showShadows = quality !== 'performance';
  const sunI = look.sunIntensity * (outdoor ? w.sunK : 1) * (look.sunElevation > -2 ? 1 : 0.2);

  return (
    <>
      <hemisphereLight args={[look.hemiSky, look.hemiGround, look.hemiIntensity * (outdoor ? 1 - w.grey * 0.3 : 1)]} />
      <directionalLight
        ref={sun}
        intensity={sunI}
        color={look.sunColor}
        castShadow={showShadows}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={10}
        shadow-camera-far={600}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <Suspense fallback={null}>
        <Environment
          key={`${env}-${weather}-${flight ? Math.round(timeOfDay) : 'x'}-${interior ? 'in' : 'out'}`}
          files={hdri ? HDRI_BASE + hdri.file : undefined}
          environmentIntensity={(hdri?.intensity ?? 1) * (outdoor && !interior ? 1 - w.grey * 0.35 : 1)}
          environmentRotation={[0, envRotY, 0]}
          resolution={quality === 'ultra' || quality === 'high' ? 512 : 256}
          frames={1}
        >
          {setStudio && !interior && (
            <>
              <color attach="background" args={['#14181d']} />
              <Lightformer intensity={2.4} position={[0, 30, 0]} rotation-x={Math.PI / 2} scale={[90, 30, 1]} />
              <Lightformer intensity={1.3} position={[-60, 12, 0]} rotation-y={Math.PI / 2} scale={[70, 10, 1]} />
              <Lightformer intensity={1.3} position={[60, 12, 0]} rotation-y={-Math.PI / 2} scale={[70, 10, 1]} />
              <Lightformer intensity={0.8} position={[0, 6, 70]} scale={[90, 5, 1]} color="#bfe9ff" />
              <Lightformer intensity={0.5} position={[0, 6, -70]} rotation-y={Math.PI} scale={[90, 5, 1]} color="#ffe6cc" />
            </>
          )}
          {setHangar && !interior && (
            <>
              {[-30, -10, 10, 30].map((z) => (
                <Lightformer key={z} intensity={2} position={[0, 32, z]} rotation-x={Math.PI / 2} scale={[70, 3, 1]} color="#eef4ff" />
              ))}
              <Lightformer intensity={1.2} position={[60, 14, 0]} rotation-y={-Math.PI / 2} scale={[100, 30, 1]} color="#33507f" />
            </>
          )}
          {outdoor && !hdriSky && !interior && !look.night && <Sky sunPosition={sunDir.clone().multiplyScalar(1000).toArray()} turbidity={4 + w.grey * 8} rayleigh={look.sunElevation < 10 ? 2.5 : 1.2} mieCoefficient={0.006} mieDirectionalG={0.85} />}
          {outdoor && !hdri && look.night && <color attach="background" args={['#0a1220']} />}
          {outdoor && !interior && (!hdriSky || hdri?.ground) && (
            <mesh rotation-x={-Math.PI / 2} position={[0, -5, 0]}>
              <circleGeometry args={[2000, 16]} />
              <meshBasicMaterial color={look.night ? '#06080b' : (hdri?.ground ?? '#4b5244')} />
            </mesh>
          )}
          {/* the probe needs at least one child to render through the portal */}
          <group />
        </Environment>
      </Suspense>

      {outdoor && !look.night && <Sky distance={45000} sunPosition={sunDir.clone().multiplyScalar(1000).toArray()} turbidity={4 + w.grey * 8} rayleigh={look.sunElevation < 10 ? 2.5 : 1.2} mieCoefficient={0.006} mieDirectionalG={0.85} />}
      {outdoor && look.night && <Stars radius={4000} depth={200} count={4000} factor={60} saturation={0} fade speed={0.2} />}

      {setStudio && <Studio reflective={(quality === 'ultra' || quality === 'high') && shading === 'material'} />}
      {setHangar && <Hangar />}

      <group ref={world} name="world">
        {outdoor && (
          <>
            <Ground wet={w.rain} />
            <Airport night={look.night} wet={w.rain} flight={flight} />
            <Windsock windKt={w.wind} />
            {look.night && !flight && <ApronFloodlights shadows={quality === 'ultra'} />}
          </>
        )}
      </group>
      {outdoor && <Clouds cover={w.cloud} night={look.night} />}
      {outdoor && w.rain > 0 && <Rain amount={w.rain} wind={w.wind} />}
    </>
  );
}

/** Wind sock near the runway 09 touchdown zone — points downwind, extends with wind speed. */
function Windsock({ windKt }: { windKt: number }) {
  const ref = useRef<Group>(null);
  useFrame((st) => {
    const g = ref.current;
    if (!g) return;
    const from = 270; // westerly
    g.rotation.y = MathUtils.degToRad(-(from + 180) + 90);
    const ext = Math.min(1, windKt / 15);
    const sock = g.children[0]!;
    sock.rotation.z = -Math.PI / 2 * (0.25 + 0.75 * ext) + Math.sin(st.clock.elapsedTime * 3) * 0.03 * ext;
  });
  return (
    <group position={[420, 0, 95]}>
      <mesh position={[0, 3, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 6, 8]} />
        <meshStandardMaterial color="#cfd3d6" />
      </mesh>
      <group ref={ref} position={[0, 6, 0]}>
        <mesh position={[0, -1.6, 0]}>
          <coneGeometry args={[0.45, 3.2, 12, 1, true]} />
          <meshStandardMaterial color="#ff6a1a" side={2} />
        </mesh>
      </group>
    </group>
  );
}

/** High-mast apron floodlights for the night inspection scene. */
function ApronFloodlights({ shadows = false }: { shadows?: boolean }) {
  const masts = [
    [STAND.x - 45, STAND.z + 30],
    [STAND.x + 45, STAND.z + 30],
    [STAND.x, STAND.z + 70],
  ];
  return (
    <>
      {masts.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x!, 0, z!]}>
          <mesh position={[0, 15, 0]}>
            <cylinderGeometry args={[0.25, 0.4, 30, 8]} />
            <meshStandardMaterial color="#6f7882" />
          </mesh>
          <mesh position={[0, 30, 0]}>
            <boxGeometry args={[3, 0.6, 1.2]} />
            <meshStandardMaterial color="#111" emissive="#fff1cf" emissiveIntensity={6} toneMapped={false} />
          </mesh>
          <spotLight position={[0, 30, 0]} angle={0.75} penumbra={0.6} intensity={7000} distance={160} decay={2} color="#ffe9c7" castShadow={shadows} shadow-mapSize={[1024, 1024]} shadow-bias={-0.0006} />
        </group>
      ))}
    </>
  );
}
