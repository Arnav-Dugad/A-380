/**
 * Simplified six-degree-of-freedom flight model for an A380-class aircraft.
 *
 * EDUCATIONAL MODEL — NOT certified data and not a training device. Aerodynamic
 * coefficients are textbook transport-aircraft values scaled to published A380 geometry
 * (845 m² wing, 79.75 m span) and tuned so that take-off, cruise and approach speeds fall
 * in realistic ranges. See docs/ACCURACY.md for every assumption.
 *
 * Frames
 *   world: three.js axes — +X east, +Y up, +Z south (north = −Z); runway 09 points along +X
 *   body:  +X forward, +Y up, +Z right wing
 * Angular velocity ω = (roll about +X [right wing down], yaw about +Y [nose left], pitch about +Z [nose up]).
 *
 * Integration: semi-implicit Euler at a fixed 1/120 s step (see loop.ts); deterministic for
 * a given input sequence (turbulence uses a seeded PRNG).
 */
import { Quaternion, Vector3 } from 'three';
import { CONF, systems, IDLE_N1 } from './systems';
import { autopilot } from '../cockpit/displays';

// ------------------------------------------------------------------- constants
export const AC = {
  S: 845, // m² [V]
  b: 79.75, // m [V]
  c: 12.3, // m mean aerodynamic chord [A]
  Ixx: 4.1e7,
  Iyy: 1.3e8, // yaw axis (vertical) in our frame
  Izz: 9.5e7, // pitch axis
  thrustSL: 341_000, // N per engine, Trent 972-84 take-off [V]
  cgHeight: 5.0, // m above ground when static [A]
  gearOffset: 0.22, // static strut compression (wheel hangs this much lower when unloaded)
};

const G = 9.80665;
const RHO0 = 1.225;
export const KT = 1.943844; // m/s → kt
export const FT = 3.28084; // m → ft

/** Contact points relative to the CG (body frame). */
export const GEAR_POINTS = [
  { id: 'nose', r: new Vector3(30.3, -AC.cgHeight - AC.gearOffset, 0), k: 1.4e6, c: 4.0e5, nose: true },
  { id: 'wingL', r: new Vector3(-0.1, -AC.cgHeight - AC.gearOffset, -7.15), k: 4.8e6, c: 1.05e6, nose: false },
  { id: 'wingR', r: new Vector3(-0.1, -AC.cgHeight - AC.gearOffset, 7.15), k: 4.8e6, c: 1.05e6, nose: false },
  { id: 'bodyL', r: new Vector3(-3.3, -AC.cgHeight - AC.gearOffset, -2.6), k: 4.8e6, c: 1.05e6, nose: false },
  { id: 'bodyR', r: new Vector3(-3.3, -AC.cgHeight - AC.gearOffset, 2.6), k: 4.8e6, c: 1.05e6, nose: false },
];
/** Structural points that may strike the ground (relative to CG). Aft-fuselage points give a
 * tail-strike pitch angle of ≈ 10° about the main gear [A]. */
const TAIL_POINTS = [new Vector3(-18.7, -1.9, 0), new Vector3(-23.7, -0.7, 0)];
const STRIKE_POINTS = [new Vector3(0, -3.3, 0), new Vector3(5.5, -3.75, 14.5), new Vector3(5.5, -3.75, -14.5), new Vector3(-6, -2.9, 25.7), new Vector3(-6, -2.9, -25.7), new Vector3(-19, 2.9, 39.8), new Vector3(-19, 2.9, -39.8)];

/** Per high-lift configuration: ΔCL at zero α, CLmax, ΔCD, ΔCm. Index matches CONF. */
const HL = [
  { dCL: 0.0, clMax: 1.32, dCD: 0.0, dCm: 0 },
  { dCL: 0.08, clMax: 1.78, dCD: 0.007, dCm: -0.01 },
  { dCL: 0.35, clMax: 2.0, dCD: 0.016, dCm: -0.04 },
  { dCL: 0.45, clMax: 2.1, dCD: 0.028, dCm: -0.06 },
  { dCL: 0.5, clMax: 2.25, dCD: 0.048, dCm: -0.08 },
  { dCL: 0.62, clMax: 2.45, dCD: 0.078, dCm: -0.11 },
]

