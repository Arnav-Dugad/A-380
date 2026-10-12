/**
 * State for the modelling-style tools: outliner visibility, measurements, annotations, saved
 * views, the reference-image overlay, recording, XR and the guided story. Annotations and saved
 * views persist in local storage; everything shareable also travels in share links.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage, type EnvPreset, type Section } from '../state/ui';
import type { Shading } from '../render/renderState';

export type V3 = [number, number, number];
export type ToolPanel = 'outliner' | 'measure' | 'annotate' | 'views' | 'share' | 'record' | 'xr' | 'story' | 'reference';
export type PickMode = 'none' | 'measure' | 'annotate';

export interface Measurement {
  id: number;
  a: V3;
  b: V3 | null;
}
export interface Annotation {
  id: number;
  p: V3;
  text: string;
}
export interface SavedView {
  id: number;
  name: string;
  pos: V3;
  target: V3;
  fov: number;
  section: Section;
  env: EnvPreset;
  shading: Shading;
  thumb: string;
}
export interface ReferenceImage {
  url: string | null;
  name: string;
  opacity: number;
  scale: number;
  x: number;
  y: number;
  rotate: number;
  flip: boolean;
  blend: 'normal' | 'difference';
  /** draw the image above the interface panels (for alignment) */
  front: boolean;
}

export interface ToolsState {
  panel: ToolPanel | null;
  pick: PickMode;
  measurements: Measurement[];
  annotations: Annotation[];
  views: SavedView[];
  /** node names hidden from the outliner */
  hidden: string[];
  ortho: boolean;
  reference: ReferenceImage;
  recording: boolean;
  turntable: { active: boolean; seconds: number; t: number };
  xr: 'none' | 'vr' | 'ar';
  story: number; // chapter index, −1 = off
  storyPlaying: boolean;
  nextId: number;
  set: (patch: Partial<ToolsState>) => void;
  togglePanel: (p: ToolPanel) => void;
}

export const useTools = create<ToolsState>()(
  persist(
    (set) => ({
      panel: null,
      pick: 'none',
      measurements: [],
      annotations: [],
      views: [],
      hidden: [],
      ortho: false,
      reference: { url: null, name: '', opacity: 0.5, scale: 1, x: 0, y: 0, rotate: 0, flip: false, blend: 'normal', front: false },
      recording: false,
      turntable: { active: false, seconds: 12, t: 0 },
      xr: 'none',
      story: -1,
      storyPlaying: false,
      nextId: 1,
      set: (patch) => set(patch),
      togglePanel: (p) =>
        set((s) => {
          const open = s.panel === p ? null : p;
          // leaving a picking tool ends its pick mode
          const pick: PickMode = open === 'measure' ? 'measure' : open === 'annotate' ? 'annotate' : 'none';
          return { panel: open, pick };
        }),
    }),
    {
      name: 'a380-tools-v1',
      storage: safeStorage,
      partialize: (s) => ({ annotations: s.annotations, views: s.views, nextId: s.nextId }),
    },
  ),
);

export const newId = (): number => {
  const id = useTools.getState().nextId;
  useTools.setState({ nextId: id + 1 });
  return id;
};
