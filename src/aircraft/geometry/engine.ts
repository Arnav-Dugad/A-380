/**
 * Rolls-Royce Trent 900 nacelle and pylon (representative geometry).
 * Separate assemblies: inlet lip, fan cowl, thrust-reverser translating sleeve (engines 2 & 3
 * only — the A380 has reversers on the inboard engines), reverser cascades, rotating fan
 * (24 swept blades + spinner), core cowl, core nozzle, exhaust plug and pylon.
 */
import type { BufferGeometry, Group } from 'three';
import { ENGINES, NACELLE, sx } from './layout';
import { lerp, type Vec3 } from './math';
import { group, mesh, pivoted } from './parts';
import { flipGeometry, gridSurface, lathe, merge, orientOutward } from './surface';
import { box } from './gear';
import { thickness } from './lifting';
import { wingLE, wingChord, wingLowerPoint } from './wing';

type Prof = [number, number][];

const FAN_X = -1.38;
const SLEEVE_X = -4.4;

const LIP: Prof = [
  [-0.62, 1.79],
  [-0.35, 1.735],
  [-0.15, 1.69],
  [-0.04, 1.645],
  [0, 1.6],
  [-0.012, 1.56],
  [-0.06, 1.532],
  [-0.2, 1.507],
  [-0.45, 1.495],
];

export interface EngineFrame {
  id: string;
  side: 1 | -1;
  z: number;
  /** model-space position of the inlet lip centre */
  origin: Vec3;
  reverser: boolean;
}

export function engineFrames(): EngineFrame[] {
  return ENGINES.map((e) => {
    const z = e.z;
    const sInlet = wingLE(z) - NACELLE.inletForward;
    const sAft = sInlet + NACELLE.length;
    const xcAft = (sAft - wingLE(z)) / wingChord(z);
    const lower = wingLowerPoint(e.side, z, Math.max(0.02, xcAft));
    const axisY = lower[1] - NACELLE.topGap - 1.62; // 1.62 = cowl radius at the aft end
    return { id: e.id, side: e.side, z, origin: [sx(sInlet), axisY, e.side * z], reverser: e.reverser };
  });
}

/** Lathe a closed (x, r) loop; outward normals follow from the loop orientation. */
function latheLoop(profile: Prof, seg: number, atlas = false): BufferGeometry {
  return orientOutward(lathe(profile, seg, false, atlas ? nacelleUV : undefined));
}

/**
 * Nacelle atlas: u runs aft from the inlet lip (x = 0) to the nozzle (x = −6.7); v runs
 * around from the crown (0) through the outboard-facing +Z side (0.25) to the keel (0.5).
 */
export const nacelleUV = (x: number, _r: number, a: number): [number, number] => [Math.min(1, Math.max(0, -x / 6.7)), a];

/** Open surface of revolution facing away from the axis ('out') or towards it ('in'). */
function latheOpen(profile: Prof, seg: number, facing: 'out' | 'in', uv?: (x: number, r: number, a: number) => [number, number]): BufferGeometry {
  const g = lathe(profile, seg, false, uv);
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const i = Math.floor(p.count / 2);
  const radial = (n.getY(i) * p.getY(i) + n.getZ(i) * p.getZ(i)) / (Math.hypot(p.getY(i), p.getZ(i)) || 1);
  return (radial > 0) === (facing === 'out') ? g : flipGeometry(g);
}

function fanBlades(count: number, quality: number): BufferGeometry {
  const nr = Math.round(10 * quality);
  const nc = Math.round(12 * quality);
  const r0 = 0.5;
  const r1 = NACELLE.fanRadius - 0.012;
  const blades: BufferGeometry[] = [];
  for (let k = 0; k < count; k++) {
    const phi = (k / count) * Math.PI * 2;
    const loop: { x: number; up: boolean }[] = [];
    for (let i = nc; i >= 0; i--) loop.push({ x: i / nc, up: true });
    for (let i = 1; i < nc; i++) loop.push({ x: i / nc, up: false });
    const g = gridSurface(
      nr,
      loop.length,
      (i, j) => {
        const t = i / nr;
        const r = lerp(r0, r1, t);
        const q = loop[j % loop.length]!;
        const stagger = lerp(0.42, 1.08, Math.pow(t, 0.8)); // radians from axial
        const chord = lerp(0.42, 0.62, Math.sin((t * Math.PI) / 2));
        const sweep = 0.1 * t * t; // swept-forward tip of the wide-chord blade
        const tMax = lerp(0.07, 0.02, t);
        const cam = 0.04 * chord * Math.sin(Math.PI * q.x);
        const off = (q.up ? 1 : -1) * thickness(q.x) * tMax * chord + cam;
        // Chord runs aft and tangentially (stagger); `off` is normal to the chord.
        const along = (q.x - 0.5) * chord;
        const px = -Math.cos(stagger) * along + Math.sin(stagger) * off;
        const pt = Math.sin(stagger) * along + Math.cos(stagger) * off;
        const x = FAN_X + sweep + px;
        return [x, r * Math.cos(phi) - pt * Math.sin(phi), r * Math.sin(phi) + pt * Math.cos(phi)];
      },
      { wrapV: true },
    );
    blades.push(orientOutward(g));
  }
  return merge(blades);
}

