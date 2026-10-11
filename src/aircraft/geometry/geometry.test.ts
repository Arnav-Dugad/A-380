import { Box3, Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ASSETS, buildAsset } from './aircraft';
import { buildCabin, seatMap } from './cabin';
import { HEIGHT, L, SPAN } from './layout';
import { signedVolume } from './surface';
import { planformArea } from './wing';

describe('generated A380 geometry', () => {
  const groups = ASSETS.map((a) => buildAsset(a, 0.5));
  const box = new Box3();
  for (const g of groups) box.union(new Box3().setFromObject(g));
  const size = box.getSize(new Vector3());

  it('matches published overall dimensions within 0.2 %', () => {
    expect(Math.abs(size.x - L) / L).toBeLessThan(0.002);
    expect(Math.abs(size.z - SPAN) / SPAN).toBeLessThan(0.002);
    expect(Math.abs(box.max.y - HEIGHT) / HEIGHT).toBeLessThan(0.002);
  });

  it('has a wing reference area close to the published 845 m²', () => {
    expect(Math.abs(planformArea() - 845) / 845).toBeLessThan(0.01);
  });

  it('has the published number of articulated control surfaces and wheels', () => {
    const names: string[] = [];
    for (const g of groups) g.traverse((o) => o.userData.articulation && names.push(o.name));
    const count = (re: RegExp) => names.filter((n) => re.test(n)).length;
    expect(count(/^slat_/)).toBe(12);
    expect(count(/^droop_/)).toBe(4);
    expect(count(/^flap_/)).toBe(6);
    expect(count(/^aileron_/)).toBe(6);
    expect(count(/^spoiler_/)).toBe(16);
    expect(count(/^elevator_/)).toBe(4);
    expect(count(/^rudder_/)).toBe(2);
    expect(count(/_w\d[ab]$|^nose_wheel_/)).toBe(22);
    expect(count(/^door_[MU]\d[LR]_panel$/)).toBe(16);
  });

  it('builds closed bodies with outward-facing normals', () => {
    let bad = 0;
    for (const g of groups)
      g.traverse((o) => {
        if (o instanceof Mesh && /_(mesh|tyre|inlet|core|plug)$|^wing_[LR]_box/.test(o.name)) if (signedVolume(o.geometry) < 0) bad++;
      });
    expect(bad).toBe(0);
  });

  it('cabin seat map matches the representative 469-seat four-class totals', () => {
    const seats = seatMap();
    const by = (c: string) => seats.filter((s) => s.cls === c).length;
    expect(seats.length).toBe(469);
    expect([by('first'), by('business'), by('premium'), by('economy')]).toEqual([14, 97, 55, 303]);
    expect(new Set(seats.map((s) => s.id)).size).toBe(469);
    expect(buildCabin().children.length).toBeGreaterThan(10);
  });
});
