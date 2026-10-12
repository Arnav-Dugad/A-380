/**
 * Flight-mode effects: tyre smoke and rubber marks on touchdown, contrails at cruise altitude
 * and camera shake (runway roll, touchdown, turbulence). Smoke, marks and trails live in
 * absolute world coordinates and are drawn relative to the floating origin.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
  type Camera,
} from 'three';
import { engineFrames } from '../aircraft/geometry/engine';
import { GEAR, sx } from '../aircraft/geometry/layout';
import { flight } from '../sim/flight';
import { systems } from '../sim/systems';
import { useUI } from '../state/ui';
import { worldFrame } from '../scene/worldFrame';

const MAX_PUFFS = 600;
const TRAIL = 220;

function puffTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/** aircraft-frame contact points of the main gears (wing and body bogies) */
const CONTACTS = [
  [sx(GEAR.wing.s), GEAR.wing.z],
  [sx(GEAR.wing.s), -GEAR.wing.z],
  [sx(GEAR.body.s), GEAR.body.z],
  [sx(GEAR.body.s), -GEAR.body.z],
] as const;

export function FlightFX() {
  const section = useUI((s) => s.section);
  if (section !== 'flight') return null;
  return <FlightFXImpl />;
}

function FlightFXImpl() {
  const camera = useThree((s) => s.camera);
  const root = useMemo(() => {
    const g = new Group();
    g.name = 'flightFX';
    g.userData.noPathTrace = true;
    return g;
  }, []);

  // ---- tyre smoke: soft additive-free grey sprites
  const smoke = useMemo(() => {
    const geo = new BufferGeometry();
    const pos = new Float32Array(MAX_PUFFS * 3);
    const life = new Float32Array(MAX_PUFFS); // seconds remaining (≤ 0 = dead)
    const size = new Float32Array(MAX_PUFFS);
    geo.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage));
    geo.setAttribute('aLife', new BufferAttribute(life, 1).setUsage(DynamicDrawUsage));
    geo.setAttribute('aSize', new BufferAttribute(size, 1).setUsage(DynamicDrawUsage));
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      uniforms: { map: { value: puffTexture() }, uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute float aLife; attribute float aSize; uniform float uScale; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float age = clamp(1.0 - aLife / 3.5, 0.0, 1.0);
          vA = aLife > 0.0 ? (1.0 - age) * 0.55 : 0.0;
          gl_PointSize = aLife > 0.0 ? aSize * (0.6 + age * 2.4) * uScale / -mv.z : 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; varying float vA;
        void main() { vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vec3(0.86, 0.86, 0.84), t.a * vA); }`,
    });
    const pts = new Points(geo, mat);
    pts.frustumCulled = false;
    return { pts, pos, life, size, vel: new Float32Array(MAX_PUFFS * 3), next: 0 };
  }, []);

  // ---- rubber marks
  const marks = useMemo(() => {
    const g = new Group();
    const mat = new MeshBasicMaterial({ color: '#141414', transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    return { g, mat, list: [] as Mesh[] };
  }, []);

  // ---- contrails: one camera-facing ribbon per engine
  const trails = useMemo(() => {
    return engineFrames().map(() => {
      const pts: Vector3[] = [];
      const geo = new BufferGeometry();
      const pos = new Float32Array(TRAIL * 2 * 3);
      const col = new Float32Array(TRAIL * 2 * 4);
      geo.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage));
      geo.setAttribute('color', new BufferAttribute(col, 4).setUsage(DynamicDrawUsage));
      const idx: number[] = [];
      for (let i = 0; i < TRAIL - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      geo.setIndex(idx);
      const mesh = new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, side: 2, toneMapped: true }));
      mesh.frustumCulled = false;
      return { pts, mesh, pos, col, acc: 0 };
    });
  }, []);

  useEffect(() => {
    const w = worldFrame.world;
    root.add(smoke.pts, marks.g, ...trails.map((t) => t.mesh));
    (w ?? root.parent)?.add(root);
    return () => {
      root.removeFromParent();
    };
  }, [root, smoke, marks, trails]);

  const was = useRef({ onGround: true, impulse: 0, shake: { x: 0, y: 0 }, t: 0 });
  const tmp = useMemo(() => new Vector3(), []);
  const frames = useMemo(() => engineFrames(), []);
  const white = useMemo(() => new Color('#f4f7fb'), []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const s = flight.state;
    const ac = worldFrame.aircraft;
    const W = was.current;
    W.t += dt;
    // keep our group in the floating world frame
    if (!root.parent && worldFrame.world) worldFrame.world.add(root);
    if (!ac) return;
    const origin = worldFrame.origin;
    const toAbs = (local: Vector3) => local.applyMatrix4(ac.matrixWorld).add(new Vector3(origin.x, 0, origin.z));

    // ---- touchdown
    const speed = s.vel.length();
    if (s.onGround && !W.onGround && speed > 30) {
      const sink = Math.min(1, Math.abs(Math.min(0, s.vel.y)) / 3);
      W.impulse = 0.4 + sink;
      for (const [x, z] of CONTACTS) {
        for (let k = 0; k < 28; k++) {
          const i = smoke.next++ % MAX_PUFFS;
          const p = toAbs(tmp.set(x + (Math.random() - 0.5) * 2.4, 0.4, z + (Math.random() - 0.5) * 1.2));
          smoke.pos.set([p.x, 0.3 + Math.random() * 0.6, p.z], i * 3);
          smoke.vel.set([(Math.random() - 0.5) * 2, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 2], i * 3);
          smoke.life[i] = 2.2 + Math.random() * 1.3;
          smoke.size[i] = 2 + Math.random() * 2.5;
        }
        // a dark streak where the wheels spun up, running along the track
        const a = toAbs(tmp.set(x, 0, z)).clone();
        const fwd = new Vector3(1, 0, 0).applyQuaternion(s.q).setY(0).normalize();
        const len = 18 + Math.random() * 22;
        const g = new PlaneGeometry(1.3, len);
        g.rotateX(-Math.PI / 2);
        const m = new Mesh(g, marks.mat);
        m.position.set(a.x + fwd.x * len * 0.5, 0.035, a.z + fwd.z * len * 0.5);
        m.rotation.y = Math.atan2(fwd.x, fwd.z);
        marks.g.add(m);
        marks.list.push(m);
        if (marks.list.length > 48) {
          const old = marks.list.shift()!;
          old.removeFromParent();
          old.geometry.dispose();
        }
      }
    }
    W.onGround = s.onGround;

    // ---- smoke update (drift with the wind, rise, slow down)
    for (let i = 0; i < MAX_PUFFS; i++) {
      if (smoke.life[i]! <= 0) continue;
      smoke.life[i]! -= dt;
      const damp = Math.exp(-dt * 0.8);
      smoke.vel[i * 3]! *= damp;
      smoke.vel[i * 3 + 2]! *= damp;
      smoke.pos[i * 3]! += smoke.vel[i * 3]! * dt + 1.5 * dt;
      smoke.pos[i * 3 + 1]! += smoke.vel[i * 3 + 1]! * dt;
      smoke.pos[i * 3 + 2]! += smoke.vel[i * 3 + 2]! * dt;
    }
    smoke.pts.geometry.getAttribute('position').needsUpdate = true;
    smoke.pts.geometry.getAttribute('aLife').needsUpdate = true;
    smoke.pts.geometry.getAttribute('aSize').needsUpdate = true;
    (smoke.pts.material as ShaderMaterial).uniforms.uScale!.value = 600;

    // ---- contrails above ~8 km in cold air
    const alt = s.pos.y;
    const contrail = Math.max(0, Math.min(1, (alt - 7600) / 900));
    trails.forEach((tr, i) => {
      const e = systems.state.engines[i];
      tr.acc += dt;
      if (tr.acc > 0.05) {
        tr.acc = 0;
        const f = frames[i]!;
        if (contrail > 0 && (e?.n1 ?? 0) > 40) tr.pts.unshift(toAbs(tmp.set(f.origin[0] - 9.6, f.origin[1], f.origin[2])).clone());
        else tr.pts.unshift(tr.pts[0]?.clone() ?? new Vector3());
        if (tr.pts.length > TRAIL) tr.pts.pop();
      }
      writeRibbon(tr, camera, origin, contrail, white);
    });

    // ---- camera shake: runway roll, touchdown thump, turbulence
    const ui = useUI.getState();
    W.impulse *= Math.exp(-dt * 3.5);
    const roll = s.onGround ? Math.min(1, speed / 75) : 0;
    const turb = s.onGround ? 0 : flight.weather.turbulence;
    const amp = ui.flightCam === 'cockpit' || ui.flightCam === 'wing' ? 1 : 0.35;
    const k = (0.0016 * roll + 0.006 * W.impulse + 0.0035 * turb) * amp;
    camera.rotateY(-W.shake.y);
    camera.rotateX(-W.shake.x);
    W.shake.x = k * (Math.sin(W.t * 37) * 0.6 + Math.sin(W.t * 61 + 1.7) * 0.4);
    W.shake.y = k * 0.6 * (Math.sin(W.t * 29 + 0.4) * 0.6 + Math.sin(W.t * 53) * 0.4);
    camera.rotateX(W.shake.x);
    camera.rotateY(W.shake.y);
  });

  return null;
}

function writeRibbon(tr: { pts: Vector3[]; mesh: Mesh; pos: Float32Array; col: Float32Array }, camera: Camera, origin: Vector3, k: number, white: Color) {
  const n = tr.pts.length;
  const cam = new Vector3().copy(camera.position).add(new Vector3(origin.x, 0, origin.z));
  for (let i = 0; i < TRAIL; i++) {
    const p = tr.pts[Math.min(i, n - 1)] ?? new Vector3();
    const q = tr.pts[Math.min(i + 1, n - 1)] ?? p;
    const dir = new Vector3().subVectors(q, p);
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
    const side = new Vector3().crossVectors(dir, new Vector3().subVectors(cam, p)).normalize();
    const age = i / TRAIL;
    const w = 0.8 + age * 16;
    const a = i < n ? k * Math.pow(1 - age, 1.6) * Math.min(1, i / 6) * 0.6 : 0;
    // absolute world coordinates: the parent world group applies the floating origin
    const rx = p.x;
    const rz = p.z;
    tr.pos.set([rx + side.x * w, p.y + side.y * w, rz + side.z * w, rx - side.x * w, p.y - side.y * w, rz - side.z * w], i * 6);
    tr.col.set([white.r * a, white.g * a, white.b * a, a, white.r * a, white.g * a, white.b * a, a], i * 8);
  }
  tr.mesh.geometry.getAttribute('position').needsUpdate = true;
  tr.mesh.geometry.getAttribute('color').needsUpdate = true;
}
