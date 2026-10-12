import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { PerspectiveCamera } from 'three';
import { useUI } from '../state/ui';
import { viewInset } from './viewInset';

/**
 * Shifts the camera's principal point so the centre of view sits in the middle of the area
 * left visible by the interface panels. Eased, so opening or dragging a panel glides the view.
 * Flight mode, photo mode and the cinematic tour use the full screen (the flight HUD is drawn
 * around the screen centre).
 */
export function ViewInsetRig() {
  const ref = useRef({ x: 0, y: 0 });
  useFrame((st, dt) => {
    const cur = ref.current;
    const cam = st.camera as PerspectiveCamera;
    if (!cam.isPerspectiveCamera) return;
    const ui = useUI.getState();
    const on = ui.introDone && !ui.photoMode && !ui.cinematic && ui.section !== 'flight';
    const tx = on ? (viewInset.right - viewInset.left) / 2 : 0;
    const ty = on ? viewInset.bottom / 2 : 0;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 7);
    cur.x += (tx - cur.x) * k;
    cur.y += (ty - cur.y) * k;
    // settle exactly, so a still camera is bit-for-bit still (the path tracer accumulates on it)
    if (Math.abs(tx - cur.x) < 0.05) cur.x = tx;
    if (Math.abs(ty - cur.y) < 0.05) cur.y = ty;
    const { width: w, height: h } = st.size;
    if (Math.abs(cur.x) < 0.25 && Math.abs(cur.y) < 0.25 && tx === 0 && ty === 0) {
      if (cam.view?.enabled) cam.clearViewOffset();
      return;
    }
    cam.setViewOffset(w, h, cur.x, cur.y, w, h);
  });
  return null;
}
