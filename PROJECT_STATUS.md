# Project status

Legend: ✅ implemented and tested · 🟡 implemented, simplified (see notes) · ⏳ not done / blocked

## Phase 1: research, licensing, architecture, viewer

- ✅ Technical research with sources, in [docs/RESEARCH.md](docs/RESEARCH.md). Web access was
  limited, so figures are taken from search summaries and each one is marked.
- ✅ Asset licensing evaluation and decision, in [docs/ASSETS.md](docs/ASSETS.md).
- ✅ Repository structure; strict TypeScript, ESLint, Vitest and Playwright.
- ✅ Aircraft viewer with the premium UI: seven sections, loading screen and cinematic intro.

## Phase 2: model, materials, camera, lighting, selection

- ✅ Procedural A380 that matches the published length, span, height and wing area to within
  0.2 %. Covered by a unit test.
- ✅ Two LODs, meshopt-compressed GLBs, progressive loading.
- ✅ PBR material library:
  - clear-coated paint with a procedural livery, panel-line bump map and roughness variation;
  - metals, rubber, glazing, cabin and cockpit materials.
- ✅ Five lighting environments: studio, apron, golden hour, blue-hour hangar, night
  inspection.
- ✅ Camera:
  - orbit, zoom and pan;
  - eleven presets;
  - smooth focus on a selected component;
  - first-person camera for the cabin and cockpit;
  - cinematic tour.
- ✅ Hover highlight, raycast selection (BVH-accelerated) and an inspector with sourced
  facts and live diagrams.
- 🟡 Camera collision avoidance. The orbit is limited to above the ground plane and the
  first-person camera collides with cabin geometry. There is no general obstacle
  avoidance in orbit mode.

## Phase 3: mechanisms and animation

- ✅ Landing gear:
  - door → gear → door sequence;
  - inboard-folding wing gear and aft-retracting body gear with bogie counter-rotation;
  - forward-retracting nose gear;
  - steering on the nose gear and body-gear rear axles;
  - wheel rotation;
  - gravity extension;
  - swing test on maintenance jacks.
- ✅ High lift: slats and droop-nose devices on offset hinges, Fowler flaps
  (translation plus rotation), CONF 1 / 1+F logic.
- ✅ Ailerons, roll and ground spoilers, elevators, two rudder panels.
- ✅ Engines: start and shutdown sequences, spool dynamics, fan rotation, translating
  reversers on engines 2 and 3.
- ✅ Doors: 16 passenger plug doors with slide arming, 3 cargo doors, interlocks.
- ✅ Exterior lighting (navigation, strobe, beacon, landing, taxi, logo, wing) and cabin
  lighting presets.

## Phase 4: exploded view, X-ray, cutaway

- ✅ Hierarchical two-stage exploded view, per assembly group, reversible and
  slider-driven.
- ✅ X-ray skin opacity; structural skeleton (frames, stringers, floors and beams,
  bulkheads, wing and tail spars and ribs); LD3 cargo; cabin layer.
- ✅ Longitudinal and horizontal section planes, isolation of each system layer.
- 🟡 Section caps. Cut surfaces show the inner skin rather than solid caps.

## Phase 5: cabin, cockpit, tours

- ✅ Two-deck cabin with 469 instanced seats (14/97/55/303), staircases, galleys,
  lavatories, bins, window reveals.
- ✅ Walking with collisions, deck change, seat map and seat picking, *sit here* and
  *look outside*.
- 🟡 Seat models are low-poly assemblies, not detailed upholstery.
- ✅ Flight deck:
  - eight live displays (PFD, ND, EWD, SD pages, MFD), OIT and FCU;
  - thrust levers, engine masters, mode selector, flaps, speed brake, gear, autobrake and
    parking brake;
  - 15 operable overhead buttons with annunciators;
  - side-stick input and flood lighting.
- 🟡 Display formats are inspired by Airbus conventions; this is not certified symbology or
  logic.
- ✅ Cinematic tour of nine shots with letterbox captions, including an interior beat and
  a golden-hour shot.

## Phase 6: flight, airport, weather

- ✅ Six-degree-of-freedom flight model:
  - ISA atmosphere, thrust lapse, ground effect, stall;
  - gear contact with steering and brakes, autobrake;
  - protected or direct control law, autopilot and autothrust;
  - fixed 120 Hz step, deterministic;
  - unit-tested take-off, cruise, turn, stall and all airborne scenarios.
- ✅ Ten scenarios, keyboard and Gamepad API input, HUD, five cameras (chase, cockpit, wing,
  tower, fly-by), replay of the last three minutes, pause and reset, crash and tail-strike
  detection.
- ✅ Fictional DTX airport:
  - runway with geometric markings, taxiways and apron;
  - stand with three boarding bridges, terminal and tower;
  - ground support equipment, airfield lighting and a windsock.
- ✅ Sky (Preetham) with sun from the time of day, haze, fog, stars, a cloud layer, rain;
  presets for clear, overcast, light rain, heavy rain, fog and windy. Wind and turbulence
  feed the flight model.
- 🟡 Ground support equipment is simple geometry; terrain is a flat textured plane.
- ⏳ JSBSim through WebAssembly. Evaluated: `@0x62/jsbsim-wasm` is early-stage, and the only
  A380 configuration (FlightGear) is GPL. A documented custom model was used instead (see
  [docs/RESEARCH.md](docs/RESEARCH.md)).

## Phase 7: performance, polish, tests, deployment

- ✅ Quality presets (Ultra, High, Balanced, Performance) with adaptive DPR, shadow and AO
  scaling, and LOD.
- ✅ Constant light count, shared materials and geometry, lazy layers, floating origin.
- ✅ Performance overlay (FPS, draw calls, triangles, resources) and a measurement script.
  Results are in [docs/PERFORMANCE.md](docs/PERFORMANCE.md).
- ✅ Photo mode: hides the UI, controls field of view and exposure, rule-of-thirds grid,
  1–3× PNG capture capped at 8,192 px.
- ✅ Optional synthesised audio (off by default).
- ✅ Accessibility:
  - keyboard shortcuts;
  - ARIA roles on navigation, dialogs, switches, radios and sliders;
  - reduced-motion support;
  - keyboard-accessible equivalents of the 3D cockpit controls.
- ✅ Unit tests (Vitest): systems, flight model, scenarios, geometry.
- ✅ Browser tests (Playwright) of the real rendered app. Desktop and mobile results are in
  [docs/PERFORMANCE.md](docs/PERFORMANCE.md).
- ✅ Cloudflare Pages configuration (`wrangler.toml`, `_headers`) and a GitHub Actions
  CI/deploy workflow.
- ⏳ **Live Cloudflare deployment is blocked.** The build environment's network policy
  denies `api.cloudflare.com` and the `wrangler login` OAuth flow. See
  [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the commands that deploy it from your
  machine or from CI.

## Known limitations

- Several geometric details are approximations because Airbus drawings are proprietary or
  were unreachable: engine positions, gear and door stations, airfoil. The inboard nacelle
  ground clearance (about 0.9 m in the model) is probably lower than the real aircraft's.
- FPS was measured only under headless software rendering (SwiftShader), which does not
  represent a real GPU. Draw calls, triangle counts and transfer sizes are the meaningful
  numbers; RTX 4060 laptop and mobile frame rates have not been measured.
- No real-world weather or map data, by design: everything works offline once loaded.
