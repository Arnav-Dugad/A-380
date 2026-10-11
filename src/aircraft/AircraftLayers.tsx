import { Suspense, useCallback, useEffect, useState } from 'react';
import type { Group } from 'three';
import { useUI } from '../state/ui';
import { LazyLayer } from './Layers';

/** Structure / cargo layer, streamed on first use of X-ray. */
export function StructureLayer() {
  const xray = useUI((s) => s.xray);
  const [root, setRoot] = useState<Group | null>(null);
  const [requested, setRequested] = useState(false);
  const want = (xray.enabled || xray.clip > 0 || xray.clipVertical > 0) && (xray.structure || xray.cargo);
  useEffect(() => {
    if (want) setRequested(true);
  }, [want]);
  useEffect(() => {
    if (!root) return;
    root.traverse((o) => {
      if (o.name === 'cargo_ulds') o.visible = xray.cargo;
      else if (o.parent === root.children[0] || o.parent === root) o.visible = o === root.children[0] || xray.structure;
    });
  }, [root, xray.cargo, xray.structure]);
  const onReady = useCallback((r: Group) => setRoot(r), []);
  if (!requested) return null;
  return (
    <Suspense fallback={null}>
      <LazyLayer name="structure" visible={want} onReady={onReady} />
    </Suspense>
  );
}
