import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Mesh, type Object3D } from 'three';
import { getRig, onRig } from '../aircraft/rig';
import { resolveSelection } from '../aircraft/selection';
import { selectUnit } from '../aircraft/interaction';
import { flyTo, getControls } from '../camera/controls';
import { PARTS } from '../data/parts';
import { canvasRef } from '../render/output';
import { useRender } from '../render/renderState';
import { useUI } from '../state/ui';
import { recordingSupported, startRecording, stopRecording } from '../tools/record';
import { shareUrl } from '../tools/share';
import { CHAPTERS, playChapter } from '../tools/story';
import { fmtLength } from '../tools/ToolsLayer';
import { newId, useTools, type ToolPanel, type V3 } from '../tools/toolsState';
import { xrSupported } from '../tools/xr';
import { Icon, type IconName } from './icons';
import { Button, Panel, Segmented, Slider, Toggle, cx } from './kit';

export const TOOLS: { id: ToolPanel; label: string; icon: IconName; hint: string }[] = [
  { id: 'outliner', label: 'Outliner', icon: 'list', hint: 'Scene tree, visibility and selection' },
  { id: 'measure', label: 'Measure', icon: 'ruler', hint: 'Click two points on the aircraft' },
  { id: 'annotate', label: 'Annotate', icon: 'pin', hint: 'Pin notes to the model' },
  { id: 'views', label: 'Saved views', icon: 'bookmark', hint: 'Bookmark camera and scene' },
  { id: 'reference', label: 'Reference image', icon: 'image', hint: 'Overlay a photo or drawing to compare' },
  { id: 'record', label: 'Video', icon: 'video', hint: 'Turntable and screen recording' },
  { id: 'share', label: 'Share link', icon: 'share', hint: 'Link to this exact view' },
  { id: 'xr', label: 'VR / AR', icon: 'vr', hint: 'Stand beside it at true scale' },
  { id: 'story', label: 'Guided story', icon: 'story', hint: 'A narrated walk through the aircraft' },
];

/** Tools dropdown for the top bar. */
export function ToolsMenu() {
  const panel = useTools((s) => s.panel);
  const toggle = useTools((s) => s.togglePanel);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Tools"
        title="Tools"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx('pointer-events-auto grid h-9 w-9 place-items-center rounded-xl text-graphite-300 transition-colors hover:bg-white/[0.06] hover:text-paper', (open || panel) && 'bg-ice-400/[0.12] text-ice-300')}
      >
        <Icon name="grid" />
      </button>
      {open && (
        <Panel className="a380-enter absolute right-0 top-11 z-30 w-64 p-1.5">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                toggle(t.id);
                setOpen(false);
              }}
              className={cx('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors', panel === t.id ? 'bg-white/[0.07] text-paper' : 'text-graphite-300 hover:bg-white/[0.04] hover:text-paper')}
            >
              <Icon name={t.icon} size={16} className={panel === t.id ? 'text-ice-400' : ''} />
              <span className="min-w-0">
                <span className="block text-[12.5px]">{t.label}</span>
                <span className="block truncate text-[10.5px] text-graphite-400">{t.hint}</span>
              </span>
            </button>
          ))}
        </Panel>
      )}
    </div>
  );
}

function Shell({ title, icon, children, wide }: { title: string; icon: IconName; children: ReactNode; wide?: boolean }) {
  const set = useTools((s) => s.set);
  return (
    <Panel className={cx('flex max-h-full flex-col overflow-hidden', wide ? 'w-full' : 'w-[320px]')} role="dialog" aria-label={title}>
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <div className="flex items-center gap-2">
          <Icon name={icon} size={15} className="text-ice-400" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ice-400/90">{title}</span>
        </div>
        <button type="button" aria-label={`Close ${title}`} onClick={() => set({ panel: null, pick: 'none' })} className="grid h-7 w-7 place-items-center rounded-lg text-graphite-400 hover:bg-white/[0.06] hover:text-paper">
          <Icon name="close" size={15} />
        </button>
      </div>
      <div className="a380-scroll min-h-0 flex-1 overflow-y-auto pb-2">{children}</div>
    </Panel>
  );
}

// ------------------------------------------------------------------ outliner
function label(o: Object3D): string {
  const id = o.userData.partId as string | undefined;
  const base = id && PARTS[id] ? PARTS[id].name : '';
  return base && !(o instanceof Mesh) ? `${base}` : o.name || (o instanceof Mesh ? 'mesh' : 'group');
}

