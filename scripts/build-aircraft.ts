/**
 * Asset pipeline: generates the procedural A380 geometry and writes optimised, independently
 * loadable GLB files (meshopt-compressed, quantised) plus a manifest with sizes and triangle
 * counts. Three LODs are produced: `ultra` (quality 2.4), `hi` (1.0) and `lo` (0.5). Every vertex
 * carries ray-traced ambient occlusion (see bake-ao.ts). Unchanged sources skip the rebuild.
 *
 *   npm run assets
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, Logger, NodeIO, type Node as GNode } from '@gltf-transform/core';
import { EXTMeshGPUInstancing, EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { InstancedMesh, Matrix4, Mesh, Quaternion, Vector3, type BufferGeometry, type Object3D } from 'three';
import { ASSETS, buildAsset, type AssetName } from '../src/aircraft/geometry/aircraft';
import { buildCabin } from '../src/aircraft/geometry/cabin';
import { buildCockpit } from '../src/aircraft/geometry/cockpit';
import { buildStructure } from '../src/aircraft/geometry/structure';
import { bakeAO } from './bake-ao';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'models', 'generated');
mkdirSync(outDir, { recursive: true });

/** Neutral preview colours so the GLBs look sensible in any external glTF viewer. */
const PREVIEW: Record<string, [number, number, number, number, number]> = {
  paint: [0.92, 0.93, 0.94, 0.0, 0.35],
  paintBelly: [0.62, 0.65, 0.68, 0.0, 0.45],
  paintTail: [0.12, 0.16, 0.22, 0.0, 0.35],
  composite: [0.78, 0.8, 0.82, 0.0, 0.5],
  leadingEdge: [0.75, 0.77, 0.8, 1.0, 0.3],
  metal: [0.7, 0.71, 0.72, 1.0, 0.35],
  darkMetal: [0.25, 0.26, 0.27, 0.8, 0.45],
  chrome: [0.9, 0.9, 0.92, 1.0, 0.08],
  tyre: [0.03, 0.03, 0.03, 0.0, 0.85],
  hub: [0.6, 0.6, 0.62, 1.0, 0.4],
  glass: [0.02, 0.03, 0.04, 0.0, 0.05],
  window: [0.03, 0.04, 0.05, 0.0, 0.1],
  seal: [0.05, 0.05, 0.06, 0.0, 0.7],
  fan: [0.55, 0.57, 0.6, 1.0, 0.3],
  inlet: [0.08, 0.08, 0.09, 0.3, 0.6],
  exhaust: [0.35, 0.3, 0.27, 1.0, 0.55],
  structure: [0.5, 0.55, 0.6, 0.6, 0.5],
  cargo: [0.55, 0.57, 0.6, 0.5, 0.6],
};

function exportGroup(group: Object3D, file: string): { tris: number; meshes: number } {
  const doc = new Document().setLogger(new Logger(Logger.Verbosity.WARN));
  const buffer = doc.createBuffer();
  const scene = doc.createScene(group.name);
  const mats = new Map<string, ReturnType<Document['createMaterial']>>();
  let tris = 0;
  let meshes = 0;

  const material = (name: string) => {
    let m = mats.get(name);
    if (!m) {
      const p = PREVIEW[name] ?? [0.7, 0.7, 0.7, 0, 0.5];
      m = doc.createMaterial(name).setBaseColorFactor([p[0], p[1], p[2], 1]).setMetallicFactor(p[3]).setRoughnessFactor(p[4]).setDoubleSided(false);
      mats.set(name, m);
    }
    return m;
  };

  let inst: EXTMeshGPUInstancing | null = null;
  const instancing = () => (inst ??= doc.createExtension(EXTMeshGPUInstancing).setRequired(true));
  const convert = (obj: Object3D): GNode => {
    const node = doc.createNode(obj.name);
    node.setTranslation([obj.position.x, obj.position.y, obj.position.z]);
    node.setRotation([obj.quaternion.x, obj.quaternion.y, obj.quaternion.z, obj.quaternion.w]);
    node.setScale([obj.scale.x, obj.scale.y, obj.scale.z]);
    const extras: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj.userData)) extras[k] = v;
    if (Object.keys(extras).length) node.setExtras(extras);
    if (obj instanceof Mesh) {
      const geo = obj.geometry as BufferGeometry;
      const prim = doc.createPrimitive();
      for (const [attr, gl] of [
        ['position', 'POSITION'],
        ['normal', 'NORMAL'],
        ['uv', 'TEXCOORD_0'],
      ] as const) {
        const a = geo.getAttribute(attr);
        if (!a) continue;
        prim.setAttribute(gl, doc.createAccessor().setType(a.itemSize === 3 ? 'VEC3' : 'VEC2').setArray(new Float32Array(a.array as Float32Array)).setBuffer(buffer));
      }
      const ao = geo.getAttribute('_ao');
      if (ao) {
        const q = new Uint8Array(ao.count);
        for (let i = 0; i < ao.count; i++) q[i] = Math.round(Math.min(1, Math.max(0, ao.getX(i))) * 255);
        prim.setAttribute('_AO', doc.createAccessor().setType('SCALAR').setArray(q).setNormalized(true).setBuffer(buffer));
      }
      const idx = geo.getIndex();
      if (idx) {
        const count = geo.getAttribute('position').count;
        const arr = count > 65535 ? new Uint32Array(idx.array) : new Uint16Array(idx.array);
        prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(arr).setBuffer(buffer));
        tris += idx.count / 3;
      }
      const matName = Array.isArray(obj.material) ? obj.material[0]!.name : obj.material.name;
      prim.setMaterial(material(matName));
      node.setMesh(doc.createMesh(obj.name).addPrimitive(prim));
      meshes++;
      if (obj instanceof InstancedMesh) {
        const n = obj.count;
        const t = new Float32Array(n * 3);
        const r = new Float32Array(n * 4);
        const sc = new Float32Array(n * 3);
        const m = new Matrix4();
        const p = new Vector3();
        const q = new Quaternion();
        const s = new Vector3();
        for (let i = 0; i < n; i++) {
          obj.getMatrixAt(i, m);
          m.decompose(p, q, s);
          t.set([p.x, p.y, p.z], i * 3);
          r.set([q.x, q.y, q.z, q.w], i * 4);
          sc.set([s.x, s.y, s.z], i * 3);
        }
        const ext = instancing();
        const batch = ext
          .createInstancedMesh()
          .setAttribute('TRANSLATION', doc.createAccessor().setType('VEC3').setArray(t).setBuffer(buffer))
          .setAttribute('ROTATION', doc.createAccessor().setType('VEC4').setArray(r).setBuffer(buffer))
          .setAttribute('SCALE', doc.createAccessor().setType('VEC3').setArray(sc).setBuffer(buffer));
        node.setExtension('EXT_mesh_gpu_instancing', batch);
        tris += (idx ? idx.count / 3 : 0) * (n - 1);
      }
    }
    for (const c of obj.children) node.addChild(convert(c));
    return node;
  };

  scene.addChild(convert(group));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  pending.push(
    (async () => {
      await doc.transform(prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
      const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, EXTMeshGPUInstancing]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
      const glb = await io.writeBinary(doc);
      writeFileSync(join(outDir, file), glb);
    })(),
  );
  return { tris, meshes };
}

