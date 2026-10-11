/**
 * Landing gear: 22 wheels — twin-wheel nose gear, two 4-wheel wing gears and two 6-wheel
 * body gears (rear axle steerable). Retraction directions: wing gears fold inboard, body
 * gears retract aft (bogie counter-rotates to stay level), nose gear retracts forward
 * (direction marked as an approximation in docs/ACCURACY.md).
 */
import { BoxGeometry, Quaternion, Vector3, type BufferGeometry, type Group } from 'three';
import { GEAR, sx } from './layout';
import type { Vec3 } from './math';
import { group, mesh, pivoted } from './parts';
import { gridSurface, lathe, merge, orientOutward } from './surface';
import { bellyFairingPoint, fuselageNormal, fuselagePoint } from './fuselage';

const MAIN_TYRE_R = 0.7; // [V] 1400x530R23 main tyres
const MAIN_TYRE_W = 0.53;
const NOSE_TYRE_R = 0.635; // [V] 1270x455R22 nose tyres
const NOSE_TYRE_W = 0.455;

/** Cylinder (closed) from a to b. */
export function cylinder(a: Vec3, b: Vec3, r: number, seg = 20, r2 = r): BufferGeometry {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const g = orientOutward(
    lathe(
      [
        [0, 0.0001],
        [0, r],
        [len, r2],
        [len, 0.0001],
      ],
      seg,
    ),
  );
  const q = new Quaternion().setFromUnitVectors(new Vector3(1, 0, 0), new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize());
  g.applyQuaternion(q);
  g.translate(a[0], a[1], a[2]);
  return g;
}

export function box(c: Vec3, size: Vec3, rotY = 0, rotZ = 0, rotX = 0): BufferGeometry {
  const g = new BoxGeometry(size[0], size[1], size[2]);
  g.rotateX(rotX);
  g.rotateZ(rotZ);
  g.rotateY(rotY);
  g.translate(c[0], c[1], c[2]);
  return g;
}

/** Tyre with four circumferential grooves; local axle along Z. */
function tyre(R: number, W: number, seg: number): BufferGeometry {
  const rim = R * 0.56;
  const h = W / 2;
  const prof: [number, number][] = [
    [-h + 0.02, rim],
    [-h, rim + 0.06],
    [-h - 0.005, R - 0.16],
    [-h + 0.02, R - 0.05],
    [-h + 0.08, R - 0.008],
  ];
  const grooves = [-0.6, -0.2, 0.2, 0.6].map((g) => g * h * 0.78);
  for (const gx of grooves) {
    prof.push([gx - 0.018, R], [gx - 0.012, R - 0.014], [gx + 0.012, R - 0.014], [gx + 0.018, R]);
  }
  prof.push([h - 0.08, R - 0.008], [h - 0.02, R - 0.05], [h + 0.005, R - 0.16], [h, rim + 0.06], [h - 0.02, rim]);
  const g = orientOutward(lathe(prof, seg));
  g.rotateY(-Math.PI / 2);
  return g;
}

function hub(R: number, W: number, seg: number, outboard: 1 | -1): BufferGeometry {
  const rim = R * 0.56;
  const h = W / 2;
  const prof: [number, number][] = [
    [-h + 0.03, 0.001],
    [-h + 0.03, rim * 0.35],
    [-h + 0.0, rim * 0.62],
    [-h + 0.01, rim * 0.98],
    [h - 0.01, rim * 0.98],
    [h, rim * 0.62],
    [h - 0.03, rim * 0.35],
    [h - 0.03, 0.001],
  ];
  const g = orientOutward(lathe(prof, seg));
  g.rotateY(-Math.PI / 2);
  // Bolt circle bosses on the outboard face
  const bolts: BufferGeometry[] = [g];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const p: Vec3 = [Math.cos(a) * rim * 0.48, Math.sin(a) * rim * 0.48, outboard * (h - 0.03)];
    bolts.push(cylinder(p, [p[0], p[1], p[2] + outboard * 0.025], 0.022, 8));
  }
  bolts.push(cylinder([0, 0, outboard * (h - 0.04)], [0, 0, outboard * (h + 0.02)], rim * 0.2, 20));
  return merge(bolts);
}

