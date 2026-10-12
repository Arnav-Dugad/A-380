/**
 * Rendered shading: an unbiased GPU path tracer (three-gpu-pathtracer) takes over the canvas.
 * The live scene is snapshotted into one BVH (built in a worker), lit by the same HDR
 * environment, sun and lamps, and refined progressively: global illumination, soft area
 * shadows, true reflections and refraction, and optional thin-lens depth of field. Moving the
 * camera restarts accumulation with a low-resolution preview; scene changes rebuild the snapshot.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  Group,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Raycaster,
  Vector2,
  Vector3,
  type Color,
  type InstancedMesh,
  type Material,
  type Object3D,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { DenoiseMaterial, PhysicalCamera, WebGLPathTracer } from 'three-gpu-pathtracer';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/src/workers/GenerateMeshBVHWorker.js';
import { getControls } from '../camera/controls';
import { useUI } from '../state/ui';
import { canvasRef, TONE_MAPS } from './output';
import { useRender, type RenderBackground } from './renderState';


const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'transmissionMap', 'sheenColorMap', 'sheenRoughnessMap', 'iridescenceMap', 'specularColorMap', 'specularIntensityMap', 'bumpMap'] as const;

function materialsOf(m: Mesh): Material[] {
  return Array.isArray(m.material) ? m.material : [m.material];
}

/** Objects the path tracer cannot represent: custom shaders (sky, stars, rain), invisible helpers. */
function unsupported(m: Mesh): boolean {
  if (m.userData.noPathTrace) return true;
  return materialsOf(m).some((x) => (x as { isShaderMaterial?: boolean }).isShaderMaterial || !x.visible || !x.colorWrite || (x.transparent && x.opacity < 0.02));
}

const _inst = new Matrix4();

/**
 * Prepare the live scene for a snapshot: hide what cannot be traced and stand in plain meshes
 * for every instance of an InstancedMesh (cabin seats, apron lights). Returns an undo function
 * and the number of distinct textures the snapshot will upload.
 */
function stage(scene: Scene): { undo: () => void; textures: number } {
  scene.updateMatrixWorld(true);
  const hide: Object3D[] = [];
  const proxies = new Group();
  proxies.name = '__pathTracerInstances';
  const textures = new Set<Texture>();
  // whole subtrees can opt out (measurement overlays, annotation pins)
  scene.traverse((o) => {
    if (o.userData.noPathTrace && o.visible) hide.push(o);
  });
  for (const o of hide) o.visible = false;
  scene.traverseVisible((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const bad = unsupported(m);
    if ((m as InstancedMesh).isInstancedMesh) {
      const im = m as InstancedMesh;
      hide.push(im);
      if (bad) return;
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, _inst);
        if (Math.abs(_inst.determinant()) < 1e-9) continue; // hidden instance
        const p = new Mesh(im.geometry, im.material);
        p.matrixAutoUpdate = false;
        p.matrix.multiplyMatrices(im.matrixWorld, _inst);
        p.castShadow = im.castShadow;
        proxies.add(p);
      }
    } else if (bad) {
      hide.push(m);
      return;
    }
    for (const mat of materialsOf(m)) {
      const rec = mat as unknown as Record<string, Texture | null | undefined>;
      for (const k of TEXTURE_SLOTS) if (rec[k]) textures.add(rec[k]!);
    }
  });
  for (const o of hide) o.visible = false;
  scene.add(proxies);
  return {
    textures: textures.size,
    undo: () => {
      for (const o of hide) o.visible = true;
      scene.remove(proxies);
    },
  };
}

/** Texture-array layer size that keeps the upload under ~320 MB. */
function textureLayerSize(count: number): number {
  for (const s of [2048, 1536, 1024]) if (count * s * s * 4 <= 320 * 1024 * 1024) return s;
  return 768;
}