const pending: Promise<void>[] = [];

/** Hash of everything that shapes the generated assets; unchanged sources skip the (slow) rebuild. */
function sourceHash(): string {
  const h = createHash('sha256');
  const files = [
    ...readdirSync(join(root, 'src/aircraft/geometry'))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => join(root, 'src/aircraft/geometry', f)),
    join(root, 'scripts/build-aircraft.ts'),
    join(root, 'scripts/bake-ao.ts'),
  ].sort();
  for (const f of files) h.update(readFileSync(f));
  return h.digest('hex').slice(0, 16);
}

/**
 * Level-of-detail tiers: geometric density factor and AO ray count. The ultra tier is
 * occluded by the hi geometry, which gives the same occlusion at a third of the cost.
 */
const LODS = [
  { lod: 'hi', quality: 1, rays: 32 },
  { lod: 'ultra', quality: 2.4, rays: 24 },
  { lod: 'lo', quality: 0.5, rays: 32 },
] as const;

async function main() {
  await MeshoptEncoder.ready;
  const t0 = performance.now();
  const hash = sourceHash();
  const manifestPath = join(outDir, 'manifest.json');
  if (!process.argv.includes('--force') && existsSync(manifestPath)) {
    try {
      const prev = JSON.parse(readFileSync(manifestPath, 'utf8')) as { source?: string; assets: Record<string, { file: string }[]> };
      const files = Object.values(prev.assets).flat();
      if (prev.source === hash && files.every((f) => existsSync(join(outDir, f.file)))) {
        console.log(`assets up to date (${hash}); pass --force to rebuild`);
        return;
      }
    } catch {
      /* rebuild */
    }
  }
  const manifest: { assets: Record<string, { lod: string; file: string; bytes: number; triangles: number; meshes: number }[]>; generated: string; source: string } = {
    assets: {},
    generated: new Date().toISOString(),
    source: hash,
  };
  const stats: { name: string; lod: string; file: string; tris: number; meshes: number }[] = [];
  const emit = (name: string, lod: string, g: Object3D) => {
    const file = `${name}-${lod}.glb`;
    stats.push({ name, lod, file, ...exportGroup(g, file) });
  };

  // Exterior: all assets of a tier occlude each other (wing over fuselage, pylons, gear bays)
  let hiGroups: Object3D[] | null = null;
  for (const t of LODS) {
    const groups = ASSETS.map((a) => buildAsset(a as AssetName, t.quality));
    if (t.lod === 'hi') hiGroups = groups;
    const r = bakeAO(groups, t.lod === 'ultra' && hiGroups ? hiGroups : groups, { rays: t.rays, distance: 3, bias: 0.012 });
    console.log(`AO ${t.lod}: ${r.vertices} vertices, ${(r.rays / 1e6).toFixed(1)} M rays, ${(r.ms / 1000).toFixed(1)} s`);
    ASSETS.forEach((a, i) => emit(a, t.lod, groups[i]!));
  }
  // Interiors bake against themselves, at a short range
  for (const [name, lod, build, dist] of [
    ['structure', 'hi', buildStructure, 1.5],
    ['cabin', 'hi', () => buildCabin(1), 1.6],
    ['cabin', 'lo', () => buildCabin(0.5), 1.6],
    ['cockpit', 'hi', buildCockpit, 0.9],
  ] as const) {
    const g = build();
    const r = bakeAO([g], [g], { rays: 32, distance: dist, bias: 0.004 });
    console.log(`AO ${name}-${lod}: ${r.vertices} vertices, ${(r.rays / 1e6).toFixed(1)} M rays, ${(r.ms / 1000).toFixed(1)} s`);
    emit(name, lod, g);
  }

  await Promise.all(pending);
  for (const s of stats) {
    const bytes = statSync(join(outDir, s.file)).size;
    (manifest.assets[s.name] ??= []).push({ lod: s.lod, file: s.file, bytes, triangles: s.tris, meshes: s.meshes });
    console.log(`${s.file.padEnd(22)} ${(bytes / 1024).toFixed(0).padStart(6)} KiB  ${String(s.tris).padStart(8)} tris  ${s.meshes} meshes`);
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`done in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
