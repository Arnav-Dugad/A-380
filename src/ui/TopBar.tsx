import { useState } from 'react';
import { useUI, type EnvPreset, type Section } from '../state/ui';
import { Icon, type IconName } from './icons';
import { IconButton, Panel, cx } from './kit';

export const SECTIONS: { id: Section; label: string; icon: IconName; key: string }[] = [
  { id: 'explore', label: 'Explore', icon: 'explore', key: '1' },
  { id: 'anatomy', label: 'Anatomy', icon: 'anatomy', key: '2' },
  { id: 'systems', label: 'Systems', icon: 'systems', key: '3' },
  { id: 'cockpit', label: 'Cockpit', icon: 'cockpit', key: '4' },
  { id: 'cabin', label: 'Cabin', icon: 'cabin', key: '5' },
  { id: 'flight', label: 'Flight', icon: 'flight', key: '6' },
  { id: 'specs', label: 'Specifications', icon: 'specs', key: '7' },
];

export const ENVIRONMENTS: { id: EnvPreset; label: string; icon: IconName }[] = [
  { id: 'studio', label: 'Studio', icon: 'studio' },
  { id: 'apron', label: 'Airport apron', icon: 'airport' },
  { id: 'golden', label: 'Golden hour', icon: 'sunset' },
  { id: 'hangar', label: 'Blue-hour hangar', icon: 'hangar' },
  { id: 'night', label: 'Night inspection', icon: 'moon' },
];

function Brand() {
  const set = useUI((s) => s.set);
  return (
    <button type="button" onClick={() => set({ section: 'explore' })} aria-label="A380 — The Digital Twin, go to Explore" className="pointer-events-auto flex items-center gap-3 rounded-xl text-left select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-400/70">
      <div className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.08] bg-graphite-900/70 text-ice-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
        <Icon name="flight" size={18} />
      </div>
      <div className="leading-none [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
        <div className="text-[13px] font-[600] tracking-[0.02em] text-paper">A380</div>
        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-graphite-300">The Digital Twin</div>
      </div>
    </button>
  );
}

export function SectionNav({ compact = false }: { compact?: boolean }) {
  const section = useUI((s) => s.section);
  const set = useUI((s) => s.set);
  return (
    <nav aria-label="Primary" className={cx('flex items-center gap-0.5', compact && 'w-full justify-between')}>
      {SECTIONS.map((s) => {
        const active = s.id === section;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => set({ section: s.id })}
            aria-current={active ? 'page' : undefined}
            title={`${s.label}  (${s.key})`}
            className={cx(
              'group relative flex items-center gap-2 rounded-xl font-[500] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-400/70',
              compact ? 'h-[56px] flex-1 flex-col justify-center gap-1 px-0.5 text-[10px]' : 'h-9 px-3.5 text-[12.5px]',
              active ? 'text-paper' : 'text-graphite-400 hover:text-paper/90',
            )}
          >
            <Icon name={s.icon} size={compact ? 18 : 15} className={cx('transition-colors', active ? 'text-ice-400' : 'text-graphite-500 group-hover:text-graphite-300')} />
            <span className={cx(compact && 'leading-none')}>{compact && s.id === 'specs' ? 'Specs' : s.label}</span>
            {active && !compact && <span className="absolute inset-x-3.5 -bottom-[5px] h-px bg-gradient-to-r from-transparent via-ice-400 to-transparent" />}
            {active && compact && <span className="absolute left-1/2 top-0 h-[2px] w-7 -translate-x-1/2 rounded-full bg-ice-400 shadow-[0_0_12px_rgba(111,211,239,0.8)]" />}
          </button>
        );
      })}
    </nav>
  );
}

function EnvMenu() {
  const env = useUI((s) => s.env);
  const set = useUI((s) => s.set);
  const [open, setOpen] = useState(false);
  const cur = ENVIRONMENTS.find((e) => e.id === env)!;
  return (
    <div className="relative">
      <IconButton icon={cur.icon} label={`Environment: ${cur.label}`} onClick={() => setOpen((o) => !o)} active={open} />
      {open && (
        <Panel className="a380-enter absolute right-0 top-11 z-30 w-56 p-1.5">
          {ENVIRONMENTS.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                set({ env: e.id });
                setOpen(false);
              }}
              className={cx(
                'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors',
                e.id === env ? 'bg-white/[0.07] text-paper' : 'text-graphite-300 hover:bg-white/[0.04] hover:text-paper',
              )}
            >
              <Icon name={e.icon} size={16} className={e.id === env ? 'text-ice-400' : ''} />
              {e.label}
            </button>
          ))}
        </Panel>
      )}
    </div>
  );
}

export function TopBar({ onSettings, onHelp, compact = false }: { onSettings: () => void; onHelp: () => void; compact?: boolean }) {
  const set = useUI((s) => s.set);
  return (
    <header className={cx('pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4', compact ? 'px-3 pb-3 pt-[max(10px,env(safe-area-inset-top))]' : 'p-5')}>
      <Brand />
      {!compact && (
        <Panel className="px-1.5 py-1">
          <SectionNav />
        </Panel>
      )}
      <Panel className="flex items-center gap-0.5 px-1 py-1">
        <EnvMenu />
        <IconButton icon="camera" label="Photo mode (P)" onClick={() => set({ photoMode: true })} />
        <IconButton icon="settings" label="Graphics & settings" onClick={onSettings} />
        <IconButton icon="help" label="Help & shortcuts (?)" onClick={onHelp} />
      </Panel>
    </header>
  );
}
