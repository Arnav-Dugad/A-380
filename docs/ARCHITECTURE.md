# Architecture

```
scripts/build-aircraft.ts   asset pipeline: procedural geometry → glTF Transform → meshopt GLBs (+ LODs, manifest)
scripts/measure.ts          dimension check against published figures

src/aircraft/geometry/      pure TypeScript generators (no DOM), shared by the build script and the app
  layout.ts                 every dimension, with [V]erified / [A]pproximation tags
  fuselage.ts, wing.ts, tail.ts, engine.ts, gear.ts, airframe.ts, lifting.ts, surface.ts
  structure.ts, cabin.ts, cockpit.ts
src/aircraft/               runtime model: GLB loading with progressive LOD, PBR material library,
                            rig (articulated-node index), selection, material director (x-ray / isolate /
                            highlight), exploder, section planes, lazily streamed layers
src/sim/                    deterministic models with unit tests
  systems.ts                aircraft systems state machine — single source of truth
  flight.ts                 6-DOF flight model, atmosphere, ground contact, control law, autopilot
  loop.ts                   fixed 1/120 s accumulator; steps the flight model then the systems
  demos.ts                  demonstrations that operate the aircraft only through system commands
src/animation/              maps systems state onto the rig every frame (no React re-renders)
src/cockpit/displays.ts     canvas renderers for PFD, ND, EWD, SD pages, MFD, OIT, FCU and overhead legends
src/interior/               cockpit and cabin runtimes (control binding, walking, seat picking, lighting)
src/flight/                 flight mode: scenarios, input (keyboard and gamepad), cameras, replay, HUD
src/camera/                 camera director (presets, focus), first-person rig, cinematic tour
src/scene/                  viewport, world and environments, airport, aircraft lights, effects, jacks
src/state/                  zustand stores: UI (persisted preferences) and a throttled systems snapshot
src/ui/                     design system (kit, icons), panels for the seven sections, inspector,
                            diagrams, photo mode, overlays
src/data/                   part catalogue, specification sheet, source registry
src/perf/                   renderer.info probe and stats overlay
src/debug/bridge.ts         automation API (window.__a380) used by the Playwright tests
```

## Key decisions

- **One source of truth.** The 3D animation, the cockpit displays, the systems panel, the
  HUD and the flight model all read the same `systems.state` object. As a result, the gear
  drawn in the 3D view, the WHEEL page and the status strip cannot disagree.
- **No React in the hot path.** Rig updates, the simulation, cameras and the HUD run in
  `useFrame` or `requestAnimationFrame`. React re-renders only when panel state changes.
  Panels read a snapshot throttled to 12 Hz.
- **Fixed-step simulation.** Results do not depend on frame rate. A spiral-of-death guard
  caps the work per frame at 24 steps.
- **Data-driven articulation.** Each moving part carries its hinge axis, travel and limits
  in glTF `extras`. Controllers only call `rig.hinge(name, deg)` and similar methods.
- **Material director.** Isolation, X-ray and highlighting compose into cached material
  variants, so toggling a mode never creates materials on every frame. Section planes are
  shared objects; a disabled plane is moved far away instead of being removed, which avoids
  recompiling shaders.
- **Light count stays constant.** Aircraft lights change intensity rather than visibility,
  so switching a light on or off never recompiles shaders.
- **Floating origin in flight.** The aircraft stays near the render origin and the world
  moves around it, which keeps rendering precise at any distance from the airport.
- **Progressive, lazy loading.**
  1. Low-detail exterior LOD (about 1.05 MB, 375 kB gzipped).
  2. High-detail exterior LOD.
  3. Structure, cabin and cockpit GLBs, fetched only when X-ray, the cabin or the cockpit is
     opened.

- **Panel-aware framing.** Interface panels report the screen area they cover
  (`src/camera/viewInset.ts`). The camera's view offset moves the principal point to the
  centre of the visible area. Presets and focus distances are fitted to that area, so the
  same shots work on a desktop beside a side panel and on a portrait phone above a bottom
  sheet.
- **One input path.** Keyboard, gamepad and on-screen touch controls all write to the same
  flight inputs and system commands.

## Quality presets

| Preset | DPR | Shadows | AO | Post | Geometry |
|---|---|---|---|---|---|
| Ultra | 1–2 | 4096² | N8AO high | Bloom, SMAA, vignette, reflective studio floor | Hi LOD |
| High | 1–1.75 | 2048² | N8AO medium, half res | Bloom, SMAA, vignette, reflective floor | Hi LOD |
| Balanced | 0.85–1.25 | 1024² | — | Bloom, SMAA | Hi LOD |
| Performance | 0.6–1 | Contact shadows only | — | None (renderer tone mapping) | Lo LOD |

The drei `PerformanceMonitor` steps Ultra down to High when the frame rate drops.
