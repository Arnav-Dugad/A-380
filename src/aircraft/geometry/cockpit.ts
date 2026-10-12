/**
 * Representative A380 flight deck: interior shell with real window openings, main panel
 * with the 8 identical displays (2 PFD, 2 ND, EWD, SD, 2 MFD), glareshield FCU, centre
 * pedestal (thrust levers, engine masters, flap and speed-brake levers, KCCUs), side-sticks,
 * landing-gear lever, overhead panel and crew seats.
 *
 * Every operable control is a separate named node carrying `userData.control`, so the
 * runtime can wire it to the shared systems model. Layout is educational, not a replica.
 */
import { BufferAttribute, BufferGeometry, type Group } from 'three';
import { COCKPIT_FLOOR, sx } from './layout';
import { fuselagePoint, thetaAtHeight } from './fuselage';
import { box, cylinder, rbox } from './gear';
import { deg, lerp, type Vec3 } from './math';
import { group, mesh, pivoted, type MaterialKey } from './parts';
import { merge } from './surface';

const F = COCKPIT_FLOOR;
export const EYE_CAPTAIN: Vec3 = [sx(5.05), F + 1.22, -0.56];
export const EYE_FO: Vec3 = [sx(5.05), F + 1.22, 0.56];

/** Window openings in (s, θ°) — must match airframe glazing (with a small margin). */
const PANES: [number, number][][] = [
  [
    [3.12, 89.2],
    [3.5, 58],
    [4.38, 60],
    [4.12, 89.2],
  ],
  [
    [3.62, 55.5],
    [4.55, 45.5],
    [5.05, 54.5],
    [4.45, 58.5],
  ],
  [
    [4.68, 44.5],
    [5.75, 40],
    [6.02, 48.5],
    [5.18, 53.2],
  ],
];

function insidePane(s: number, thDeg: number): boolean {
  const th = thDeg > 90 ? 180 - thDeg : thDeg; // mirror port side
  for (const p of PANES) {
    // point-in-quad via cross products (convex quads)
    let sign = 0;
    let inside = true;
    for (let i = 0; i < 4; i++) {
      const a = p[i]!;
      const b = p[(i + 1) % 4]!;
      const c = (b[0] - a[0]) * (th - a[1]) - (b[1] - a[1]) * (s - a[0]);
      if (c !== 0) {
        if (sign === 0) sign = Math.sign(c);
        else if (Math.sign(c) !== sign) {
          inside = false;
          break;
        }
      }
    }
    if (inside) return true;
  }
  return false;
}

