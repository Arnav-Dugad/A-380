/**
 * Turnaround animation on the apron: boarding bridges that dock and retract, bags riding the
 * belt loaders into open cargo holds, the push-back tug, and the pushback itself (a straight
 * push followed by a 90° arc onto the taxilane, with rolling wheels and a steered nose gear).
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BoxGeometry, Color, Group, InstancedMesh, MathUtils, Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three';
import { create } from 'zustand';
import { systems } from '../../sim/systems';
import { worldFrame } from '../worldFrame';
import { beltPaths, buildTug, type GseMaterial } from './gse';
import { STAND, TERMINAL } from './layout';

interface OpsState {
  /** boarding bridges: 1 docked, 0 parked clear of the aircraft */
  bridges: number;
  pushback: 'idle' | 'running' | 'done';
  set: (p: Partial<OpsState>) => void;
}
export const useOps = create<OpsState>()((set) => ({ bridges: 1, pushback: 'idle', set: (p) => set(p) }));

const PUSH_STRAIGHT = 24;
const PUSH_RADIUS = 32;
const PUSH_ARC = Math.PI / 2;
const PUSH_LEN = PUSH_STRAIGHT + PUSH_RADIUS * PUSH_ARC;
const PUSH_SPEED = 1.4; // m/s, a walking pace

/** Aircraft pose relative to the stand after pushing `d` metres. */
function pushPose(d: number, out: Matrix4): number {
  let yaw = 0;
  const p = new Vector3();
  if (d <= PUSH_STRAIGHT) p.set(-d, 0, 0);
  else {
    const phi = Math.min(PUSH_ARC, (d - PUSH_STRAIGHT) / PUSH_RADIUS);
    // arc centre to starboard of the push line: the tail swings east onto the taxilane
    p.set(-PUSH_STRAIGHT - PUSH_RADIUS * Math.sin(phi), 0, PUSH_RADIUS * (1 - Math.cos(phi)));
    yaw = phi;
  }
  out.compose(p, new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), new Vector3(1, 1, 1));
  return d > PUSH_STRAIGHT && d < PUSH_LEN ? 1 : 0;
}

export function startPushback(): string {
  const s = systems.state;
  if (Object.values(s.doors).some((d) => d.position > 0.02)) {
    systems.setAllDoors(false);
  }
  useOps.getState().set({ bridges: 0, pushback: 'running' });
  pushState.d = 0;
  pushState.wait = 9; // bridges pull back and doors close first
  return 'Pushback: doors closing, bridges retracting, then the tug pushes back onto the taxilane';
}
export function resetPushback(): void {
  pushState.d = 0;
  worldFrame.push.identity();
  useOps.getState().set({ pushback: 'idle', bridges: 1 });
  systems.state.air.gs = 0;
}
const pushState = { d: 0, wait: 0 };

// ------------------------------------------------------------------ boarding bridges
interface BridgeDef {
  s: number;
  y: number;
  rot: Vector3;
}
const doorZ = (s: number) => STAND.z - (36.0 - s);
const leftX = STAND.x - 3.9;
const termFace = TERMINAL.z + 2;
const BRIDGES: BridgeDef[] = [
  { s: 9.6, y: 5.2, rot: new Vector3(STAND.x - 20, 0, termFace + 10) },
  { s: 20.15, y: 5.2, rot: new Vector3(STAND.x - 30, 0, termFace + 16) },
  { s: 16.3, y: 7.95, rot: new Vector3(STAND.x - 14, 0, termFace + 6) },
];

