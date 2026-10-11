import { useState } from 'react';
import { focusObjects } from '../camera/controls';
import { clearSelection, selectPart } from '../aircraft/interaction';
import { getRig } from '../aircraft/rig';
import { instanceLabel, unitByNode } from '../aircraft/selection';
import { PARTS } from '../data/parts';
import { SOURCES } from '../data/sources';
import { runDemo } from '../sim/demos';
import { useUI } from '../state/ui';
import { PartDiagram } from './diagrams';
import { Icon } from './icons';
import { Button, Label, Panel, ScrollArea, StatusBadge } from './kit';

export function Inspector() {
  const id = useUI((s) => s.selected);
  const node = useUI((s) => s.selectedNode);
  const isolate = useUI((s) => s.isolate);
  const set = useUI((s) => s.set);
  const [demoMsg, setDemoMsg] = useState<string | null>(null);
  const info = id ? PARTS[id] : undefined;
  if (!id || !info) return null;
  const inst = instanceLabel(node);

  const frame = () => {
    const u = node ? unitByNode(node, id) : null;
    if (u) void focusObjects(u.meshes);
  };

  return (
    <Panel key={`${id}:${node}`} className="a380-enter flex max-h-[calc(100dvh-180px)] w-full flex-col overflow-hidden sm:w-[360px]" role="dialog" aria-label={`${info.name} details`}>
      <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0">
          <Label className="text-ice-400/90">{info.system}</Label>
          <h2 className="mt-1.5 text-[19px] font-[550] leading-tight tracking-[-0.01em]">{info.name}</h2>
          {inst && <div className="mt-1 text-[12px] capitalize text-graphite-400">{inst}</div>}
        </div>
        <button type="button" onClick={clearSelection} aria-label="Close inspector" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-graphite-400 transition-colors hover:bg-white/[0.06] hover:text-paper">
          <Icon name="close" size={16} />
        </button>
      </div>
      <ScrollArea className="flex-1">
        <div className="px-5 pb-4">
          <p className="text-[13px] leading-relaxed text-paper/85">{info.function}</p>
          <div className="mt-3 grid grid-cols-[88px_1fr] gap-y-1.5 text-[12px]">
            <span className="text-graphite-400">Location</span>
            <span className="text-paper/85">{info.location}</span>
            <span className="text-graphite-400">Layer</span>
            <span className="capitalize text-paper/85">{info.layer.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
          </div>
        </div>
        <PartDiagram partId={id} />
        <div className="border-t border-white/[0.06] px-5 py-3.5">
          <Label className="mb-2.5">Engineering facts</Label>
          <ul className="space-y-2.5">
            {info.facts.map((f, i) => (
              <li key={i} className="text-[12.5px] leading-relaxed text-paper/85">
                <div className="flex items-start gap-2">
                  <StatusBadge status={f.status} />
                  <span>{f.text}</span>
                </div>
                {f.sources && f.sources.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-x-3 pl-[2px]">
                    {f.sources.map((s) => (
                      <a key={s} href={SOURCES[s]?.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-graphite-400 underline-offset-2 transition-colors hover:text-ice-300 hover:underline">
                        {SOURCES[s]?.title ?? s}
                        <Icon name="external" size={10} />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
        {info.related.length > 0 && (
          <div className="border-t border-white/[0.06] px-5 py-3.5">
            <Label className="mb-2.5">Connected assemblies</Label>
            <div className="flex flex-wrap gap-1.5">
              {info.related
                .filter((r) => PARTS[r] && getRig()?.partMeshes.has(r))
                .map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => selectPart(r)}
                    className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[11.5px] text-paper/80 transition-colors hover:border-ice-400/40 hover:text-ice-300"
                  >
                    {PARTS[r]!.name}
                  </button>
                ))}
            </div>
          </div>
        )}
      </ScrollArea>
      <div className="flex flex-wrap gap-1.5 border-t border-white/[0.06] p-3">
        <Button size="sm" icon="target" onClick={frame}>
          Frame
        </Button>
        <Button size="sm" icon="layers" active={isolate === info.layer} onClick={() => set({ isolate: isolate === info.layer ? 'none' : info.layer })}>
          Isolate system
        </Button>
        {info.demo && (
          <Button size="sm" icon="play" variant="accent" onClick={() => setDemoMsg(runDemo(info.demo!))}>
            Demonstrate
          </Button>
        )}
      </div>
      {demoMsg && <div className="border-t border-white/[0.06] px-4 py-2 text-[11.5px] text-graphite-300">{demoMsg}</div>}
    </Panel>
  );
}