// ------------------------------------------------------------------- atmosphere
export function isa(hM: number): { rho: number; T: number; a: number; p: number } {
  const h = Math.max(-500, hM);
  if (h < 11000) {
    const T = 288.15 - 0.0065 * h;
    const p = 101325 * Math.pow(T / 288.15, 5.2559);
    return { T, p, rho: p / (287.05 * T), a: Math.sqrt(1.4 * 287.05 * T) };
  }
  const T = 216.65;
  const p = 22632 * Math.exp(-(h - 11000) / 6341.6);
  return { T, p, rho: p / (287.05 * T), a: Math.sqrt(1.4 * 287.05 * T) };
}

// ------------------------------------------------------------------- PRNG
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------- state
export interface FlightInputs {
  pitch: number; // −1 push … +1 pull
  roll: number; // −1 left … +1 right
  yaw: number; // −1 left … +1 right pedal
  brake: number; // 0..1
}

export interface Weather {
  windFrom: number; // degrees true
  windKt: number;
  gustKt: number;
  turbulence: number; // 0..1
}

export type ControlLaw = 'normal' | 'direct';

export interface FlightState {
  pos: Vector3; // CG world position (m)
  vel: Vector3; // world velocity (m/s)
  q: Quaternion; // body → world
  w: Vector3; // body angular velocity (rad/s)
  mass: number;
  fuel: number; // kg
  t: number;
  onGround: boolean;
  crashed: string | null;
  // derived (for displays)
  alpha: number;
  beta: number;
  ias: number; // m/s
  tas: number;
  mach: number;
  nz: number;
  gearLoad: number[];
}

const tmpV = new Vector3();
const tmpV2 = new Vector3();
const tmpQ = new Quaternion();

export class FlightModel {
  state: FlightState;
  inputs: FlightInputs = { pitch: 0, roll: 0, yaw: 0, brake: 0 };
  weather: Weather = { windFrom: 270, windKt: 0, gustKt: 0, turbulence: 0 };
  law: ControlLaw = 'normal';
  private rnd = mulberry32(380);
  private turb = new Vector3();
  private pitchI = 0;
  private gammaHold = 0;
  private bankHold = 0;
  private athrI = 0;

  constructor() {
    this.state = this.initialState();
  }

  initialState(): FlightState {
    return {
      pos: new Vector3(0, AC.cgHeight, 0),
      vel: new Vector3(),
      q: new Quaternion(),
      w: new Vector3(),
      mass: 470_000,
      fuel: 120_000,
      t: 0,
      onGround: true,
      crashed: null,
      alpha: 0,
      beta: 0,
      ias: 0,
      tas: 0,
      mach: 0,
      nz: 1,
      gearLoad: [0, 0, 0, 0, 0],
    };
  }