/** Interior shell: inset nose surface with holes where the windows are. */
function shell(): BufferGeometry {
  const s0 = 2.3;
  const s1 = 7.6;
  const nu = 90;
  const nv = 140;
  const pts: number[] = [];
  const idx: number[] = [];
  const P = (i: number, j: number): Vec3 => {
    const s = lerp(s0, s1, i / nu);
    const t0 = thetaAtHeight(s, F, 1);
    const th = lerp(t0, Math.PI - t0, j / nv);
    return fuselagePoint(s, th, -0.06);
  };
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) pts.push(...P(i, j));
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const s = lerp(s0, s1, (i + 0.5) / nu);
      const t0 = thetaAtHeight(s, F, 1);
      const th = (lerp(t0, Math.PI - t0, (j + 0.5) / nv) * 180) / Math.PI;
      if (insidePane(s, th)) continue;
      const a = i * (nv + 1) + j;
      const b = (i + 1) * (nv + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1); // faces point inward (seen from inside)
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array((pts.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A display: bezel + screen quad facing aft (towards the crew), tilted back by `tilt`. */
function display(name: string, c: Vec3, tilt: number, w = 0.15, h = 0.2): Group {
  const g = group(`display_${name}`, [], 'displays');
  const bezel = box([0, 0, 0], [0.025, h + 0.03, w + 0.03]);
  const screen = new BufferGeometry();
  const x = -0.014;
  screen.setAttribute('position', new BufferAttribute(new Float32Array([x, -h / 2, w / 2, x, -h / 2, -w / 2, x, h / 2, -w / 2, x, h / 2, w / 2]), 3));
  screen.setAttribute('normal', new BufferAttribute(new Float32Array([-1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0]), 3));
  screen.setAttribute('uv', new BufferAttribute(new Float32Array([1, 0, 0, 0, 0, 1, 1, 1]), 2));
  screen.setIndex([0, 2, 1, 0, 3, 2]);
  const b = mesh(`${name}_bezel`, bezel, 'cockpitTrim', 'displays');
  const sc = mesh(`screen_${name}`, screen, 'screen', 'displays');
  sc.userData.screen = name;
  g.add(b, sc);
  g.position.set(...c);
  g.rotation.z = -tilt; // lean the top aft
  return g;
}

function control(name: string, controlId: string, pivot: Vec3, parts: [BufferGeometry, MaterialKey][], axis: Vec3 = [0, 0, 1], min = -90, max = 90): Group {
  const node = pivoted(
    `ctl_${name}`,
    pivot,
    parts.map(([g, m], k) => mesh(`ctl_${name}_${k}`, g, m, 'cockpitControl')),
    { kind: 'hinge', axis, min, max },
    'cockpitControl',
  );
  node.userData.control = controlId;
  for (const c of node.children) c.userData.control = controlId;
  return node;
}

/** Overhead push button (annunciator cap is a separate mesh so it can light up). */
function pushButton(id: string, p: Vec3, label: string): Group {
  const g = group(`btn_${id}`, [], 'cockpitControl');
  const body = mesh(`btn_${id}_body`, box(p, [0.034, 0.012, 0.034]), 'cockpitTrim', 'cockpitControl');
  const cap = mesh(`btn_${id}_cap`, box([p[0], p[1] - 0.008, p[2]], [0.026, 0.006, 0.026]), 'screen', 'cockpitControl');
  cap.userData.annunciator = id;
  body.userData.control = id;
  cap.userData.control = id;
  g.userData.control = id;
  g.userData.label = label;
  g.add(body, cap);
  return g;
}

export const OVERHEAD_BUTTONS: { id: string; label: string; row: number; col: number }[] = [
  { id: 'BAT', label: 'BAT 1+2', row: 0, col: 0 },
  { id: 'EXT_PWR', label: 'EXT PWR', row: 0, col: 1 },
  { id: 'APU_GEN', label: 'APU GEN', row: 0, col: 2 },
  { id: 'APU_MASTER', label: 'APU MASTER', row: 1, col: 0 },
  { id: 'APU_START', label: 'APU START', row: 1, col: 1 },
  { id: 'APU_BLEED', label: 'APU BLEED', row: 1, col: 2 },
  { id: 'LT_BEACON', label: 'BEACON', row: 2, col: 0 },
  { id: 'LT_NAV', label: 'NAV & LOGO', row: 2, col: 1 },
  { id: 'LT_STROBE', label: 'STROBE', row: 2, col: 2 },
  { id: 'LT_LAND', label: 'LAND', row: 3, col: 0 },
  { id: 'LT_TAXI', label: 'TAXI', row: 3, col: 1 },
  { id: 'LT_WING', label: 'WING', row: 3, col: 2 },
  { id: 'SEAT_BELTS', label: 'SEAT BELTS', row: 4, col: 0 },
  { id: 'CABIN_LT', label: 'CABIN LT', row: 4, col: 1 },
  { id: 'DOME_LT', label: 'DOME', row: 4, col: 2 },
];

function overhead(): Group {
  const g = group('overhead', [], 'cockpitPanel');
  // Overhead panel surface: slopes from above the windshield back to the ceiling
  const sA = 4.35;
  const sB = 6.3;
  const yA = 8.42;
  const yB = 8.62;
  const panel = box([sx((sA + sB) / 2), (yA + yB) / 2, 0], [sB - sA, 0.05, 1.02], 0, Math.atan2(yB - yA, sB - sA));
  g.add(mesh('overhead_panel', panel, 'cockpitPanel', 'cockpitPanel'));
  // Label face: printed legends for the operable buttons (runtime canvas texture)
  const face = new BufferGeometry();
  const yAt = (s: number) => lerp(yA, yB, (s - sA) / (sB - sA)) - 0.027;
  const v = [
    [sx(sA + 0.05), yAt(sA + 0.05), -0.48],
    [sx(sA + 0.05), yAt(sA + 0.05), 0.48],
    [sx(sB - 0.05), yAt(sB - 0.05), 0.48],
    [sx(sB - 0.05), yAt(sB - 0.05), -0.48],
  ].flat();
  face.setAttribute('position', new BufferAttribute(new Float32Array(v), 3));
  face.setAttribute('normal', new BufferAttribute(new Float32Array([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0]), 3));
  face.setAttribute('uv', new BufferAttribute(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]), 2));
  face.setIndex([0, 1, 2, 0, 2, 3]);
  const fm = mesh('overhead_legends', face, 'screen', 'cockpitPanel');
  fm.userData.screen = 'OVHD';
  g.add(fm);
  g.userData.overhead = { sA, sB };
  // Decorative (non-interactive) switch field is rendered as panel texture; the operable
  // buttons below are real controls.
  for (const b of OVERHEAD_BUTTONS) {
    const s = lerp(sA + 0.25, sB - 0.35, b.row / 4);
    const z = (b.col - 1) * 0.16;
    const y = lerp(yA, yB, (s - sA) / (sB - sA)) - 0.032;
    g.add(pushButton(b.id, [sx(s), y, z], b.label));
  }
  const field = overheadField(sA, sB, yA, yB);
  g.add(mesh('overhead_subpanels', field.panels, 'cockpitPanel', 'cockpitPanel'));
  g.add(mesh('overhead_switches', field.switches, 'cockpitTrim', 'cockpitPanel'));
  return g;
}

