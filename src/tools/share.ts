/**
 * Share links: the view (camera, section, environment, shading, X-ray, exploded view), the
 * aircraft's configuration (gear, flaps, lights, open doors) and annotations, compressed into
 * the URL fragment. Nothing leaves the browser; the link carries the whole state.
 */
import { getControls } from '../camera/controls';
import { useRender, type Shading } from '../render/renderState';
import { systems } from '../sim/systems';
import { useUI, type EnvPreset, type Section } from '../state/ui';
import { useTools, type Annotation, type V3 } from './toolsState';

interface SharedState {
  v: 1;
  s: Section;
  e: EnvPreset;
  c: number[]; // camera position + target, centimetres
  f: number;
  sh?: Shading;
  x?: 1;
  ex?: number;
  g?: 'u';
  fl?: number;
  l?: 1;
  d?: string[];
  an?: [number, number, number, string][];
}

const r2 = (v: number) => Math.round(v * 100);

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

export function captureState(): SharedState {
  const ui = useUI.getState();
  const c = getControls();
  const pos = c ? c.getPosition({ x: 0, y: 0, z: 0 } as never) : null;
  const tgt = c ? c.getTarget({ x: 0, y: 0, z: 0 } as never) : null;
  const sys = systems.state;
  const st: SharedState = {
    v: 1,
    s: ui.section,
    e: ui.env,
    c: pos && tgt ? [pos.x, pos.y, pos.z, tgt.x, tgt.y, tgt.z].map(r2) : [],
    f: Math.round(ui.fov),
  };
  const shading = useRender.getState().shading;
  if (shading !== 'material') st.sh = shading;
  if (ui.xray.enabled) st.x = 1;
  if (ui.explode > 0.01) st.ex = Math.round(ui.explode * 100) / 100;
  if (sys.gear.lever === 'up') st.g = 'u';
  if (sys.highLift.lever) st.fl = sys.highLift.lever;
  if (sys.lights.nav) st.l = 1;
  const open = Object.values(sys.doors)
    .filter((d) => d.target > 0.5)
    .map((d) => d.id);
  if (open.length) st.d = open;
  const an = useTools.getState().annotations;
  if (an.length) st.an = an.slice(0, 30).map((a) => [r2(a.p[0]), r2(a.p[1]), r2(a.p[2]), a.text.slice(0, 140)]);
  return st;
}

export function shareUrl(): string {
  const url = new URL(window.location.href);
  url.hash = `v=${toBase64Url(JSON.stringify(captureState()))}`;
  return url.toString();
}

export function parseShared(hash = window.location.hash): SharedState | null {
  const m = hash.match(/[#&]v=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const st = JSON.parse(fromBase64Url(m[1]!)) as SharedState;
    return st && st.v === 1 ? st : null;
  } catch {
    return null;
  }
}

/** Apply a shared state once the aircraft and camera are ready. */
export async function applyShared(st: SharedState): Promise<void> {
  const ui = useUI.getState();
  ui.set({ section: st.s, env: st.e, fov: st.f || ui.fov, introDone: true, explode: st.ex ?? 0 });
  ui.setXRay({ enabled: !!st.x });
  if (st.sh) useRender.getState().set({ shading: st.sh });
  if (st.g === 'u') systems.setGearLever('up');
  if (st.fl) systems.setFlapLever(st.fl);
  if (st.l) {
    if (!systems.state.elec.dc) systems.setBattery(true);
    for (const k of ['nav', 'beacon', 'strobe', 'logo'] as const) systems.setLight(k, true);
  }
  for (const id of st.d ?? []) systems.setDoor(id, true);
  if (st.an) {
    const notes: Annotation[] = st.an.map(([x, y, z, text], i) => ({ id: 100000 + i, p: [x / 100, y / 100, z / 100] as V3, text }));
    useTools.getState().set({ annotations: notes });
  }
  const c = getControls();
  if (c && st.c.length === 6) {
    const [px, py, pz, tx, ty, tz] = st.c.map((v) => v / 100) as [number, number, number, number, number, number];
    await c.setLookAt(px, py, pz, tx, ty, tz, true);
  }
}