function Bridge({ def, mat, glass }: { def: BridgeDef; mat: MeshStandardMaterial; glass: MeshPhysicalMaterial }) {
  const parts = useMemo(() => {
    const rotunda = new Mesh(new BoxGeometry(3.6, def.y + 3, 3.6), mat);
    rotunda.position.set(def.rot.x, (def.y + 3) / 2, def.rot.z);
    const outer = new Mesh(new BoxGeometry(1, 3.2, 3.2), mat);
    const inner = new Mesh(new BoxGeometry(1, 2.9, 2.9), mat);
    const cab = new Group();
    const cabBox = new Mesh(new BoxGeometry(3.0, 3.4, 3.8), mat);
    const cabGlass = new Mesh(new BoxGeometry(0.06, 1.2, 3.2), glass);
    cabGlass.position.set(1.52, 0.5, 0);
    const canopy = new Mesh(new BoxGeometry(0.8, 3.0, 3.4), new MeshStandardMaterial({ color: '#2a2d31', roughness: 0.9 }));
    canopy.position.set(1.7, 0, 0);
    cab.add(cabBox, cabGlass, canopy);
    const column = new Mesh(new BoxGeometry(0.6, 1, 0.6), mat);
    const wheels = new Mesh(new BoxGeometry(1.6, 0.7, 2.4), new MeshStandardMaterial({ color: '#1d1f22', roughness: 0.8 }));
    for (const m of [rotunda, outer, inner, cabBox, column, wheels]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    return { rotunda, outer, inner, cab, column, wheels };
  }, [def, mat, glass]);
  const k = useRef(useOps.getState().bridges);

  useFrame((_, dt) => {
    const target = useOps.getState().bridges;
    k.current += MathUtils.clamp(target - k.current, -dt / 8, dt / 8); // about eight seconds end to end
    const t = k.current * k.current * (3 - 2 * k.current);
    const docked = new Vector3(leftX - 2.5, def.y, doorZ(def.s));
    const dirDocked = docked.clone().sub(def.rot).setY(0).normalize();
    // parked: pulled back 6 m and swung 12° clear of the fuselage
    const ang = MathUtils.degToRad(12) * (1 - t);
    const dir = dirDocked.clone().applyAxisAngle(new Vector3(0, 1, 0), ang);
    const full = docked.clone().sub(def.rot).setY(0).length();
    const len = full - 6 * (1 - t);
    const end = def.rot.clone().addScaledVector(dir, len).setY(def.y);
    const yaw = Math.atan2(-dir.z, dir.x);
    const half = full * 0.55;
    const { outer, inner, cab, column, wheels } = parts;
    outer.scale.x = half;
    outer.position.copy(def.rot).addScaledVector(dir, half / 2).setY(def.y + 1.4);
    outer.rotation.set(0, yaw, 0);
    inner.scale.x = half;
    inner.position.copy(end).addScaledVector(dir, -half / 2 - 1.2).setY(def.y + 1.4);
    inner.rotation.set(0, yaw, 0);
    cab.position.copy(end).setY(def.y + 1.4);
    cab.rotation.set(0, yaw, 0);
    const colPos = def.rot.clone().addScaledVector(dir, len * 0.7);
    column.scale.y = def.y + 0.2;
    column.position.set(colPos.x, (def.y + 0.2) / 2, colPos.z);
    wheels.position.set(colPos.x, 0.35, colPos.z);
    wheels.rotation.set(0, yaw, 0);
  });
  return (
    <group>
      {Object.values(parts).map((o, i) => (
        <primitive key={i} object={o as Object3D} />
      ))}
    </group>
  );
}

export function JetBridges() {
  const mats = useMemo(
    () => ({
      body: new MeshStandardMaterial({ color: '#b9c0c6', roughness: 0.45, metalness: 0.5 }),
      glass: new MeshPhysicalMaterial({ color: '#16222c', roughness: 0.06, metalness: 0.2, clearcoat: 1 }),
    }),
    [],
  );
  return (
    <group name="jetBridges">
      {BRIDGES.map((b) => (
        <Bridge key={b.s} def={b} mat={mats.body} glass={mats.glass} />
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ bags on the belts
const BAGS = 14;
export function BeltBags() {
  const paths = useMemo(() => beltPaths(), []);
  const mesh = useMemo(() => {
    const m = new InstancedMesh(new BoxGeometry(0.62, 0.32, 0.42), new MeshStandardMaterial({ roughness: 0.7 }), BAGS * paths.length);
    const palette = ['#2d3e57', '#7a2e2e', '#1f1f22', '#5b6a3a', '#9a8a6a', '#3f4f5f', '#b04a2a'];
    for (let i = 0; i < m.count; i++) m.setColorAt(i, new Color(palette[i % palette.length]!));
    m.castShadow = true;
    m.frustumCulled = false;
    return m;
  }, [paths]);
  const t = useRef(0);
  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), p: new Vector3(), s: new Vector3() }), []);
  useFrame((_, dt) => {
    t.current += dt;
    const ops = useOps.getState();
    paths.forEach((path, j) => {
      const door = systems.state.doors[path.s < 30 ? 'FWD_CARGO' : 'AFT_CARGO'];
      const open = (door?.position ?? 0) > 0.95 && ops.pushback === 'idle';
      const dir = path.to.clone().sub(path.from);
      const pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
      tmp.q.setFromAxisAngle(new Vector3(0, 0, 1), -pitch);
      for (let k = 0; k < BAGS; k++) {
        const i = j * BAGS + k;
        // bags spaced along the belt, moving at 0.6 m/s; they vanish into the hold at the top
        const u = (t.current * 0.6 / dir.length() + k / BAGS) % 1;
        tmp.p.copy(path.from).addScaledVector(dir, u);
        tmp.s.setScalar(open && u < 0.97 ? 1 : 0);
        tmp.m.compose(tmp.p, tmp.q, tmp.s);
        mesh.setMatrixAt(i, tmp.m);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

// ------------------------------------------------------------------ tug + pushback driver
const GSE_MATS: Record<GseMaterial, () => MeshStandardMaterial> = {
  body: () => new MeshPhysicalMaterial({ color: '#eef0f2', roughness: 0.32, clearcoat: 0.6 }),
  hivis: () => new MeshPhysicalMaterial({ color: '#f2b705', roughness: 0.38, clearcoat: 0.5 }),
  chassis: () => new MeshStandardMaterial({ color: '#2b2e33', roughness: 0.6, metalness: 0.4 }),
  glass: () => new MeshPhysicalMaterial({ color: '#0d1418', roughness: 0.05, clearcoat: 1 }),
  rubber: () => new MeshStandardMaterial({ color: '#17181a', roughness: 0.85 }),
  alu: () => new MeshStandardMaterial({ color: '#c5c9ce', roughness: 0.35, metalness: 1 }),
};

/** Tug in the aircraft frame, plus the pushback motion. Mount inside the aircraft group. */
export function PushbackTug({ visible }: { visible: boolean }) {
  const meshes = useMemo(() => {
    const g = buildTug();
    return (Object.keys(g) as GseMaterial[]).map((k) => {
      const m = new Mesh(g[k], GSE_MATS[k]());
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    });
  }, []);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const ops = useOps.getState();
    if (ops.pushback !== 'running') return;
    if (pushState.wait > 0) {
      pushState.wait -= dt;
      return;
    }
    pushState.d = Math.min(PUSH_LEN, pushState.d + PUSH_SPEED * dt);
    const turning = pushPose(pushState.d, worldFrame.push);
    const s = systems.state;
    s.air.gs = pushState.d < PUSH_LEN ? PUSH_SPEED : 0;
    // nose wheel steered by the tug through the arc (steering is in degrees, + = nose right)
    s.gear.steering += ((turning ? -48 : 0) - s.gear.steering) * Math.min(1, dt * 1.5);
    if (pushState.d >= PUSH_LEN) {
      s.gear.steering = 0;
      ops.set({ pushback: 'done' });
    }
  });
  return (
    <group name="pushbackTug" visible={visible}>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}

/** Hide the static fleet once the aircraft starts moving off the stand. */
export function useFleetVisible(): boolean {
  return useOps((s) => s.pushback === 'idle');
}