export function buildEngine(frame: EngineFrame, quality: number): Group {
  const seg = Math.round(64 * quality);
  const id = frame.id;
  const root = group(id, [], 'engine');
  root.position.set(...frame.origin);
  root.userData.engineIndex = Number(id.slice(3));

  // Inlet lip (polished) and fan cowl (painted) form one closed loop split by material.
  const lip: Prof = [...LIP, [-0.62, 1.49]];
  root.add(mesh(`${id}_inlet`, latheLoop(lip, seg), 'inletLip', 'engineInlet'));
  // painted fan cowl outside; perforated acoustic liner lining the inlet duct inside
  const cowlOuter: Prof = [
    [SLEEVE_X, 1.875],
    [-3.2, 1.86],
    [-2.2, 1.858],
    [-1.3, 1.835],
    [-0.62, 1.79],
  ];
  const liner: Prof = [
    [-0.45, 1.495],
    [-0.62, 1.495],
    [-1.2, 1.482],
    [-2.6, 1.5],
    [SLEEVE_X, 1.525],
  ];
  root.add(mesh(`${id}_fancowl`, latheOpen(cowlOuter, seg, 'out', nacelleUV), 'nacelle', 'fanCowl'));
  root.add(mesh(`${id}_liner`, latheOpen(liner, seg, 'in'), 'liner', 'engineInlet'));
  // vortex-control strake on the inboard side of the cowl
  {
    const a = -frame.side * 0.85; // inboard upper quadrant
    const r = 1.86 + 0.11;
    root.add(mesh(`${id}_strake`, box([-1.6, r * Math.cos(a), r * Math.sin(a)], [0.95, 0.22, 0.014], 0, 0, a), 'paint', 'fanCowl'));
  }

  // Thrust-reverser translating sleeve / fixed aft cowl
  const sleeve: Prof = [
    [-6.6, 1.47],
    [-6.0, 1.6],
    [-5.2, 1.75],
    [SLEEVE_X - 0.01, 1.872],
    [SLEEVE_X - 0.01, 1.53],
    [-5.6, 1.525],
    [-6.55, 1.455],
  ];
  const sleeveMesh = mesh(`${id}_sleeve`, latheLoop(sleeve, seg, true), 'nacelle', frame.reverser ? 'thrustReverser' : 'fanCowl');
  if (frame.reverser) {
    root.add(pivoted(`${id}_reverser`, [0, 0, 0], [sleeveMesh], { kind: 'slide', travel: [-0.75, 0, 0] }, 'thrustReverser'));
    // cascades: rings of turning vanes between axial strongbacks, bared when the sleeve slides aft
    const parts: BufferGeometry[] = [];
    const inner: Prof = [
      [SLEEVE_X - 0.8, 1.545],
      [SLEEVE_X - 0.8, 1.56],
      [SLEEVE_X + 0.02, 1.56],
      [SLEEVE_X + 0.02, 1.545],
    ];
    parts.push(latheLoop(inner, seg));
    for (let k = 0; k <= 9; k++) {
      const x = SLEEVE_X - 0.78 + k * 0.088;
      parts.push(
        latheLoop(
          [
            [x - 0.007, 1.56],
            [x - 0.02, 1.79],
            [x + 0.0, 1.79],
            [x + 0.007, 1.56],
          ],
          seg,
        ),
      );
    }
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      parts.push(box([SLEEVE_X - 0.38, 1.675 * Math.cos(a), 1.675 * Math.sin(a)], [0.82, 0.23, 0.02], 0, 0, a));
    }
    root.add(mesh(`${id}_cascade`, merge(parts), 'darkMetal', 'thrustReverser'));
  } else root.add(sleeveMesh);

  // Fan face backdrop (dark duct ring behind blades) and core
  const core: Prof = [
    [-8.2, 0.64],
    [-7.6, 0.79],
    [-6.8, 0.92],
    [-5.5, 1.02],
    [-4.0, 1.05],
    [-2.6, 0.98],
    [FAN_X - 0.3, 0.62],
    [FAN_X - 0.3, 0.45],
    [-8.2, 0.48],
  ];
  root.add(mesh(`${id}_core`, latheLoop(core, seg), 'metal', 'engineCore'));
  const plug: Prof = [
    [-9.35, 0.02],
    [-9.0, 0.17],
    [-8.5, 0.36],
    [-8.0, 0.465],
    [-7.5, 0.5],
    [-7.5, 0.02],
  ];
  root.add(mesh(`${id}_plug`, latheLoop(plug, seg), 'exhaust', 'engineCore'));
  // Dark annulus behind the fan so the duct does not look hollow
  const stator: Prof = [
    [FAN_X - 0.45, 0.6],
    [FAN_X - 0.45, 1.49],
    [FAN_X - 0.5, 1.49],
    [FAN_X - 0.5, 0.6],
  ];
  root.add(mesh(`${id}_stator`, latheLoop(stator, seg), 'inlet', 'engineFan'));

  // Rotating assembly: spinner + 24 swept fan blades
  const spinner: Prof = [
    [FAN_X - 0.42, 0.02],
    [FAN_X - 0.42, 0.55],
    [FAN_X - 0.1, 0.53],
    [FAN_X + 0.2, 0.44],
    [FAN_X + 0.48, 0.27],
    [FAN_X + 0.66, 0.1],
    [FAN_X + 0.72, 0.02],
  ];
  const fan = pivoted(`${id}_fan`, [0, 0, 0], [
    mesh(`${id}_spinner`, orientOutward(lathe(spinner, seg, false, (x, _r, a) => [(x - (FAN_X - 0.42)) / 1.14, a])), 'spinner', 'engineFan'),
    mesh(`${id}_blades`, fanBlades(NACELLE.fanBlades, quality), 'fan', 'engineFan'),
  ], { kind: 'spin', axis: [1, 0, 0] }, 'engineFan');
  root.add(fan);

  return root;
}

