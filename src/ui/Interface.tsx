import { useCallback, useState } from 'react';
import { useUI } from '../state/ui';
import { HelpPanel } from './Help';
import { Inspector } from './Inspector';
import { Panel } from './kit';
import { SettingsPanel } from './Settings';
import { StatusStrip } from './StatusStrip';
import { Toasts } from './Toasts';
import { SectionNav, TopBar } from './TopBar';
import { AnatomyPanel } from './sections/Anatomy';
import { CabinPanel } from './sections/Cabin';
import { CockpitPanel } from './sections/Cockpit';
import { ExplorePanel } from './sections/Explore';
import { FlightPanel } from './sections/Flight';
import { SpecsPanel } from './sections/Specs';
import { SystemsPanel } from './sections/Systems';
import { useShortcuts } from './useShortcuts';
import { FlightHUD } from '../flight/HUD';

function SectionPanel() {
  const section = useUI((s) => s.section);
  const Body = {
    explore: ExplorePanel,
    anatomy: AnatomyPanel,
    systems: SystemsPanel,
    cockpit: CockpitPanel,
    cabin: CabinPanel,
    flight: FlightPanel,
    specs: SpecsPanel,
  }[section];
  return (
    <Panel key={section} className="a380-enter flex max-h-full w-full flex-col overflow-hidden lg:w-[340px]">
      <Body />
    </Panel>
  );
}

export function Interface() {
  const [modal, setModal] = useState<'settings' | 'help' | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const toggleHelp = useCallback(() => setModal((m) => (m === 'help' ? null : 'help')), []);
  useShortcuts(toggleHelp);
  const introDone = useUI((s) => s.introDone);
  const selected = useUI((s) => s.selected);
  const section = useUI((s) => s.section);
  if (!introDone) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {section === 'flight' && <FlightHUD />}
      <TopBar onSettings={() => setModal((m) => (m === 'settings' ? null : 'settings'))} onHelp={toggleHelp} />

      {/* Left: contextual section panel (desktop) / bottom sheet (mobile) */}
      <div
        className={
          'pointer-events-none absolute bottom-[76px] left-3 right-3 flex max-h-[46dvh] flex-col sm:left-5 sm:right-auto sm:w-[340px] lg:bottom-5 lg:top-[84px] lg:max-h-none ' +
          (collapsed ? 'hidden lg:hidden' : '')
        }
      >
        <SectionPanel />
      </div>

      {/* Right: inspector */}
      {selected && section !== 'flight' && section !== 'cockpit' && section !== 'cabin' && (
        <div className="pointer-events-none absolute right-3 top-[72px] z-10 flex max-w-[calc(100vw-24px)] justify-end sm:right-5 sm:top-[84px]">
          <Inspector />
        </div>
      )}

      {/* Modals */}
      {modal && (
        <div className="pointer-events-auto absolute right-3 top-[72px] z-30 sm:right-5">
          {modal === 'settings' ? <SettingsPanel onClose={() => setModal(null)} /> : <HelpPanel onClose={() => setModal(null)} />}
        </div>
      )}

      {/* Bottom centre: telemetry + toasts */}
      <div className="pointer-events-none absolute bottom-[84px] left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 lg:bottom-5">
        <Toasts />
        <StatusStrip />
      </div>

      {/* Panel collapse (desktop) */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="pointer-events-auto absolute bottom-5 left-[372px] hidden h-8 rounded-lg border border-white/[0.07] bg-graphite-900/70 px-2.5 text-[11px] text-graphite-300 backdrop-blur-xl transition-colors hover:text-paper lg:block"
        style={collapsed ? { left: 20 } : undefined}
      >
        {collapsed ? 'Show panel' : 'Hide panel'}
      </button>

      {/* Mobile nav */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 border-t border-white/[0.06] bg-graphite-950/85 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <SectionNav compact />
      </div>
    </div>
  );
}
