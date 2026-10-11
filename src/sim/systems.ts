/**
 * Deterministic, educational model of the A380's major aircraft systems.
 *
 * One shared state object is advanced at a fixed timestep. Every module (3D animation,
 * cockpit displays, systems panel, flight model) reads from this single source of truth,
 * so they can never contradict each other. Commands validate preconditions and return a
 * human-readable result instead of silently failing.
 *
 * This is NOT a certified or proprietary-accurate systems simulation; behaviour is a
 * simplified, documented approximation (see docs/ACCURACY.md).
 */

export const CONF = [
  { id: '0', label: 'CONF 0', slat: 0, flap: 0 },
  { id: '1', label: 'CONF 1', slat: 20, flap: 0 },
  { id: '1+F', label: 'CONF 1+F', slat: 20, flap: 8 },
  { id: '2', label: 'CONF 2', slat: 20, flap: 17 },
  { id: '3', label: 'CONF 3', slat: 23, flap: 26 },
  { id: 'FULL', label: 'CONF FULL', slat: 23, flap: 32 },
] as const;
/** Flap lever detents (0..4); lever 1 gives CONF 1 in flight and CONF 1+F on the ground / at low speed. */
export const FLAP_LEVER = ['0', '1', '2', '3', 'FULL'] as const;

export type EngineRun = 'off' | 'starting' | 'running' | 'stopping';
export interface EngineState {
  master: boolean;
  state: EngineRun;
  n1: number; // %
  n2: number; // %
  egt: number; // °C
  ff: number; // kg/h
  lever: number; // 0 = idle … 1 = TOGA
  reverseCmd: boolean;
  reverser: number; // 0..1 deployed (engines 2 & 3 only)
  startProgress: number;
  fire: boolean;
}

export type LightKey = 'nav' | 'beacon' | 'strobe' | 'landing' | 'taxi' | 'logo' | 'wing' | 'runwayTurnoff';
export type CabinLight = 'off' | 'night' | 'boarding' | 'day' | 'ambient';
export type Autobrake = 'DISARM' | 'BTV' | 'LO' | '2' | '3' | 'HI' | 'RTO';

export interface DoorState {
  id: string;
  kind: 'passenger' | 'cargo';
  target: 0 | 1;
  position: number;
  armed: boolean;
}

export interface Annunciation {
  id: string;
  level: 'warning' | 'caution' | 'memo';
  text: string;
}

export interface SystemsState {
  time: number;
  elec: { battery: boolean; extAvail: boolean; extOn: boolean; apuGen: boolean; ac: boolean; dc: boolean; sources: string[] };
  apu: { master: boolean; start: boolean; n: number; state: 'off' | 'starting' | 'running' | 'cooldown'; bleed: boolean; egt: number };
  hyd: { green: number; yellow: number; elecPumps: boolean };
  bleedAvailable: boolean;
  engineMode: 'NORM' | 'IGN/START' | 'CRANK';
  engines: EngineState[];
  gear: { lever: 'up' | 'down'; position: number; doors: number; wow: boolean; steering: number; inTransit: boolean; gravityExtension: boolean };
  highLift: { lever: number; conf: number; slat: number; flap: number };
  spoilers: { lever: number; armed: boolean; deployed: number; rollLeft: number; rollRight: number };
  controls: { pitch: number; roll: number; yaw: number; tiller: number; elevator: number; aileronL: number; aileronR: number; rudder: number; trim: number };
  brakes: { parking: boolean; autobrake: Autobrake; left: number; right: number; temp: number };
  doors: Record<string, DoorState>;
  lights: Record<LightKey, boolean>;
  cabinLight: CabinLight;
  seatbelt: boolean;
  noSmoking: boolean;
  /** Flight state injected by the flight model (or static values when parked). */
  air: { ias: number; gs: number; altitude: number; radioAlt: number; vs: number; mach: number; pitch: number; bank: number; heading: number; aoa: number; airborne: boolean };
  annunciations: Annunciation[];
  timeScale: number;
  /** Aircraft on jacks with ground hydraulic power — allows a gear swing test on the ground. */
  maintenance: boolean;
}

export interface CommandResult {
  ok: boolean;
  message: string;
}

