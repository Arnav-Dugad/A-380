/**
 * Empennage: trimmable horizontal stabiliser with 2 elevators per side, and the vertical
 * fin with a two-segment rudder (upper and lower), per Airbus descriptions.
 */
import type { Group } from 'three';
import { HTP, VTP, sx } from './layout';
import { lerp } from './math';
import { panel, type LiftingSurface } from './lifting';
import { group, mesh, norm, pivoted, scale, sub } from './parts';
import { lensDome, staticWick } from './details';
import { ordinate } from './lifting';
import { merge } from './surface';

const ELEV_FRAC = 0.7;
const RUDDER_FRAC = 0.66;

export function htpSurface(side: 1 | -1): LiftingSurface {
  const chord = (z: number) => lerp(HTP.chordRoot, HTP.chordTip, (z - HTP.rootZ) / (HTP.tipZ - HTP.rootZ));
  const le = (z: number) => lerp(HTP.leRoot, HTP.leTip, (z - HTP.rootZ) / (HTP.tipZ - HTP.rootZ));
  return {
    cambered: false,
    chord,
    tc: (z) => lerp(HTP.tc, HTP.tc * 0.8, (z - HTP.rootZ) / (HTP.tipZ - HTP.rootZ)),
    map(z, xc, yn) {
      const c = chord(z);
      // Slightly inverted camber is ignored; the stabiliser is modelled symmetric.
      return [sx(le(z) + xc * c), HTP.rootY + (z - HTP.rootZ) * Math.tan(HTP.dihedral) + yn * c, side * z];
    },
  };
}

export const vtpSurface: LiftingSurface = {
  cambered: false,
  chord: (h) => lerp(VTP.chordRoot, VTP.chordTip, (h - VTP.rootY) / (VTP.tipY - VTP.rootY)),
  tc: () => VTP.tc,
  map(h, xc, yn) {
    const t = (h - VTP.rootY) / (VTP.tipY - VTP.rootY);
    const c = lerp(VTP.chordRoot, VTP.chordTip, t);
    return [sx(lerp(VTP.leRoot, VTP.leTip, t) + xc * c), h, yn * c];
  },
};

/**
 * Tail atlas coordinates. Upper half: the stabiliser (u across both sides, upper skin in the
 * top quarter). Lower half: the fin (u up the span, starboard skin in the upper quarter).
 */
export function htpUV(side: 1 | -1): (z: number, xc: number, upper: boolean) => [number, number] {
  return (z, xc, upper) => [0.5 + 0.5 * side * (z / HTP.tipZ), 0.75 + (upper ? 0.25 : -0.25) * xc];
}
export const VTP_BASE = VTP.rootY - 0.6;
export const vtpUV = (h: number, xc: number, upper: boolean): [number, number] => [(h - VTP_BASE) / (VTP.tipY - VTP_BASE), 0.25 + (upper ? 0.25 : -0.25) * xc];

export function buildHtp(quality: number): Group {
  const g = group('htp', [], 'htp');
  const n = Math.round(20 * quality);
  for (const side of [1, -1] as const) {
    const S = side === 1 ? 'R' : 'L';
    const surf = htpSurface(side);
    const uvMap = htpUV(side);
    g.add(mesh(`htp_${S}_box`, panel(surf, HTP.rootZ, HTP.tipZ, 0, ELEV_FRAC, { nChord: n + 6, uvMap }), 'tailSkin', 'htp'));
    const spans = [
      { z0: HTP.rootZ + 1.0, z1: 8.0 },
      { z0: 8.0, z1: HTP.tipZ - 0.45 },
    ];
    spans.forEach((sp, k) => {
      const name = `elevator_${S}${k + 1}`;
      const geo = panel(surf, sp.z0 + 0.03, sp.z1 - 0.03, ELEV_FRAC + 0.004, 1, { nChord: Math.round(12 * quality), uvMap });
      const p0 = surf.map(sp.z0, ELEV_FRAC + 0.01, 0);
      const p1 = surf.map(sp.z1, ELEV_FRAC + 0.01, 0);
      const wicks = [0.3, 0.75].map((f) => staticWick(surf.map(sp.z0 + (sp.z1 - sp.z0) * f, 0.995, 0), [-1, 0, side * 0.08]));
      g.add(
        pivoted(name, p0, [mesh(`${name}_mesh`, geo, 'tailSkin', 'elevator'), mesh(`${name}_wicks`, merge(wicks), 'darkMetal', 'elevator')], { kind: 'hinge', axis: norm(scale(sub(p1, p0), side)), min: -30, max: 20 }, 'elevator'),
      );
    });
    // Fixed trailing edge stubs at the root and tip of the elevator spans
    g.add(mesh(`htp_${S}_te_root`, panel(surf, HTP.rootZ, HTP.rootZ + 1.0, ELEV_FRAC, 1, { nChord: 8, uvMap }), 'tailSkin', 'htp'));
    g.add(mesh(`htp_${S}_te_tip`, panel(surf, HTP.tipZ - 0.45, HTP.tipZ, ELEV_FRAC, 1, { nChord: 8, uvMap }), 'tailSkin', 'htp'));
    g.add(mesh(`htp_${S}_tip_wicks`, merge([0.2, 0.75].map((f) => staticWick(surf.map(HTP.tipZ - 0.05, 0.75 + f * 0.24, 0), [-0.3, 0, side]))), 'darkMetal', 'htp'));
    // logo-light lens on the upper surface, aimed at the fin
    const lz = 6;
    const lp = surf.map(lz, 0.164, ordinate(surf, lz, 0.164, true));
    g.add(mesh(`logo_light_lens_${S}`, lensDome(lp, [0, 1, 0], [1, 0, 0], 0.16, 0.1, 0.07), 'lens', 'htp'));
  }
  return g;
}

