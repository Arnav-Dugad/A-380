import { SOURCES } from '../../data/sources';
import { SPEC_GROUPS } from '../../data/specs';
import { Group, ScrollArea, SectionTitle, StatusBadge } from '../kit';

export function SpecsPanel() {
  return (
    <ScrollArea className="max-h-full">
      <SectionTitle eyebrow="Specifications" title="A380-842 technical data">
        Every figure carries its provenance. Approximations are values chosen for this educational model where official data is unavailable.
      </SectionTitle>
      {SPEC_GROUPS.map((g) => (
        <Group key={g.title} label={g.title}>
          <dl className="space-y-2">
            {g.items.map((it) => (
              <div key={it.label} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3">
                <dt className="text-[12px] text-graphite-300">{it.label}</dt>
                <dd className="text-right font-mono text-[12px] tabular-nums text-paper">{it.value}</dd>
                <div className="col-span-2 mt-0.5 flex flex-wrap items-center gap-2">
                  <StatusBadge status={it.status} />
                  {it.sources.map((s) => (
                    <a key={s} href={SOURCES[s]?.url} target="_blank" rel="noreferrer" className="text-[10.5px] text-graphite-400 hover:text-ice-300 hover:underline">
                      {SOURCES[s]?.title}
                    </a>
                  ))}
                  {it.note && <span className="text-[10.5px] text-graphite-500">{it.note}</span>}
                </div>
              </div>
            ))}
          </dl>
        </Group>
      ))}
      <Group label="About this model">
        <p className="text-[11.5px] leading-relaxed text-graphite-300">
          The aircraft is generated procedurally from published dimensions and the Airbus three-view, then exported as optimised glTF assets. It is an educational
          approximation — not certified data, not a flight-training device, and not affiliated with or endorsed by Airbus or Rolls-Royce. The livery is fictional.
        </p>
      </Group>
    </ScrollArea>
  );
}