const PASSENGER_DOORS = ['M1L', 'M2L', 'M3L', 'M4L', 'M5L', 'M1R', 'M2R', 'M3R', 'M4R', 'M5R', 'U1L', 'U2L', 'U3L', 'U1R', 'U2R', 'U3R'];
const CARGO_DOORS = ['FWD_CARGO', 'AFT_CARGO', 'BULK'];

export const IDLE_N1 = 20;
export const IDLE_N2 = 62;

/** Exponential approach — frame-rate independent first-order lag. */
const approach = (v: number, target: number, tau: number, dt: number) => v + (target - v) * (1 - Math.exp(-dt / tau));
const rate = (v: number, target: number, maxRate: number, dt: number) => {
  const d = target - v;
  const step = maxRate * dt;
  return Math.abs(d) <= step ? target : v + Math.sign(d) * step;
};

function newEngine(): EngineState {
  return { master: false, state: 'off', n1: 0, n2: 0, egt: 15, ff: 0, lever: 0, reverseCmd: false, reverser: 0, startProgress: 0, fire: false };
}

export function createState(): SystemsState {
  const doors: Record<string, DoorState> = {};
  for (const id of PASSENGER_DOORS) doors[id] = { id, kind: 'passenger', target: 0, position: 0, armed: false };
  for (const id of CARGO_DOORS) doors[id] = { id, kind: 'cargo', target: 0, position: 0, armed: false };
  return {
    time: 0,
    elec: { battery: false, extAvail: true, extOn: false, apuGen: true, ac: false, dc: false, sources: [] },
    apu: { master: false, start: false, n: 0, state: 'off', bleed: false, egt: 15 },
    hyd: { green: 0, yellow: 0, elecPumps: false },
    bleedAvailable: false,
    engineMode: 'NORM',
    engines: [newEngine(), newEngine(), newEngine(), newEngine()],
    gear: { lever: 'down', position: 0, doors: 0, wow: true, steering: 0, inTransit: false, gravityExtension: false },
    highLift: { lever: 0, conf: 0, slat: 0, flap: 0 },
    spoilers: { lever: 0, armed: false, deployed: 0, rollLeft: 0, rollRight: 0 },
    controls: { pitch: 0, roll: 0, yaw: 0, tiller: 0, elevator: 0, aileronL: 0, aileronR: 0, rudder: 0, trim: 0 },
    brakes: { parking: true, autobrake: 'DISARM', left: 0, right: 0, temp: 20 },
    doors,
    lights: { nav: false, beacon: false, strobe: false, landing: false, taxi: false, logo: false, wing: false, runwayTurnoff: false },
    cabinLight: 'off',
    seatbelt: false,
    noSmoking: true,
    air: { ias: 0, gs: 0, altitude: 0, radioAlt: 0, vs: 0, mach: 0, pitch: 0, bank: 0, heading: 0, aoa: 0, airborne: false },
    annunciations: [],
    timeScale: 1,
    maintenance: false,
  };
}

export class AircraftSystems {
  state: SystemsState = createState();
  /** Event log for UI feedback (most recent last). */
  log: { t: number; text: string; level: 'info' | 'caution' | 'warning' }[] = [];
  private listeners = new Set<() => void>();