function countTris(o: Object3D): number {
  let n = 0;
  o.traverse((c) => {
    const g = (c as Mesh).geometry;
    if ((c as Mesh).isMesh && g) n += (g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)) / 3;
  });
  return n;
}

function TreeRow({ o, depth, filter }: { o: Object3D; depth: number; filter: string }) {
  const hidden = useTools((s) => s.hidden.includes(o.name));
  const set = useTools((s) => s.set);
  const selectedNode = useUI((s) => s.selectedNode);
  const [open, setOpen] = useState(depth < 1);
  const kids = o.children.filter((c) => c.name || c.children.length);
  const name = label(o);
  const match = !filter || name.toLowerCase().includes(filter) || o.name.toLowerCase().includes(filter);
  const childMatch = useMemo(() => {
    if (!filter) return true;
    let m = false;
    o.traverse((c) => {
      if (c !== o && (label(c).toLowerCase().includes(filter) || c.name.toLowerCase().includes(filter))) m = true;
    });
    return m;
  }, [o, filter]);
  if (!match && !childMatch) return null;
  const expanded = open || (!!filter && childMatch);
  const select = () => {
    const m = o instanceof Mesh ? o : (o.getObjectByProperty('isMesh', true) as Mesh | undefined);
    const unit = m ? resolveSelection(m) : null;
    if (unit) selectUnit(unit);
  };
  return (
    <>
      <div className={cx('group flex h-7 items-center gap-1 pr-2 text-[11.5px]', selectedNode === o.name ? 'bg-ice-400/[0.10] text-paper' : 'text-graphite-300 hover:bg-white/[0.04] hover:text-paper')} style={{ paddingLeft: 8 + depth * 12 }}>
        <button type="button" aria-label={expanded ? 'Collapse' : 'Expand'} onClick={() => setOpen(!expanded)} className={cx('grid h-5 w-5 shrink-0 place-items-center text-graphite-500', !kids.length && 'invisible')}>
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={11} />
        </button>
        <button type="button" onClick={select} className="min-w-0 flex-1 truncate text-left" title={o.name}>
          {name}
          {name !== o.name && o.name && <span className="ml-1.5 font-mono text-[9.5px] text-graphite-500">{o.name}</span>}
        </button>
        <button
          type="button"
          aria-label={hidden ? `Show ${name}` : `Hide ${name}`}
          onClick={() => {
            const h = useTools.getState().hidden;
            set({ hidden: hidden ? h.filter((n) => n !== o.name) : [...h, o.name] });
          }}
          className={cx('grid h-5 w-5 shrink-0 place-items-center rounded', hidden ? 'text-graphite-600' : 'text-graphite-400 opacity-60 group-hover:opacity-100')}
        >
          <Icon name="eye" size={13} className={hidden ? 'opacity-40' : ''} />
        </button>
      </div>
      {expanded && kids.map((c) => <TreeRow key={c.uuid} o={c} depth={depth + 1} filter={filter} />)}
    </>
  );
}

function Outliner({ wide }: { wide?: boolean }) {
  const [roots, setRoots] = useState<Object3D[]>(() => getRig()?.roots ?? []);
  const [filter, setFilter] = useState('');
  const hiddenCount = useTools((s) => s.hidden.length);
  const set = useTools((s) => s.set);
  useEffect(() => onRig((r) => setRoots(r?.roots ? [...r.roots] : [])), []);
  const tris = useMemo(() => roots.reduce((a, r) => a + countTris(r), 0), [roots]);
  return (
    <Shell title="Outliner" icon="list" wide={wide}>
      <div className="px-4 pb-2">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value.toLowerCase())}
          placeholder="Filter: slat, door, wheel…"
          aria-label="Filter the scene tree"
          className="h-8 w-full rounded-lg border border-white/[0.07] bg-black/25 px-2.5 text-[12px] text-paper placeholder:text-graphite-500 focus:border-ice-400/40 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-graphite-400">
          <span>{(tris / 1e6).toFixed(2)}M triangles</span>
          {hiddenCount > 0 && (
            <button type="button" className="text-ice-300 hover:text-ice-200" onClick={() => set({ hidden: [] })}>
              Unhide all ({hiddenCount})
            </button>
          )}
        </div>
      </div>
      <div role="tree" aria-label="Scene tree">
        {roots.map((r) => (
          <TreeRow key={r.uuid} o={r} depth={0} filter={filter} />
        ))}
      </div>
    </Shell>
  );
}

