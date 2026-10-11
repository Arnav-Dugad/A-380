/**
 * Top-level assembly. Produces independent asset groups, each exported as its own GLB so
 * the viewer can stream them progressively and keep every file well below hosting limits.
 */
import type { Group } from 'three';
import { buildAirframe } from './airframe';
import { buildEngine, buildPylon, engineFrames } from './engine';
import { buildGear } from './gear';
import { group, mesh } from './parts';
import { buildHtp, buildVtp } from './tail';
import { buildWing } from './wing';

export type AssetName = 'airframe' | 'wings' | 'empennage' | 'engines' | 'gear';

export function buildAsset(name: AssetName, quality: number): Group {
  switch (name) {
    case 'airframe':
      return buildAirframe(quality);
    case 'wings':
      return group('wings', [buildWing(1, quality), buildWing(-1, quality)]);
    case 'empennage':
      return group('empennage', [buildHtp(quality), buildVtp(quality)]);
    case 'engines': {
      const g = group('engines');
      for (const f of engineFrames()) {
        g.add(buildEngine(f, quality));
        g.add(mesh(`pylon_${f.id}`, buildPylon(f, quality), 'paint', 'pylon'));
      }
      return g;
    }
    case 'gear':
      return buildGear(quality);
  }
}

export const ASSETS: AssetName[] = ['airframe', 'wings', 'empennage', 'engines', 'gear'];
