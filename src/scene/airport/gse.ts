/**
 * Ground support equipment around the stand, built from rounded primitives and grouped by
 * material (painted body, hi-vis yellow, chassis, glass, rubber, aluminium) so the whole fleet
 * costs six draw calls. World frame: the aircraft is parked nose-in heading north, so a
 * fuselage station `s` lies at world z = STAND.z − (36 − s) and the right side faces east (+X).
 */
import { BufferGeometry, CylinderGeometry, Matrix4, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAIN_DECK_FLOOR } from '../../aircraft/geometry/layout';
import { STAND } from './layout';

export type GseMaterial = 'body' | 'hivis' | 'chassis' | 'glass' | 'rubber' | 'alu';

class Fleet {
  parts: Record<GseMaterial, BufferGeometry[]> = { body: [], hivis: [], chassis: [], glass: [], rubber: [], alu: [] };
  private frame = new Matrix4();

  /** Start a vehicle at world (x, z), heading `rotY` (vehicle +X is its front). */
  vehicle(x: number, z: number, rotY: number): this {
    this.frame.makeRotationY(rotY).setPosition(x, 0, z);
    return this;
  }

  private add(mat: GseMaterial, g: BufferGeometry) {
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng.getAttribute('uv')) ng.deleteAttribute('uv');
    ng.applyMatrix4(this.frame);
    this.parts[mat].push(ng);
  }

  /** Rounded box centred at local (x, y, z) with optional pitch about the vehicle's lateral axis. */
  box(mat: GseMaterial, x: number, y: number, z: number, l: number, h: number, w: number, r = 0.08, pitch = 0): this {
    const g = new RoundedBoxGeometry(l, h, w, 2, Math.min(r, Math.min(l, h, w) / 2 - 1e-3));
    if (pitch) g.rotateZ(pitch);
    g.translate(x, y, z);
    this.add(mat, g);
    return this;
  }

  /** Cylinder along the local axis `axis`. */
  cyl(mat: GseMaterial, x: number, y: number, z: number, r: number, len: number, axis: 'x' | 'y' | 'z', seg = 20): this {
    const g = new CylinderGeometry(r, r, len, seg);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
    this.add(mat, g);
    return this;
  }

  /** Road wheel: tyre plus a hub, axis along local Z. */
  wheel(x: number, z: number, r = 0.45, w = 0.3): this {
    this.cyl('rubber', x, r, z, r, w, 'z', 24);
    this.cyl('alu', x, r, z + Math.sign(z || 1) * (w / 2 + 0.005), r * 0.55, 0.02, 'z', 16);
    return this;
  }

  /** Driver's cab with wrap-around glazing. */
  cab(x: number, z: number, l: number, w: number, base: number, h = 1.5, mat: GseMaterial = 'body'): this {
    this.box(mat, x, base + h * 0.3, z, l, h * 0.6, w, 0.12);
    this.box('glass', x + 0.02, base + h * 0.78, z, l * 0.92, h * 0.4, w * 0.96, 0.1);
    this.box(mat, x, base + h + 0.04, z, l, 0.1, w, 0.05);
    return this;
  }
}

/** LD3 container: 1.53 m wide, 1.63 m high, with the angled base that fits the lower-deck contour. */
function ld3(f: Fleet, x: number, y: number, z: number): void {
  f.box('alu', x, y + 0.98, z, 1.53, 1.3, 2.01, 0.03);
  f.box('alu', x - 0.2, y + 0.18, z, 1.13, 0.36, 2.01, 0.02);
  f.box('alu', x + 0.38, y + 0.32, z, 0.6, 0.28, 2.0, 0.02, 0.6);
  f.box('chassis', x, y + 0.02, z, 1.56, 0.04, 2.04, 0.01);
}