// ------------------------------------------------------------------ measure & annotate
function MeasurePanel({ wide }: { wide?: boolean }) {
  const list = useTools((s) => s.measurements);
  const pick = useTools((s) => s.pick);
  const set = useTools((s) => s.set);
  return (
    <Shell title="Measure" icon="ruler" wide={wide}>
      <div className="px-4">
        <Toggle label="Pick points" hint="Click the aircraft twice; drag still orbits" checked={pick === 'measure'} onChange={(v) => set({ pick: v ? 'measure' : 'none' })} />
      </div>
      {list.length === 0 && <p className="px-4 py-3 text-[11.5px] leading-relaxed text-graphite-400">Distances are measured between surface points in metres, at the model's true scale.</p>}
      <ul className="mt-1 space-y-1 px-3">
        {list.map((m, i) => {
          const d = m.b ? Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]) : 0;
          return (
            <li key={m.id} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-[#ffd166]">#{i + 1}</span>
                <span className="font-mono text-[11.5px] text-paper">{m.b ? fmtLength(d) : 'pick second point…'}</span>
                <button type="button" aria-label="Delete measurement" onClick={() => set({ measurements: list.filter((x) => x.id !== m.id) })} className="text-graphite-500 hover:text-paper">
                  <Icon name="close" size={13} />
                </button>
              </div>
              {m.b && (
                <div className="mt-1 grid grid-cols-3 font-mono text-[10px] text-graphite-400">
                  <span>ΔX {(m.b[0] - m.a[0]).toFixed(2)}</span>
                  <span>ΔY {(m.b[1] - m.a[1]).toFixed(2)}</span>
                  <span>ΔZ {(m.b[2] - m.a[2]).toFixed(2)}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {list.length > 0 && (
        <div className="px-4 pt-2">
          <Button size="sm" variant="ghost" icon="reset" onClick={() => set({ measurements: [] })}>
            Clear all
          </Button>
        </div>
      )}
    </Shell>
  );
}

function AnnotatePanel({ wide }: { wide?: boolean }) {
  const list = useTools((s) => s.annotations);
  const pick = useTools((s) => s.pick);
  const set = useTools((s) => s.set);
  return (
    <Shell title="Annotate" icon="pin" wide={wide}>
      <div className="px-4">
        <Toggle label="Place pins" hint="Click the aircraft to drop a numbered pin" checked={pick === 'annotate'} onChange={(v) => set({ pick: v ? 'annotate' : 'none' })} />
      </div>
      {list.length === 0 && <p className="px-4 py-3 text-[11.5px] leading-relaxed text-graphite-400">Notes are saved in this browser and travel with share links.</p>}
      <ul className="mt-1 space-y-1.5 px-3">
        {list.map((n, i) => (
          <li key={n.id} className="flex items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] p-2">
            <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ice-400 font-mono text-[10px] font-[600] text-graphite-950">{i + 1}</span>
            <textarea
              value={n.text}
              rows={2}
              autoFocus={!n.text && i === list.length - 1}
              placeholder="Write a note…"
              aria-label={`Note ${i + 1}`}
              onChange={(e) => set({ annotations: list.map((x) => (x.id === n.id ? { ...x, text: e.target.value } : x)) })}
              className="min-h-[38px] flex-1 resize-y rounded-md border border-white/[0.06] bg-black/25 px-2 py-1 text-[12px] text-paper placeholder:text-graphite-500 focus:border-ice-400/40 focus:outline-none"
            />
            <div className="flex flex-col gap-1">
              <button
                type="button"
                aria-label="Fly to note"
                className="text-graphite-400 hover:text-paper"
                onClick={() => {
                  const c = getControls();
                  if (!c) return;
                  const pos = c.getPosition({ x: 0, y: 0, z: 0 } as never);
                  const p = n.p;
                  const dir = [pos.x - p[0], pos.y - p[1], pos.z - p[2]];
                  const l = Math.hypot(dir[0]!, dir[1]!, dir[2]!) || 1;
                  void flyTo([p[0] + (dir[0]! / l) * 12, p[1] + (dir[1]! / l) * 12, p[2] + (dir[2]! / l) * 12], p, true);
                }}
              >
                <Icon name="target" size={14} />
              </button>
              <button type="button" aria-label="Delete note" className="text-graphite-500 hover:text-paper" onClick={() => set({ annotations: list.filter((x) => x.id !== n.id) })}>
                <Icon name="close" size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

// ------------------------------------------------------------------ saved views
function thumbnail(): string {
  const src = canvasRef.el;
  if (!src) return '';
  const c = document.createElement('canvas');
  c.width = 192;
  c.height = 108;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const k = Math.max(c.width / src.width, c.height / src.height);
  const w = src.width * k;
  const h = src.height * k;
  try {
    ctx.drawImage(src, (c.width - w) / 2, (c.height - h) / 2, w, h);
    return c.toDataURL('image/jpeg', 0.72);
  } catch {
    return '';
  }
}

function ViewsPanel({ wide }: { wide?: boolean }) {
  const views = useTools((s) => s.views);
  const set = useTools((s) => s.set);
  const save = () => {
    const c = getControls();
    if (!c) return;
    const p = c.getPosition({ x: 0, y: 0, z: 0 } as never);
    const t = c.getTarget({ x: 0, y: 0, z: 0 } as never);
    const ui = useUI.getState();
    const v = {
      id: newId(),
      name: `View ${views.length + 1}`,
      pos: [p.x, p.y, p.z] as V3,
      target: [t.x, t.y, t.z] as V3,
      fov: ui.fov,
      section: ui.section,
      env: ui.env,
      shading: useRender.getState().shading,
      thumb: thumbnail(),
    };
    set({ views: [...views, v].slice(-24) });
  };
  return (
    <Shell title="Saved views" icon="bookmark" wide={wide}>
      <div className="px-4 pb-2">
        <Button size="sm" variant="accent" icon="bookmark" className="w-full" onClick={save}>
          Save current view
        </Button>
      </div>
      {views.length === 0 && <p className="px-4 py-2 text-[11.5px] leading-relaxed text-graphite-400">Saved views keep the camera, section, environment and shading. They stay in this browser.</p>}
      <div className="grid grid-cols-2 gap-2 px-3">
        {views.map((v) => (
          <div key={v.id} className="group overflow-hidden rounded-lg border border-white/[0.06] bg-black/20">
            <button
              type="button"
              className="block w-full"
              aria-label={`Go to ${v.name}`}
              onClick={() => {
                useUI.getState().set({ section: v.section, env: v.env, fov: v.fov });
                useRender.getState().set({ shading: v.shading });
                window.setTimeout(() => void flyTo(v.pos, v.target, true), 50);
              }}
            >
              {v.thumb ? <img src={v.thumb} alt="" className="aspect-video w-full object-cover" /> : <div className="aspect-video w-full bg-graphite-800" />}
            </button>
            <div className="flex items-center gap-1 px-1.5 py-1">
              <input
                value={v.name}
                aria-label="View name"
                onChange={(e) => set({ views: views.map((x) => (x.id === v.id ? { ...x, name: e.target.value } : x)) })}
                className="min-w-0 flex-1 bg-transparent text-[11px] text-paper/90 focus:outline-none"
              />
              <button type="button" aria-label={`Delete ${v.name}`} onClick={() => set({ views: views.filter((x) => x.id !== v.id) })} className="text-graphite-500 hover:text-paper">
                <Icon name="close" size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

// ------------------------------------------------------------------ share
function SharePanel({ wide }: { wide?: boolean }) {
  const [url, setUrl] = useState(() => shareUrl());
  const [copied, setCopied] = useState(false);
  return (
    <Shell title="Share link" icon="share" wide={wide}>
      <div className="space-y-2.5 px-4">
        <p className="text-[11.5px] leading-relaxed text-graphite-400">The link restores this camera, section, environment, shading, X-ray, gear, flaps, lights, open doors and annotations. All state lives in the link itself.</p>
        <textarea readOnly value={url} rows={3} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} className="w-full resize-none rounded-lg border border-white/[0.07] bg-black/25 px-2.5 py-2 font-mono text-[10.5px] text-graphite-300 focus:outline-none" />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="accent"
            icon="share"
            className="flex-1"
            onClick={async () => {
              const u = shareUrl();
              setUrl(u);
              try {
                await navigator.clipboard.writeText(u);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          {'share' in navigator && (
            <Button size="sm" icon="external" onClick={() => void navigator.share({ title: 'A380 — The Digital Twin', url: shareUrl() }).catch(() => undefined)}>
              Share…
            </Button>
          )}
          <Button size="sm" variant="ghost" icon="reset" onClick={() => setUrl(shareUrl())} title="Refresh with the current view">
            Update
          </Button>
        </div>
      </div>
    </Shell>
  );
}

// ------------------------------------------------------------------ video
function RecordPanel({ wide }: { wide?: boolean }) {
  const recording = useTools((s) => s.recording);
  const tt = useTools((s) => s.turntable);
  const [seconds, setSeconds] = useState('12');
  const [mbps, setMbps] = useState('20');
  const supported = recordingSupported();
  const rendered = useRender((s) => s.shading === 'rendered');
  return (
    <Shell title="Video" icon="video" wide={wide}>
      <div className="space-y-3 px-4">
        {!supported && <p className="text-[11.5px] text-amber-300">This browser cannot record the canvas (MediaRecorder with canvas capture is required).</p>}
        {rendered && <p className="text-[11px] text-graphite-400">Rendered mode restarts sampling on every camera move, so a turntable records a noisy preview. Material shading is recommended for video.</p>}
        <div>
          <div className="mb-1.5 text-[12.5px] text-paper/90">Turntable length</div>
          <Segmented<string>
            size="sm"
            label="Turntable length"
            value={seconds}
            onChange={setSeconds}
            options={[
              { value: '6', label: '6 s' },
              { value: '12', label: '12 s' },
              { value: '20', label: '20 s' },
              { value: '40', label: '40 s' },
            ]}
          />
        </div>
        <div>
          <div className="mb-1.5 text-[12.5px] text-paper/90">Quality</div>
          <Segmented<string>
            size="sm"
            label="Bit rate"
            value={mbps}
            onChange={setMbps}
            options={[
              { value: '8', label: '8 Mb/s' },
              { value: '20', label: '20 Mb/s' },
              { value: '40', label: '40 Mb/s' },
            ]}
          />
        </div>
        {recording ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-mono text-[11px] text-red-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" /> Recording{tt.active ? ` · ${Math.round(tt.t * 100)}%` : ''}
            </div>
            <Button size="sm" variant="solid" icon="pause" className="w-full" onClick={stopRecording}>
              Stop and save
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="accent" icon="reset" className="flex-1" disabled={!supported} onClick={() => startRecording({ turntable: Number(seconds), mbps: Number(mbps) })}>
              Record turntable
            </Button>
            <Button size="sm" icon="video" disabled={!supported} onClick={() => startRecording({ mbps: Number(mbps) })}>
              Record free
            </Button>
          </div>
        )}
        <p className="text-[10.5px] leading-relaxed text-graphite-400">Saves WebM (VP9) or MP4, depending on the browser, at the canvas resolution.</p>
      </div>
    </Shell>
  );
}

// ------------------------------------------------------------------ XR
function XRPanel({ wide }: { wide?: boolean }) {
  const [vr, setVr] = useState<boolean | null>(null);
  const [ar, setAr] = useState<boolean | null>(null);
  const xr = useTools((s) => s.xr);
  const set = useTools((s) => s.set);
  useEffect(() => {
    void xrSupported('immersive-vr').then(setVr);
    void xrSupported('immersive-ar').then(setAr);
  }, []);
  return (
    <Shell title="VR / AR" icon="vr" wide={wide}>
      <div className="space-y-3 px-4">
        <p className="text-[11.5px] leading-relaxed text-graphite-400">
          <span className="text-paper/90">VR</span> stands you on the apron beside the aircraft at true scale. Aim a controller at the ground and pull the trigger to teleport, push a thumbstick sideways to turn.
        </p>
        <p className="text-[11.5px] leading-relaxed text-graphite-400">
          <span className="text-paper/90">AR</span> places a 1:40 model on the floor in front of you.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="accent" icon="vr" className="flex-1" disabled={!vr || xr !== 'none'} onClick={() => set({ xr: 'vr' })}>
            Enter VR
          </Button>
          <Button size="sm" icon="eye" className="flex-1" disabled={!ar || xr !== 'none'} onClick={() => set({ xr: 'ar' })}>
            Enter AR
          </Button>
        </div>
        {(vr === false || ar === false) && <p className="text-[10.5px] text-graphite-500">{vr === false && ar === false ? 'No WebXR device was found. Open this page in a headset browser (for example Meta Quest) or on an AR-capable phone, over HTTPS.' : vr === false ? 'VR is not available on this device.' : 'AR is not available on this device.'}</p>}
      </div>
    </Shell>
  );
}

// ------------------------------------------------------------------ reference image
function ReferencePanel({ wide }: { wide?: boolean }) {
  const r = useTools((s) => s.reference);
  const set = useTools((s) => s.set);
  const upd = (p: Partial<typeof r>) => set({ reference: { ...useTools.getState().reference, ...p } });
  const [ortho, setOrtho] = [useTools((s) => s.ortho), (v: boolean) => set({ ortho: v })];
  return (
    <Shell title="Reference image" icon="image" wide={wide}>
      <div className="space-y-2 px-4">
        <p className="text-[11.5px] leading-relaxed text-graphite-400">Overlay your own photo or three-view drawing to compare proportions. The image stays on this device.</p>
        <label className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-white/[0.14] bg-white/[0.02] text-[12px] text-paper/85 hover:border-ice-400/40">
          <Icon name="image" size={15} />
          {r.url ? `Replace “${r.name.slice(0, 24)}”` : 'Choose an image…'}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (r.url) URL.revokeObjectURL(r.url);
              upd({ url: URL.createObjectURL(f), name: f.name });
            }}
          />
        </label>
        {r.url && (
          <>
            <Slider label="Opacity" value={r.opacity} min={0.05} max={1} onChange={(v) => upd({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Scale" value={r.scale} min={0.2} max={3} onChange={(v) => upd({ scale: v })} format={(v) => `${v.toFixed(2)}×`} />
            <Slider label="Offset X" value={r.x} min={-50} max={50} step={0.1} onChange={(v) => upd({ x: v })} format={(v) => `${v.toFixed(1)}%`} />
            <Slider label="Offset Y" value={r.y} min={-50} max={50} step={0.1} onChange={(v) => upd({ y: v })} format={(v) => `${v.toFixed(1)}%`} />
            <Slider label="Rotate" value={r.rotate} min={-20} max={20} step={0.1} onChange={(v) => upd({ rotate: v })} format={(v) => `${v.toFixed(1)}°`} />
            <Toggle label="Mirror" checked={r.flip} onChange={(v) => upd({ flip: v })} />
            <Toggle label="Difference blend" hint="Mismatched edges light up" checked={r.blend === 'difference'} onChange={(v) => upd({ blend: v ? 'difference' : 'normal' })} />
            <Toggle label="Orthographic view" hint="Flatten perspective to match a drawing (numpad 5)" checked={ortho} onChange={setOrtho} />
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {(
                [
                  ['Front', [130, 7.2, 0.01], [0, 7.2, 0]],
                  ['Side', [0, 7.2, 160], [0, 7.2, 0]],
                  ['Top', [0, 220, 0.01], [0, 0, 0]],
                  ['Rear', [-140, 7.2, 0.01], [0, 7.2, 0]],
                ] as [string, V3, V3][]
              ).map(([n, p, t]) => (
                <Button key={n} size="sm" onClick={() => void flyTo(p, t, true)}>
                  {n}
                </Button>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="ghost" icon="reset" onClick={() => upd({ opacity: 0.5, scale: 1, x: 0, y: 0, rotate: 0, flip: false })}>
                Reset
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon="close"
                onClick={() => {
                  if (r.url) URL.revokeObjectURL(r.url);
                  upd({ url: null, name: '' });
                }}
              >
                Remove
              </Button>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

/** The overlay itself, drawn above the canvas and below the interface. */
export function ReferenceOverlay() {
  const r = useTools((s) => s.reference);
  if (!r.url) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] grid place-items-center overflow-hidden" style={{ mixBlendMode: r.blend === 'difference' ? 'difference' : 'normal' }}>
      <img
        src={r.url}
        alt=""
        className="max-h-full max-w-full object-contain"
        style={{ opacity: r.opacity, transform: `translate(${r.x}%, ${r.y}%) rotate(${r.rotate}deg) scale(${r.flip ? -r.scale : r.scale}, ${r.scale})` }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ story
function StoryPanel({ wide }: { wide?: boolean }) {
  const set = useTools((s) => s.set);
  return (
    <Shell title="Guided story" icon="story" wide={wide}>
      <div className="space-y-2 px-4">
        <p className="text-[11.5px] leading-relaxed text-graphite-400">Nine short chapters, from the two decks to the flight deck. Read at your own pace or let it play.</p>
        <ol className="space-y-1">
          {CHAPTERS.map((c, i) => (
            <li key={c.title}>
              <button
                type="button"
                onClick={() => {
                  set({ story: i, storyPlaying: false, panel: null });
                  playChapter(i);
                }}
                className="flex w-full items-baseline gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.04]"
              >
                <span className="w-14 shrink-0 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ice-400/80">{c.kicker}</span>
                <span className="text-[12px] text-paper/90">{c.title}</span>
              </button>
            </li>
          ))}
        </ol>
        <Button
          size="sm"
          variant="accent"
          icon="play"
          className="w-full"
          onClick={() => {
            set({ story: 0, storyPlaying: true, panel: null });
            playChapter(0);
          }}
        >
          Play the story
        </Button>
      </div>
    </Shell>
  );
}

/** Chapter card shown while the story runs. */
export function StoryOverlay({ compact = false }: { compact?: boolean }) {
  const story = useTools((s) => s.story);
  const playing = useTools((s) => s.storyPlaying);
  const set = useTools((s) => s.set);
  const [t, setT] = useState(0);
  const ch = CHAPTERS[story];
  useEffect(() => setT(0), [story]);
  useEffect(() => {
    if (!playing || !ch) return;
    const id = window.setInterval(() => {
      setT((v) => {
        const n = v + 0.1 / ch.seconds;
        if (n >= 1) {
          const next = story + 1;
          if (next >= CHAPTERS.length) set({ storyPlaying: false });
          else {
            set({ story: next });
            playChapter(next);
          }
          return 0;
        }
        return n;
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [playing, story, ch, set]);
  if (!ch) return null;
  const go = (i: number) => {
    if (i < 0 || i >= CHAPTERS.length) return;
    set({ story: i });
    playChapter(i);
  };
  return (
    <div className={cx('pointer-events-none absolute inset-x-0 z-30 flex justify-center px-3', compact ? 'bottom-[calc(58px+env(safe-area-inset-bottom)+8px)]' : 'bottom-6')}>
      <Panel key={story} className="a380-enter pointer-events-auto w-full max-w-[640px] px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ice-400">
            {ch.kicker} · {story + 1}/{CHAPTERS.length}
          </span>
          <button type="button" aria-label="End the story" onClick={() => set({ story: -1, storyPlaying: false })} className="grid h-7 w-7 place-items-center rounded-lg text-graphite-400 hover:bg-white/[0.06] hover:text-paper">
            <Icon name="close" size={15} />
          </button>
        </div>
        <h2 className="mt-1 text-[clamp(19px,2.4vw,24px)] font-[350] tracking-[-0.015em] text-paper">{ch.title}</h2>
        <p className={cx('mt-1.5 text-[12.5px] leading-relaxed text-graphite-300', compact && 'max-h-[22vh] overflow-y-auto')}>{ch.body}</p>
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" variant="ghost" icon="chevronLeft" disabled={story === 0} onClick={() => go(story - 1)}>
            Back
          </Button>
          <div className="flex flex-1 items-center gap-1" aria-hidden="true">
            {CHAPTERS.map((c, i) => (
              <span key={c.title} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                <span className="block h-full bg-ice-400 transition-[width] duration-100" style={{ width: i < story ? '100%' : i === story ? `${(playing ? t : 0) * 100}%` : '0%' }} />
              </span>
            ))}
          </div>
          <Button size="sm" variant="ghost" icon={playing ? 'pause' : 'play'} onClick={() => set({ storyPlaying: !playing })} aria-label={playing ? 'Pause' : 'Play'} />
          <Button size="sm" variant="subtle" icon="chevronRight" disabled={story === CHAPTERS.length - 1} onClick={() => go(story + 1)}>
            Next
          </Button>
        </div>
      </Panel>
    </div>
  );
}

const PANELS: Record<ToolPanel, (p: { wide?: boolean }) => ReactNode> = {
  outliner: Outliner,
  measure: MeasurePanel,
  annotate: AnnotatePanel,
  views: ViewsPanel,
  share: SharePanel,
  record: RecordPanel,
  xr: XRPanel,
  story: StoryPanel,
  reference: ReferencePanel,
};

export function ToolPanelHost({ wide = false }: { wide?: boolean }) {
  const panel = useTools((s) => s.panel);
  if (!panel) return null;
  const P = PANELS[panel];
  return <P wide={wide} />;
}
