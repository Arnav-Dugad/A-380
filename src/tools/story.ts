/**
 * Guided story: a narrated walk through the aircraft. Each chapter sets the scene (section,
 * environment, aircraft configuration), frames the camera and tells one idea in a paragraph.
 * Figures are the published ones used elsewhere in the app (see data/specs.ts and sources).
 */
import { flyTo } from '../camera/controls';
import { systems } from '../sim/systems';
import { useUI, type EnvPreset, type Section } from '../state/ui';

export interface Chapter {
  title: string;
  kicker: string;
  body: string;
  pos: [number, number, number];
  target: [number, number, number];
  section?: Section;
  env?: EnvPreset;
  xray?: boolean;
  explode?: number;
  /** seconds on screen when playing */
  seconds: number;
  setup?: () => void;
}

const lightsOn = (on: boolean) => {
  if (on && !systems.state.elec.dc) systems.setBattery(true);
  for (const k of ['nav', 'beacon', 'logo'] as const) systems.setLight(k, on);
};

export const CHAPTERS: Chapter[] = [
  {
    kicker: 'Prologue',
    title: 'The largest airliner ever built',
    body: 'Seventy-three metres long, nearly eighty across the wing and twenty-four tall at the fin. The A380 was designed around a simple ambition: a full-length second deck, so a single aircraft could carry the passengers of two on the busiest long-haul routes.',
    pos: [74, 12, 72],
    target: [0, 7, 0],
    env: 'studio',
    seconds: 14,
    setup: () => {
      systems.setAllDoors(false);
      systems.setFlapLever(0);
      lightsOn(false);
    },
  },
  {
    kicker: 'Chapter 1',
    title: 'Two full decks',
    body: 'The fuselage is an ovoid rather than a circle, wider at the main deck than at the upper deck. Look at the rows of windows: sixteen doors and two complete cabins, joined by staircases at the front and the back.',
    pos: [16, 9, 58],
    target: [10, 7, 0],
    seconds: 13,
    setup: () => systems.setAllDoors(true, 'passenger'),
  },
  {
    kicker: 'Chapter 2',
    title: 'Inside the skin',
    body: 'Frames, stringers and floor beams carry the pressure loads of both decks. Upper fuselage panels use GLARE, a fibre-metal laminate, and the central wing box is carbon-fibre composite: both firsts for an airliner of this size.',
    pos: [-6, 22, 50],
    target: [0, 6, 0],
    section: 'anatomy',
    xray: true,
    seconds: 13,
    setup: () => systems.setAllDoors(false),
  },
  {
    kicker: 'Chapter 3',
    title: 'A wing of 845 square metres',
    body: 'Swept at 33.5 degrees and deep at the root, the wing carries most of the fuel. On approach, droop noses and slats run along the leading edge and three large Fowler flaps roll back and down, adding area and camber for slow, stable flight.',
    pos: [-4, 18, 34],
    target: [-8, 5, 20],
    section: 'explore',
    seconds: 14,
    setup: () => systems.setFlapLever(3),
  },
  {
    kicker: 'Chapter 4',
    title: 'Four Trent 900s',
    body: 'Each engine has a 2.95 m fan of 24 swept, hollow titanium blades. Most of the thrust comes from air the fan pushes around the core, which is why a modern high-bypass engine is both quieter and more efficient than the turbojets of the past.',
    pos: [28, 3.4, 30],
    target: [6, 3.6, 16],
    seconds: 13,
    setup: () => {
      systems.setFlapLever(0);
      if (!systems.state.engines.some((e) => e.state === 'running')) {
        systems.applyScenario('taxi');
        systems.setParkingBrake(true);
      }
    },
  },
  {
    kicker: 'Chapter 5',
    title: 'Twenty-two wheels',
    body: 'A two-wheel nose gear, two four-wheel wing gears and two six-wheel body gears spread more than 570 tonnes across the pavement. The rear axles of the body gears steer, so the aircraft can turn tightly on the taxiway.',
    pos: [12, 1.2, 16],
    target: [-2, 1.6, 3],
    seconds: 13,
  },
  {
    kicker: 'Chapter 6',
    title: 'The flight deck',
    body: 'Eight large interchangeable displays, side-stick controllers and a keyboard-and-trackball interface for each pilot. Fly-by-wire computers turn stick inputs into commands for every surface while protecting the flight envelope.',
    pos: [0, 0, 0],
    target: [0, 0, 0],
    section: 'cockpit',
    seconds: 13,
  },
  {
    kicker: 'Chapter 7',
    title: 'Life on board',
    body: 'Premium cabins up top, economy on both decks, galleys, lavatories and crew rests tucked into the space between. Walk the aisles in the Cabin section, change deck at the staircases and look out of any window.',
    pos: [0, 0, 0],
    target: [0, 0, 0],
    section: 'cabin',
    seconds: 13,
  },
  {
    kicker: 'Epilogue',
    title: 'Golden hour on the runway',
    body: 'The digital twin keeps every system live: start the engines, raise the gear, open the doors, or take it flying in the Flight section. Every figure on screen links to the sources it came from.',
    pos: [66, 4.5, -54],
    target: [0, 7, 0],
    section: 'explore',
    env: 'golden',
    seconds: 14,
    setup: () => lightsOn(true),
  },
];

export function playChapter(i: number): void {
  const ch = CHAPTERS[i];
  if (!ch) return;
  const ui = useUI.getState();
  ui.select(null);
  ui.set({ section: ch.section ?? (ui.section === 'cockpit' || ui.section === 'cabin' ? 'explore' : ui.section), explode: ch.explode ?? 0, ...(ch.env ? { env: ch.env } : {}) });
  ui.setXRay({ enabled: !!ch.xray });
  ch.setup?.();
  if (!ch.section || (ch.section !== 'cockpit' && ch.section !== 'cabin')) window.setTimeout(() => void flyTo(ch.pos, ch.target, true, true), 60);
}
