import { CONF } from '../sim/systems';
import { useSim } from '../state/sim';
import { useUI } from '../state/ui';
import { Panel, Stat, cx } from './kit';

/** Compact live telemetry: power, hydraulics, gear, high lift and engines. */
export function StatusStrip() {
  const s = useSim((x) => x.s);
  const section = useUI((x) => x.section);
  if (section === 'flight') return null;
  const g = s.gear;
  const gearText = g.inTransit ? 'TRANSIT' : g.position < 0.01 ? 'DOWN' : g.position > 0.99 ? 'UP' : '—';
  const warn = s.annunciations.filter((a) => a.level !== 'memo');
  return (
    <Panel className="pointer-events-auto hidden items-center gap-5 px-4 py-2.5 md:flex">
      <Stat label="AC power" value={s.elec.ac ? s.elec.sources[0] ?? 'ON' : s.elec.dc ? 'BAT' : 'OFF'} tone={s.elec.ac ? 'ok' : s.elec.dc ? 'warn' : 'dim'} />
      <Stat label="Hyd G / Y" value={`${(s.hyd.green / 1000).toFixed(1)} / ${(s.hyd.yellow / 1000).toFixed(1)}`} unit="kpsi" tone={s.hyd.green > 4000 ? 'ok' : 'dim'} />
      <Stat label="Gear" value={gearText} tone={gearText === 'DOWN' ? 'ok' : gearText === 'TRANSIT' ? 'warn' : undefined} />
      <Stat label="Config" value={CONF[s.highLift.conf]!.label.replace('CONF ', '')} />
      <div className="min-w-0">
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-graphite-300">N1 %</div>
        <div className="mt-1 flex items-end gap-1">
          {s.engines.map((e, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5" title={`Engine ${i + 1}: N1 ${e.n1.toFixed(1)} %`}>
              <div className="relative h-4 w-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                <div className={cx('absolute inset-x-0 bottom-0 rounded-full', e.state === 'running' ? 'bg-green-ok' : e.state === 'starting' ? 'bg-amber-warn' : 'bg-graphite-500')} style={{ height: `${Math.min(100, e.n1)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {warn.length > 0 && (
        <div className="max-w-[220px] truncate font-mono text-[11px] text-amber-warn" title={warn.map((w) => w.text).join(' · ')}>
          {warn[0]!.text}
          {warn.length > 1 && ` +${warn.length - 1}`}
        </div>
      )}
    </Panel>
  );
}
