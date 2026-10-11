/**
 * First-person camera used inside the aircraft (flight deck and cabin). Replaces the orbit
 * controls while active: drag to look, wheel / pinch to zoom the field of view, and — in
 * the cabin — WASD / arrow keys or on-screen buttons to walk, with collision against the
 * cabin walls, monuments and seat rows.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Euler, MathUtils, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { worldFrame } from '../scene/worldFrame';
import { getControls } from './controls';

export interface FpPose {
  pos: [number, number, number];
  yaw: number; // radians, 0 = looking forward (+X)
  pitch: number;
  fov?: number;
}

export interface Obstacle {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface WalkBounds {
  /** returns allowed half-width at model X for the current deck, or 0 outside the deck */
  halfWidth: (x: number) => number;
  xMin: number;
  xMax: number;
  obstacles: Obstacle[];
  eye: number;
}

type Mode = 'off' | 'cockpit' | 'cabin';

const state = {
  mode: 'off' as Mode,
  pos: new Vector3(),
  yaw: 0,
  pitch: 0,
  fov: 60,
  target: null as null | { pos: Vector3; yaw: number; pitch: number; fov: number; t: number; from: { pos: Vector3; q: Quaternion; fov: number } },
  bounds: null as WalkBounds | null,
  keys: new Set<string>(),
  move: { fwd: 0, side: 0 },
  dragging: false,
  last: { x: 0, y: 0 },
};

export const firstPerson = {
  get mode() {
    return state.mode;
  },
  enter(mode: Exclude<Mode, 'off'>, pose: FpPose, bounds: WalkBounds | null = null) {
    const c = getControls();
    if (c) c.enabled = false;
    state.mode = mode;
    state.bounds = bounds;
    firstPerson.goTo(pose);
  },
  goTo(pose: FpPose) {
    const cam = getControls()?.camera as PerspectiveCamera | undefined;
    const from = cam ? { pos: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov } : { pos: new Vector3(...pose.pos), q: new Quaternion(), fov: 50 };
    // express the starting pose in aircraft coordinates (the aircraft may be moving)
    const a = worldFrame.aircraft;
    if (a && cam) {
      a.updateMatrixWorld();
      const inv = new Matrix4().copy(a.matrixWorld).invert();
      const m = new Matrix4().compose(from.pos, from.q, new Vector3(1, 1, 1)).premultiply(inv);
      m.decompose(from.pos, from.q, new Vector3());
    }
    state.target = { pos: new Vector3(...pose.pos), yaw: pose.yaw, pitch: pose.pitch, fov: pose.fov ?? state.fov, t: 0, from };
  },
  setBounds(b: WalkBounds | null) {
    state.bounds = b;
  },
  exit(): void {
    if (state.mode === 'off') return;
    state.mode = 'off';
    state.target = null;
    const c = getControls();
    if (c) {
      const cam = c.camera;
      const dir = new Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      c.enabled = true;
      void c.setLookAt(cam.position.x, cam.position.y, cam.position.z, cam.position.x + dir.x * 4, cam.position.y + dir.y * 4, cam.position.z + dir.z * 4, false);
    }
  },
  setMove(fwd: number, side: number) {
    state.move.fwd = fwd;
    state.move.side = side;
  },
  pose(): FpPose {
    return { pos: [state.pos.x, state.pos.y, state.pos.z], yaw: state.yaw, pitch: state.pitch, fov: state.fov };
  },
};

const euler = new Euler(0, 0, 0, 'YXZ');
const IDENTITY = new Matrix4();
const tmpM = new Matrix4();
/** Transform a camera pose given in aircraft coordinates into render coordinates. */
function attachToAircraft(cam: PerspectiveCamera) {
  const a = worldFrame.aircraft;
  if (!a) return;
  a.updateMatrixWorld();
  if (a.matrixWorld.equals(IDENTITY)) return;
  tmpM.compose(cam.position, cam.quaternion, cam.scale).premultiply(a.matrixWorld);
  tmpM.decompose(cam.position, cam.quaternion, cam.scale);
}
const q = new Quaternion();

