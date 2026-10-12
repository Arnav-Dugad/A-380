/**
 * Maps the shared systems state onto the aircraft rig every frame. Purely imperative —
 * no React state is touched, so mechanical animation never causes re-renders.
 */
import { useFrame } from '@react-three/fiber';
import { getRig, type AircraftRig } from '../aircraft/rig';
import { advance } from '../sim/loop';
import { systems } from '../sim/systems';
import { publishSnapshot } from '../state/sim';
import { deform } from '../effects/deform';
import { flight } from '../sim/flight';
import { useUI } from '../state/ui';
import { worldFrame } from '../scene/worldFrame';
import { Quaternion } from 'three';

const tmpQ = new Quaternion();
let flexState = -0.28;
let gustPhase = 0;

/**
 * Wing bending: tanks full on the ground droop the tips about 0.3 m; in flight lift bends them
 * up, roughly in proportion to load factor, with a light ripple in turbulence.
 */
function updateDeform(dt: number): void {
  const a = worldFrame.aircraft;
  if (a) {
    a.updateWorldMatrix(true, false);
    deform.uAircraftInv.value.copy(a.matrixWorld).invert();
    deform.uAircraftUp.value.set(0, 1, 0).applyQuaternion(a.getWorldQuaternion(tmpQ));
  }
  const s = systems.state;
  const inFlight = useUI.getState().section === 'flight';
  const airborne = inFlight ? !flight.state.onGround : s.air.airborne;
  const nz = inFlight ? flight.state.nz : 1;
  // lift builds with airspeed even before rotation
  const q = Math.min(1, Math.max(0, (s.air.ias - 60) / 90));
  const target = airborne ? 0.2 + 2.35 * Math.max(0, nz) : -0.28 + q * 1.4;
  flexState += (target - flexState) * (1 - Math.exp(-dt / 0.9));
  gustPhase += dt;
  const turb = inFlight && airborne ? flight.weather.turbulence : 0;
  deform.uFlex.value = flexState + turb * 0.35 * (Math.sin(gustPhase * 2.3) * 0.6 + Math.sin(gustPhase * 5.1 + 1.3) * 0.4);
  // tyres squash onto the pavement only while the gear carries weight
  deform.uGround.value = s.gear.wow ? 0.045 : -10;
}

const SIDES = ['R', 'L'] as const;
/** Visual fan speed is reduced to avoid stroboscopic aliasing at display refresh rates. */
const FAN_VISUAL_SCALE = 0.12;
const FAN_RPM_100 = 2900; // approximate Trent 900 N1 at 100 %

let wheelAngle = 0;
let wiperPhase = 0;
/** current wiper sweep 0…1, read by the rain-on-glass overlay */
export const wiperState = { angle: 0 };
const fanAngle = [0, 0, 0, 0];

