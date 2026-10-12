/**
 * WebXR. VR puts the viewer on the apron beside the aircraft at true scale, with teleport
 * (trigger, aiming at the ground) and snap turning (thumbstick). AR stands a 1:40 model on the
 * floor about a metre and a half ahead. React Three Fiber switches to the XR frame loop by
 * itself once the renderer holds a session; post-processing and path tracing step aside.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Group, Matrix4, Plane, Raycaster, Vector3, type Object3D, type XRTargetRaySpace } from 'three';
import { getControls } from '../camera/controls';
import { useRender } from '../render/renderState';
import { worldFrame } from '../scene/worldFrame';
import { useUI } from '../state/ui';
import { useTools } from './toolsState';

export async function xrSupported(mode: 'immersive-vr' | 'immersive-ar'): Promise<boolean> {
  const xr = (navigator as Navigator & { xr?: { isSessionSupported: (m: string) => Promise<boolean> } }).xr;
  if (!xr || !window.isSecureContext) return false;
  try {
    return await xr.isSessionSupported(mode);
  } catch {
    return false;
  }
}

const AR_SCALE = 1 / 40;

export function XRSessionManager() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const mode = useTools((s) => s.xr);
  const rig = useRef<Group | null>(null);
  const turnLatch = useRef(false);

  useEffect(() => {
    if (mode === 'none') return;
    const xr = (navigator as Navigator & { xr?: { requestSession: (m: string, o: object) => Promise<XRSession> } }).xr;
    if (!xr) {
      useTools.getState().set({ xr: 'none' });
      return;
    }
    let session: XRSession | null = null;
    let ended = false;
    const hidden: Object3D[] = [];
    const prev = { shading: useRender.getState().shading, bg: scene.background, camPos: camera.position.clone(), camQuat: camera.quaternion.clone() };
    const controls = getControls();
    const dolly = new Group();
    dolly.name = 'xrDolly';
    rig.current = dolly;
    const cleanups: (() => void)[] = [];

    const end = () => {
      if (ended) return;
      ended = true;
      for (const c of cleanups) c();
      for (const o of hidden) o.visible = true;
      const a = worldFrame.aircraft;
      if (a && mode === 'ar') {
        a.scale.setScalar(1);
        a.position.set(0, 0, 0);
      }
      scene.background = prev.bg;
      camera.removeFromParent();
      scene.remove(dolly);
      camera.position.copy(prev.camPos);
      camera.quaternion.copy(prev.camQuat);
      if (controls) controls.enabled = true;
      gl.xr.enabled = false;
      useRender.getState().set({ shading: prev.shading });
      useTools.getState().set({ xr: 'none' });
    };

    (async () => {
      try {
        // the XR compositor needs the plain forward renderer
        useRender.getState().set({ shading: 'material' });
        useUI.getState().set({ photoMode: false, cinematic: null });
        const s = await xr.requestSession(mode === 'vr' ? 'immersive-vr' : 'immersive-ar', {
          optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
        });
        session = s;
        if (controls) controls.enabled = false;
        gl.xr.enabled = true;
        gl.xr.setReferenceSpaceType('local-floor');
        scene.add(dolly);
        dolly.add(camera);
        camera.position.set(0, 0, 0);
        camera.quaternion.identity();
        if (mode === 'vr') {
          // standing on the apron off the left wing tip, looking at the nose
          dolly.position.set(38, 0, -30);
          dolly.lookAt(new Vector3(20, 0, 0));
          dolly.rotateY(Math.PI);
        } else {
          // AR: show only the aircraft, small, on the floor ahead
          scene.background = null;
          for (const o of scene.children) {
            if (o === worldFrame.aircraft || o === dolly || (o as { isLight?: boolean }).isLight || !o.visible) continue;
            o.visible = false;
            hidden.push(o);
          }
          const a = worldFrame.aircraft;
          if (a) {
            a.scale.setScalar(AR_SCALE);
            a.position.set(0, 0, -1.6);
          }
        }
        // controllers: trigger to teleport (VR)
        const ray = new Raycaster();
        const ground = new Plane(new Vector3(0, 1, 0), 0);
        const m = new Matrix4();
        for (const i of [0, 1]) {
          const ctl = gl.xr.getController(i) as XRTargetRaySpace;
          dolly.add(ctl);
          const onSelect = () => {
            if (mode !== 'vr') return;
            m.identity().extractRotation(ctl.matrixWorld);
            ray.ray.origin.setFromMatrixPosition(ctl.matrixWorld);
            ray.ray.direction.set(0, 0, -1).applyMatrix4(m);
            const hit = ray.ray.intersectPlane(ground, new Vector3());
            if (hit && hit.distanceTo(ray.ray.origin) < 120) dolly.position.set(hit.x, 0, hit.z);
          };
          ctl.addEventListener('selectstart', onSelect);
          cleanups.push(() => {
            ctl.removeEventListener('selectstart', onSelect);
            dolly.remove(ctl);
          });
        }
        await gl.xr.setSession(s);
        s.addEventListener('end', end);
      } catch (e) {
        console.warn('XR session failed', e);
        end();
      }
    })();

    return () => {
      if (session && !ended) void session.end().catch(() => end());
      else end();
    };
  }, [mode, gl, scene, camera]);

  // Snap turn with either thumbstick (VR)
  useFrame(() => {
    if (mode !== 'vr' || !rig.current) return;
    const session = gl.xr.getSession();
    if (!session) return;
    let x = 0;
    for (const src of session.inputSources) if (src.gamepad && src.gamepad.axes.length >= 4) x = Math.abs(src.gamepad.axes[2]!) > Math.abs(x) ? src.gamepad.axes[2]! : x;
    if (Math.abs(x) > 0.7 && !turnLatch.current) {
      turnLatch.current = true;
      // rotate about the viewer's head, not the play-space origin
      const head = new Vector3().setFromMatrixPosition(gl.xr.getCamera().matrixWorld);
      const d = rig.current;
      d.position.sub(head).applyAxisAngle(new Vector3(0, 1, 0), -Math.sign(x) * (Math.PI / 6)).add(head);
      d.rotateY(-Math.sign(x) * (Math.PI / 6));
    } else if (Math.abs(x) < 0.3) turnLatch.current = false;
  });
  return null;
}