/** Background seen by camera rays (lighting always comes from the scene's environment). */
function stageBackground(scene: Scene, mode: RenderBackground, outdoor: boolean): () => void {
  const prev = { bg: scene.background, rot: scene.backgroundRotation.clone(), blur: scene.backgroundBlurriness, intensity: scene.backgroundIntensity };
  const useEnv = mode === 'environment' || (mode === 'auto' && outdoor);
  if (mode === 'transparent') scene.background = null;
  else if (useEnv && scene.environment) {
    scene.background = scene.environment;
    scene.backgroundRotation.copy(scene.environmentRotation);
    scene.backgroundIntensity = scene.environmentIntensity;
    scene.backgroundBlurriness = 0;
  }
  return () => {
    scene.background = prev.bg as Color | Texture | null;
    scene.backgroundRotation.copy(prev.rot);
    scene.backgroundBlurriness = prev.blur;
    scene.backgroundIntensity = prev.intensity;
  };
}

/** Copies the interactive camera (including the panel-aware view offset) into the physical camera. */
function near(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}

function syncCamera(src: PerspectiveCamera, dst: PhysicalCamera): boolean {
  src.updateMatrixWorld();
  const view = src.view;
  const e = src.matrixWorld.elements;
  const f = dst.matrixWorld.elements;
  // tolerate float noise from damped controls: sub-millimetre, sub-pixel changes keep accumulating
  let same = e.every((v, i) => near(v, f[i]!, 2e-5)) && near(dst.fov, src.fov, 1e-4) && near(dst.aspect, src.aspect, 1e-5) && dst.zoom === src.zoom;
  if (same && (!!dst.view?.enabled !== !!view?.enabled)) same = false;
  if (same && view?.enabled && dst.view) {
    same = near(dst.view.offsetX, view.offsetX, 0.5) && near(dst.view.offsetY, view.offsetY, 0.5) && dst.view.width === view.width && dst.view.fullWidth === view.fullWidth && dst.view.fullHeight === view.fullHeight;
  }
  if (same) return false;
  dst.position.copy(src.position);
  dst.quaternion.copy(src.quaternion);
  dst.scale.copy(src.scale);
  dst.fov = src.fov;
  dst.aspect = src.aspect;
  dst.near = src.near;
  dst.far = src.far;
  dst.zoom = src.zoom;
  dst.filmGauge = src.filmGauge;
  dst.view = view ? { ...view } : null;
  dst.updateProjectionMatrix();
  dst.updateMatrixWorld(true);
  return true;
}

/** Distance from the camera to the orbit target, along the view direction. */
function autoFocus(cam: PerspectiveCamera): number {
  const c = getControls();
  if (!c) return 30;
  const t = c.getTarget(new Vector3());
  const fwd = new Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  return Math.max(0.5, t.sub(cam.position).dot(fwd));
}

/** Cleared after the first failure so later builds go straight to the main thread. */
let workerOk = true;

function createTracer(gl: WebGLRenderer, denoiser: FullScreenQuad, useWorker: boolean): { pt: WebGLPathTracer; worker: GenerateMeshBVHWorker | null } {
  const pt = new WebGLPathTracer(gl);
  const worker = useWorker ? new GenerateMeshBVHWorker() : null;
  if (worker) pt.setBVHWorker(worker as never);
  pt.dynamicLowRes = true;
  pt.lowResScale = 0.3;
  pt.renderDelay = 0;
  pt.minSamples = 1;
  pt.fadeDuration = 0;
  pt.tiles.set(2, 2);
  pt.multipleImportanceSampling = true;
  pt.renderToCanvasCallback = (target, renderer, quad) => {
    const r = useRender.getState();
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    if (r.denoise) {
      const m = denoiser.material as DenoiseMaterial & { uniforms: Record<string, { value: unknown }> };
      // denoise hard while the image is young, then step back so converged detail survives
      const k = r.denoiseStrength / Math.sqrt(1 + pt.samples / 48);
      m.uniforms.map!.value = target.texture;
      m.uniforms.opacity!.value = (quad.material as unknown as { opacity: number }).opacity;
      m.uniforms.sigma!.value = 1.2 + 4.5 * k;
      m.uniforms.threshold!.value = 0.004 + 0.09 * k;
      denoiser.render(renderer);
    } else quad.render(renderer);
    renderer.autoClear = auto;
  };
  return { pt, worker };
}

