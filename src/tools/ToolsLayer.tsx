/**
 * In-scene side of the tools: click-picking on the model for measurements and annotation pins,
 * their 3D display, outliner visibility, the orthographic-style view, the turntable driver and
 * WebXR sessions. Points are stored in the aircraft's own frame so they ride along when the
 * aircraft moves (flight mode) and survive level-of-detail swaps.
 */
import { Html, Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Group, MathUtils, Raycaster, Vector2, Vector3, type Mesh, type Object3D, type PerspectiveCamera } from 'three';
import { getControls } from '../camera/controls';
import { getRig, onRig } from '../aircraft/rig';
import { worldFrame } from '../scene/worldFrame';
import { useTools, newId, type V3 } from './toolsState';
import { XRSessionManager } from './xr';

const toLocal = (p: Vector3): V3 => {
  const a = worldFrame.aircraft;
  const q = a ? a.worldToLocal(p.clone()) : p.clone();
  return [Math.round(q.x * 1000) / 1000, Math.round(q.y * 1000) / 1000, Math.round(q.z * 1000) / 1000];
};

export function fmtLength(m: number): string {
  const ft = m * 3.28084;
  const whole = Math.floor(ft);
  const inch = Math.round((ft - whole) * 12);
  return `${m.toFixed(m < 10 ? 3 : 2)} m · ${whole}′ ${inch}″`;
}

/** Visible, pickable meshes under the aircraft (raycasting the airport would be wasted work). */
function pickTargets(): Object3D[] {
  return worldFrame.aircraft ? [worldFrame.aircraft] : [];
}

function Picker() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const el = gl.domElement;
    const ray = new Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (useTools.getState().pick === 'none' || e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      const t = useTools.getState();
      if (t.pick === 'none' || !down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 5) return; // that was an orbit drag
      const r = el.getBoundingClientRect();
      ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(pickTargets(), true).find((h) => {
        const m = h.object as Mesh;
        const mat = Array.isArray(m.material) ? m.material[0] : m.material;
        return m.isMesh && m.visible && mat?.visible !== false && !(mat?.transparent && (mat?.opacity ?? 1) < 0.2);
      });
      if (!hit) return;
      const p = toLocal(hit.point);
      if (t.pick === 'measure') {
        const last = t.measurements[t.measurements.length - 1];
        if (last && !last.b) t.set({ measurements: [...t.measurements.slice(0, -1), { ...last, b: p }] });
        else t.set({ measurements: [...t.measurements, { id: newId(), a: p, b: null }] });
      } else if (t.pick === 'annotate') {
        t.set({ annotations: [...t.annotations, { id: newId(), p, text: '' }] });
      }
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
    };
  }, [gl, camera]);
  return null;
}

const tag = 'pointer-events-none whitespace-nowrap rounded-md border border-white/10 bg-graphite-950/85 px-1.5 py-0.5 font-mono text-[10.5px] text-paper shadow-lg backdrop-blur';

function Measurements() {
  const list = useTools((s) => s.measurements);
  return (
    <>
      {list.map((m, i) => {
        const a = new Vector3(...m.a);
        const b = m.b ? new Vector3(...m.b) : null;
        return (
          <group key={m.id}>
            <mesh position={a} renderOrder={1000}>
              <sphereGeometry args={[0.06, 12, 8]} />
              <meshBasicMaterial color="#ffd166" depthTest={false} toneMapped={false} />
            </mesh>
            {b && (
              <>
                <mesh position={b} renderOrder={1000}>
                  <sphereGeometry args={[0.06, 12, 8]} />
                  <meshBasicMaterial color="#ffd166" depthTest={false} toneMapped={false} />
                </mesh>
                <Line points={[a, b]} color="#ffd166" lineWidth={2} depthTest={false} renderOrder={999} dashed={false} />
                <Html position={a.clone().lerp(b, 0.5)} center zIndexRange={[15, 10]}>
                  <div className={tag}>
                    <span className="text-[#ffd166]">{i + 1}</span> {fmtLength(a.distanceTo(b))}
                  </div>
                </Html>
              </>
            )}
          </group>
        );
      })}
    </>
  );
}