function wheel(name: string, centre: Vec3, R: number, W: number, outboard: 1 | -1, quality: number): Group {
  const seg = Math.round(40 * quality);
  const t = tyre(R, W, seg);
  const hb = hub(R, W, Math.round(28 * quality), outboard);
  t.translate(...centre);
  hb.translate(...centre);
  return pivoted(name, centre, [mesh(`${name}_tyre`, t, 'tyre', 'wheel'), mesh(`${name}_hub`, hb, 'hub', 'wheel')], { kind: 'spin', axis: [0, 0, 1] }, 'wheel');
}

function strutParts(top: Vec3, bottom: Vec3, rOuter: number): { outer: BufferGeometry; slider: BufferGeometry; links: BufferGeometry } {
  const mid: Vec3 = [top[0], bottom[1] + (top[1] - bottom[1]) * 0.42, top[2]];
  const outer = merge([cylinder(top, mid, rOuter, 22), cylinder(mid, [mid[0], mid[1] - 0.1, mid[2]], rOuter * 1.18, 22)]);
  const slider = cylinder([mid[0], mid[1] + 0.1, mid[2]], bottom, rOuter * 0.68, 22);
  const lk = 0.55;
  const links = merge([
    box([mid[0] + 0.18, mid[1] + 0.27, mid[2]], [0.07, lk, 0.1], 0, 0.45),
    box([mid[0] + 0.18, mid[1] - 0.27, mid[2]], [0.07, lk, 0.1], 0, -0.45),
  ]);
  return { outer, slider, links };
}

// ---------------------------------------------------------------- nose gear
function noseGear(quality: number): Group {
  const { s } = GEAR.nose;
  const axle: Vec3 = [sx(s), NOSE_TYRE_R, 0];
  const pivot: Vec3 = [sx(s - 0.25), 3.05, 0];
  const st = strutParts([axle[0] + 0.12, pivot[1], 0], [axle[0], axle[1] + 0.12, 0], 0.15);
  const steer = pivoted(
    'nose_steer',
    [axle[0], 0, 0],
    [
      mesh('nose_slider', st.slider, 'chrome', 'noseGear'),
      mesh('nose_axle', cylinder([axle[0], axle[1], -0.42], [axle[0], axle[1], 0.42], 0.075, 14), 'darkMetal', 'noseGear'),
      wheel('nose_wheel_L', [axle[0], axle[1], -0.475], NOSE_TYRE_R, NOSE_TYRE_W, -1, quality),
      wheel('nose_wheel_R', [axle[0], axle[1], 0.475], NOSE_TYRE_R, NOSE_TYRE_W, 1, quality),
      mesh('nose_taxi_light_mount', box([axle[0] + 0.2, axle[1] + 0.95, 0], [0.12, 0.18, 0.5]), 'darkMetal', 'noseGear'),
    ],
    { kind: 'hinge', axis: [0, 1, 0], min: -70, max: 70 },
    'noseGear',
  );
  const leg = pivoted(
    'gear_nose',
    pivot,
    [
      mesh('nose_strut', st.outer, 'darkMetal', 'noseGear'),
      mesh('nose_links', st.links, 'darkMetal', 'noseGear'),
      mesh('nose_drag_brace', cylinder([pivot[0] - 0.1, 2.1, 0], [pivot[0] + 1.6, 3.0, 0], 0.07, 12), 'darkMetal', 'noseGear'),
      mesh('nose_leg_door', box([axle[0] - 0.02, 2.2, 0], [0.03, 1.2, 0.7]), 'paintBelly', 'gearDoor'),
      steer,
    ],
    { kind: 'hinge', axis: [0, 0, 1], min: 0, max: 98 },
    'noseGear',
  );
  leg.userData.gear = 'nose';
  return leg;
}

