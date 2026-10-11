import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Section = 'explore' | 'anatomy' | 'systems' | 'cockpit' | 'cabin' | 'flight' | 'specs';
export type EnvPreset = 'studio' | 'apron' | 'golden' | 'hangar' | 'night';
export type Quality = 'ultra' | 'high' | 'balanced' | 'performance';
export type Weather = 'clear' | 'overcast' | 'lightRain' | 'heavyRain' | 'fog' | 'windy';
export type ExplodeGroup = 'all' | 'engines' | 'gear' | 'wings' | 'empennage' | 'fuselage';
export type SystemLayer = 'none' | 'flightControls' | 'landingGear' | 'propulsion' | 'doors' | 'structure' | 'cabin';

export interface XRay {
  enabled: boolean;
  skinOpacity: number;
  structure: boolean;
  cabin: boolean;
  cargo: boolean;
  clip: number; // 0 = off; otherwise clipping-plane station fraction 0..1
  clipVertical: number; // 0 = off; cut-away height fraction
}

export interface UIState {
  section: Section;
  selected: string | null;
  /** scene-graph node name of the selected instance (e.g. slat_R3) */
  selectedNode: string | null;
  hovered: string | null;
  env: EnvPreset;
  quality: Quality;
  exposure: number;
  weather: Weather;
  timeOfDay: number;
  explode: number;
  explodeGroup: ExplodeGroup;
  isolate: SystemLayer;
  xray: XRay;
  photoMode: boolean;
  fov: number;
  cinematic: string | null;
  introDone: boolean;
  showHelp: boolean;
  showStats: boolean;
  audio: boolean;
  set: (patch: Partial<UIState>) => void;
  setXRay: (patch: Partial<XRay>) => void;
  select: (id: string | null, node?: string | null) => void;
}

const safeStorage = createJSONStorage(() => {
  try {
    const k = '__a380_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
  }
});

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      section: 'explore',
      selected: null,
      selectedNode: null,
      hovered: null,
      env: 'studio',
      quality: 'high',
      exposure: 1,
      weather: 'clear',
      timeOfDay: 15.5,
      explode: 0,
      explodeGroup: 'all',
      isolate: 'none',
      xray: { enabled: false, skinOpacity: 0.18, structure: true, cabin: true, cargo: true, clip: 0, clipVertical: 0 },
      photoMode: false,
      fov: 35,
      cinematic: null,
      introDone: false,
      showHelp: false,
      showStats: false,
      audio: false,
      set: (patch) => set(patch),
      setXRay: (patch) => set((s) => ({ xray: { ...s.xray, ...patch } })),
      select: (id, node = null) => set({ selected: id, selectedNode: id ? node : null }),
    }),
    {
      name: 'a380-prefs-v1',
      storage: safeStorage,
      partialize: (s) => ({ quality: s.quality, env: s.env, exposure: s.exposure, audio: s.audio, showStats: s.showStats }),
    },
  ),
);
