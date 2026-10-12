/** Light-weight render plumbing shared by the UI and the (lazily loaded) path tracer. */
import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping, type ToneMapping } from 'three';
import { useRender, type ToneMap } from './renderState';

export const TONE_MAPS: Record<ToneMap, ToneMapping> = { neutral: NeutralToneMapping, agx: AgXToneMapping, aces: ACESFilmicToneMapping };

export const canvasRef: { el: HTMLCanvasElement | null } = { el: null };

/** The live path tracer, for the automation bridge (diagnostics only). */
export const tracerRef: { pt: unknown } = { pt: null };

/** Saves the current path-traced frame as a PNG (alpha preserved for a transparent background). */
export function saveRender(): { width: number; height: number } | null {
  const c = canvasRef.el;
  if (!c) return null;
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `a380-render-${Math.floor(useRender.getState().samples)}spp-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  a.click();
  return { width: c.width, height: c.height };
}
