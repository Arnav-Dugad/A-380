/**
 * Lightweight performance probe: frame time, FPS, draw calls, triangles and GPU-resident
 * resources from renderer.info (accumulated across all passes of a frame).
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';

export const perf = { fps: 0, frameMs: 0, calls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0, samples: [] as number[] };

export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame((_, dt) => {
    perf.samples.push(dt * 1000);
    if (perf.samples.length > 120) perf.samples.shift();
    const avg = perf.samples.reduce((a, b) => a + b, 0) / perf.samples.length;
    perf.frameMs = avg;
    perf.fps = 1000 / avg;
    perf.calls = gl.info.render.calls;
    perf.triangles = gl.info.render.triangles;
    perf.geometries = gl.info.memory.geometries;
    perf.textures = gl.info.memory.textures;
    perf.programs = gl.info.programs?.length ?? 0;
    gl.info.reset();
  }, -100);
  return null;
}