/** Crew seat: contoured cushions with lumbar and headrest, armrests, and a column on floor rails. */
function seat(c: Vec3): { fabric: BufferGeometry; frame: BufferGeometry } {
  const r = -0.12;
  const fabric = merge([
    rbox([c[0], c[1] + 0.5, c[2]], [0.52, 0.12, 0.5], 0.05, -0.04),
    rbox([c[0] - 0.29, c[1] + 0.96, c[2]], [0.13, 0.8, 0.5], 0.06, r, 0, 0, 0.35),
    rbox([c[0] - 0.36, c[1] + 1.45, c[2]], [0.12, 0.22, 0.34], 0.06, r),
    rbox([c[0] - 0.24, c[1] + 0.75, c[2]], [0.06, 0.18, 0.42], 0.03, r),
  ]);
  const frame = merge([
    rbox([c[0], c[1] + 0.41, c[2]], [0.5, 0.06, 0.46], 0.02),
    rbox([c[0] - 0.32, c[1] + 0.95, c[2]], [0.05, 0.84, 0.46], 0.02, r),
    rbox([c[0] + 0.02, c[1] + 0.7, c[2] - 0.29], [0.42, 0.06, 0.07], 0.025),
    rbox([c[0] + 0.02, c[1] + 0.7, c[2] + 0.29], [0.42, 0.06, 0.07], 0.025),
    cylinder([c[0], c[1] + 0.06, c[2]], [c[0], c[1] + 0.4, c[2]], 0.07, 16),
    rbox([c[0], c[1] + 0.04, c[2]], [0.6, 0.06, 0.34], 0.02),
    box([c[0], c[1] + 0.005, c[2] - 0.14], [1.1, 0.012, 0.05]),
    box([c[0], c[1] + 0.005, c[2] + 0.14], [1.1, 0.012, 0.05]),
  ]);
  return { fabric, frame };
}

/**
 * Decorative overhead switch field (systems not modelled as operable controls): rows of
 * guarded push-buttons, toggle switches and rotary knobs on sub-panels with lit legends.
 */
function overheadField(sA: number, sB: number, yA: number, yB: number): { panels: BufferGeometry; switches: BufferGeometry } {
  const panels: BufferGeometry[] = [];
  const sw: BufferGeometry[] = [];
  const tilt = Math.atan2(yB - yA, sB - sA);
  const yAt = (s: number) => lerp(yA, yB, (s - sA) / (sB - sA)) - 0.028;
  let seed = 17;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 9; row++) {
    const s = lerp(sA + 0.12, sB - 0.12, row / 8);
    for (const zc of [-0.36, 0.36]) {
      panels.push(rbox([sx(s), yAt(s) + 0.004, zc], [0.18, 0.006, 0.26], 0.003, tilt));
      const n = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const z = zc - 0.1 + (0.2 * k) / Math.max(1, n - 1);
        const kind = rnd();
        if (kind < 0.5) sw.push(rbox([sx(s), yAt(s) - 0.004, z], [0.03, 0.012, 0.03], 0.004, tilt));
        else if (kind < 0.8) sw.push(cylinder([sx(s), yAt(s), z], [sx(s), yAt(s) - 0.02, z], 0.011, 10), box([sx(s - 0.008), yAt(s) - 0.024, z], [0.02, 0.006, 0.008]));
        else sw.push(cylinder([sx(s), yAt(s), z], [sx(s), yAt(s) - 0.012, z], 0.016, 12, 0.012));
      }
    }
  }
  return { panels: merge(panels), switches: merge(sw) };
}

