import { useEffect } from 'react';
import { focusObjects, goPreset } from '../camera/controls';
import { clearSelection } from '../aircraft/interaction';
import { unitByNode } from '../aircraft/selection';
import { systems } from '../sim/systems';
import { useUI } from '../state/ui';
import { SECTIONS } from './TopBar';

/** Global keyboard shortcuts (ignored while typing in inputs and during flight mode). */
export function useShortcuts(toggleHelp: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const ui = useUI.getState();
      if (ui.section === 'flight' && !['Escape', '?', 'p', 'P'].includes(e.key) && !/^[1-7]$/.test(e.key)) return;
      if (ui.section === 'cabin' && ['w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) return;
      const sec = SECTIONS.find((s) => s.key === e.key);
      if (sec) return ui.set({ section: sec.id });
      switch (e.key) {
        case 'Escape':
          if (ui.photoMode) ui.set({ photoMode: false });
          else if (ui.cinematic) ui.set({ cinematic: null });
          else clearSelection();
          break;
        case 'h':
        case 'H':
          void goPreset('home');
          break;
        case 'f':
        case 'F': {
          const u = ui.selected && ui.selectedNode ? unitByNode(ui.selectedNode, ui.selected) : null;
          if (u) void focusObjects(u.meshes);
          break;
        }
        case 'x':
        case 'X':
          ui.setXRay({ enabled: !ui.xray.enabled });
          break;
        case 'e':
        case 'E':
          ui.set({ explode: ui.explode > 0 ? 0 : 0.6 });
          break;
        case 'g':
        case 'G':
          systems.setGearLever(systems.state.gear.lever === 'down' ? 'up' : 'down');
          break;
        case '[':
          systems.setFlapLever(systems.state.highLift.lever - 1);
          break;
        case ']':
          systems.setFlapLever(systems.state.highLift.lever + 1);
          break;
        case 'l':
        case 'L': {
          const on = !systems.state.lights.nav;
          if (on && !systems.state.elec.dc) systems.setBattery(true);
          for (const k of ['nav', 'beacon', 'strobe', 'logo'] as const) systems.setLight(k, on);
          break;
        }
        case 'c':
        case 'C':
          ui.set({ cinematic: ui.cinematic ? null : 'grand' });
          break;
        case 'p':
        case 'P':
          ui.set({ photoMode: !ui.photoMode });
          break;
        case '?':
          toggleHelp();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleHelp]);
}