export function applyState(rig: AircraftRig, dt: number): void {
  const s = systems.state;
  const g = s.gear;
  const ease = (t: number) => t * t * (3 - 2 * t);

  // ---- landing gear: legs, bogies, doors, steering
  const legT = ease(g.position);
  rig.hinge('gear_nose', legT * 98);
  for (const S of SIDES) {
    rig.hinge(`gear_wing_${S}`, legT * 92);
    rig.hinge(`gear_body_${S}`, legT * 92);
    // Body-gear bogie counter-rotates to stow flat; in flight with gear down it trails nose-up.
    const trail = !g.wow && g.position < 0.05 ? -7 : 0; // pitch trimmer sets the bogie nose-down for landing
    rig.hinge(`gear_body_${S}_bogie`, legT * 92 + trail);
    rig.hinge(`gear_wing_${S}_bogie`, trail);
    rig.hinge(`gear_body_${S}_steer_axle`, Math.max(-15, Math.min(15, -g.steering * 0.3)));
    rig.hinge(`gdoor_wing_${S}`, ease(g.doors) * 88);
    rig.hinge(`gdoor_body_${S}`, ease(g.doors) * 88);
    rig.hinge(`gdoor_nose_${S}`, ease(g.doors) * 85);
  }
  rig.hinge('nose_steer', -g.steering); // +steering = turn right; the hinge axis is +Y (nose-left positive)

  // Wheels roll with ground speed (only when on the ground)
  if (g.wow) wheelAngle -= (s.air.gs / 0.7) * dt;
  for (const name of wheelNames(rig)) rig.spin(name, wheelAngle);

  // ---- high-lift devices
  const hl = s.highLift;
  for (const S of SIDES) {
    for (let k = 1; k <= 6; k++) rig.hinge(`slat_${S}${k}`, hl.slat, hl.slat / 23);
    for (let k = 1; k <= 2; k++) rig.hinge(`droop_${S}${k}`, hl.slat * 0.85);
    for (let k = 1; k <= 3; k++) rig.hinge(`flap_${S}${k}`, hl.flap, hl.flap / 33);
  }

  // ---- primary flight controls
  const c = s.controls;
  for (let k = 1; k <= 3; k++) {
    rig.hinge(`aileron_R${k}`, c.aileronR);
    rig.hinge(`aileron_L${k}`, c.aileronL);
  }
  const sp = s.spoilers;
  for (let k = 1; k <= 8; k++) {
    const roll = k >= 3 ? 1 : 0; // outboard spoilers assist roll
    rig.hinge(`spoiler_R${k}`, sp.deployed + roll * sp.rollRight);
    rig.hinge(`spoiler_L${k}`, sp.deployed + roll * sp.rollLeft);
  }
  for (const S of SIDES) for (let k = 1; k <= 2; k++) rig.hinge(`elevator_${S}${k}`, c.elevator);
  rig.hinge('rudder_lower', c.rudder);
  rig.hinge('rudder_upper', c.rudder);

  // ---- engines
  s.engines.forEach((e, i) => {
    const rps = (e.n1 / 100) * (FAN_RPM_100 / 60) * FAN_VISUAL_SCALE;
    fanAngle[i] = (fanAngle[i]! + rps * Math.PI * 2 * dt) % (Math.PI * 2);
    rig.spin(`eng${i + 1}_fan`, fanAngle[i]!);
    rig.slide(`eng${i + 1}_reverser`, ease(e.reverser));
  });

  // ---- windshield wipers: run in rain (fast in heavy rain), park otherwise
  const weather = useUI.getState().weather;
  const wipe = weather === 'heavyRain' ? 1.6 : weather === 'lightRain' ? 0.75 : 0;
  wiperPhase = wipe ? wiperPhase + dt * wipe * Math.PI : 0;
  const sweep = wipe ? (1 - Math.cos(wiperPhase)) / 2 : 0;
  rig.hinge('wiper_R', sweep * 62);
  rig.hinge('wiper_L', sweep * 62);
  wiperState.angle = sweep;

  // ---- doors
  for (const d of Object.values(s.doors)) {
    const name = `door_${d.id}_panel`;
    if (d.kind === 'cargo') rig.hinge(name, ease(d.position) * 90);
    else rig.door(name, ease(d.position));
  }
}

const wheelCache = new WeakMap<AircraftRig, string[]>();
function wheelNames(rig: AircraftRig): string[] {
  let list = wheelCache.get(rig);
  if (!list) {
    list = [...rig.articulated.values()].filter((a) => a.art.kind === 'spin' && !a.node.name.endsWith('_fan')).map((a) => a.node.name);
    wheelCache.set(rig, list);
  }
  return list;
}

export function AircraftAnimator() {
  useFrame((_, delta) => {
    advance(delta);
    const rig = getRig();
    if (rig) applyState(rig, Math.min(delta, 0.1));
    updateDeform(Math.min(delta, 0.1));
    publishSnapshot(performance.now());
  }, -1);
  return null;
}
