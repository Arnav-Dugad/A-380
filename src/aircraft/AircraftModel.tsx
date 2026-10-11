import { useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useMemo } from 'react';
import { Mesh, type Group, type Material } from 'three';
import { EXTERIOR_ASSETS, assetUrl, type Lod } from './assets';
import { getMaterials } from './materials';
import { AircraftRig, setRig } from './rig';

/** Swap placeholder materials for the shared PBR library and configure shadows. */
function prepare(root: Group): void {
  const lib = getMaterials();
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const key = (o.material as Material).name;
    const replacement = o.name === 'fuselage_skin' ? lib.livery : (lib as Record<string, Material>)[key];
    if (replacement) o.material = replacement;
    o.castShadow = !['cabin_windows', 'cabin_window_frames', 'cockpit_windows', 'cockpit_window_frames'].includes(o.name);
    o.receiveShadow = true;
  });
}

function AircraftLod({ lod }: { lod: Lod }) {
  const gltfs = useGLTF(EXTERIOR_ASSETS.map((a) => assetUrl(a, lod)), false, true);
  const roots = useMemo(() => {
    const list = gltfs.map((g) => g.scene as Group);
    list.forEach(prepare);
    return list;
  }, [gltfs]);
  useEffect(() => {
    const rig = new AircraftRig(roots);
    setRig(rig);
    return () => setRig(null);
  }, [roots]);
  return (
    <group name="aircraft">
      {roots.map((r) => (
        <primitive key={r.uuid} object={r} />
      ))}
    </group>
  );
}

/**
 * Progressive loading: the low-detail set renders first, the high-detail set replaces it
 * when ready (unless a low quality profile is active).
 */
export function AircraftModel({ highDetail }: { highDetail: boolean }) {
  return (
    <Suspense fallback={null}>
      {highDetail ? (
        <Suspense fallback={<AircraftLod lod="lo" />}>
          <AircraftLod lod="hi" />
        </Suspense>
      ) : (
        <AircraftLod lod="lo" />
      )}
    </Suspense>
  );
}
