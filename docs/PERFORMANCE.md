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
| App JavaScript (React, three.js, R3F, drei, postprocessing, app code) | 1.95 MB | 622 kB |
| CSS | 55 kB | 11 kB |
| Fonts (Inter, JetBrains Mono; Latin subsets load first) | 88 kB (Latin) | — (woff2) |
| Exterior, low LOD (airframe, wings, empennage, engines, gear) | 1.05 MB | 375 kB |
| Exterior, high LOD | 1.49 MB | 517 kB |
| Structure (lazy, X-ray) | 132 kB | 35 kB |
| Cabin (lazy) | 228 kB | 43 kB |
| Flight deck (lazy) | 186 kB | 61 kB |
| **Whole site** (`dist/`) | 5.3 MB | — |

The app becomes interactive once the low LOD has loaded. The high LOD then streams in and
replaces it. The cabin, flight-deck and structure files are fetched only when those views
are first opened.

Time from navigation to "aircraft ready" on the local preview server was **2.2–4.1 s**. That
measurement includes SwiftShader shader compilation; network time over localhost is
negligible.

## Geometry budget

| Asset | Triangles (hi / lo) | Meshes |
|---|---|---|
| Airframe (fuselage, glazing, doors, fairings, details) | 133,268 / 88,020 | 47 |
| Wings and moving surfaces | 41,600 / 28,176 | 84 |
| Empennage | 10,646 / 6,854 | 16 |
| Engines | 75,648 / 24,864 | 38 |
| Landing gear | 73,072 / 46,760 | 101 |
| Structure | 12,678 | 6 |
| Cabin (469 instanced seats) | 93,996 | 24 |
| Flight deck | 23,712 | 91 |

## Renderer statistics per view

All views are at 1920 × 1080. Every value is per frame and summed over all render passes.

| View | Draw calls | Triangles | Geometries | Textures | Programs |
|---|---|---|---|---|---|
| Explore · studio · **High** | 899 | 993k | 218 | 48 | 28 |
| Explore · studio · **Balanced** | 594 | 657k | 404 | 41 | 39 |
| Explore · studio · **Performance** | 294 | 197k | 403 | 17 | 33 |
| Explore · airport (apron) · High | 628 | 665k | 417 | 59 | 46 |
| Anatomy · X-ray with structure | 1,024 | 1.22M | 447 | 59 | 69 |
| Cockpit (first person) | 413 | 355k | 481 | 59 | 84 |
| Cabin (first person) | 479 | 590k | 481 | 59 | 88 |
| Flight · chase camera | 633 | 667k | 484 | 73 | 90 |

The geometry and program counts accumulate during a session because each lazy layer stays
cached after its first use. High uses fewer programs than the lighter presets only because it
was measured first.

Each preset does the following:

- **Ultra and High.** Shadow-map pass, reflective studio floor (one extra scene render), N8AO,
  bloom, SMAA and vignette.
- **Balanced.** Shadow map plus the main pass; bloom and SMAA; no ambient occlusion.
- **Performance.** Low LOD, no shadow maps, a contact shadow rendered once, no
  post-processing, device pixel ratio 0.6–1.

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
| `npx playwright test`: 14 desktop tests and 1 mobile (Pixel 7, touch) test against the production build | **15 / 15 passed** (12.2 min under SwiftShader) |

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
- the mobile layout: bottom navigation, section switching by tap, a touch tap on the canvas and no horizontal overflow.