/** Door panel sampled from a surface function f(u, v) → point; hinge along v = 0 edge. */
function bayDoor(name: string, f: (u: number, v: number) => Vec3, side: 1 | -1, partId = 'gearDoor'): Group {
  const geo = gridSurface(10, 4, (i, j) => f(i / 10, j / 4));
  // Ensure normals face down/out (away from the aircraft interior)
  const n = geo.getAttribute('normal');
  if (n.getY(Math.floor(n.count / 2)) > 0) {
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    const idx = geo.getIndex()!.array as Uint32Array | Uint16Array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1]!;
      idx[i + 1] = idx[i + 2]!;
      idx[i + 2] = t;
    }
  }
  const a = f(0, 0);
  const b = f(1, 0);
  const pivot: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return pivoted(name, pivot, [mesh(`${name}_skin`, thicken(geo, 0.03), 'paintBelly', partId)], { kind: 'hinge', axis: [-side, 0, 0], min: 0, max: 88 }, partId);
}

const fusPatch = (s0: number, s1: number, th0: number, th1: number, off: number) => (u: number, v: number): Vec3 => {
  const s = s0 + (s1 - s0) * u;
  const th = th0 + (th1 - th0) * v;
  const p = fuselagePoint(s, th);
  const n = fuselageNormal(s, th);
  return [p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off];
};

const bellyPatch = (s0: number, s1: number, t0: number, t1: number, side: 1 | -1) => (u: number, v: number): Vec3 => {
  const p = bellyFairingPoint(s0 + (s1 - s0) * u, t0 + (t1 - t0) * v, side);
  return [p[0], p[1] - 0.012, p[2]];
};

/** Give a single-sided patch some thickness so open doors read as solid panels. */
function thicken(g: BufferGeometry, t: number): BufferGeometry {
  const a = g.clone();
  const b = g.clone();
  const n = b.getAttribute('normal');
  const p = b.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) - n.getX(i) * t, p.getY(i) - n.getY(i) * t, p.getZ(i) - n.getZ(i) * t);
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  const idx = b.getIndex()!.array as Uint32Array | Uint16Array;
  for (let i = 0; i < idx.length; i += 3) {
    const tmp = idx[i + 1]!;
    idx[i + 1] = idx[i + 2]!;
    idx[i + 2] = tmp;
  }
  return merge([a, b]);
}

