import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { setInset } from '../camera/viewInset';
import { FlightHUD } from '../flight/HUD';
import { useUI } from '../state/ui';
import { HelpPanel } from './Help';
import { HoverLabel } from './HoverLabel';
import { Icon } from './icons';
import { Inspector } from './Inspector';
import { Panel, cx } from './kit';
import { SettingsPanel } from './Settings';
import { BottomSheet, NAV_H } from './Sheet';
import { StatusStrip } from './StatusStrip';
import { Toasts } from './Toasts';
import { SectionNav, TopBar } from './TopBar';
import { TouchControls } from './TouchControls';
import { AnatomyPanel } from './sections/Anatomy';
import { CabinPanel } from './sections/Cabin';
import { CockpitPanel } from './sections/Cockpit';
import { ExplorePanel } from './sections/Explore';
import { FlightPanel } from './sections/Flight';
import { SpecsPanel } from './sections/Specs';
import { SystemsPanel } from './sections/Systems';
import { useLayout } from './useMedia';
import { useShortcuts } from './useShortcuts';

const BODIES = {
  explore: ExplorePanel,
  anatomy: AnatomyPanel,
  systems: SystemsPanel,
  cockpit: CockpitPanel,
  cabin: CabinPanel,
  flight: FlightPanel,
  specs: SpecsPanel,
};

/** Sections whose 3D view is the point: the mobile sheet starts collapsed there. */
const IMMERSIVE = new Set(['cockpit', 'cabin', 'flight']);

function SectionBody() {
  const section = useUI((s) => s.section);
  const Body = BODIES[section];
  return (
    <div key={section} className="a380-enter flex min-h-0 flex-1 flex-col">
      <Body />
    </div>
  );
}

/** Reports the screen area a panel covers, so the 3D view centres in what is left. */
function useInset(key: string, side: 'left' | 'right' | 'bottom', active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) {
      setInset(key, null);
      return;
    }
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return setInset(key, null);
      setInset(key, {
        left: side === 'left' ? r.right : 0,
        right: side === 'right' ? window.innerWidth - r.left : 0,
        bottom: side === 'bottom' ? window.innerHeight - r.top : 0,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      setInset(key, null);
    };
  }, [key, side, active]);
  return ref;
}

