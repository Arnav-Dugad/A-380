/**
 * Automation bridge used by Playwright tests and the screenshot tooling. It exposes a small,
 * read-mostly API on `window.__a380` — never relied upon by the UI itself.
 */
import { getControls } from '../camera/controls';
import { getRig } from '../aircraft/rig';
import { useUI } from '../state/ui';
import { systems } from '../sim/systems';
import { firstPerson } from '../camera/FirstPerson';
import { cabinActions } from '../interior/CabinScene';
import { Box3, Raycaster, Vector2, Vector3 } from 'three';
import { flight } from '../sim/flight';
import { perf } from '../perf/PerfProbe';
import { useRender } from '../render/renderState';
import { previewAtlas } from '../aircraft/textures/atlases';

export interface Bridge {
  ready: () => boolean;
  camera: (pos: [number, number, number], target: [number, number, number], animate?: boolean) => Promise<void>;
  ui: typeof useUI;
  rigInfo: () => { nodes: number; articulated: number; meshes: number; parts: string[] } | null;
  systems: typeof systems;
  /** screen position (CSS px) of a named scene node's bounding-box centre */
  project: (name: string) => { x: number; y: number } | null;
  node: (name: string) => { pos: number[]; quat: number[] } | null;
  flight: typeof flight;
  perf: typeof perf;
  render: typeof useRender;
  atlas: typeof previewAtlas;
  extra: Record<string, unknown>;
}


declare global {
  interface Window {
    __a380?: Bridge;
  }
}

export function installBridge(): void {
  window.__a380 = {
    ready: () => !!getRig() && !!getControls(),
    camera: async (pos, target, animate = false) => {
      const controls = getControls();
      if (!controls) return;
      await controls.setLookAt(pos[0], pos[1], pos[2], target[0], target[1], target[2], animate);
    },
    ui: useUI,
    rigInfo: () => {
      const r = getRig();
      if (!r) return null;
      return { nodes: r.nodes.size, articulated: r.articulated.size, meshes: r.meshes.length, parts: [...r.partMeshes.keys()] };
    },
    systems,
    render: useRender,
    atlas: previewAtlas,
    project: (name) => {
      const n = getRig()?.nodes.get(name);
      const c = getControls();
      if (!n || !c) return null;
      const cam = c.camera;
      const box = new Box3().setFromObject(n);
      const p = box.getCenter(new Vector3()).project(cam);
      const el = document.querySelector('canvas')!;
      const r = el.getBoundingClientRect();
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    },
    node: (name) => {
      const n = getRig()?.nodes.get(name);
      if (!n) return null;
      return { pos: n.position.toArray(), quat: n.quaternion.toArray() };
    },
    flight,
    perf,
    extra: {
      firstPerson,
      cabinActions,
      /** set the orbit camera's lens (degrees) */
      fov: (deg: number) => {
        const cam = getControls()?.camera as import('three').PerspectiveCamera | undefined;
        if (!cam) return;
        cam.fov = deg;
        cam.updateProjectionMatrix();
        const c = getControls();
        if (c) c.maxDistance = 5000;
      },
      /** names of the meshes under a screen point (CSS px), nearest first */
      pick: (x: number, y: number) => {
        const c = getControls();
        const el = document.querySelector('canvas');
        const root = getRig()?.roots[0]?.parent?.parent;
        if (!c || !el || !root) return [];
        const r = el.getBoundingClientRect();
        const ray = new Raycaster();
        ray.setFromCamera(new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), c.camera);
        return ray.intersectObjects([root], true).slice(0, 5).map((h) => `${h.object.name} (${h.distance.toFixed(2)} m)`);
      },
    },
  };
}
