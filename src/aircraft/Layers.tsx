/**
 * Lazily streamed interior layers. The structure, cabin and cockpit GLBs are only fetched
 * when a mode needs them (X-ray, cabin walk, cockpit), keeping the initial download small.
 */
import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import type { Group } from 'three';
import { useUI } from '../state/ui';
import { assetUrl, type InteriorAsset } from './assets';
import { prepareScene } from './prepare';
import { attachRoot, detachRoot } from './rig';

export function LazyLayer({ name, visible, onReady }: { name: InteriorAsset | 'structure'; visible: boolean; onReady?: (root: Group) => void }) {
  // phones (Performance preset) get the lighter cabin
  const lod = name === 'cabin' && useUI.getState().quality === 'performance' ? 'lo' : 'hi';
  const gltf = useGLTF(assetUrl(name as InteriorAsset, lod), false, true);
  const root = useMemo(() => {
    const r = gltf.scene as Group;
    prepareScene(r, { shadows: name !== 'cabin' });
    return r;
  }, [gltf, name]);
  useEffect(() => {
    attachRoot(root);
    onReady?.(root);
    return () => detachRoot(root);
  }, [root, onReady]);
  return <primitive object={root} visible={visible} />;
}
