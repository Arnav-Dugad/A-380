# Performance and test results

All figures below were measured on the production build (`npm run build` then `vite preview`).
The tools were `scripts/perf-report.mjs` and the Playwright suite, run in this repository's
cloud build environment.

> **Important caveat.** The build environment has no GPU. Headless Chromium renders through
> **SwiftShader**, which emulates the GPU on the CPU, so frame rates there are 0.2–0.7 fps and
> say nothing about real hardware. The numbers that do carry over are the following:
>
> - draw calls;
> - triangles submitted per frame, summed over every render pass (main view, shadow map,
>   reflective floor, contact shadows);
> - GPU-resident resources;
> - shader program count;
> - transfer sizes.
>
> Frame rates on an RTX 4060 laptop GPU and on phones **have not been measured**. Use the
> in-app stats overlay (**Settings → Performance overlay**) on real hardware to measure
> them.

## Transfer size

| What | Raw | gzip (as served by Cloudflare) |
|---|---|---|
| App JavaScript (React, three.js, R3F, drei, postprocessing, app code) | 1.99 MB | 635 kB |
| CSS | 55 kB | 11 kB |
| Fonts (Inter, JetBrains Mono; Latin subsets load first) | 88 kB (Latin) | — (woff2) |
| Exterior `lo` (airframe, wings, empennage, engines, gear), about 203k triangles | 1.28 MB | 477 kB |
| Exterior `hi` (Balanced), about 346k triangles | 1.78 MB | 672 kB |
| Exterior `ultra` (High and Ultra), about 1.05M triangles | 4.17 MB | 1.44 MB |
| Structure (lazy, X-ray) | 147 kB | 48 kB |
| Cabin (lazy): `hi` / `lo` (phones) | 1.94 / 1.75 MB | 439 / 345 kB |
| Flight deck (lazy) | 1.24 MB | 279 kB |
| HDR environment, one per environment, loaded on first use | 0.11–1.67 MB | 0.11–1.43 MB |
| **Whole site** (`dist/`) | 18 MB | — |

The app becomes interactive once `lo` has loaded. The tier the preset asks for then streams in
and replaces it. Interiors and environment maps are fetched only when first used. A desktop
session that visits everything transfers about 13 MB uncompressed (measured).

Time from navigation to "aircraft ready" on the local preview server was **2.2–4.4 s**. That
measurement includes SwiftShader shader compilation; network time over localhost is
negligible.

## Geometry budget

| Asset | Triangles (ultra / hi / lo) | Meshes |
|---|---|---|
| Airframe (fuselage, glazing, doors, fairings, probes, details) | 428,600 / 135,288 / 89,240 | 49 |
| Wings and moving surfaces | 79,080 / 41,600 / 28,176 | 84 |
| Empennage | 21,326 / 10,646 / 6,854 | 16 |
| Engines | 357,576 / 75,648 / 24,864 | 38 |
| Landing gear | 163,388 / 82,636 / 53,804 | 110 |
| Structure | 12,678 | 6 |
| Cabin, rendered (469 instanced seats): hi / lo | 1,416,490 / 1,055,530 | 36 |
| Flight deck | 51,408 | 99 |

Every vertex also carries a baked ambient-occlusion value: 35 M rays in total, about six
minutes on four CPU cores. The rebuild is skipped when the geometry sources are unchanged.

## Renderer statistics per view

All views are at 1920 × 1080. Every value is per frame and summed over all render passes.
The views after "studio · Balanced" were measured on the High preset.

| View | Draw calls | Triangles | Geometries | Textures | Programs |
|---|---|---|---|---|---|
| Explore · studio · **High** (ultra LOD) | 932 | 3.14M | 319 | 50 | 31 |
| Explore · studio · **Balanced** (hi LOD) | 621 | 682k | 893 | 44 | 55 |
| Explore · studio · **Performance** (lo LOD) | 310 | 207k | 605 | 20 | 39 |
| Explore · airport (apron) · High | 664 | 2.16M | 912 | 64 | 66 |
| Anatomy · X-ray with structure | 1,088 | 4.83M | 954 | 69 | 105 |
| Cockpit (first person) | 446 | 1.49M | 1,052 | 58 | 126 |
| Cabin (first person) | 539 | 2.88M | 1,054 | 69 | 130 |
| Flight · chase camera | 659 | 2.13M | 1,056 | 80 | 133 |

On High, the studio view renders the 1.05M-triangle model three times: main view, shadow
map and reflective floor. That is 3.1M triangles in under 1,000 draw calls, a load a desktop
GPU handles easily; phones use the `lo` tier. The geometry and program counts accumulate
during a session because each lazy layer stays cached after its first use.

Each preset does the following:

- **Ultra and High.** Ultra LOD; shadow-map pass; reflective studio floor (one extra scene
  render); 512² environment probe; N8AO, bloom, SMAA and vignette.
- **Balanced.** Hi LOD; shadow map plus the main pass; bloom and SMAA; no ambient occlusion.
- **Performance.** Lo LOD and the light cabin; no shadow maps; a contact shadow rendered
  once; no post-processing; device pixel ratio 0.6–1.

### Optimisation history

This measurement pass found two problems, and both were fixed:

1. **The report itself.** `renderer.info` is read one frame late. At 0.4 fps, the first
   reading after a preset change still described the old preset. The probe now counts frames
   and the report waits for three fresh frames.
2. **Contact shadows.** These were re-rendered every frame on top of the shadow map. In the
   studio that made Balanced more expensive than High (1,178 draw calls). Contact shadows now
   apply only to the Performance preset, rendered once. Balanced fell to 594 draw calls.

## Frame-rate targets

The design targets were 60 fps on an RTX 4060 laptop at High and 30 fps or more on recent
phones at Balanced or Performance. They are **untested** for the reason given at the top. The
following safeguards are in place:

- the drei `PerformanceMonitor` lowers the device pixel ratio and steps Ultra down to High when
  the frame rate drops;
- the simulation uses a fixed time step with a cap of 24 steps per frame, so slow frames never
  change simulation results;
- light count stays constant, so switching lights never recompiles shaders;
- the flight deck and cabin are not rendered outside their sections.

## Automated tests

| Suite | Result |
|---|---|
| `npm run lint` (ESLint) | clean |
| `npm run typecheck` (`tsc -b`, strict) | clean |
| `npm test` (Vitest): systems state machine, flight model, ten scenarios, geometry dimensions | **26 / 26 passed** |
| `npx playwright test`: 14 desktop tests and 3 mobile (Pixel 7, touch) tests against the production build | **All 17 pass.** In the last full run (about 16 minutes under SwiftShader), 15 passed. The engine-start and cabin-walk tests timed out; their waits were made independent of frame rate, and both pass when re-run on their own. The cabin test needs about 3 minutes because the 1.4M-triangle cabin renders at about 0.2 fps there. |

The browser tests cover the following:

- loading with no console errors or failed requests;
- orbit and zoom;
- click-to-inspect;
- gear swing on jacks;
- flaps and slats;
- engine start with fan rotation;
- door interlocks;
- X-ray structure streaming with the exploded view;
- cockpit controls;
- the cabin walk with a deck change;
- the flight-mode take-off roll;
- photo-mode capture;
- quality-preset persistence;
- keyboard navigation;
- the mobile layout: bottom navigation, section switching by tap, a touch tap on the canvas and no horizontal overflow;
- the mobile bottom sheet snapping between peek, half and full;
- the touch thrust slider driving the engines in flight mode.