function Modal({ layout, onClose, children }: { layout: string; onClose: () => void; children: ReactNode }) {
  if (layout === 'desktop') return <div className="pointer-events-auto absolute right-5 top-[84px] z-30">{children}</div>;
  return (
    <div className="pointer-events-auto absolute inset-0 z-30">
      <button type="button" aria-label="Close" className="a380-fade absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="a380-sheet-in absolute inset-x-2 flex max-h-[calc(100dvh-150px)] flex-col"
        style={{
          bottom: `calc(${NAV_H}px + env(safe-area-inset-bottom) + 6px)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function Interface() {
  const [modal, setModal] = useState<'settings' | 'help' | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const toggleHelp = useCallback(() => setModal((m) => (m === 'help' ? null : 'help')), []);
  useShortcuts(toggleHelp);
  const layout = useLayout();
  const introDone = useUI((s) => s.introDone);
  const selected = useUI((s) => s.selected);
  const section = useUI((s) => s.section);
  const set = useUI((s) => s.set);
  const sheetSnap = useUI((s) => s.sheet);
  const showInspector = !!selected && !IMMERSIVE.has(section);

  // Each section opens the sheet at a sensible height; a new selection reveals the inspector.
  useEffect(() => set({ sheet: IMMERSIVE.has(section) ? 'peek' : 'half' }), [section, set]);
  useEffect(() => {
    if (selected && useUI.getState().sheet === 'peek') set({ sheet: 'half' });
  }, [selected, set]);
  useEffect(() => {
    if (!modal) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setModal(null);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [modal]);

  const desktopPanel = useInset('panel', 'left', introDone && layout === 'desktop' && !collapsed);
  const desktopInspector = useInset('inspector', 'right', introDone && layout === 'desktop' && showInspector);
  const sheet = useInset('sheet', 'bottom', introDone && layout === 'sheet');
  const side = useInset('side', 'left', introDone && layout === 'side' && sheetSnap !== 'peek');

  if (!introDone) return null;
  const mobile = layout !== 'desktop';
  const body = showInspector && mobile ? <Inspector embedded /> : <SectionBody />;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {section === 'flight' && <FlightHUD compact={mobile} />}
      <TopBar compact={mobile} onSettings={() => setModal((m) => (m === 'settings' ? null : 'settings'))} onHelp={toggleHelp} />

      {layout === 'desktop' && (
        <>
          <div ref={desktopPanel} className={cx('pointer-events-none absolute bottom-5 left-5 top-[84px] flex w-[340px] flex-col', collapsed && 'hidden')}>
            <Panel className="flex max-h-full w-full flex-col overflow-hidden">
              <SectionBody />
            </Panel>
          </div>
          {showInspector && (
            <div ref={desktopInspector} className="pointer-events-none absolute right-5 top-[84px] z-10 flex justify-end">
              <Inspector />
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="pointer-events-auto absolute bottom-5 flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.07] bg-graphite-900/70 px-2.5 text-[11px] text-graphite-300 backdrop-blur-xl transition-colors hover:text-paper"
            style={{ left: collapsed ? 20 : 372 }}
          >
            {collapsed ? 'Show panel' : 'Hide panel'}
          </button>
        </>
      )}

      {layout === 'sheet' && (
        <BottomSheet innerRef={sheet} label={`${section} panel`}>
          {body}
        </BottomSheet>
      )}

      {layout === 'side' && (
        <div
          ref={side}
          className="pointer-events-none absolute left-2 top-[56px] flex w-[min(320px,46vw)] flex-col"
          style={{
            bottom: `calc(${NAV_H}px + env(safe-area-inset-bottom) + 6px)`,
          }}
        >
          {sheetSnap === 'peek' ? (
            <Panel className="a380-enter self-start">
              <button type="button" onClick={() => set({ sheet: 'full' })} aria-label="Expand panel" className="flex h-10 items-center gap-2.5 pl-3.5 pr-2.5 text-[12.5px] text-paper">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ice-400">{section}</span>
                <span className="text-graphite-300">Panel</span>
                <Icon name="chevronDown" size={15} className="text-graphite-400" />
              </button>
            </Panel>
          ) : (
            <Panel className="relative flex max-h-full w-full flex-col overflow-hidden">
              {body}
              <button
                type="button"
                aria-label="Collapse panel"
                onClick={() => set({ sheet: 'peek' })}
                className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full border border-white/[0.08] bg-graphite-900/80 text-graphite-300"
              >
                <Icon name="chevronUp" size={16} />
              </button>
            </Panel>
          )}
        </div>
      )}

      {modal && (
        <Modal layout={layout} onClose={() => setModal(null)}>
          {modal === 'settings' ? <SettingsPanel onClose={() => setModal(null)} wide={mobile} /> : <HelpPanel onClose={() => setModal(null)} wide={mobile} />}
        </Modal>
      )}

      {/* Telemetry and toasts: bottom centre on desktop, under the top bar on phones */}
      <div className={cx('pointer-events-none absolute left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2', mobile ? 'top-[60px] w-[calc(100%-24px)]' : 'bottom-5')}>
        {!(mobile && section === 'flight') && <Toasts max={mobile ? 1 : 3} />}
        {!mobile && <StatusStrip />}
      </div>

      {!mobile && <HoverLabel />}
      <TouchControls />

      {mobile && (
        <div
          className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 border-t border-white/[0.06] bg-graphite-950/88 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
          style={{ minHeight: NAV_H }}
        >
          <SectionNav compact />
        </div>
      )}
    </div>
  );
}
