/**
 * Camera director: smooth framing, presets and focus transitions built on camera-controls.
 * Kept outside React so any module (inspector, keyboard, tours) can drive the camera.
 */
import type CameraControlsImpl from 'camera-controls';
import { Box3, Vector3, type Object3D } from 'three';

let controls: CameraControlsImpl | null = null;
const listeners = new Set<(c: CameraControlsImpl | null) => void>();

export function setControls(c: CameraControlsImpl | null): void {
  controls = c;
  if (c) {
    c.smoothTime = 0.55;
    c.draggingSmoothTime = 0.12;
    c.dollyToCursor = true;
  }
  for (const l of listeners) l(c);
}
export function getControls(): CameraControlsImpl | null {
  return controls;
}
export function onControls(fn: (c: CameraControlsImpl | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export interface CameraPreset {
  id: string;
  label: string;
  pos: [number, number, number];
  target: [number, number, number];
  key?: string;
}

/** Model space: +X forward, +Y up, +Z starboard. The fuselage spans X ≈ +36 (nose) … −36.7 (tail). */
export const PRESETS: CameraPreset[] = [
  { id: 'home', label: 'Hero', pos: [58, 14, 64], target: [2, 6, 0], key: 'h' },
  { id: 'front', label: 'Front', pos: [92, 7.5, 0.01], target: [0, 7, 0] },
  { id: 'side', label: 'Profile', pos: [0, 8, 118], target: [0, 8, 0] },
  { id: 'top', label: 'Plan', pos: [0, 150, 0.01], target: [0, 0, 0] },
  { id: 'rear', label: 'Rear ¾', pos: [-70, 16, 46], target: [-6, 8, 0] },
  { id: 'belly', label: 'Underside', pos: [18, 0.6, 22], target: [-4, 4.2, 0] },
  { id: 'nose', label: 'Nose', pos: [46, 8.5, 14], target: [31, 7, 0] },
  { id: 'engines', label: 'Engines', pos: [26, 3.2, 38], target: [4, 3.5, 18] },
  { id: 'gear', label: 'Landing gear', pos: [10, 1.5, 15], target: [-2, 1.6, 3] },
  { id: 'wing', label: 'Wing top', pos: [-8, 22, 30], target: [-6, 5, 22] },
  { id: 'tail', label: 'Tail', pos: [-48, 16, 26], target: [-28, 14, 0] },
];

export async function flyTo(pos: [number, number, number], target: [number, number, number], animate = true): Promise<void> {
  if (!controls) return;
  await controls.setLookAt(pos[0], pos[1], pos[2], target[0], target[1], target[2], animate);
}

export function goPreset(id: string, animate = true): Promise<void> {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0]!;
  return flyTo(p.pos, p.target, animate);
}

const box = new Box3();
const tmp = new Box3();
/** Smoothly frame a set of objects, keeping the current viewing direction. */
export async function focusObjects(objects: Object3D[], padding = 0.35): Promise<void> {
  if (!controls || objects.length === 0) return;
  box.makeEmpty();
  for (const o of objects) {
    o.updateWorldMatrix(true, true);
    tmp.setFromObject(o);
    box.union(tmp);
  }
  if (box.isEmpty()) return;
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  const radius = Math.max(size.length() / 2, 0.8);
  const cam = controls.camera;
  const dir = new Vector3().subVectors(cam.position, controls.getTarget(new Vector3())).normalize();
  // Avoid looking from under the ground plane.
  if (centre.y + dir.y * radius * 3 < 0.4) dir.y = Math.abs(dir.y) + 0.15;
  dir.normalize();
  const fov = ((cam as { fov?: number }).fov ?? 35) * (Math.PI / 180);
  const dist = (radius * (1 + padding)) / Math.sin(fov / 2);
  const p = centre.clone().addScaledVector(dir, Math.max(dist, 3));
  p.y = Math.max(p.y, 0.5);
  await controls.setLookAt(p.x, p.y, p.z, centre.x, centre.y, centre.z, true);
}
