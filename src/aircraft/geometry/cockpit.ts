import type { Group } from 'three';
import { group } from './parts';

export function buildCockpit(): Group {
  return group('cockpit');
}