  private note(text: string, level: 'info' | 'caution' | 'warning' = 'info') {
    this.log.push({ t: this.state.time, text, level });
    if (this.log.length > 60) this.log.shift();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const l of this.listeners) l();
  }

  // ------------------------------------------------------------------ commands
  private ok(message: string): CommandResult {
    this.note(message);
    this.emit();
    return { ok: true, message };
  }
  private deny(message: string): CommandResult {
    this.note(message, 'caution');
    this.emit();
    return { ok: false, message };
  }

  setBattery(on: boolean): CommandResult {
    this.state.elec.battery = on;
    return this.ok(`Batteries ${on ? 'ON' : 'OFF'}`);
  }
  setExternalPower(on: boolean): CommandResult {
    const s = this.state;
    if (on && !s.elec.extAvail) return this.deny('External power not available');
    if (on && s.air.airborne) return this.deny('External power unavailable in flight');
    s.elec.extOn = on;
    return this.ok(`External power ${on ? 'ON' : 'OFF'}`);
  }
  setApuMaster(on: boolean): CommandResult {
    const s = this.state;
    if (on && !s.elec.dc) return this.deny('APU MASTER needs DC power — switch batteries ON first');
    s.apu.master = on;
    if (!on) {
      s.apu.start = false;
      if (s.apu.state !== 'off') s.apu.state = 'cooldown';
    }
    return this.ok(`APU master ${on ? 'ON' : 'OFF'}`);
  }
  startApu(): CommandResult {
    const s = this.state;
    if (!s.apu.master) return this.deny('Set APU MASTER ON before START');
    if (s.apu.state === 'running') return this.deny('APU already running');
    s.apu.start = true;
    s.apu.state = 'starting';
    return this.ok('APU start sequence initiated');
  }
  setApuBleed(on: boolean): CommandResult {
    const s = this.state;
    if (on && s.apu.state !== 'running') return this.deny('APU bleed available only with the APU running');
    s.apu.bleed = on;
    return this.ok(`APU bleed ${on ? 'ON' : 'OFF'}`);
  }
  setEngineMode(mode: SystemsState['engineMode']): CommandResult {
    this.state.engineMode = mode;
    return this.ok(`Engine mode selector ${mode}`);
  }
  setEngineMaster(i: number, on: boolean): CommandResult {
    const s = this.state;
    const e = s.engines[i];
    if (!e) return this.deny('Unknown engine');
    if (on) {
      if (e.state === 'running') return this.deny(`Engine ${i + 1} already running`);
      if (s.engineMode !== 'IGN/START') return this.deny('Set ENG MODE selector to IGN/START first');
      if (!s.bleedAvailable) return this.deny('No bleed air for the starter — start the APU and open APU BLEED');
      if (!s.elec.dc) return this.deny('No electrical power for ignition');
      e.master = true;
      e.state = 'starting';
      e.startProgress = 0;
      return this.ok(`Engine ${i + 1} start: starter engaged`);
    }
    e.master = false;
    if (e.state !== 'off') e.state = 'stopping';
    return this.ok(`Engine ${i + 1} master OFF`);
  }
  setThrust(lever: number, engines: number[] = [0, 1, 2, 3]): void {
    for (const i of engines) {
      const e = this.state.engines[i];
      if (e) e.lever = Math.min(1, Math.max(0, lever));
    }
  }
  setReverse(on: boolean): CommandResult {
    const s = this.state;
    if (on && s.air.airborne) return this.deny('Reverse thrust is inhibited in flight');
    for (const i of [1, 2]) s.engines[i]!.reverseCmd = on;
    return this.ok(on ? 'Reversers (ENG 2 & 3) commanded to deploy' : 'Reversers stowing');
  }
  setGearLever(pos: 'up' | 'down'): CommandResult {
    const s = this.state;
    if (pos === s.gear.lever) return { ok: true, message: `Gear lever already ${pos.toUpperCase()}` };
    if (pos === 'up' && s.gear.wow) return this.deny('Gear retraction inhibited: aircraft on ground (weight on wheels)');
    s.gear.lever = pos;
    return this.ok(`Landing gear lever ${pos.toUpperCase()}`);
  }
  gravityExtension(): CommandResult {
    const s = this.state;
    s.gear.lever = 'down';
    s.gear.gravityExtension = true;
    return this.ok('Gravity extension: gear free-falls with uplocks released');
  }
  setFlapLever(i: number): CommandResult {
    const s = this.state;
    const lever = Math.max(0, Math.min(4, Math.round(i)));
    s.highLift.lever = lever;
    return this.ok(`Flap lever ${FLAP_LEVER[lever]}`);
  }
  setSpeedbrake(v: number): void {
    this.state.spoilers.lever = Math.max(0, Math.min(1, v));
    if (v > 0) this.state.spoilers.armed = false;
  }
  armSpoilers(on: boolean): CommandResult {
    this.state.spoilers.armed = on;
    if (on) this.state.spoilers.lever = 0;
    return this.ok(`Ground spoilers ${on ? 'ARMED' : 'DISARMED'}`);
  }
  setParkingBrake(on: boolean): CommandResult {
    this.state.brakes.parking = on;
    return this.ok(`Parking brake ${on ? 'ON' : 'OFF'}`);
  }
  setAutobrake(mode: Autobrake): CommandResult {
    this.state.brakes.autobrake = mode;
    return this.ok(`Autobrake ${mode}`);
  }
  setBrakes(left: number, right = left): void {
    this.state.brakes.left = Math.max(0, Math.min(1, left));
    this.state.brakes.right = Math.max(0, Math.min(1, right));
  }
  setLight(k: LightKey, on: boolean): CommandResult {
    this.state.lights[k] = on;
    return this.ok(`${LIGHT_NAMES[k]} lights ${on ? 'ON' : 'OFF'}`);
  }
  setCabinLight(mode: CabinLight): CommandResult {
    this.state.cabinLight = mode;
    return this.ok(`Cabin lighting: ${mode}`);
  }
  setSeatbelt(on: boolean): CommandResult {
    this.state.seatbelt = on;
    return this.ok(`Seat belt signs ${on ? 'ON' : 'OFF'}`);
  }
  setDoor(id: string, open: boolean): CommandResult {
    const s = this.state;
    const d = s.doors[id];
    if (!d) return this.deny(`Unknown door ${id}`);
    if (open) {
      if (s.air.airborne) return this.deny('Doors cannot be opened in flight (cabin pressure differential)');
      if (s.air.gs > 1) return this.deny('Doors cannot be opened while the aircraft is moving');
      if (d.kind === 'passenger' && d.armed) return this.deny(`Door ${id} is ARMED — disarm the slide before opening`);
      if (d.kind === 'cargo' && !s.elec.ac) return this.deny('Cargo doors need AC power (electric hydraulic pump)');
    }
    d.target = open ? 1 : 0;
    return this.ok(`Door ${id} ${open ? 'opening' : 'closing'}`);
  }
  armDoor(id: string, armed: boolean): CommandResult {
    const d = this.state.doors[id];
    if (!d || d.kind !== 'passenger') return this.deny('Only passenger doors have evacuation slides');
    if (armed && d.position > 0.01) return this.deny(`Close door ${id} before arming`);
    d.armed = armed;
    return this.ok(`Door ${id} slide ${armed ? 'ARMED' : 'DISARMED'}`);
  }
  setAllDoors(open: boolean, kind: 'passenger' | 'cargo' | 'all' = 'all'): void {
    for (const d of Object.values(this.state.doors)) if (kind === 'all' || d.kind === kind) this.setDoor(d.id, open);
  }
  setFlightControls(pitch: number, roll: number, yaw: number): void {
    const c = this.state.controls;
    c.pitch = Math.max(-1, Math.min(1, pitch));
    c.roll = Math.max(-1, Math.min(1, roll));
    c.yaw = Math.max(-1, Math.min(1, yaw));
  }
  setTiller(v: number): void {
    this.state.controls.tiller = Math.max(-1, Math.min(1, v));
  }
  setMaintenance(on: boolean): CommandResult {
    const s = this.state;
    if (on && (s.air.airborne || s.air.gs > 0.5)) return this.deny('Jacking is only possible with the aircraft stationary on the ground');
    if (!on && s.gear.position > 0.01) return this.deny('Extend the landing gear before lowering the aircraft off the jacks');
    s.maintenance = on;
    return this.ok(on ? 'Aircraft on jacks — ground hydraulic carts connected (gear swing test)' : 'Aircraft lowered onto its gear');
  }
  setTimeScale(k: number): void {
    this.state.timeScale = Math.max(0.25, Math.min(8, k));
  }

  // ---------------------------------------------------------------- simulation
  /** Advance by dt seconds (call with a fixed step, e.g. 1/120 s). */
  step(dtReal: number): void {
    const s = this.state;
    const dt = dtReal * s.timeScale;
    s.time += dt;

    // Electrical network
    const anyEng = s.engines.some((e) => e.state === 'running');
    const apuGen = s.apu.state === 'running' && s.apu.n > 95 && s.elec.apuGen;
    const sources: string[] = [];
    if (s.elec.extOn && s.elec.extAvail && !s.air.airborne) sources.push('EXT');
    if (apuGen) sources.push('APU GEN');
    s.engines.forEach((e, i) => e.state === 'running' && e.n2 > 55 && sources.push(`GEN ${i + 1}`));
    s.elec.sources = sources;
    s.elec.ac = sources.length > 0;
    s.elec.dc = s.elec.ac || s.elec.battery;
    if (!s.elec.dc && s.apu.master) s.apu.master = false;

    // APU
    const apu = s.apu;
    if (apu.state === 'starting') {
      apu.n = rate(apu.n, 100, 100 / 45, dt);
      apu.egt = approach(apu.egt, apu.n < 60 ? 750 : 420, 6, dt);
      if (apu.n >= 100) {
        apu.state = 'running';
        apu.start = false;
        this.note('APU AVAIL');
      }
    } else if (apu.state === 'running') {
      apu.n = 100;
      apu.egt = approach(apu.egt, 420, 8, dt);
      if (!apu.master) apu.state = 'cooldown';
    } else if (apu.state === 'cooldown') {
      apu.bleed = false;
      apu.n = rate(apu.n, 0, 100 / 30, dt);
      apu.egt = approach(apu.egt, 15, 20, dt);
      if (apu.n <= 0) apu.state = 'off';
    } else {
      apu.egt = approach(apu.egt, 15, 30, dt);
    }
    s.bleedAvailable = (apu.bleed && apu.state === 'running') || anyEng;

    // Engines
    s.engines.forEach((e, i) => this.stepEngine(e, i, dt));

    // Hydraulics: Green = engines 1 & 2, Yellow = engines 3 & 4, electric pumps on ground with AC.
    s.hyd.elecPumps = s.elec.ac && !s.air.airborne && (Object.values(s.doors).some((d) => d.kind === 'cargo' && d.target !== d.position) || false);
    if (!s.air.airborne) s.gear.wow = !s.maintenance;
    const greenSrc = s.engines[0]!.n2 > 50 || s.engines[1]!.n2 > 50 || s.maintenance;
    const yellowSrc = s.engines[2]!.n2 > 50 || s.engines[3]!.n2 > 50 || s.maintenance;
    s.hyd.green = approach(s.hyd.green, greenSrc ? 5000 : s.hyd.elecPumps ? 3000 : 0, greenSrc ? 1.2 : 5, dt);
    s.hyd.yellow = approach(s.hyd.yellow, yellowSrc ? 5000 : s.hyd.elecPumps ? 3000 : 0, yellowSrc ? 1.2 : 5, dt);
    // A380 2H/2E: electro-hydrostatic actuators keep surfaces powered from AC even without hydraulics.
    const surfacesPowered = s.hyd.green > 1500 || s.hyd.yellow > 1500 || s.elec.ac;

    // Landing gear sequence (doors open → gear moves → doors close)
    this.stepGear(dt);

    // High lift
    const hl = s.highLift;
    let conf = [0, 1, 3, 4, 5][hl.lever]!;
    if (hl.lever === 1 && (!s.air.airborne || s.air.ias < 205)) conf = 2; // 1+F
    hl.conf = conf;
    if (surfacesPowered) {
      hl.slat = rate(hl.slat, CONF[conf]!.slat, 1.0, dt);
      hl.flap = rate(hl.flap, CONF[conf]!.flap, 0.8, dt);
    }

    // Flight-control surfaces (educational direct mapping with rate limits)
    const c = s.controls;
    if (surfacesPowered) {
      c.elevator = rate(c.elevator, -c.pitch * 30 * (c.pitch > 0 ? 1 : 0.67), 40, dt);
      c.aileronR = rate(c.aileronR, -c.roll * 25, 50, dt);
      c.aileronL = rate(c.aileronL, c.roll * 25, 50, dt);
      c.rudder = rate(c.rudder, c.yaw * 30, 35, dt);
    }
    // Spoilers: speed brake, roll assist and ground spoilers
    const sp = s.spoilers;
    const allIdle = s.engines.every((e) => e.lever < 0.05);
    const groundDeploy = sp.armed && s.gear.wow && allIdle && s.air.gs > 40 / 1.944;
    const target = groundDeploy ? 50 : sp.lever * (s.air.airborne ? 30 : 50);
    if (surfacesPowered) {
      sp.deployed = rate(sp.deployed, target, 60, dt);
      sp.rollRight = rate(sp.rollRight, c.roll > 0.2 ? (c.roll - 0.2) * 40 : 0, 60, dt);
      sp.rollLeft = rate(sp.rollLeft, c.roll < -0.2 ? (-c.roll - 0.2) * 40 : 0, 60, dt);
    }
    if (groundDeploy && sp.deployed < 1) this.note('GROUND SPOILERS deployed');

    // Nose-wheel steering (tiller ±70°, pedals ±6°) needs hydraulics
    const steerTarget = s.gear.wow ? c.tiller * 70 + c.yaw * 6 : 0;
    s.gear.steering = s.hyd.green > 1500 || s.hyd.yellow > 1500 ? rate(s.gear.steering, steerTarget, 20, dt) : s.gear.steering;

    // Brakes: temperature rises with braking energy
    const b = s.brakes;
    b.temp = approach(b.temp, 20 + (b.left + b.right) * s.air.gs * 4, b.left + b.right > 0.05 ? 30 : 400, dt);

    // Doors
    for (const d of Object.values(s.doors)) {
      const speed = d.kind === 'cargo' ? 1 / 14 : 1 / 7;
      d.position = rate(d.position, d.target, speed, dt);
    }

    s.annunciations = this.annunciations();
  }

  private stepEngine(e: EngineState, i: number, dt: number) {
    const s = this.state;
    switch (e.state) {
      case 'off':
        e.n1 = approach(e.n1, s.air.ias > 60 ? s.air.ias * 0.08 : 0, 10, dt); // windmilling
        e.n2 = approach(e.n2, 0, 12, dt);
        e.egt = approach(e.egt, 15, 60, dt);
        e.ff = 0;
        break;
      case 'starting': {
        if (!s.bleedAvailable && e.n2 < 25) {
          e.state = 'stopping';
          this.note(`ENG ${i + 1} start aborted — bleed air lost`, 'caution');
          break;
        }
        // Starter motoring → fuel & ignition at ~25 % N2 → light-off → stabilise at idle
        if (e.n2 < 25) e.n2 = rate(e.n2, 25.5, 1.4, dt);
        else {
          e.n2 = rate(e.n2, IDLE_N2, 1.6, dt);
          e.ff = approach(e.ff, 900, 3, dt);
          e.egt = approach(e.egt, e.n2 < 50 ? 640 : 520, 5, dt);
        }
        e.n1 = Math.max(e.n1, (e.n2 / IDLE_N2) * IDLE_N1 * Math.min(1, e.n2 / 40));
        e.startProgress = e.n2 / IDLE_N2;
        if (e.n2 >= IDLE_N2 - 0.1) {
          e.state = 'running';
          this.note(`ENG ${i + 1} AVAIL — stabilised at idle`);
        }
        break;
      }
      case 'running': {
        const target = IDLE_N1 + e.lever * (100 - IDLE_N1);
        // Spool-up is slower from idle (high-bypass engine acceleration lag)
        const tau = target > e.n1 ? (e.n1 < 40 ? 2.6 : 1.6) : 1.8;
        e.n1 = approach(e.n1, target, tau, dt);
        e.n2 = approach(e.n2, IDLE_N2 + (e.n1 - IDLE_N1) * 0.42, tau * 0.9, dt);
        e.egt = approach(e.egt, 480 + (e.n1 - IDLE_N1) * 4.6, 3, dt);
        e.ff = approach(e.ff, 900 + Math.pow((e.n1 - IDLE_N1) / 80, 1.6) * 11500, 2, dt);
        if (!e.master) e.state = 'stopping';
        break;
      }
      case 'stopping':
        e.ff = 0;
        e.n1 = approach(e.n1, 0, 6, dt);
        e.n2 = approach(e.n2, 0, 7, dt);
        e.egt = approach(e.egt, 15, 40, dt);
        if (e.n2 < 0.5) e.state = 'off';
        break;
    }
    // Reversers (inboard engines only) – electrically actuated, need ground & running engine
    const canReverse = (i === 1 || i === 2) && s.gear.wow && s.elec.ac;
    e.reverser = rate(e.reverser, e.reverseCmd && canReverse ? 1 : 0, 1 / 2.2, dt);
  }

  private stepGear(dt: number) {
    const s = this.state;
    const g = s.gear;
    const hydOk = s.hyd.green > 2000 || g.gravityExtension;
    const wantUp = g.lever === 'up';
    const targetPos = wantUp ? 1 : 0;
    if (!hydOk) {
      g.inTransit = false;
      return;
    }
    const moving = Math.abs(g.position - targetPos) > 1e-4;
    if (moving) {
      g.inTransit = true;
      // Doors must be open before the gear moves
      g.doors = rate(g.doors, 1, 1 / 2.2, dt);
      if (g.doors > 0.98) g.position = rate(g.position, targetPos, g.gravityExtension ? 1 / 6 : 1 / 7, dt);
    } else {
      g.inTransit = false;
      g.doors = rate(g.doors, 0, 1 / 2.2, dt);
      if (g.gravityExtension && g.doors <= 0) {
        // In a real gravity extension the doors remain open; keep them open for realism.
        g.doors = 1;
      }
    }
  }

  private annunciations(): Annunciation[] {
    const s = this.state;
    const out: Annunciation[] = [];
    const anyRunning = s.engines.some((e) => e.state === 'running');
    const highThrust = s.engines.some((e) => e.lever > 0.6);
    if (!s.elec.ac && s.elec.dc) out.push({ id: 'elec', level: 'caution', text: 'ELEC AC BUS OFF — BATTERY ONLY' });
    if (s.gear.wow && highThrust) {
      if (s.brakes.parking) out.push({ id: 'pkbrk', level: 'warning', text: 'CONFIG PARK BRK ON' });
      if (s.highLift.lever === 0) out.push({ id: 'cfgflap', level: 'warning', text: 'CONFIG FLAPS NOT IN T.O CONFIG' });
      if (s.spoilers.lever > 0.05) out.push({ id: 'cfgspd', level: 'warning', text: 'CONFIG SPD BRK NOT RETRACTED' });
    }
    if (s.air.airborne && s.gear.position > 0.5 && s.air.radioAlt < 750 && s.highLift.conf >= 4) out.push({ id: 'gear', level: 'warning', text: 'L/G GEAR NOT DOWN' });
    if (anyRunning && Object.values(s.doors).some((d) => d.position > 0.02)) out.push({ id: 'door', level: 'caution', text: 'DOOR NOT CLOSED' });
    if (anyRunning && s.hyd.green < 1500) out.push({ id: 'hydg', level: 'caution', text: 'HYD G SYS LO PR' });
    if (anyRunning && s.hyd.yellow < 1500) out.push({ id: 'hydy', level: 'caution', text: 'HYD Y SYS LO PR' });
    if (s.air.airborne && s.spoilers.deployed > 5 && highThrust) out.push({ id: 'spd', level: 'caution', text: 'SPEED BRAKES STILL OUT' });
    if (s.air.mach > 0.89 || s.air.ias > 340) out.push({ id: 'ovs', level: 'warning', text: 'OVERSPEED' });
    if (s.air.airborne && s.air.aoa > 14) out.push({ id: 'stall', level: 'warning', text: 'STALL' });
    if (s.brakes.temp > 300) out.push({ id: 'brk', level: 'caution', text: 'BRAKES HOT' });
    // Memos
    if (s.apu.state === 'running') out.push({ id: 'apu', level: 'memo', text: s.apu.bleed ? 'APU BLEED' : 'APU AVAIL' });
    if (s.brakes.parking) out.push({ id: 'park', level: 'memo', text: 'PARK BRK' });
    if (s.maintenance) out.push({ id: 'jacks', level: 'memo', text: 'ON JACKS · GND HYD' });
    if (s.spoilers.armed) out.push({ id: 'gsp', level: 'memo', text: 'GND SPLRS ARMED' });
    if (s.seatbelt) out.push({ id: 'seat', level: 'memo', text: 'SEAT BELTS' });
    if (s.engineMode === 'IGN/START') out.push({ id: 'ign', level: 'memo', text: 'IGNITION' });
    if (s.engines.some((e) => e.state === 'starting')) out.push({ id: 'start', level: 'memo', text: 'ENG START IN PROGRESS' });
    return out;
  }

  // -------------------------------------------------------------- scenarios
  /** Apply a named starting configuration (used by the Systems and Flight sections). */
  applyScenario(name: Scenario): void {
    const keepAir = this.state.air;
    this.state = createState();
    const s = this.state;
    s.air = { ...keepAir };
    this.log = [];
    const powered = () => {
      s.elec.battery = true;
      s.elec.extOn = true;
      s.elec.ac = true;
      s.elec.dc = true;
    };
    const apuRunning = () => {
      s.apu.master = true;
      s.apu.state = 'running';
      s.apu.n = 100;
      s.apu.egt = 420;
      s.apu.bleed = true;
    };
    const enginesRunning = (lever = 0) => {
      s.engineMode = 'NORM';
      for (const e of s.engines) {
        Object.assign(e, { master: true, state: 'running', n1: IDLE_N1 + lever * 80, n2: IDLE_N2 + lever * 33, egt: 520 + lever * 300, ff: 900 + lever * 9000, lever });
      }
      s.hyd.green = 5000;
      s.hyd.yellow = 5000;
      s.elec.ac = true;
      s.elec.dc = true;
    };
    const lightsOn = (land: boolean) => {
      s.lights.nav = true;
      s.lights.beacon = true;
      s.lights.logo = true;
      s.lights.strobe = land;
      s.lights.landing = land;
      s.lights.taxi = !land;
    };
    switch (name) {
      case 'coldDark':
        s.brakes.parking = true;
        break;
      case 'turnaround':
        powered();
        s.cabinLight = 'boarding';
        s.lights.nav = true;
        s.lights.logo = true;
        for (const id of ['M1L', 'U1L', 'FWD_CARGO', 'AFT_CARGO']) {
          s.doors[id]!.target = 1;
          s.doors[id]!.position = 1;
        }
        break;
      case 'apuStart':
        powered();
        apuRunning();
        s.elec.extOn = false;
        s.cabinLight = 'boarding';
        s.lights.nav = true;
        s.lights.beacon = true;
        break;
      case 'taxi':
        powered();
        s.elec.extOn = false;
        enginesRunning(0);
        lightsOn(false);
        s.brakes.parking = false;
        s.brakes.autobrake = 'RTO';
        s.highLift.lever = 1;
        s.highLift.conf = 2;
        s.highLift.slat = 20;
        s.highLift.flap = 8;
        s.spoilers.armed = true;
        s.seatbelt = true;
        s.cabinLight = 'night';
        for (const d of Object.values(s.doors)) if (d.kind === 'passenger') d.armed = true;
        break;
      case 'takeoff':
        this.applyScenario('taxi');
        lightsOn(true);
        s.lights.taxi = true;
        return;
      case 'cruise':
        powered();
        s.elec.extOn = false;
        enginesRunning(0.78);
        lightsOn(false);
        s.lights.taxi = false;
        s.lights.logo = false;
        s.brakes.parking = false;
        s.gear.lever = 'up';
        s.gear.position = 1;
        s.gear.wow = false;
        s.cabinLight = 'ambient';
        s.seatbelt = false;
        for (const d of Object.values(s.doors)) if (d.kind === 'passenger') d.armed = true;
        break;
      case 'approach':
        this.applyScenario('cruise');
        s.engines.forEach((e) => (e.lever = 0.45));
        s.highLift.lever = 3;
        s.highLift.conf = 4;
        s.highLift.slat = 23;
        s.highLift.flap = 26;
        s.gear.lever = 'down';
        s.gear.position = 0;
        s.spoilers.armed = true;
        s.brakes.autobrake = '2';
        s.seatbelt = true;
        lightsOn(true);
        return;
    }
    this.emit();
  }
}

export type Scenario = 'coldDark' | 'turnaround' | 'apuStart' | 'taxi' | 'takeoff' | 'cruise' | 'approach';

export const LIGHT_NAMES: Record<LightKey, string> = {
  nav: 'Navigation',
  beacon: 'Beacon',
  strobe: 'Strobe',
  landing: 'Landing',
  taxi: 'Taxi',
  logo: 'Logo',
  wing: 'Wing inspection',
  runwayTurnoff: 'Runway turn-off',
};

/** Single shared instance used by the whole application. */
export const systems = new AircraftSystems();
