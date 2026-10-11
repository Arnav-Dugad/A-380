import { useMemo } from 'react';
import { firstPerson } from '../../camera/FirstPerson';
import { CLASS_NAMES, cabinActions, useCabin, type Deck } from '../../interior/CabinScene';
import { systems, type CabinLight } from '../../sim/systems';
import { useSim } from '../../state/sim';
import { Button, Group, Label, ScrollArea, SectionTitle, Segmented, cx } from '../kit';
import type { CabinClass } from '../../aircraft/geometry/cabin';

const CLASS_COLOR: Record<CabinClass, string> = { first: '#d9b98c', business: '#6fd3ef', premium: '#a6b4ff', economy: '#7d8794' };

function SeatMap({ deck }: { deck: Deck }) {
  const seats = useCabin((s) => s.seats);
  const sel = useCabin((s) => s.seat);
  const list = useMemo(() => seats.filter((s) => s.deck === deck), [seats, deck]);
  if (!list.length) return <p className="text-[11px] text-graphite-500">Loading seat map…</p>;
  const s0 = Math.min(...list.map((s) => s.s)) - 1;
  const s1 = Math.max(...list.map((s) => s.s)) + 1;
  const W = 300;
  const H = 96;
  const X = (s: number) => ((s - s0) / (s1 - s0)) * (W - 12) + 6;
  const Y = (z: number) => H / 2 + z * 15;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${deck} deck seat map, nose to the left`}>
      <rect x="1" y="4" width={W - 2} height={H - 8} rx="40" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.08)" />
      {list.map((s) => (
        <rect
          key={s.id}
          x={X(s.s) - 1.6}
          y={Y(s.z) - 1.6}
          width={3.2}
          height={3.2}
          rx={0.6}
          fill={sel?.id === s.id ? '#ffffff' : CLASS_COLOR[s.cls]}
          className="cursor-pointer"
          onClick={() => useCabin.setState({ seat: s })}
        >
          <title>{`${s.id} · ${CLASS_NAMES[s.cls]}`}</title>
        </rect>
      ))}
    </svg>
  );
}

export function CabinPanel() {
  const deck = useCabin((s) => s.deck);
  const seat = useCabin((s) => s.seat);
  const seated = useCabin((s) => s.seated);
  const seats = useCabin((s) => s.seats);
  const light = useSim((s) => s.s.cabinLight);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of seats) c[s.cls] = (c[s.cls] ?? 0) + 1;
    return c;
  }, [seats]);
  const move = (f: number, sd: number) => firstPerson.setMove(f, sd);
  return (
    <ScrollArea className="max-h-full">
      <SectionTitle eyebrow="Cabin" title="Two passenger decks">
        Walk with W A S D or the arrow keys (Shift to hurry), drag to look around. Click any seat to inspect it, then sit down or look out of the window.
      </SectionTitle>
      <Group label="Deck">
        <Segmented<Deck> value={deck} onChange={(d) => cabinActions.goDeck(d)} options={[{ value: 'main', label: 'Main deck' }, { value: 'upper', label: 'Upper deck' }]} />
        <div className="mt-3">
          <SeatMap deck={deck} />
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {(Object.keys(CLASS_NAMES) as CabinClass[]).map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5 text-[10.5px] text-graphite-300">
                <span className="h-2 w-2 rounded-sm" style={{ background: CLASS_COLOR[c] }} />
                {CLASS_NAMES[c]} · {counts[c] ?? 0}
              </span>
            ))}
          </div>
        </div>
      </Group>
      {seat && (
        <Group label="Selected seat">
          <div className="flex items-baseline justify-between">
            <div className="text-[20px] font-[550] tracking-tight">{seat.id.replace(/^[MU] /, '')}</div>
            <div className="text-[12px] text-graphite-300">
              {CLASS_NAMES[seat.cls]} · {seat.deck === 'main' ? 'main' : 'upper'} deck · {seat.window ? 'window' : 'aisle / centre'}
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Button size="sm" variant="accent" icon="seat" onClick={() => cabinActions.sit(seat)}>
              Sit here
            </Button>
            <Button size="sm" icon="eye" onClick={() => cabinActions.lookOutside()}>
              Look outside
            </Button>
            {seated && (
              <Button size="sm" icon="walk" onClick={() => cabinActions.standUp()}>
                Stand up
              </Button>
            )}
          </div>
        </Group>
      )}
      <Group label="Move">
        <div className="grid w-40 grid-cols-3 gap-1">
          <span />
          <Button size="sm" aria-label="Walk forward" onPointerDown={() => move(1, 0)} onPointerUp={() => move(0, 0)} onPointerLeave={() => move(0, 0)}>
            ▲
          </Button>
          <span />
          <Button size="sm" aria-label="Step left" onPointerDown={() => move(0, -1)} onPointerUp={() => move(0, 0)} onPointerLeave={() => move(0, 0)}>
            ◀
          </Button>
          <Button size="sm" aria-label="Walk back" onPointerDown={() => move(-1, 0)} onPointerUp={() => move(0, 0)} onPointerLeave={() => move(0, 0)}>
            ▼
          </Button>
          <Button size="sm" aria-label="Step right" onPointerDown={() => move(0, 1)} onPointerUp={() => move(0, 0)} onPointerLeave={() => move(0, 0)}>
            ▶
          </Button>
        </div>
      </Group>
      <Group label="Cabin lighting">
        <Segmented<CabinLight>
          size="sm"
          value={light}
          onChange={(v) => {
            if (!systems.state.elec.ac) systems.setExternalPower(true);
            systems.setCabinLight(v);
          }}
          options={[
            { value: 'boarding', label: 'Boarding' },
            { value: 'day', label: 'Day' },
            { value: 'night', label: 'Night' },
            { value: 'ambient', label: 'Mood' },
            { value: 'off', label: 'Off' },
          ]}
        />
      </Group>
      <Group label="Configuration">
        <Label className="mb-1 text-[9px] text-graphite-400">Representative layout</Label>
        <p className={cx('text-[11.5px] leading-relaxed text-graphite-300')}>
          469 seats in four classes, matching the class totals British Airways publishes for its A380 (14 / 97 / 55 / 303). Seat pitch, zoning and monuments are illustrative — A380 cabins vary widely between operators.
        </p>
      </Group>
    </ScrollArea>
  );
}
