import { Icon } from './icons';
import { useTouch } from './useMedia';
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
  ['Z', 'Shading: solid / material / rendered'],
  ['⇧ Z', 'Wireframe'],
  ['Num 1 3 7', 'Front / right / top (Ctrl: opposite)'],
  ['Num 2 4 6 8', 'Orbit 15°'],
  ['Num 5', 'Orthographic view'],
  ['M', 'Measure'],
  ['?', 'This help'],
];

const TOUCH: [string, string][] = [
  ['One finger', 'Orbit the aircraft · look around inside'],
  ['Two fingers', 'Pinch to zoom · drag to pan'],
  ['Tap', 'Inspect a component · operate a cockpit control · pick a seat'],
  ['Joystick', 'Walk the cabin · fly (left stick, throttle on the right)'],
  ['Panel handle', 'Drag or tap to resize the panel'],
];

export function HelpPanel({ onClose, wide = false }: { onClose: () => void; wide?: boolean }) {
  const touch = useTouch();
  if (touch)
    return (
      <Panel className={wide ? 'a380-scroll w-full overflow-y-auto' : 'a380-enter w-[380px]'} role="dialog" aria-label="Help">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <Label className="text-ice-400/90">Help</Label>
          <button type="button" onClick={onClose} aria-label="Close help" className="grid h-9 w-9 place-items-center rounded-lg text-graphite-400 hover:bg-white/[0.06] hover:text-paper">
            <Icon name="close" size={16} />
          </button>
        </div>
        <Group label="Touch gestures">
          <dl className="grid grid-cols-[96px_1fr] gap-y-2.5 text-[12.5px]">
            {TOUCH.map(([k, d]) => (
              <div key={k} className="contents">
                <dt className="font-mono text-[11px] text-ice-300">{k}</dt>
                <dd className="text-paper/85">{d}</dd>
              </div>
            ))}
          </dl>
        </Group>
        <Group label="Tip">
          <p className="text-[12px] leading-relaxed text-graphite-300">If the view stutters, choose the Performance preset under Settings. Rotate the phone to landscape for a wider view while flying.</p>
        </Group>
      </Panel>
    );
  return (
    <Panel className={wide ? 'a380-scroll w-full overflow-y-auto' : 'a380-enter w-[380px]'} role="dialog" aria-label="Help and keyboard shortcuts">
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
        <dl className="grid grid-cols-[84px_1fr] gap-y-1.5 text-[12px]">
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
