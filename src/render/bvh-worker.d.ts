declare module 'three-mesh-bvh/src/workers/GenerateMeshBVHWorker.js' {
  export class GenerateMeshBVHWorker {
    constructor();
    generate(geometry: import('three').BufferGeometry, options?: object): Promise<unknown>;
    dispose(): void;
  }
}
