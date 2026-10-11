/**
 * Asset pipeline: generates the procedural A380 geometry and writes optimised, independently
 * loadable GLB files (meshopt-compressed, quantised) plus a manifest with sizes and triangle
 * counts. Two LODs are produced: `hi` (quality 1.0) and `lo` (quality 0.5).
 *
 *   npm run assets
 */
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, Logger, NodeIO, type Node as GNode } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { Mesh, type BufferGeometry, type Object3D } from 'three';
import { ASSETS, buildAsset, type AssetName } from '../src/aircraft/geometry/aircraft';
import { buildCabin } from '../src/aircraft/geometry/cabin';
import { buildCockpit } from '../src/aircraft/geometry/cockpit';

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
      const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
      const glb = await io.writeBinary(doc);
      writeFileSync(join(outDir, file), glb);
    })(),
  );
  return { tris, meshes };
}

const pending: Promise<void>[] = [];

async function main() {
  await MeshoptEncoder.ready;
  const t0 = performance.now();
  const manifest: { assets: Record<string, { lod: string; file: string; bytes: number; triangles: number; meshes: number }[]>; generated: string } = {
    assets: {},
    generated: new Date().toISOString(),
  };
  const jobs: { name: string; lod: string; build: () => Object3D }[] = [];
  for (const name of ASSETS) {
    jobs.push({ name, lod: 'hi', build: () => buildAsset(name as AssetName, 1) });
    jobs.push({ name, lod: 'lo', build: () => buildAsset(name as AssetName, 0.5) });
  }
  jobs.push({ name: 'cabin', lod: 'hi', build: () => buildCabin() });
  jobs.push({ name: 'cockpit', lod: 'hi', build: () => buildCockpit() });

  const stats: { name: string; lod: string; file: string; tris: number; meshes: number }[] = [];
  for (const j of jobs) {
    const g = j.build();
    const file = `${j.name}-${j.lod}.glb`;
    const s = exportGroup(g, file);
    stats.push({ name: j.name, lod: j.lod, file, ...s });
  }
  await Promise.all(pending);
  for (const s of stats) {
    const bytes = statSync(join(outDir, s.file)).size;
    (manifest.assets[s.name] ??= []).push({ lod: s.lod, file: s.file, bytes, triangles: s.tris, meshes: s.meshes });
    console.log(`${s.file.padEnd(22)} ${(bytes / 1024).toFixed(0).padStart(6)} KiB  ${String(s.tris).padStart(8)} tris  ${s.meshes} meshes`);
  }
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`done in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