  /** Place the aircraft: position (CG), heading (deg true), speed (kt TAS), pitch (deg), climb angle (deg). */
  place(opts: { x: number; z: number; alt: number; heading: number; speedKt: number; pitch?: number; gamma?: number; mass?: number }): void {
    const s = this.initialState();
    s.mass = opts.mass ?? s.mass;
    s.fuel = Math.min(s.fuel, s.mass - 300_000);
    s.pos.set(opts.x, opts.alt, opts.z);
    const psi = (opts.heading * Math.PI) / 180;
    const theta = ((opts.pitch ?? 0) * Math.PI) / 180;
    // heading ψ: rotate body +X (east at ψ=90) — yaw about +Y by (90° − ψ)
    const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (Math.PI / 2 - psi));
    const pitch = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), theta);
    s.q.copy(yaw).multiply(pitch);
    const gamma = ((opts.gamma ?? 0) * Math.PI) / 180;
    const v = opts.speedKt / KT;
    const fwd = new Vector3(Math.sin(psi), 0, -Math.cos(psi));
    s.vel.copy(fwd.multiplyScalar(v * Math.cos(gamma))).add(new Vector3(0, v * Math.sin(gamma), 0));
    s.onGround = opts.alt <= AC.cgHeight + 0.01;
    this.state = s;
    this.pitchI = 0;
    this.gammaHold = gamma;
    this.bankHold = 0;
    this.athrI = 0;
    this.rnd = mulberry32(380);
    this.publish();
  }

  /** Euler angles in degrees: heading (true, 0..360), pitch, bank. */
  attitude(): { heading: number; pitch: number; bank: number } {
    const fwd = tmpV.set(1, 0, 0).applyQuaternion(this.state.q);
    const right = tmpV2.set(0, 0, 1).applyQuaternion(this.state.q);
    const pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y)));
    let heading = Math.atan2(fwd.x, -fwd.z);
    if (heading < 0) heading += Math.PI * 2;
    // bank: angle of right wing below horizon
    const bank = Math.asin(Math.max(-1, Math.min(1, -right.y)) / Math.max(0.2, Math.cos(pitch)));
    return { heading: (heading * 180) / Math.PI, pitch: (pitch * 180) / Math.PI, bank: (bank * 180) / Math.PI };
  }

  private windWorld(dt: number): Vector3 {
    const w = this.weather;
    const from = (w.windFrom * Math.PI) / 180;
    // wind blowing *from* direction → velocity towards opposite
    const base = new Vector3(-Math.sin(from), 0, Math.cos(from)).multiplyScalar(w.windKt / KT);
    if (w.turbulence > 0 || w.gustKt > 0) {
      const k = 1 - Math.exp(-dt / 1.6);
      const amp = (w.gustKt / KT) * 0.6 + w.turbulence * 4;
      this.turb.x += ((this.rnd() - 0.5) * 2 * amp - this.turb.x) * k;
      this.turb.y += ((this.rnd() - 0.5) * amp * 0.8 - this.turb.y) * k;
      this.turb.z += ((this.rnd() - 0.5) * 2 * amp - this.turb.z) * k;
      base.add(this.turb);
    }
    return base;
  }

  /** Educational fly-by-wire: stick → pitch-rate / roll-rate demands with protections. */
  private controlLaw(dt: number, V: number) {
    const sys = systems.state;
    const inp = this.inputs;
    const s = this.state;
    const att = this.attitude();
    const c = sys.controls;
    // Autopilot overrides stick when engaged and stick is neutral
    let pitchCmd = inp.pitch;
    let rollCmd = inp.roll;
    const stickActive = Math.abs(inp.pitch) > 0.15 || Math.abs(inp.roll) > 0.15;
    if (autopilot.ap && stickActive) {
      autopilot.ap = false;
      systems.state.annunciations.push({ id: 'apoff', level: 'warning', text: 'AP OFF' });
    }
    if (this.law === 'direct' || V < 40) {
      systems.setFlightControls(pitchCmd, rollCmd, inp.yaw);
      return;
    }
    if (s.onGround) {
      // Ground law: pitch-rate command for a controlled rotation (≈ 3°/s), direct roll/yaw.
      if (Math.abs(pitchCmd) < 0.02) {
        this.pitchI = 0;
        systems.setFlightControls(0, rollCmd, inp.yaw);
        return;
      }
      const qErrG = pitchCmd * ((3 * Math.PI) / 180) - s.w.z;
      this.pitchI = Math.max(-1, Math.min(1, this.pitchI + qErrG * dt * 3));
      systems.setFlightControls(Math.max(-1, Math.min(1, qErrG * 10 + this.pitchI * 0.8)), rollCmd, inp.yaw);
      this.gammaHold = 0.12;
      return;
    }
    const gamma = Math.asin(Math.max(-1, Math.min(1, s.vel.y / Math.max(V, 1))));
    // ---- autopilot targets
    if (autopilot.ap) {
      // Vertical: ALT capture / V/S
      const altFt = s.pos.y * FT;
      let vsTarget = autopilot.vertical === 'V/S' ? autopilot.vs : 0;
      if (autopilot.vertical === 'ALT' || autopilot.vertical === 'V/S') {
        const err = autopilot.alt - altFt;
        if (autopilot.vertical === 'ALT' || Math.abs(err) < Math.abs(autopilot.vs) / 6) {
          autopilot.vertical = 'ALT';
          vsTarget = Math.max(-2000, Math.min(2000, err * 2));
        }
      }
      const gammaT = Math.atan2(vsTarget / FT / 60, V);
      this.gammaHold = gammaT;
      pitchCmd = 0;
      // Lateral: heading select
      if (autopilot.lateral === 'HDG') {
        let dh = autopilot.hdg - att.heading;
        dh = ((dh + 540) % 360) - 180;
        this.bankHold = Math.max(-25, Math.min(25, dh * 1.6));
        rollCmd = 0;
      }
    }
    // ---- pitch: C*-like — stick commands pitch rate; neutral stick holds flight-path angle
    let qCmd: number;
    if (Math.abs(pitchCmd) > 0.02) {
      qCmd = pitchCmd * (3.5 * Math.PI) / 180;
      this.gammaHold = gamma;
    } else {
      const bankCos = Math.cos((att.bank * Math.PI) / 180);
      qCmd = (this.gammaHold - gamma) * 0.9 + (G / V) * (1 / Math.max(0.3, bankCos) - 1) * 0.9;
    }
    // protections: pitch attitude +30/−15, α-protection
    if (att.pitch > 28 && qCmd > 0) qCmd *= Math.max(0, (30 - att.pitch) / 2);
    if (att.pitch < -13 && qCmd < 0) qCmd *= Math.max(0, (att.pitch + 15) / 2);
    const conf = HL[sys.highLift.conf]!;
    const alphaMax = ((conf.clMax - 0.2 - conf.dCL) / 5.6) * (180 / Math.PI) - 2;
    const alphaDeg = (s.alpha * 180) / Math.PI;
    if (alphaDeg > alphaMax - 2 && qCmd > -0.01) qCmd = Math.min(qCmd, (alphaMax - alphaDeg) * 0.02);
    const qErr = qCmd - s.w.z;
    this.pitchI = Math.max(-1, Math.min(1, this.pitchI + qErr * dt * 3));
    const elevDemand = -(qErr * 9 + this.pitchI * 0.8) - c.trim * 0;
    // ---- roll: rate command, neutral holds bank (≤33°), 67° hard limit
    let pCmd: number;
    if (Math.abs(rollCmd) > 0.02) {
      pCmd = rollCmd * (15 * Math.PI) / 180;
      this.bankHold = att.bank;
    } else {
      const hold = Math.abs(this.bankHold) > 33 ? Math.sign(this.bankHold) * 33 : this.bankHold;
      if (!autopilot.ap) this.bankHold = hold;
      pCmd = ((hold - att.bank) * Math.PI) / 180 * 0.6;
    }
    if (Math.abs(att.bank) > 65 && Math.sign(pCmd) === Math.sign(att.bank)) pCmd = 0;
    const pErr = pCmd - s.w.x;
    const rollDemand = pErr * 6;
    // ---- yaw damper + pedals
    const yawDemand = inp.yaw + s.beta * 3 + s.w.y * 2.5;
    // Map demands to normalised surface commands (−1..1) through the systems model
    systems.setFlightControls(Math.max(-1, Math.min(1, -elevDemand)), Math.max(-1, Math.min(1, rollDemand)), Math.max(-1, Math.min(1, yawDemand)));
  }

  private autothrust(dt: number) {
    if (!autopilot.athr) return;
    const s = this.state;
    const err = autopilot.spd - s.ias * KT;
    this.athrI = Math.max(-0.5, Math.min(0.5, this.athrI + err * dt * 0.01));
    const lever = Math.max(0, Math.min(0.9, 0.5 + err * 0.04 + this.athrI));
    systems.setThrust(lever);
  }

  step(dt: number): void {
    const s = this.state;
    if (s.crashed) return;
    const sys = systems.state;
    s.t += dt;

    const wind = this.windWorld(dt);
    const air = isa(s.pos.y);
    const qInv = tmpQ.copy(s.q).invert();
    // air-relative velocity in body frame
    const vAirW = s.vel.clone().sub(wind);
    const vb = vAirW.clone().applyQuaternion(qInv);
    const V = Math.max(0.1, vb.length());
    s.alpha = Math.atan2(-vb.y, Math.max(vb.x, 0.1));
    s.beta = Math.asin(Math.max(-1, Math.min(1, vb.z / V)));
    s.tas = V;
    s.ias = V * Math.sqrt(air.rho / RHO0);
    s.mach = V / air.a;

    this.controlLaw(dt, V);
    this.autothrust(dt);

    const qd = 0.5 * air.rho * V * V;
    const conf = HL[sys.highLift.conf]!;
    // effective high-lift: interpolate by actual surface positions
    const target = CONF[sys.highLift.conf]!;
    const hlFrac = target.flap + target.slat > 0 ? (sys.highLift.flap + sys.highLift.slat) / (target.flap + target.slat) : 1;
    const dCL = conf.dCL * Math.min(1, hlFrac);
    const clMax = HL[0]!.clMax + (conf.clMax - HL[0]!.clMax) * Math.min(1, hlFrac);
    const spoiler = (sys.spoilers.deployed / 50) * (sys.spoilers.deployed > 0 ? 1 : 0);

    // Lift curve with smooth stall break
    const CLa = 5.6;
    const a = s.alpha;
    const clLinear = 0.2 + dCL + CLa * a;
    const aStall = (clMax - 0.2 - dCL) / CLa;
    let CL = clLinear;
    if (a > aStall) CL = clMax - 1.8 * (a - aStall) - 6 * (a - aStall) ** 2;
    if (a < -0.25) CL = 0.2 + dCL + CLa * -0.25 + 2 * (a + 0.25);
    CL -= 0.35 * spoiler;
    // Ground effect (wing within one span of the ground)
    const hWing = Math.max(0.5, s.pos.y - AC.cgHeight + 3.6);
    const ge = hWing < AC.b ? 1 + 0.08 * Math.pow(1 - hWing / AC.b, 2) : 1;
    CL *= ge;
    const k = 1 / (Math.PI * 0.82 * 7.53);
    const mCrit = 0.86;
    const wave = s.mach > mCrit ? 20 * (s.mach - mCrit) ** 4 + 0.6 * (s.mach - mCrit) ** 2 : 0;
    const gearDown = 1 - sys.gear.position;
    let CD = 0.0195 + (k * (CL / ge) ** 2) / ge + conf.dCD * Math.min(1, hlFrac) + 0.018 * gearDown + 0.04 * spoiler + wave + 0.006 * sys.gear.doors;
    if (a > aStall) CD += 0.9 * (a - aStall);

    const lift = qd * AC.S * CL;
    const drag = qd * AC.S * CD;
    const side = -qd * AC.S * 0.9 * s.beta;
    // aero force in body frame: drag opposite velocity, lift perpendicular in x-y plane
    const vhat = vb.clone().divideScalar(V);
    const liftDir = new Vector3(Math.sin(a), Math.cos(a), 0);
    const Fb = vhat.multiplyScalar(-drag).addScaledVector(liftDir, lift).add(new Vector3(0, 0, side));

    // Thrust
    // density lapse and ram-drag lapse with Mach (high-bypass turbofan, approximate)
    const lapse = Math.pow(air.rho / RHO0, 0.72) * (1 - 0.95 * s.mach + 0.62 * s.mach * s.mach);
    let thrust = 0;
    let fuelFlow = 0;
    sys.engines.forEach((e, i) => {
      if (e.state !== 'running') return;
      const frac = 0.035 + 0.965 * Math.pow(Math.max(0, (e.n1 - IDLE_N1) / (100 - IDLE_N1)), 1.35);
      let t = AC.thrustSL * lapse * frac;
      if ((i === 1 || i === 2) && e.reverser > 0.05) t *= 1 - e.reverser * 1.4;
      thrust += t;
      fuelFlow += e.ff / 3600;
    });
    Fb.x += thrust;
    s.fuel = Math.max(0, s.fuel - fuelFlow * dt);
    s.mass = Math.max(300_000, s.mass - fuelFlow * dt);

    // Aerodynamic moments (body): roll (x), yaw (y), pitch (z)
    const c = sys.controls;
    const d2r = Math.PI / 180;
    const elev = c.elevator * d2r; // +TE down
    const ail = ((c.aileronL - c.aileronR) / 2) * d2r; // + = right wing aileron up → roll right
    const rud = c.rudder * d2r; // +TE right → nose right
    const pHat = (s.w.x * AC.b) / (2 * V);
    const rHat = (s.w.y * AC.b) / (2 * V);
    const qHat = (s.w.z * AC.c) / (2 * V);
    const spoilRoll = ((sys.spoilers.rollLeft - sys.spoilers.rollRight) / 40) * -0.06;
    const Cm = 0.02 + conf.dCm * Math.min(1, hlFrac) - 1.15 * (a - 0.03) - 1.35 * elev - 24 * qHat + (a > aStall ? -0.8 * (a - aStall) : 0);
    const Cl = -0.12 * s.beta + 0.09 * ail + spoilRoll - 0.5 * pHat - 0.1 * rHat;
    const Cn = -0.13 * s.beta - 0.1 * rud - 0.22 * rHat - 0.02 * pHat; // positive Cn = nose left (+Y)
    const Mb = new Vector3(qd * AC.S * AC.b * Cl, qd * AC.S * AC.b * Cn, qd * AC.S * AC.c * Cm);
    // roll sign: positive ω.x = right wing down; our Cl>0 with ail>0 should roll right
    // Damping at low speed so the aircraft does not wobble on the ground
    if (V < 30) Mb.addScaledVector(s.w, -2e7);

    // Forces to world
    const Fw = Fb.applyQuaternion(s.q);
    Fw.y -= s.mass * G;

    // Ground contact
    let onGround = false;
    const gearDownLocked = sys.gear.position < 0.05;
    const R = new Vector3();
    s.gearLoad = [0, 0, 0, 0, 0];
    const brake = Math.max(this.inputs.brake, sys.brakes.left, sys.brakes.parking ? 1 : 0, this.autobrake(gearDownLocked));
    if (gearDownLocked) {
      GEAR_POINTS.forEach((gp, i) => {
        R.copy(gp.r).applyQuaternion(s.q);
        const py = s.pos.y + R.y;
        const pen = -py;
        if (pen <= 0) return;
        onGround = true;
        // contact point velocity
        const wW = s.w.clone().applyQuaternion(s.q);
        const vp = s.vel.clone().add(wW.clone().cross(R));
        let N = gp.k * Math.min(pen, 0.9) - gp.c * vp.y;
        N = Math.max(0, N) + (pen > 0.9 ? (pen - 0.9) * 5e7 : 0);
        s.gearLoad[i] = N;
        // wheel heading: body +X rotated by nose steering on the nose gear
        const steer = gp.nose ? (sys.gear.steering * Math.PI) / 180 : 0;
        const fwdB = new Vector3(Math.cos(steer), 0, Math.sin(steer)).applyQuaternion(s.q);
        fwdB.y = 0;
        fwdB.normalize();
        const latB = new Vector3(-fwdB.z, 0, fwdB.x);
        const vLong = vp.dot(fwdB);
        const vLat = vp.dot(latB);
        const mu = gp.nose ? 0.015 : 0.015 + 0.45 * brake;
        const fLong = -Math.max(-1, Math.min(1, vLong / 0.4)) * mu * N;
        const fLat = -Math.max(-1, Math.min(1, vLat / 0.25)) * 0.75 * N;
        const F = new Vector3(0, N, 0).addScaledVector(fwdB, fLong).addScaledVector(latB, fLat);
        Fw.add(F);
        // torque = R × F (world) → body
        const tW = R.clone().cross(F);
        Mb.add(tW.applyQuaternion(qInv));
      });
    }
    // Touchdown severity and structural ground strikes
    if (onGround && !s.onGround) {
      const vs = s.vel.y;
      if (vs < -5) return this.crash('Hard impact on landing (descent rate above 1,000 ft/min)');
      if (vs < -3) this.event('HARD LANDING');
    }
    for (const p of TAIL_POINTS) {
      R.copy(p).applyQuaternion(s.q);
      if (s.pos.y + R.y < 0) {
        if (s.pos.y + R.y < -0.6) return this.crash('Severe tail strike');
        this.event('TAIL STRIKE');
      }
    }
    for (const p of STRIKE_POINTS) {
      R.copy(p).applyQuaternion(s.q);
      if (s.pos.y + R.y < -0.02) return this.crash(!gearDownLocked ? 'Gear-up landing — fuselage contact' : 'Engine or wing-tip ground strike');
    }
    s.onGround = onGround;

    // Integrate translation
    const acc = Fw.divideScalar(s.mass);
    s.nz = (acc.y + G) / G;
    s.vel.addScaledVector(acc, dt);
    s.pos.addScaledVector(s.vel, dt);
    if (s.pos.y < 0.5) s.pos.y = 0.5;
    // Integrate rotation (Euler's equations, diagonal inertia)
    const I = new Vector3(AC.Ixx, AC.Iyy, AC.Izz);
    const w = s.w;
    const gyro = new Vector3((I.y - I.z) * w.y * w.z, (I.z - I.x) * w.z * w.x, (I.x - I.y) * w.x * w.y);
    w.x += ((Mb.x + gyro.x) / I.x) * dt;
    w.y += ((Mb.y + gyro.y) / I.y) * dt;
    w.z += ((Mb.z + gyro.z) / I.z) * dt;
    const dq = new Quaternion(w.x * dt * 0.5, w.y * dt * 0.5, w.z * dt * 0.5, 1);
    s.q.multiply(dq).normalize();

    this.publish();
  }

  /** Transient events (tail strike, hard landing) for the HUD and annunciations. */
  events: { t: number; text: string }[] = [];
  private event(text: string) {
    const last = this.events[this.events.length - 1];
    if (last && last.text === text && this.state.t - last.t < 3) return;
    this.events.push({ t: this.state.t, text });
    if (this.events.length > 20) this.events.shift();
  }
  private crash(reason: string) {
    this.state.crashed = reason;
    this.state.vel.set(0, 0, 0);
    this.state.w.set(0, 0, 0);
    this.publish();
  }

  private abActive = false;
  private autobrake(gearDown: boolean): number {
    const sys = systems.state;
    const mode = sys.brakes.autobrake;
    if (mode === 'DISARM' || !gearDown || !this.state.onGround) {
      this.abActive = false;
      return 0;
    }
    const allIdle = sys.engines.every((e) => e.lever < 0.05);
    if (mode === 'RTO') {
      if (allIdle && this.state.ias * KT > 72) this.abActive = true;
    } else if (allIdle && sys.spoilers.deployed > 20) this.abActive = true;
    if (!this.abActive) return 0;
    const target = { LO: 1.7, '2': 2.0, '3': 3.0, HI: 3.5, RTO: 6, BTV: 2.5 }[mode] ?? 2;
    return Math.min(1, target / 6);
  }

  /** Copy derived values into the shared systems state for displays and annunciations. */
  publish(): void {
    const s = this.state;
    const att = this.attitude();
    const sys = systems.state;
    const groundZ = 0;
    sys.air.ias = s.ias * KT;
    sys.air.gs = Math.hypot(s.vel.x, s.vel.z);
    sys.air.altitude = s.pos.y * FT;
    sys.air.radioAlt = Math.max(0, (s.pos.y - AC.cgHeight - groundZ) * FT);
    sys.air.vs = s.vel.y * FT * 60;
    sys.air.mach = s.mach;
    sys.air.pitch = att.pitch;
    sys.air.bank = att.bank;
    sys.air.heading = att.heading;
    sys.air.aoa = (s.alpha * 180) / Math.PI;
    const airborne = !s.onGround && sys.air.radioAlt > 3;
    sys.air.airborne = airborne;
    if (!sys.maintenance) sys.gear.wow = s.onGround || sys.air.radioAlt < 1;
  }
}