/** Saves the current path-traced frame as a PNG (alpha preserved for a transparent background). */
export function saveRender(): { width: number; height: number } | null {
  const c = canvasRef.el;
  if (!c) return null;
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `a380-render-${Math.floor(useRender.getState().samples)}spp-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  a.click();
  return { width: c.width, height: c.height };
}

export default function PathTracerImpl() {
  const gl = useThree((s) => s.gl) as WebGLRenderer;
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const setDpr = useThree((s) => s.setDpr);
  const version = useRender((s) => s.version);
  const background = useRender((s) => s.background);
  const size = useRender((s) => s.size);
  const ready = useRef(false);
  const settingsKey = useRef('');
  const lastPublish = useRef(0);
  const elapsed = useRef(0);

  const pcam = useMemo(() => new PhysicalCamera(), []);
  const denoiser = useMemo(() => new FullScreenQuad(new DenoiseMaterial({ premultipliedAlpha: gl.getContextAttributes().premultipliedAlpha } as never)), [gl]);
  const tracer = useRef<{ pt: WebGLPathTracer; worker: GenerateMeshBVHWorker | null } | null>(null);
  const create = (useWorker: boolean) => {
    if (tracer.current) {
      tracer.current.pt.dispose();
      tracer.current.worker?.dispose();
    }
    tracer.current = createTracer(gl, denoiser, useWorker);
    return tracer.current.pt;
  };

  useEffect(() => {
    canvasRef.el = gl.domElement;
    return () => {
      ready.current = false;
      tracer.current?.pt.dispose();
      tracer.current?.worker?.dispose();
      tracer.current = null;
      denoiser.dispose();
      denoiser.material.dispose();
      useRender.getState().set({ status: 'idle', samples: 0, progress: 0 });
    };
  }, [gl, denoiser]);

  // Output size: render the canvas backing store above screen resolution for large stills
  useEffect(() => {
    const base = gl.getPixelRatio();
    const long = Math.max(gl.domElement.clientWidth, gl.domElement.clientHeight) || 1;
    const dpr = size === '2x' ? Math.min(base * 2, 8192 / long) : size === '4k' ? 3840 / long : base;
    if (dpr !== base) setDpr(dpr);
    return () => {
      if (dpr !== base) setDpr(base);
    };
  }, [size, gl, setDpr]);

  // Snapshot the scene (again whenever the visible state changes)
  useEffect(() => {
    let cancelled = false;
    const st = useRender.getState();
    ready.current = false;
    st.set({ status: 'building', progress: 0, samples: 0, error: null });
    const ui = useUI.getState();
    const outdoor = ui.section === 'flight' || ((ui.env === 'apron' || ui.env === 'golden' || ui.env === 'night') && ui.section !== 'cabin' && ui.section !== 'cockpit');
    const t0 = performance.now();
    // let the "building" state paint before the synchronous part of the build
    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      syncCamera(camera, pcam);
      let pt = tracer.current?.pt ?? create(workerOk);
      const { undo, textures } = stage(scene);
      pt.textureSize.setScalar(textureLayerSize(textures));
      const restoreBg = stageBackground(scene, background, outdoor);
      let promise: Promise<void>;
      try {
        promise = pt.setSceneAsync(scene, pcam, { onProgress: (p) => !cancelled && useRender.getState().set({ progress: p }) });
      } catch (e) {
        undo();
        restoreBg();
        useRender.getState().set({ status: 'error', error: String(e) });
        return;
      }
      undo(); // the geometry was gathered synchronously; only the BVH is still building
      try {
        await promise;
      } catch {
        // worker unavailable (for example under a dev server): build on the main thread instead
        if (cancelled) return restoreBg();
        workerOk = false;
        pt = create(false);
        pt.textureSize.setScalar(textureLayerSize(textures));
        const again = stage(scene);
        try {
          pt.setScene(scene, pcam);
        } catch (e) {
          again.undo();
          restoreBg();
          useRender.getState().set({ status: 'error', error: String(e) });
          return;
        }
        again.undo();
      }
      pt.updateEnvironment();
      restoreBg();
      if (cancelled) return;
      let tris = 0;
      scene.traverseVisible((o) => {
        const g = (o as Mesh).geometry;
        if ((o as Mesh).isMesh && g) tris += (g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)) / 3;
      });
      settingsKey.current = '';
      elapsed.current = 0;
      ready.current = true;
      useRender.getState().set({ status: 'compiling', progress: 1, triangles: Math.round(tris), elapsed: (performance.now() - t0) / 1000 });
    }, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [version, background, scene, camera, pcam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild automatically when what is on screen changes
  useEffect(() => {
    let t = 0;
    const keys = ['env', 'section', 'quality', 'xray', 'explode', 'explodeGroup', 'isolate', 'weather', 'timeOfDay'] as const;
    const unsub = useUI.subscribe((s, p) => {
      if (!keys.some((k) => s[k] !== p[k])) return;
      window.clearTimeout(t);
      t = window.setTimeout(() => useRender.getState().resync(), 900);
    });
    return () => {
      unsub();
      window.clearTimeout(t);
    };
  }, []);

  // Click-to-focus
  useEffect(() => {
    const el = gl.domElement;
    const ray = new Raycaster();
    const onDown = (e: PointerEvent) => {
      if (!useRender.getState().pickFocus) return;
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(scene.children, true).find((h) => (h.object as Mesh).isMesh && !unsupported(h.object as Mesh));
      const st = useRender.getState();
      if (hit) {
        const fwd = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        st.set({ focusDistance: Math.max(0.3, hit.point.clone().sub(camera.position).dot(fwd)), dof: true, pickFocus: false });
      } else st.set({ pickFocus: false });
    };
    el.addEventListener('pointerdown', onDown, { capture: true });
    return () => el.removeEventListener('pointerdown', onDown, { capture: true });
  }, [gl, camera, scene]);

  useFrame((_, dt) => {
    const r = useRender.getState();
    gl.toneMapping = TONE_MAPS[r.toneMapping];
    const pt = tracer.current?.pt;
    if (!ready.current || !pt) {
      gl.render(scene, camera);
      return;
    }
    let moved = syncCamera(camera, pcam);
    const focus = r.focusDistance > 0 ? r.focusDistance : autoFocus(camera);
    const key = `${r.bounces}|${r.glossyFilter}|${r.dof}|${r.fStop}|${focus.toFixed(2)}|${r.apertureBlades}|${r.renderScale}|${r.toneMapping}|${r.denoise}|${r.denoiseStrength}`;
    if (key !== settingsKey.current) {
      settingsKey.current = key;
      pt.bounces = r.bounces;
      pt.transmissiveBounces = Math.max(4, r.bounces);
      pt.filterGlossyFactor = r.glossyFilter;
      pt.renderScale = r.renderScale;
      pcam.fStop = r.dof ? r.fStop : 1e6;
      pcam.focusDistance = focus;
      pcam.apertureBlades = r.apertureBlades;
      moved = true;
    }
    if (moved) {
      pt.updateCamera();
      elapsed.current = 0;
    }
    const done = pt.samples >= r.maxSamples;
    if (!done) {
      pt.renderSample();
      elapsed.current += dt;
    }
    const now = performance.now();
    if (now - lastPublish.current > 150 || (done && r.status !== 'done')) {
      lastPublish.current = now;
      const status = done ? 'done' : (pt as unknown as { isCompiling: boolean }).isCompiling ? 'compiling' : 'rendering';
      r.set({ samples: Math.min(r.maxSamples, Math.floor(pt.samples)), status, elapsed: elapsed.current });
    }
  }, 1);

  return null;
}
