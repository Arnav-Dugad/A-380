/**
 * Blender-style numpad navigation: 1 front, 3 right, 7 top (Ctrl for the opposite side),
 * 2/4/6/8 orbit in 15° steps, 5 toggles the orthographic-style view, 0 the hero camera,
 * . frames the selection and +/− zoom. Model axes: +X nose, +Y up, +Z starboard.
 */
import { focusObjects, flyTo, getControls, goPreset } from './controls';
import { unitByNode } from '../aircraft/selection';
import { useTools } from '../tools/toolsState';
import { useUI } from '../state/ui';
import { Vector3 } from 'three';

const STEP = Math.PI / 12;

export function numpadView(code: string, opposite: boolean): boolean {
  const c = getControls();
  if (!c) return false;
  const t = c.getTarget(new Vector3());
  const d = Math.max(c.distance, 20);
  const at = (dir: [number, number, number]) => void flyTo([t.x + dir[0] * d, t.y + dir[1] * d, t.z + dir[2] * d], [t.x, t.y, t.z], true);
  switch (code) {
    case 'Numpad1':
      at(opposite ? [-1, 0, 0.0001] : [1, 0, 0.0001]);
      return true;
    case 'Numpad3':
      at(opposite ? [0.0001, 0, -1] : [0.0001, 0, 1]);
      return true;
    case 'Numpad7':
      // top looks down with the nose up the screen; bottom looks up from below the ground plane limit
      at(opposite ? [0.0001, -0.02, 0.0001] : [0.0001, 1, 0.0001]);
      return true;
    case 'Numpad2':
      void c.rotate(0, STEP, true);
      return true;
    case 'Numpad8':
      void c.rotate(0, -STEP, true);
      return true;
    case 'Numpad4':
      void c.rotate(-STEP, 0, true);
      return true;
    case 'Numpad6':
      void c.rotate(STEP, 0, true);
      return true;
    case 'Numpad9':
      void c.rotate(Math.PI, 0, true);
      return true;
    case 'Numpad5': {
      const s = useTools.getState();
      s.set({ ortho: !s.ortho });
      return true;
    }
    case 'Numpad0':
      void goPreset('home');
      return true;
    case 'NumpadDecimal': {
      const ui = useUI.getState();
      const u = ui.selected && ui.selectedNode ? unitByNode(ui.selectedNode, ui.selected) : null;
      if (u) void focusObjects(u.meshes);
      return true;
    }
    case 'NumpadAdd':
      void c.dolly(d * 0.2, true);
      return true;
    case 'NumpadSubtract':
      void c.dolly(-d * 0.25, true);
      return true;
    default:
      return false;
  }
}