export function buildCockpit(): Group {
  const g = group('cockpit', [], 'cockpit');
  g.add(mesh('cockpit_shell', shell(), 'cockpitTrim', 'cockpitPanel'));
  g.add(mesh('cockpit_floor', box([sx(4.9), F - 0.03, 0], [5.2, 0.06, 2.6]), 'carpet', 'cockpitPanel'));
  g.add(mesh('cockpit_rear_wall', box([sx(7.45), F + 1.2, 0], [0.06, 2.4, 2.8]), 'cockpitPanel', 'cockpitPanel'));

  // Main instrument panel and glareshield
  const panelS = 3.98;
  g.add(mesh('main_panel', rbox([sx(panelS), F + 0.82, 0], [0.06, 0.62, 2.5], 0.02, deg(-14)), 'cockpitPanel', 'cockpitPanel'));
  g.add(
    mesh(
      'glareshield',
      rbox([sx(panelS - 0.1), F + 1.14, 0], [0.42, 0.06, 2.4], 0.025),
      'cockpitTrim',
      'cockpitPanel',
    ),
  );
  g.add(mesh('fcu_body', rbox([sx(panelS - 0.02), F + 1.08, 0], [0.12, 0.1, 1.1], 0.015), 'cockpitPanel', 'cockpitPanel'));
  // EFIS control panels at both ends of the glareshield: baro, range and mode knobs
  const efis: BufferGeometry[] = [];
  for (const zc of [-0.82, 0.82]) {
    efis.push(rbox([sx(panelS - 0.01), F + 1.08, zc], [0.11, 0.1, 0.36], 0.012));
    for (const dz of [-0.11, 0, 0.11]) efis.push(cylinder([sx(panelS + 0.04), F + 1.08, zc + dz], [sx(panelS + 0.075), F + 1.08, zc + dz], 0.019, 14, 0.016));
  }
  for (const dz of [-0.36, -0.12, 0.12, 0.36]) efis.push(cylinder([sx(panelS + 0.04), F + 1.06, dz], [sx(panelS + 0.07), F + 1.06, dz], 0.017, 14, 0.015));
  g.add(mesh('efis_controls', merge(efis), 'cockpitTrim', 'cockpitPanel'));
  g.add(display('FCU', [sx(panelS + 0.045), F + 1.08, 0], 0, 0.95, 0.07));

  // Eight identical 150 × 200 mm LCDs
  const yRow = F + 0.86;
  const panelX = (s: number) => sx(s + 0.03);
  g.add(display('PFD_C', [panelX(panelS), yRow, -0.68], deg(14)));
  g.add(display('ND_C', [panelX(panelS), yRow, -0.47], deg(14)));
  g.add(display('EWD', [panelX(panelS), yRow, 0], deg(14)));
  g.add(display('ND_F', [panelX(panelS), yRow, 0.47], deg(14)));
  g.add(display('PFD_F', [panelX(panelS), yRow, 0.68], deg(14)));
  g.add(display('SD', [panelX(panelS + 0.08), F + 0.6, 0], deg(28)));

  // Centre pedestal
  const pedS0 = 4.25;
  const pedS1 = 5.55;
  g.add(mesh('pedestal', rbox([sx((pedS0 + pedS1) / 2), F + 0.36, 0], [pedS1 - pedS0, 0.72, 0.62], 0.03), 'cockpitPanel', 'cockpitPanel'));
  g.add(display('MFD_C', [sx(4.36), F + 0.62, -0.2], deg(55), 0.15, 0.2));
  g.add(display('MFD_F', [sx(4.36), F + 0.62, 0.2], deg(55), 0.15, 0.2));
  // KCCUs (keyboards)
  // KCCUs: keyboard and cursor control units with a key grid and trackball
  const kccu: BufferGeometry[] = [];
  for (const zc of [-0.2, 0.2]) {
    kccu.push(rbox([sx(5.0), F + 0.76, zc], [0.34, 0.04, 0.2], 0.012, deg(-8)));
    for (let i = 0; i < 6; i++) for (let j = 0; j < 8; j++) kccu.push(rbox([sx(4.88 + i * 0.033), F + 0.782 + i * 0.0046, zc - 0.075 + j * 0.0215], [0.024, 0.008, 0.017], 0.003, deg(-8)));
    kccu.push(cylinder([sx(5.12), F + 0.79, zc], [sx(5.12), F + 0.8, zc], 0.022, 16));
  }
  g.add(mesh('kccu', merge(kccu), 'cockpitTrim', 'cockpitPanel'));

  // Thrust levers (4) — pivot on the pedestal, rotate about Z (forward = more thrust)
  const tlPivot = (z: number): Vec3 => [sx(4.72), F + 0.7, z];
  [-0.105, -0.035, 0.035, 0.105].forEach((z, i) => {
    const p = tlPivot(z);
    g.add(
      control(`thrust${i + 1}`, `THRUST_${i + 1}`, p, [
        [box([p[0], p[1] + 0.12, p[2]], [0.025, 0.24, 0.022]), 'darkMetal'],
        [rbox([p[0], p[1] + 0.25, p[2]], [0.055, 0.04, 0.055], 0.015), 'cockpitTrim'],
      ], [0, 0, 1], -20, 35),
    );
  });
  // Engine master switches (4)
  [-0.105, -0.035, 0.035, 0.105].forEach((z, i) => {
    const p: Vec3 = [sx(5.1), F + 0.74, z];
    g.add(control(`engmaster${i + 1}`, `ENG_MASTER_${i + 1}`, p, [[cylinder([p[0], p[1], p[2]], [p[0], p[1] + 0.05, p[2]], 0.012, 10), 'chrome']], [0, 0, 1], -30, 30));
  });
  // Engine start selector
  const es: Vec3 = [sx(5.25), F + 0.74, 0];
  g.add(control('engstart', 'ENG_START', es, [[cylinder(es, [es[0], es[1] + 0.03, es[2]], 0.025, 14), 'cockpitTrim']], [0, 1, 0], -60, 60));
  // Flap lever (right of thrust levers) and speed-brake lever (left)
  const fl: Vec3 = [sx(4.9), F + 0.72, 0.24];
  g.add(control('flaps', 'FLAPS', fl, [[box([fl[0], fl[1] + 0.09, fl[2]], [0.02, 0.18, 0.02]), 'darkMetal'], [box([fl[0], fl[1] + 0.19, fl[2]], [0.04, 0.03, 0.06]), 'hub']], [0, 0, 1], -30, 30));
  const sb: Vec3 = [sx(4.9), F + 0.72, -0.24];
  g.add(control('speedbrake', 'SPEEDBRAKE', sb, [[box([sb[0], sb[1] + 0.09, sb[2]], [0.02, 0.18, 0.02]), 'darkMetal'], [box([sb[0], sb[1] + 0.19, sb[2]], [0.06, 0.03, 0.04]), 'hub']], [0, 0, 1], -30, 30));
  // Parking brake handle
  const pb: Vec3 = [sx(5.4), F + 0.73, -0.12];
  g.add(control('parkbrake', 'PARK_BRAKE', pb, [[box([pb[0], pb[1] + 0.02, pb[2]], [0.07, 0.03, 0.03]), 'cockpitTrim']], [0, 1, 0], -90, 0));

  // Landing-gear lever on the main panel (right of centre)
  const gl: Vec3 = [sx(panelS + 0.06), F + 0.66, 0.26];
  g.add(control('gear', 'GEAR', gl, [[box([gl[0] - 0.06, gl[1], gl[2]], [0.12, 0.016, 0.016]), 'chrome'], [cylinder([gl[0] - 0.12, gl[1] - 0.025, gl[2]], [gl[0] - 0.12, gl[1] + 0.025, gl[2]], 0.025, 14), 'tyre']], [0, 0, 1], -35, 35));
  // Autobrake knob
  const ab: Vec3 = [sx(panelS + 0.05), F + 0.56, 0.26];
  g.add(control('autobrake', 'AUTOBRAKE', ab, [[cylinder([ab[0], ab[1], ab[2]], [ab[0] - 0.03, ab[1], ab[2]], 0.022, 12), 'cockpitTrim']], [1, 0, 0], -90, 90));

  // Side consoles with side-sticks
  for (const side of [-1, 1] as const) {
    g.add(mesh(`console_${side}`, rbox([sx(5.0), F + 0.58, side * 1.02], [1.4, 0.1, 0.32], 0.03), 'cockpitPanel', 'cockpitPanel'));
    g.add(mesh(`armrest_${side}`, rbox([sx(5.25), F + 0.68, side * 1.0], [0.45, 0.06, 0.16], 0.03), 'seatFabricBiz', 'cockpitPanel'));
    const ss: Vec3 = [sx(4.75), F + 0.64, side * 1.02];
    g.add(
      control(`sidestick_${side === -1 ? 'C' : 'F'}`, 'SIDESTICK', ss, [
        [cylinder(ss, [ss[0], ss[1] + 0.14, ss[2]], 0.017, 10), 'darkMetal'],
        [rbox([ss[0] + 0.005, ss[1] + 0.2, ss[2]], [0.065, 0.13, 0.055], 0.025, deg(10)), 'cockpitTrim'],
        [cylinder([ss[0], ss[1] - 0.01, ss[2]], [ss[0], ss[1] + 0.05, ss[2]], 0.045, 16, 0.025), 'tyre'],
      ], [1, 0, 0], -20, 20),
    );
    // OIT side screens
    g.add(display(side === -1 ? 'OIT_C' : 'OIT_F', [sx(4.3), F + 0.9, side * 1.15], deg(10), 0.18, 0.14));
  }
  // Crew seats
  const seats = [seat([sx(5.35), F, -0.56]), seat([sx(5.35), F, 0.56]), seat([sx(6.6), F, -0.75])];
  g.add(mesh('crew_seats', merge(seats.map((x) => x.fabric)), 'sheepskin', 'cockpitPanel'));
  g.add(mesh('crew_seat_frames', merge(seats.map((x) => x.frame)), 'cockpitTrim', 'cockpitPanel'));
  // Rudder pedals
  // sun visors parked at the top of the side windows, tinted and translucent
  const visors = [-1, 1].map((side) => rbox([sx(4.95), F + 1.42, side * 1.02], [0.42, 0.26, 0.012], 0.01, 0, side * 0.42, side * 0.35));
  g.add(mesh('sun_visors', merge(visors), 'visor', 'cockpitPanel'));
  // reinforced flight-deck door in the rear wall: frame, panel, handle, viewer and keypad
  const door = merge([
    box([sx(7.41), F + 1.0, 0.55], [0.03, 2.0, 0.08]),
    box([sx(7.41), F + 1.0, -0.4], [0.03, 2.0, 0.08]),
    box([sx(7.41), F + 2.02, 0.075], [0.03, 0.08, 1.03]),
    rbox([sx(7.4), F + 0.99, 0.075], [0.05, 1.96, 0.9], 0.01),
  ]);
  g.add(mesh('cockpit_door', door, 'cockpitPanel', 'cockpitPanel'));
  g.add(
    mesh(
      'cockpit_door_hardware',
      merge([
        cylinder([sx(7.37), F + 1.02, -0.27], [sx(7.33), F + 1.02, -0.27], 0.012, 10),
        box([sx(7.33), F + 1.02, -0.2], [0.02, 0.025, 0.16]),
        cylinder([sx(7.38), F + 1.55, 0.075], [sx(7.36), F + 1.55, 0.075], 0.018, 12),
        rbox([sx(7.37), F + 1.25, -0.3], [0.02, 0.12, 0.08], 0.006),
      ]),
      'chrome',
      'cockpitPanel',
    ),
  );
  g.add(mesh('pedals', merge([-0.66, -0.46, 0.46, 0.66].map((z) => box([sx(4.25), F + 0.12, z], [0.04, 0.24, 0.1], 0, deg(-25)))), 'darkMetal', 'cockpitPanel'));

  g.add(overhead());
  return g;
}
