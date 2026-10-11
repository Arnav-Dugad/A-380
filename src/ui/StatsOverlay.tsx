import { useEffect, useState } from 'react';
import { perf } from '../perf/PerfProbe';

/** Optional performance overlay: FPS, frame time, draw calls, triangles and GPU resources. */
export function StatsOverlay() {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, []);
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return (
    <div className="pointer-events-none absolute bottom-[86px] right-3 z-20 rounded-lg border border-white/10 bg-black/70 px-3 py-2 font-mono text-[10.5px] leading-[1.6] text-paper/90 lg:bottom-5 lg:right-5" data-testid="stats">
      <div>
        <span className={perf.fps >= 55 ? 'text-green-ok' : perf.fps >= 30 ? 'text-amber-warn' : 'text-red-warn'}>{perf.fps.toFixed(0)} fps</span> · {perf.frameMs.toFixed(1)} ms
      </div>
      <div>{perf.calls} draw calls</div>
      <div>{(perf.triangles / 1e6).toFixed(2)} M triangles</div>
      <div>
        {perf.geometries} geometries · {perf.textures} textures · {perf.programs} programs
      </div>
      {mem && <div>JS heap {(mem.usedJSHeapSize / 1048576).toFixed(0)} MB</div>}
    </div>
  );
}