function resolveCollisions(p: Vector3, b: WalkBounds) {
  const r = 0.22;
  p.x = MathUtils.clamp(p.x, b.xMin, b.xMax);
  const hw = Math.max(0.1, b.halfWidth(p.x) - r);
  p.z = MathUtils.clamp(p.z, -hw, hw);
  for (const o of b.obstacles) {
    const cx = MathUtils.clamp(p.x, o.x0, o.x1);
    const cz = MathUtils.clamp(p.z, o.z0, o.z1);
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.z = cz + (dz / d) * r;
      } else {
        // inside: push out along the shortest axis
        const ex = Math.min(p.x - o.x0, o.x1 - p.x);
        const ez = Math.min(p.z - o.z0, o.z1 - p.z);
        if (ex < ez) p.x = p.x - o.x0 < o.x1 - p.x ? o.x0 - r : o.x1 + r;
        else p.z = p.z - o.z0 < o.z1 - p.z ? o.z0 - r : o.z1 + r;
      }
    }
  }
}

export function FirstPersonRig() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;

  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      if (state.mode === 'off') return;
      state.dragging = true;
      state.last = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (state.mode === 'off' || !state.dragging || state.target) return;
      const dx = e.clientX - state.last.x;
      const dy = e.clientY - state.last.y;
      state.last = { x: e.clientX, y: e.clientY };
      const k = (state.fov / 60) * 0.0042;
      // grab-the-world semantics, like panoramic viewers
      state.yaw -= dx * k;
      state.pitch = MathUtils.clamp(state.pitch - dy * k, -1.35, 1.35);
    };
    const up = () => (state.dragging = false);
    const wheel = (e: WheelEvent) => {
      if (state.mode === 'off') return;
      e.preventDefault();
      if (state.mode === 'cabin' && !e.ctrlKey) {
        // wheel walks in the cabin
        state.move.fwd = -Math.sign(e.deltaY) * 0.9;
        window.setTimeout(() => (state.move.fwd = 0), 140);
      } else state.fov = MathUtils.clamp(state.fov + e.deltaY * 0.03, 22, 85);
    };
    const kd = (e: KeyboardEvent) => {
      if (state.mode !== 'cabin') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      state.keys.add(e.key.toLowerCase());
    };
    const ku = (e: KeyboardEvent) => state.keys.delete(e.key.toLowerCase());
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    el.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      el.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [gl]);

  useFrame((_, dtRaw) => {
    if (state.mode === 'off') return;
    const dt = Math.min(dtRaw, 0.05);
    const tg = state.target;
    if (tg) {
      tg.t = Math.min(1, tg.t + Math.min(dtRaw, 0.25) / 1.3);
      const k = tg.t < 0.5 ? 4 * tg.t ** 3 : 1 - (-2 * tg.t + 2) ** 3 / 2;
      euler.set(-tg.pitch, -tg.yaw - Math.PI / 2, 0);
      q.setFromEuler(euler);
      camera.position.lerpVectors(tg.from.pos, tg.pos, k);
      camera.quaternion.slerpQuaternions(tg.from.q, q, k);
      camera.fov = MathUtils.lerp(tg.from.fov, tg.fov, k);
      camera.updateProjectionMatrix();
      attachToAircraft(camera);
      if (tg.t >= 1) {
        state.pos.copy(tg.pos);
        state.yaw = tg.yaw;
        state.pitch = tg.pitch;
        state.fov = tg.fov;
        state.target = null;
      }
      return;
    }
    if (state.mode === 'cabin' && state.bounds) {
      const k = state.keys;
      let fwd = state.move.fwd + (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
      let side = state.move.side + (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
      fwd = MathUtils.clamp(fwd, -1, 1);
      side = MathUtils.clamp(side, -1, 1);
      const speed = k.has('shift') ? 2.6 : 1.4;
      // yaw 0 looks along +X (forward); +Z is starboard
      const fx = Math.cos(state.yaw);
      const fz = Math.sin(state.yaw);
      state.pos.x += (fx * fwd - fz * side) * speed * dt;
      state.pos.z += (fz * fwd + fx * side) * speed * dt;
      resolveCollisions(state.pos, state.bounds);
      state.pos.y = state.bounds.eye;
    }
    euler.set(-state.pitch, -state.yaw - Math.PI / 2, 0);
    camera.quaternion.setFromEuler(euler);
    camera.position.copy(state.pos);
    attachToAircraft(camera);
    if (Math.abs(camera.fov - state.fov) > 0.01) {
      camera.fov = state.fov;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}
