import { Bvh, useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useMemo } from 'react';
import type { Group } from 'three';
import { EXTERIOR_ASSETS, assetUrl, type Lod } from './assets';
import { prepareScene } from './prepare';
import { onClick, onPointerMove, onPointerOut } from './interaction';
import { AircraftRig, setRig } from './rig';

function AircraftLod({ lod }: { lod: Lod }) {
  const gltfs = useGLTF(EXTERIOR_ASSETS.map((a) => assetUrl(a, lod)), false, true);
  const roots = useMemo(() => {
    const list = gltfs.map((g) => g.scene as Group);
    list.forEach((r) => prepareScene(r));
    return list;
  }, [gltfs]);
  useEffect(() => {
    const rig = new AircraftRig(roots);
    setRig(rig);
    return () => setRig(null);
  }, [roots]);
  return (
    <group name="aircraft" onPointerMove={onPointerMove} onPointerOut={onPointerOut} onClick={onClick}>
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
      <Bvh firstHitOnly>
      {highDetail ? (
        <Suspense fallback={<AircraftLod lod="lo" />}>
          <AircraftLod lod="hi" />
        </Suspense>
      ) : (
        <AircraftLod lod="lo" />
      )}
      </Bvh>
    </Suspense>
  );
}
