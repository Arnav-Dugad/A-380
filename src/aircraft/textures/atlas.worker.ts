/// <reference lib="webworker" />
/**
 * Paints the aircraft texture atlases with OffscreenCanvas, off the main thread, and returns
 * raw RGBA buffers (transferred, not copied).
 */
import interUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import { paintFuselage } from './fuselage';
import { paintNacelle, paintTyre } from './nacelle';
import type { AtlasBuffers } from './paint';
import { paintWing } from './wing';
import { paintTail } from './tail';

export type AtlasKind = 'fuselage' | 'wing' | 'tail' | 'nacelle' | 'tyre';
export interface AtlasRequest {
  id: number;
  kind: AtlasKind;
  W: number;
  H: number;
  sidewall?: [number, number][];
}

const fontReady = (async () => {
  try {
    const f = new FontFace('Inter', `url(${interUrl})`, { weight: '100 900' });
    await f.load();
    (self as unknown as { fonts: FontFaceSet }).fonts.add(f);
  } catch {
    /* system sans-serif fallback */
  }
})();

export function paint(req: AtlasRequest): AtlasBuffers {
  switch (req.kind) {
    case 'fuselage':
      return paintFuselage(req.W, req.H);
    case 'wing':
      return paintWing(req.W, req.H);
    case 'tail':
      return paintTail(req.W, req.H);
    case 'nacelle':
      return paintNacelle(req.W, req.H);
    case 'tyre':
      return paintTyre(req.W, req.H, req.sidewall ?? []);
  }
}

self.onmessage = async (e: MessageEvent<AtlasRequest>) => {
  await fontReady;
  try {
    const out = paint(e.data);
    const transfer = [out.normal.buffer, out.orm.buffer, ...(out.color ? [out.color.buffer] : [])] as ArrayBuffer[];
    (self as unknown as Worker).postMessage({ id: e.data.id, out }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: e.data.id, error: String(err) });
  }
};