/** Pylon from the nacelle crown to the wing lower surface (model space, not engine-local). */
export function buildPylon(frame: EngineFrame, quality: number): BufferGeometry {
  const z = frame.z;
  const side = frame.side;
  const sInlet = X0(frame);
  const le = wingLE(z);
  const c = wingChord(z);
  const s0 = sInlet + 1.0;
  const s1 = le + 0.62 * c;
  const nu = Math.round(40 * quality);
  const nv = Math.round(18 * quality);
  const axisY = frame.origin[1];
  const crown = (s: number) => {
    const x = -(s - sInlet);
    // nacelle outer radius along its length (approx. of the cowl profile)
    const r = x > -0.62 ? 1.79 : x > -4.4 ? lerp(1.835, 1.875, Math.min(1, (-x - 1.3) / 3)) : x > -6.6 ? lerp(1.875, 1.47, (-x - 4.4) / 2.2) : 1.2;
    return axisY + r;
  };
  const wingLower = (s: number) => wingLowerPoint(side, z, Math.min(Math.max((s - le) / c, 0.005), 0.98))[1];
  const top = (s: number) => {
    if (s >= le + 0.05 * c) return wingLower(s) + 0.3;
    const t = (s - s0) / (le + 0.05 * c - s0);
    return lerp(crown(s0) + 0.35, wingLower(le + 0.05 * c) + 0.3, Math.pow(Math.max(t, 0), 0.8));
  };
  const sNacAft = sInlet + 6.6;
  const bottom = (s: number) => {
    if (s <= sNacAft - 0.3) return crown(s) - 0.12;
    const t = (s - (sNacAft - 0.3)) / (s1 - (sNacAft - 0.3));
    return lerp(crown(sNacAft - 0.3) - 0.12, wingLower(s1) - 0.05, Math.pow(t, 0.7));
  };
  const width = (s: number) => {
    const t = (s - s0) / (s1 - s0);
    return 0.78 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t * 0.95 + 0.04))), 0.45);
  };
  const g = gridSurface(
    nu,
    nv,
    (i, j) => {
      const s = lerp(s0, s1, i / nu);
      const a = (j / nv) * Math.PI * 2;
      const yt = top(s);
      const yb = bottom(s);
      const w = width(s) / 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // rounded-rectangle section (super-ellipse)
      const zz = w * Math.sign(ca) * Math.pow(Math.abs(ca), 0.5);
      const yy = (yt + yb) / 2 + ((yt - yb) / 2) * Math.sign(sa) * Math.pow(Math.abs(sa), 0.7);
      return [sx(s), yy, side * z + zz];
    },
    { wrapV: true },
  );
  return orientOutward(g);
}

/** Aft pylon fairing: the titanium heat-shield canoe under the wing behind the nacelle. */
export function buildAftPylonFairing(frame: EngineFrame, quality: number): BufferGeometry {
  const z = frame.z;
  const side = frame.side;
  const le = wingLE(z);
  const c = wingChord(z);
  const s0 = le + 0.42 * c;
  const s1 = le + 0.86 * c;
  const nu = Math.round(24 * quality);
  const nv = Math.round(14 * quality);
  const g = gridSurface(
    nu,
    nv,
    (i, j) => {
      const t = i / nu;
      const s = lerp(s0, s1, t);
      const top = wingLowerPoint(side, z, Math.min(0.98, (s - le) / c))[1] + 0.06;
      const depth = 0.62 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.55))), 0.8) * (1 - t * 0.55) + 0.03;
      const w = 0.3 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.5))), 0.6) + 0.015;
      const a = (j / nv) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const yy = top - depth * 0.5 * (1 - Math.sign(sa) * Math.pow(Math.abs(sa), 0.8));
      return [sx(s), yy, side * z + w * Math.sign(ca) * Math.pow(Math.abs(ca), 0.6)];
    },
    { wrapV: true },
  );
  return orientOutward(g);
}

function X0(frame: EngineFrame): number {
  return -(frame.origin[0] - sx(0));
}