export function buildGse(): Record<GseMaterial, BufferGeometry> {
  const f = new Fleet();
  const zs = (s: number) => STAND.z - (36.0 - s);
  const skin = STAND.x + 3.75; // right fuselage side

  // Belt loaders at the forward and aft cargo doors: conveyor from the sill down to the apron
  for (const [s, sill] of [
    [17.2, 2.75],
    [50.5, 2.8],
  ] as const) {
    const len = 8.2;
    const rise = sill - 0.95;
    const pitch = Math.atan2(rise, len - 1.2); // higher at the aircraft end (+X)
    f.vehicle(skin + len / 2 + 0.2, zs(s), Math.PI); // front (+X) points at the aircraft
    f.box('chassis', 0, 0.55, 0, len - 1, 0.35, 1.6, 0.06);
    f.box('rubber', 0, 0.95 + rise / 2, 0, len, 0.08, 0.95, 0.03, pitch);
    f.box('hivis', 0, 1.1 + rise / 2, 0.53, len, 0.24, 0.06, 0.02, pitch);
    f.box('hivis', 0, 1.1 + rise / 2, -0.53, len, 0.24, 0.06, 0.02, pitch);
    f.box('chassis', -0.4, 0.95 + rise * 0.35, 0, 0.15, rise * 0.7, 0.8, 0.03);
    f.cab(-len / 2 + 1.0, -0.75, 1.3, 0.9, 0.7, 1.35, 'hivis');
    for (const [wx, wz] of [
      [len / 2 - 1.2, 0.85],
      [len / 2 - 1.2, -0.85],
      [-len / 2 + 1.0, 0.85],
      [-len / 2 + 1.0, -0.85],
    ] as const)
      f.wheel(wx, wz, 0.38, 0.26);
  }

  // Baggage tractor towing four LD3 dollies, waiting for the forward hold
  f.vehicle(STAND.x + 15.5, zs(6), -Math.PI / 2);
  f.box('hivis', 0, 0.75, 0, 2.6, 0.7, 1.5, 0.12);
  f.cab(-0.4, 0, 1.2, 1.4, 1.1, 1.3, 'hivis');
  for (const wx of [0.85, -0.85]) for (const wz of [0.72, -0.72]) f.wheel(wx, wz, 0.38, 0.28);
  for (let k = 0; k < 4; k++) {
    const dx = -3.4 - k * 2.6;
    f.box('chassis', dx, 0.52, 0, 2.2, 0.12, 1.75, 0.03);
    for (let r = 0; r < 6; r++) f.cyl('alu', dx - 0.9 + r * 0.36, 0.6, 0, 0.03, 1.6, 'z', 8);
    for (const wx of [0.75, -0.75]) for (const wz of [0.72, -0.72]) f.wheel(dx + wx, wz, 0.22, 0.14);
    f.box('chassis', dx + 1.3, 0.45, 0, 0.5, 0.06, 0.08, 0.02);
    ld3(f, dx, 0.58, 0);
  }

  // Catering high-loader at door M2R: body raised on its scissor lift to the main-deck sill
  {
    const bodyL = 6.2;
    const floorY = MAIN_DECK_FLOOR;
    f.vehicle(skin + bodyL / 2 + 0.25, zs(20.15), Math.PI);
    f.box('body', 0, floorY + 1.35, 0, bodyL, 2.6, 2.45, 0.08);
    f.box('hivis', 0, floorY + 0.25, 1.24, bodyL - 0.2, 0.18, 0.02, 0.01);
    f.box('hivis', 0, floorY + 0.25, -1.24, bodyL - 0.2, 0.18, 0.02, 0.01);
    f.box('chassis', bodyL / 2 + 0.25, floorY + 0.05, 0, 0.6, 0.08, 2.2, 0.02); // bridge platform
    f.box('chassis', 0, 0.85, 0, bodyL + 1.5, 0.35, 2.3, 0.05); // truck chassis
    // scissor lift arms
    const liftH = floorY - 1.1;
    for (const sz of [0.9, -0.9]) {
      const a = Math.atan2(liftH, bodyL - 1.2);
      f.box('chassis', 0, 1.05 + liftH / 2, sz, Math.hypot(liftH, bodyL - 1.2), 0.14, 0.08, 0.02, a);
      f.box('chassis', 0, 1.05 + liftH / 2, sz, Math.hypot(liftH, bodyL - 1.2), 0.14, 0.08, 0.02, -a);
    }
    f.cab(-bodyL / 2 - 1.1, 0, 1.9, 2.3, 1.0, 1.7);
    for (const wx of [bodyL / 2 - 0.6, -bodyL / 2 + 0.4, -bodyL / 2 - 1.1]) for (const wz of [1.05, -1.05]) f.wheel(wx, wz, 0.5, 0.32);
  }

  // Fuel tanker alongside the right wing root
  f.vehicle(STAND.x + 21, zs(33), Math.PI / 2);
  f.cyl('alu', -0.9, 2.0, 0, 1.25, 8.5, 'x', 32);
  f.cyl('alu', 3.35, 2.0, 0, 1.18, 0.12, 'x', 32);
  f.cyl('alu', -5.15, 2.0, 0, 1.18, 0.12, 'x', 32);
  f.box('chassis', -0.6, 0.85, 0, 10.6, 0.35, 2.3, 0.05);
  f.box('hivis', -0.9, 2.0, 1.27, 8.4, 0.25, 0.02, 0.01);
  f.box('hivis', -0.9, 2.0, -1.27, 8.4, 0.25, 0.02, 0.01);
  f.cab(4.6, 0, 2.0, 2.4, 1.0, 1.9);
  for (const wx of [4.4, -2.8, -4.2]) for (const wz of [1.05, -1.05]) f.wheel(wx, wz, 0.52, 0.34);

  // Push-back tug, low and wide, ahead of the nose gear
  f.vehicle(STAND.x, zs(-5.5), -Math.PI / 2); // coupling (+X) faces the nose gear
  f.box('hivis', 0, 0.85, 0, 6.2, 0.9, 3.1, 0.18);
  f.box('chassis', 0, 0.42, 0, 6.4, 0.25, 3.2, 0.06);
  f.box('chassis', 3.25, 0.65, 0, 0.3, 0.4, 1.2, 0.05); // tow coupling
  f.cab(-1.9, 1.0, 1.6, 1.0, 1.3, 1.25, 'hivis');
  for (const wx of [1.9, -1.9]) for (const wz of [1.3, -1.3]) f.wheel(wx, wz, 0.55, 0.45);

  // Ground power unit beside the nose, with its cable to the receptacle
  f.vehicle(STAND.x + 5.2, zs(3.5), 0);
  f.box('body', 0, 0.95, 0, 2.6, 1.2, 1.5, 0.1);
  f.box('chassis', 0, 0.38, 0, 2.7, 0.15, 1.6, 0.04);
  f.box('chassis', 1.0, 1.0, 0.76, 0.5, 0.6, 0.02, 0.01);
  for (const wx of [0.85, -0.85]) for (const wz of [0.7, -0.7]) f.wheel(wx, wz, 0.3, 0.2);
  f.vehicle(0, 0, 0);
  const a = new Vector3(STAND.x + 5.2 - 1.3, 0.12, zs(3.5));
  const b = new Vector3(STAND.x + 1.2, 0.12, zs(4.6));
  const cable = new CylinderGeometry(0.04, 0.04, a.distanceTo(b), 8);
  cable.rotateZ(Math.PI / 2);
  cable.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
  cable.translate((a.x + b.x) / 2, 0.06, (a.z + b.z) / 2);
  const c2 = cable.toNonIndexed();
  c2.deleteAttribute('uv');
  f.parts.rubber.push(c2);

  const out = {} as Record<GseMaterial, BufferGeometry>;
  for (const k of Object.keys(f.parts) as GseMaterial[]) out[k] = mergeGeometries(f.parts[k])!;
  return out;
}
