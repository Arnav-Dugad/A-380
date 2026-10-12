/**
 * Ray-traced ambient-occlusion bake. For every vertex of the target meshes, a fixed set of
 * cosine-weighted hemisphere rays (randomly rotated per vertex to avoid banding) is cast
 * against a BVH of all occluders in world space. The result is stored per vertex in a
 * `_ao` attribute (exported as glTF `_AO`), which the runtime shaders apply to indirect
 * light only (see src/aircraft/bakedAO.ts).
 */
import { BufferAttribute, BufferGeometry, DoubleSide, InstancedMesh, Matrix3, Matrix4, Mesh, Ray, Vector3, type Object3D } from 'three';
import { MeshBVH, SAH } from 'three-mesh-bvh';

export interface AOOptions {
  /** rays per vertex */
  rays: number;
  /** occlusion distance in metres; nearer hits occlude more */
  distance: number;
  /** start offset along the normal, in metres */
  bias: number;
}

/** Cosine-weighted hemisphere directions in tangent space (z = normal), Hammersley sequence. */
function hemisphere(n: number): Vector3[] {
  const out: Vector3[] = [];
  for (let i = 0; i < n; i++) {
    let bits = i;
    bits = ((bits << 16) | (bits >>> 16)) >>> 0;
    bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
    bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0;
    bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
    bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0;
    const u = (i + 0.5) / n;
    const v = bits / 4294967296;
    const r = Math.sqrt(u);
    const phi = 2 * Math.PI * v;
    out.push(new Vector3(r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(Math.max(0, 1 - u))));
  }
  return out;
}

/** Merge every mesh (and every instance) under the roots into one world-space geometry. */
function occluderGeometry(roots: Object3D[]): BufferGeometry {
  const chunks: Float32Array[] = [];
  let total = 0;
  const m = new Matrix4();
  const v = new Vector3();
  const push = (geo: BufferGeometry, world: Matrix4) => {
    const pos = geo.getAttribute('position');
    const idx = geo.getIndex();
    const n = idx ? idx.count : pos.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const k = idx ? idx.getX(i) : i;
      v.fromBufferAttribute(pos, k).applyMatrix4(world);
      arr[i * 3] = v.x;
      arr[i * 3 + 1] = v.y;
      arr[i * 3 + 2] = v.z;
    }
    chunks.push(arr);
    total += arr.length;
  };
  for (const r of roots) {
    r.updateMatrixWorld(true);
    r.traverse((o) => {
      if (!(o instanceof Mesh) || o.userData.noOcclude) return;
      if (o instanceof InstancedMesh) {
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m);
          push(o.geometry, m.premultiply(o.matrixWorld));
        }
      } else push(o.geometry, o.matrixWorld);
    });
  }
  const all = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.length;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(all, 3));
  return g;
}

/** Bake `_ao` onto every mesh under `targets`, occluded by everything under `occluders`. */
export function bakeAO(targets: Object3D[], occluders: Object3D[], opts: AOOptions): { vertices: number; rays: number; ms: number } {
  const t0 = performance.now();
  const geo = occluderGeometry(occluders);
  const bvh = new MeshBVH(geo, { maxLeafTris: 4, strategy: SAH });
  const dirs = hemisphere(opts.rays);
  const ray = new Ray();
  const p = new Vector3();
  const nrm = new Vector3();
  const t1 = new Vector3();
  const t2 = new Vector3();
  const d = new Vector3();
  const world = new Matrix4();
  const normalM = new Matrix3();
  const inst = new Matrix4();
  let vertices = 0;
  let rays = 0;
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  const seen = new Set<BufferGeometry>();
  for (const root of targets) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      // a geometry shared by several meshes gets its own copy, since occlusion depends on placement
      if (seen.has(o.geometry)) o.geometry = (o.geometry as BufferGeometry).clone();
      seen.add(o.geometry);
      const g = o.geometry as BufferGeometry;
      const pos = g.getAttribute('position');
      const nor = g.getAttribute('normal');
      if (!pos || !nor) return;
      world.copy(o.matrixWorld);
      if (o instanceof InstancedMesh && o.count > 0) {
        // instances share one geometry: bake it in the frame of a representative instance
        o.getMatrixAt(Math.floor(o.count / 2), inst);
        world.multiply(inst);
      }
      normalM.getNormalMatrix(world);
      const ao = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(world);
        nrm.fromBufferAttribute(nor, i).applyMatrix3(normalM).normalize();
        // tangent frame with a random twist per vertex
        const a = Math.abs(nrm.x) > 0.9 ? t1.set(0, 1, 0) : t1.set(1, 0, 0);
        t2.crossVectors(nrm, a).normalize();
        t1.crossVectors(t2, nrm);
        const tw = rnd() * Math.PI * 2;
        const c = Math.cos(tw);
        const s = Math.sin(tw);
        let occ = 0;
        for (const h of dirs) {
          const x = h.x * c - h.y * s;
          const y = h.x * s + h.y * c;
          d.set(0, 0, 0).addScaledVector(t1, x).addScaledVector(t2, y).addScaledVector(nrm, h.z).normalize();
          ray.origin.copy(p).addScaledVector(nrm, opts.bias);
          ray.direction.copy(d);
          const hit = bvh.raycastFirst(ray, DoubleSide, 0, opts.distance);
          if (hit) {
            const f = hit.distance / opts.distance;
            occ += 1 - f * f;
          }
        }
        rays += dirs.length;
        ao[i] = 1 - occ / dirs.length;
      }
      vertices += pos.count;
      g.setAttribute('_ao', new BufferAttribute(ao, 1));
    });
  }
  return { vertices, rays, ms: performance.now() - t0 };
}