export const flight = new FlightModel();

/** Approximate trimmed pitch attitude (deg) for steady flight at a given TRUE airspeed — used to start airborne scenarios. */
export function trimPitch(speedKt: number, altM: number, conf: number, mass: number, gammaDeg: number): number {
  const air = isa(altM);
  const V = speedKt / KT;
  const qd = 0.5 * air.rho * V * V;
  const CL = (mass * G * Math.cos((gammaDeg * Math.PI) / 180)) / (qd * AC.S);
  const alpha = (CL - 0.2 - HL[conf]!.dCL) / 5.6;
  return (alpha * 180) / Math.PI + gammaDeg;
}

/** Approximate thrust-lever position (0..1) for steady flight at the given condition. */
export function trimLever(speedKt: number, altM: number, conf: number, mass: number, gammaDeg: number, gearDown: boolean): number {
  const air = isa(altM);
  const V = speedKt / KT;
  const M = V / air.a;
  const qd = 0.5 * air.rho * V * V;
  const CL = (mass * G) / (qd * AC.S);
  const k = 1 / (Math.PI * 0.82 * 7.53);
  const wave = M > 0.86 ? 20 * (M - 0.86) ** 4 + 0.6 * (M - 0.86) ** 2 : 0;
  const CD = 0.0195 + k * CL * CL + HL[conf]!.dCD + (gearDown ? 0.018 : 0) + wave;
  const T = qd * AC.S * CD + mass * G * Math.sin((gammaDeg * Math.PI) / 180);
  const lapse = Math.pow(air.rho / RHO0, 0.72) * (1 - 0.95 * M + 0.62 * M * M);
  const frac = Math.max(0, Math.min(1, T / (4 * AC.thrustSL * lapse)));
  const n1frac = Math.pow(Math.max(0, (frac - 0.035) / 0.965), 1 / 1.35);
  return Math.max(0, Math.min(1, n1frac));
}
