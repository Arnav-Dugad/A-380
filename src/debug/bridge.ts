/**
 * Automation bridge used by Playwright tests and the screenshot tooling. It exposes a small,
 * read-mostly API on `window.__a380` — never relied upon by the UI itself.
 */
import type CameraControlsImpl from 'camera-controls';
import { getRig } from '../aircraft/rig';
import { useUI } from '../state/ui';

export interface Bridge {
  ready: () => boolean;
  camera: (pos: [number, number, number], target: [number, number, number], animate?: boolean) => Promise<void>;
  ui: typeof useUI;
  rigInfo: () => { nodes: number; articulated: number; meshes: number; parts: string[] } | null;
  extra: Record<string, unknown>;
}

let controls: CameraControlsImpl | null = null;
export function registerControls(c: CameraControlsImpl | null): void {
  controls = c;
}

declare global {
  interface Window {
    __a380?: Bridge;
  }
}

export function installBridge(): void {
  window.__a380 = {
    ready: () => !!getRig() && !!controls,
    camera: async (pos, target, animate = false) => {
      if (!controls) return;
      await controls.setLookAt(pos[0], pos[1], pos[2], target[0], target[1], target[2], animate);
    },
    ui: useUI,
    rigInfo: () => {
      const r = getRig();
      if (!r) return null;
      return { nodes: r.nodes.size, articulated: r.articulated.size, meshes: r.meshes.length, parts: [...r.partMeshes.keys()] };
    },
    extra: {},
  };
}