function Annotations() {
  const list = useTools((s) => s.annotations);
  return (
    <>
      {list.map((n, i) => (
        <Html key={n.id} position={n.p} zIndexRange={[15, 10]} style={{ transform: 'translate(-11px, -100%)' }}>
          <div className="pointer-events-none flex flex-col items-start">
            <div className="flex items-center gap-1.5">
              <span className="grid h-[22px] w-[22px] place-items-center rounded-full border border-ice-300/70 bg-ice-400 font-mono text-[11px] font-[600] text-graphite-950 shadow-[0_0_14px_rgba(111,211,239,0.6)]">{i + 1}</span>
              {n.text && <span className={tag}>{n.text}</span>}
            </div>
            <span className="ml-[10px] h-3 w-px bg-ice-300/80" />
          </div>
        </Html>
      ))}
    </>
  );
}

/** Outliner visibility survives level-of-detail swaps. */
function Visibility() {
  const hidden = useTools((s) => s.hidden);
  useEffect(() => {
    const apply = () => {
      const rig = getRig();
      if (!rig) return;
      for (const [name, node] of rig.nodes) {
        const want = !hidden.includes(name);
        if (node.userData.__outlinerHidden && want) {
          node.visible = true;
          delete node.userData.__outlinerHidden;
        } else if (!want && node.visible) {
          node.visible = false;
          node.userData.__outlinerHidden = true;
        }
      }
    };
    apply();
    return onRig(apply);
  }, [hidden]);
  return null;
}

/**
 * Orthographic-style view: a 1.2° lens from far away flattens perspective like a drafting view
 * while keeping every interaction of the orbit camera.
 */
function OrthoRig() {
  const ortho = useTools((s) => s.ortho);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  useEffect(() => {
    const c = getControls();
    if (!ortho || !c) return;
    const prev = { fov: camera.fov, near: camera.near, max: c.maxDistance, min: c.minDistance, dist: c.distance };
    const ORTHO_FOV = 1.2;
    const k = Math.tan(MathUtils.degToRad(prev.fov / 2)) / Math.tan(MathUtils.degToRad(ORTHO_FOV / 2));
    c.maxDistance = 60000;
    c.minDistance = 2 * k;
    camera.fov = ORTHO_FOV;
    camera.updateProjectionMatrix();
    void c.dollyTo(prev.dist * k, false);
    return () => {
      const d = c.distance / k;
      camera.fov = prev.fov;
      camera.near = prev.near;
      camera.updateProjectionMatrix();
      c.minDistance = prev.min;
      c.maxDistance = prev.max;
      void c.dollyTo(MathUtils.clamp(d, prev.min, prev.max), false);
    };
  }, [ortho, camera]);
  useFrame(() => {
    if (!ortho) return;
    const c = getControls();
    if (!c) return;
    // keep depth precision: the near plane follows the long camera distance
    const near = Math.max(0.4, c.distance * 0.6);
    if (Math.abs(camera.near - near) > 1) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

/** Turntable: one steady 360° orbit around the current target (used for video export). */
function Turntable() {
  const start = useRef<{ az: number } | null>(null);
  useFrame((_, dt) => {
    const t = useTools.getState().turntable;
    const c = getControls();
    if (!t.active || !c) {
      start.current = null;
      return;
    }
    if (!start.current) start.current = { az: c.azimuthAngle };
    const nt = Math.min(1, t.t + dt / t.seconds);
    void c.rotateTo(start.current.az + nt * Math.PI * 2, c.polarAngle, false);
    useTools.setState({ turntable: { ...t, t: nt, active: nt < 1 } });
  });
  return null;
}

export function ToolsLayer() {
  const group = useMemo(() => new Group(), []);
  // measurement graphics live in the aircraft frame
  useFrame(() => {
    const a = worldFrame.aircraft;
    if (a) {
      a.updateWorldMatrix(true, false);
      group.matrixAutoUpdate = false;
      group.matrix.copy(a.matrixWorld);
      group.matrixWorldNeedsUpdate = true;
    }
  });
  return (
    <>
      <Picker />
      <Visibility />
      <OrthoRig />
      <Turntable />
      <XRSessionManager />
      <primitive object={group} userData={{ noPathTrace: true }}>
        <Measurements />
        <Annotations />
      </primitive>
    </>
  );
}
