import { Icon } from './icons';
import { Group, Kbd, Label, Panel } from './kit';

const KEYS: [string, string][] = [
  ['1 – 7', 'Switch section'],
  ['H', 'Home view'],
  ['F', 'Frame selected component'],
  ['Esc', 'Clear selection / exit mode'],
  ['X', 'Toggle X-ray'],
  ['E', 'Toggle exploded view'],
  ['G', 'Landing gear lever'],
  ['[  ]', 'Flap lever up / down'],
  ['L', 'Exterior lights'],
  ['C', 'Cinematic tour'],
  ['P', 'Photo mode'],
  ['?', 'This help'],
];

export function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <Panel className="a380-enter w-[380px] max-w-[calc(100vw-32px)]" role="dialog" aria-label="Help and keyboard shortcuts">
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <Label className="text-ice-400/90">Help</Label>
        <button type="button" onClick={onClose} aria-label="Close help" className="grid h-7 w-7 place-items-center rounded-lg text-graphite-400 hover:bg-white/[0.06] hover:text-paper">
          <Icon name="close" size={15} />
        </button>
      </div>
      <Group label="Navigate">
        <ul className="space-y-1 text-[12px] text-paper/85">
          <li>Drag — orbit · Right-drag / two fingers — pan · Scroll / pinch — zoom</li>
          <li>Click a component to inspect it; the camera frames it smoothly.</li>
          <li>Flight mode: W/S pitch, A/D roll, Q/E rudder, Shift/Ctrl thrust, B brakes, G gear, F/V flaps. Gamepads are supported.</li>
        </ul>
      </Group>
      <Group label="Keyboard shortcuts">
        <dl className="grid grid-cols-[72px_1fr] gap-y-1.5 text-[12px]">
          {KEYS.map(([k, d]) => (
            <div key={k} className="contents">
              <dt>
                <Kbd>{k}</Kbd>
              </dt>
              <dd className="text-paper/85">{d}</dd>
            </div>
          ))}
        </dl>
      </Group>
    </Panel>
  );
}