export function buildVtp(quality: number): Group {
  const g = group('vtp', [], 'vtp');
  const n = Math.round(22 * quality);
  const base = VTP.rootY - 0.6; // root buried into the fuselage crown
  g.add(mesh('vtp_box', panel(vtpSurface, base, VTP.tipY, 0, RUDDER_FRAC, { nChord: n + 6, uvMap: vtpUV }), 'tailSkin', 'vtp'));
  const spans = [
    { h0: VTP.rootY + 0.5, h1: 16.6, id: 'rudder_lower' },
    { h0: 16.6, h1: VTP.tipY - 0.35, id: 'rudder_upper' },
  ];
  for (const sp of spans) {
    const geo = panel(vtpSurface, sp.h0 + 0.03, sp.h1 - 0.03, RUDDER_FRAC + 0.004, 1, { nChord: Math.round(12 * quality), uvMap: vtpUV });
    const p0 = vtpSurface.map(sp.h0, RUDDER_FRAC + 0.01, 0);
    const p1 = vtpSurface.map(sp.h1, RUDDER_FRAC + 0.01, 0);
    const wicks = [0.25, 0.7].map((f) => staticWick(vtpSurface.map(sp.h0 + (sp.h1 - sp.h0) * f, 0.995, 0), [-1, 0.06, 0]));
    g.add(pivoted(sp.id, p0, [mesh(`${sp.id}_mesh`, geo, 'tailSkin', 'rudder'), mesh(`${sp.id}_wicks`, merge(wicks), 'darkMetal', 'rudder')], { kind: 'hinge', axis: norm(sub(p1, p0)), min: -30, max: 30 }, 'rudder'));
  }
  g.add(mesh('vtp_te_root', panel(vtpSurface, base, VTP.rootY + 0.5, RUDDER_FRAC, 1, { nChord: 8, uvMap: vtpUV }), 'tailSkin', 'vtp'));
  g.add(mesh('vtp_te_tip', panel(vtpSurface, VTP.tipY - 0.35, VTP.tipY, RUDDER_FRAC, 1, { nChord: 8, uvMap: vtpUV }), 'tailSkin', 'vtp'));
  // Dorsal fillet blending the fin leading edge into the crown. Its base stays above the
  // upper-deck ceiling (10.17 m) so it never shows inside the cabin.
  const FB = 10.2;
  const fillet: LiftingSurface = {
    cambered: false,
    chord: () => 1,
    tc: () => 0.5,
    map(h, xc, yn) {
      const t = (h - FB) / (VTP.rootY + 1.0 - FB);
      const le = lerp(VTP.leRoot - 6.5, VTP.leRoot + 1.0, t);
      const te = VTP.leRoot + 3.0;
      return [sx(le + xc * (te - le)), h, yn * lerp(1.6, 0.6, t) * (1 - xc * 0.3)];
    },
  };
  g.add(mesh('vtp_fillet', panel(fillet, FB, VTP.rootY + 1.0, 0, 1, { nChord: 14, nSpan: 6 }), 'paintTail', 'vtp'));
  return g;
}