// ---------------------------------------------------------------- main gears
function mainGear(kind: 'wing' | 'body', side: 1 | -1, quality: number): Group {
  const cfg = kind === 'wing' ? GEAR.wing : GEAR.body;
  const S = side === 1 ? 'R' : 'L';
  const id = `gear_${kind}_${S}`;
  const z = side * cfg.z;
  const axles = kind === 'wing' ? [-cfg.axleSpan / 2, cfg.axleSpan / 2] : [-cfg.axleSpan, 0, cfg.axleSpan];
  const bogieY = MAIN_TYRE_R + 0.06;
  const bogieC: Vec3 = [sx(cfg.s), bogieY, z];
  const pivotY = kind === 'wing' ? 4.95 : 4.25;
  const pivot: Vec3 = kind === 'wing' ? [bogieC[0], pivotY, z] : [bogieC[0] + 0.0, pivotY, z];
  const st = strutParts([pivot[0], pivotY, z], [bogieC[0], bogieY + 0.05, z], 0.2);

  const bogieParts: (Group | ReturnType<typeof mesh>)[] = [];
  const len = Math.abs(axles[axles.length - 1]! - axles[0]!) + 0.5;
  bogieParts.push(mesh(`${id}_beam`, cylinder([bogieC[0] + len / 2, bogieY, z], [bogieC[0] - len / 2, bogieY, z], 0.13, 16), 'darkMetal', `${kind}Gear`));
  const tw = cfg.wheelTrack / 2;
  axles.forEach((ds, k) => {
    const ax = bogieC[0] - ds;
    const wheelsOnAxle = [
      wheel(`${id}_w${k + 1}a`, [ax, MAIN_TYRE_R, z - tw], MAIN_TYRE_R, MAIN_TYRE_W, -1, quality),
      wheel(`${id}_w${k + 1}b`, [ax, MAIN_TYRE_R, z + tw], MAIN_TYRE_R, MAIN_TYRE_W, 1, quality),
    ];
    const axleMesh = mesh(`${id}_axle${k + 1}`, cylinder([ax, MAIN_TYRE_R, z - tw + 0.1], [ax, MAIN_TYRE_R, z + tw - 0.1], 0.1, 14), 'darkMetal', `${kind}Gear`);
    // Brake housings
    const brakes = mesh(
      `${id}_brakes${k + 1}`,
      merge([
        cylinder([ax, MAIN_TYRE_R, z - tw + 0.22], [ax, MAIN_TYRE_R, z - tw + 0.02], 0.3, 18),
        cylinder([ax, MAIN_TYRE_R, z + tw - 0.22], [ax, MAIN_TYRE_R, z + tw - 0.02], 0.3, 18),
      ]),
      'metal',
      'brakes',
    );
    const isSteer = kind === 'body' && k === 0; // rear axle (largest s → first after ordering)
    if (isSteer) {
      bogieParts.push(pivoted(`${id}_steer_axle`, [ax, MAIN_TYRE_R, z], [axleMesh, brakes, ...wheelsOnAxle], { kind: 'hinge', axis: [0, 1, 0], min: -15, max: 15 }, `${kind}Gear`));
    } else bogieParts.push(axleMesh, brakes, ...wheelsOnAxle);
  });
  const bogie = pivoted(`${id}_bogie`, bogieC, bogieParts, { kind: 'hinge', axis: [0, 0, 1], min: -95, max: 95 }, `${kind}Gear`);

  const braceTop: Vec3 = kind === 'wing' ? [pivot[0] + 0.2, pivotY - 0.2, z - side * 1.7] : [pivot[0] + 1.6, pivotY - 0.3, z];
  const braceBot: Vec3 = [pivot[0], 2.3, z];
  const leg = pivoted(
    id,
    pivot,
    [
      mesh(`${id}_strut`, st.outer, 'darkMetal', `${kind}Gear`),
      mesh(`${id}_slider`, st.slider, 'chrome', `${kind}Gear`),
      mesh(`${id}_links`, st.links, 'darkMetal', `${kind}Gear`),
      mesh(`${id}_brace`, merge([cylinder(braceBot, braceTop, 0.085, 12), cylinder([braceBot[0], braceBot[1] + 0.05, braceBot[2]], [braceTop[0], braceTop[1] - 0.05, braceTop[2]], 0.06, 12)]), 'darkMetal', `${kind}Gear`),
      mesh(`${id}_leg_door`, box([pivot[0], 3.0, z + side * 0.3], [1.2, 1.7, 0.03]), 'paintBelly', 'gearDoor'),
      bogie,
    ],
    kind === 'wing' ? { kind: 'hinge', axis: [side, 0, 0], min: 0, max: 92 } : { kind: 'hinge', axis: [0, 0, -1], min: 0, max: 92 },
    `${kind}Gear`,
  );
  leg.userData.gear = kind;
  return leg;
}

export function buildGear(quality: number): Group {
  const g = group('gear', [], 'landingGear');
  g.add(noseGear(quality));
  for (const side of [1, -1] as const) {
    g.add(mainGear('wing', side, quality));
    g.add(mainGear('body', side, quality));
  }
  const doors = group('gear_doors');
  const d = (deg: number) => (deg * Math.PI) / 180;
  // Nose bay doors (hinged at their outer edges)
  doors.add(bayDoor('gdoor_nose_R', fusPatch(4.2, 7.9, d(-62), d(-89.5), 0.01), 1));
  doors.add(bayDoor('gdoor_nose_L', fusPatch(4.2, 7.9, Math.PI - d(-62), Math.PI - d(-89.5), 0.01), -1));
  // Main gear bay doors in the belly fairing (approximate panel layout)
  for (const side of [1, -1] as const) {
    const S = side === 1 ? 'R' : 'L';
    doors.add(bayDoor(`gdoor_wing_${S}`, bellyPatch(34.5, 38.4, 0.42, 0.74, side), side));
    doors.add(bayDoor(`gdoor_body_${S}`, bellyPatch(38.7, 44.6, 0.76, 0.985, side), side));
  }
  g.add(doors);
  return g;
}
