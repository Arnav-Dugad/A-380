/**
 * Viewport shading and offline-render settings, in the spirit of Blender's viewport header:
 * Wireframe, Solid, Material preview and Rendered (path traced), plus two inspection passes
 * (baked ambient occlusion and surface normals).
 */
import { create } from 'zustand';

export type Shading = 'wireframe' | 'solid' | 'material' | 'rendered' | 'ao' | 'normals';
export type ToneMap = 'neutral' | 'agx' | 'aces';
export type RenderBackground = 'auto' | 'environment' | 'color' | 'transparent';
export type RenderStatus = 'idle' | 'building' | 'compiling' | 'rendering' | 'done' | 'error';
/** Output size: the screen, double the screen, or a fixed long edge */
export type RenderSize = 'screen' | '2x' | '4k';

export interface RenderState {
  shading: Shading;
  maxSamples: number;
  bounces: number;
  /** soften caustics from glossy surfaces (0 = exact, noisier) */
  glossyFilter: number;
  dof: boolean;
  fStop: number;
  /** metres; 0 = automatic (the orbit target) */
  focusDistance: number;
  apertureBlades: number;
  denoise: boolean;
  denoiseStrength: number;
  toneMapping: ToneMap;
  /** path-tracing resolution relative to the canvas */
  renderScale: number;
  size: RenderSize;
  background: RenderBackground;
  /** live progress, written by the renderer */
  samples: number;
  status: RenderStatus;
  progress: number;
  triangles: number;
  elapsed: number;
  error: string | null;
  /** bumped to rebuild the path-traced scene from the live one */
  version: number;
  /** next click in the viewport sets the focus distance */
  pickFocus: boolean;
  set: (patch: Partial<RenderState>) => void;
  resync: () => void;
}

export const useRender = create<RenderState>()((set) => ({
  shading: 'material',
  maxSamples: 512,
  bounces: 6,
  glossyFilter: 0.25,
  dof: false,
  fStop: 2.8,
  focusDistance: 0,
  apertureBlades: 7,
  denoise: true,
  denoiseStrength: 0.5,
  toneMapping: 'neutral',
  renderScale: 1,
  size: 'screen',
  background: 'auto',
  samples: 0,
  status: 'idle',
  progress: 0,
  triangles: 0,
  elapsed: 0,
  error: null,
  version: 0,
  pickFocus: false,
  set: (patch) => set(patch),
  resync: () => set((s) => ({ version: s.version + 1 })),
}));

export const SHADING_INFO: Record<Shading, { label: string; hint: string }> = {
  wireframe: { label: 'Wireframe', hint: 'Every triangle edge' },
  solid: { label: 'Solid', hint: 'Clay studio shading for reading form' },
  material: { label: 'Material', hint: 'Real-time physically based materials' },
  rendered: { label: 'Rendered', hint: 'Path traced: global illumination, true reflections, depth of field' },
  ao: { label: 'Ambient occlusion', hint: 'The occlusion baked into every vertex' },
  normals: { label: 'Normals', hint: 'Surface orientation, for checking smoothing' },
};
