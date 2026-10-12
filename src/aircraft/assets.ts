/** Asset URLs and manifest access for the generated, independently streamed GLB files. */
export type AircraftAsset = 'airframe' | 'wings' | 'empennage' | 'engines' | 'gear';
export type InteriorAsset = 'cabin' | 'cockpit' | 'structure';
export type Lod = 'ultra' | 'hi' | 'lo';

export const EXTERIOR_ASSETS: AircraftAsset[] = ['airframe', 'wings', 'empennage', 'engines', 'gear'];

const BASE = `${import.meta.env.BASE_URL}models/generated/`;

export const assetUrl = (name: AircraftAsset | InteriorAsset, lod: Lod = 'hi'): string => `${BASE}${name}-${lod}.glb`;

export interface ManifestEntry {
  lod: Lod;
  file: string;
  bytes: number;
  triangles: number;
  meshes: number;
}
export interface Manifest {
  assets: Record<string, ManifestEntry[]>;
  generated: string;
}

let manifest: Promise<Manifest | null> | null = null;
export function loadManifest(): Promise<Manifest | null> {
  manifest ??= fetch(`${BASE}manifest.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .catch(() => null);
  return manifest;
}
