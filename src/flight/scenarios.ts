/**
 * Flight scenarios. Each sets the shared systems state and places the flight model at a
 * consistent, trimmed condition. Positions are on the fictional DTX airport (runway 09).
 */
import { autopilot } from '../cockpit/displays';
import { AC, FT, flight, trimLever, trimPitch } from '../sim/flight';
import { IDLE_N1, IDLE_N2, systems } from '../sim/systems';
import type { FlightScenario } from '../state/ui';

export const SCENARIOS: { id: FlightScenario; label: string; hint: string }[] = [
  { id: 'coldDark', label: 'Cold & dark', hint: 'Remote stand, everything off. Power up, start the APU and engines.' },
  { id: 'taxi', label: 'Taxi', hint: 'Engines running on the taxiway. Use the tiller (A/D) and gentle thrust.' },
  { id: 'ready', label: 'Ready for take-off', hint: 'Lined up on runway 09, CONF 1+F. Release brakes (K), set TOGA.' },
  { id: 'takeoff', label: 'Take-off roll', hint: 'Brakes off, TOGA set. Rotate (S) at about 150 kt.' },
  { id: 'climb', label: 'Climb', hint: '3,000 ft, clean-up and climb.' },
  { id: 'cruise', label: 'Cruise', hint: 'FL350, M 0.85 with autopilot and autothrust engaged.' },
  { id: 'descent', label: 'Descent', hint: 'FL150 descending towards the airport.' },
  { id: 'approach', label: 'Approach', hint: '9 nm final, 3,000 ft, CONF 3, gear down.' },
  { id: 'landing', label: 'Landing', hint: '1,000 ft on a 3° glide path, CONF FULL. Flare at 30 ft.' },
  { id: 'free', label: 'Free flight', hint: '5,000 ft, 250 kt, clean.' },
];

const THRESHOLD_X = 180;
const TOUCHDOWN_X = 580;

function enginesAt(lever: number) {
  const s = systems.state;
  for (const e of s.engines) {
    e.lever = lever;
    const n1 = IDLE_N1 + lever * (100 - IDLE_N1);
    e.n1 = n1;
    e.n2 = IDLE_N2 + (n1 - IDLE_N1) * 0.42;
  }
}

function setConf(lever: number, conf: number, slat: number, flap: number) {
  const hl = systems.state.highLift;
  hl.lever = lever;
  hl.conf = conf;
  hl.slat = slat;
  hl.flap = flap;
}

export function applyScenario(id: FlightScenario): void {
  autopilot.ap = false;
  autopilot.athr = false;
  autopilot.lateral = '';
  autopilot.vertical = '';
  flight.law = 'normal';
  flight.inputs = { pitch: 0, roll: 0, yaw: 0, brake: 0 };
  flight.events = [];
  const air = (opts: { alt: number; kt: number; gamma: number; conf: [number, number, number, number]; gear: boolean; x: number; z?: number; heading?: number; mass?: number }) => {
    const mass = opts.mass ?? 440_000;
    const altM = opts.alt / FT;
    systems.applyScenario(opts.gear ? 'approach' : 'cruise');
    setConf(...opts.conf);
    systems.state.gear.lever = opts.gear ? 'down' : 'up';
    systems.state.gear.position = opts.gear ? 0 : 1;
    systems.state.gear.wow = false;
    const pitch = trimPitch(opts.kt, altM, opts.conf[1], mass, opts.gamma);
    const lever = trimLever(opts.kt, altM, opts.conf[1], mass, opts.gamma, opts.gear);
    enginesAt(lever);
    // place() takes TAS; convert from IAS with the density ratio
    const tas = opts.kt / Math.sqrt(Math.max(0.2, isaRatio(altM)));
    flight.place({ x: opts.x, z: opts.z ?? 0, alt: altM + AC.cgHeight, heading: opts.heading ?? 90, speedKt: tas, pitch, gamma: opts.gamma, mass });
  };
  switch (id) {
    case 'coldDark':
      systems.applyScenario('coldDark');
      flight.place({ x: 320, z: -260, alt: AC.cgHeight, heading: 180, speedKt: 0, mass: 470_000 });
      break;
    case 'taxi':
      systems.applyScenario('taxi');
      systems.setParkingBrake(true);
      flight.place({ x: 320, z: -260, alt: AC.cgHeight, heading: 180, speedKt: 0, mass: 470_000 });
      break;
    case 'ready':
    case 'takeoff':
      systems.applyScenario('takeoff');
      setConf(1, 2, 20, 8);
      systems.setParkingBrake(id === 'ready');
      flight.place({ x: THRESHOLD_X, z: 0, alt: AC.cgHeight, heading: 90, speedKt: 0, mass: 480_000 });
      if (id === 'takeoff') {
        enginesAt(0.4);
        systems.setThrust(1);
        systems.state.brakes.autobrake = 'RTO';
      }
      break;
    case 'climb':
      air({ alt: 3000, kt: 220, gamma: 4, conf: [1, 1, 20, 0], gear: false, x: 9000 });
      break;
    case 'cruise':
      air({ alt: 35000, kt: 275, gamma: 0, conf: [0, 0, 0, 0], gear: false, x: -60000, mass: 430_000 });
      Object.assign(autopilot, { ap: true, athr: true, spd: 275, alt: 35000, hdg: 90, vertical: 'ALT', lateral: 'HDG' });
      break;
    case 'descent':
      air({ alt: 15000, kt: 290, gamma: -2.5, conf: [0, 0, 0, 0], gear: false, x: -70000 });
      break;
    case 'approach': {
      const d = 3000 / FT / Math.tan((3 * Math.PI) / 180);
      air({ alt: 3000, kt: 160, gamma: -3, conf: [3, 4, 23, 26], gear: true, x: TOUCHDOWN_X - d, mass: 380_000 });
      systems.state.brakes.autobrake = '2';
      break;
    }
    case 'landing': {
      const d = 1000 / FT / Math.tan((3 * Math.PI) / 180);
      air({ alt: 1000, kt: 140, gamma: -3, conf: [4, 5, 23, 32], gear: true, x: TOUCHDOWN_X - d, mass: 380_000 });
      systems.state.brakes.autobrake = '2';
      systems.state.spoilers.armed = true;
      break;
    }
    case 'free':
      air({ alt: 5000, kt: 250, gamma: 0, conf: [0, 0, 0, 0], gear: false, x: -4000, z: -2000 });
      break;
  }
}

function isaRatio(h: number): number {
  const T = h < 11000 ? 288.15 - 0.0065 * h : 216.65;
  const p = h < 11000 ? 101325 * Math.pow(T / 288.15, 5.2559) : 22632 * Math.exp(-(h - 11000) / 6341.6);
  return p / (287.05 * T) / 1.225;
}
