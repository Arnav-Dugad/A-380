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
- ✅ Camera collision avoidance:
  - the orbit camera stays above the ground and cannot pass through the fuselage, wing,
    tail or nacelle skins (switched off in X-ray, section and exploded views, where looking
    inside is the point);
  - the first-person camera collides with cabin geometry.

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
  Per-frame draw calls in the studio are 899 at High, 594 at Balanced and 294 at
  Performance. Full results are in [docs/PERFORMANCE.md](docs/PERFORMANCE.md).
- ✅ Photo mode: hides the UI, controls field of view and exposure, rule-of-thirds grid,
  1–3× PNG capture capped at 8,192 px.
- ✅ Optional synthesised audio (off by default).
- ✅ Accessibility:
  - keyboard shortcuts;
  - ARIA roles on navigation, dialogs, switches, radios and sliders;
  - reduced-motion support;
  - keyboard-accessible equivalents of the 3D cockpit controls.
- ✅ Unit tests (Vitest): systems, flight model, scenarios, geometry.
- ✅ Browser tests (Playwright) of the real rendered app: 14 desktop tests and 3 mobile
  tests (Pixel 7, touch). Details are in [docs/PERFORMANCE.md](docs/PERFORMANCE.md).
- ✅ Cloudflare configuration for Workers static assets (`wrangler.toml`, `_headers`), on the
  free tier. It works with Workers Builds (the dashboard's Git integration), with Wrangler and
  with the GitHub Actions workflow.
- ⏳ **Live deployment is pending.** The first dashboard build succeeded, but the upload step
  failed because the configuration targeted Pages. The configuration now targets Workers
  static assets. This build environment cannot reach `api.cloudflare.com`, so it cannot
  deploy directly. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Mobile and polish

- ✅ Three layouts:
  - **desktop:** side panels;
  - **portrait phone:** draggable bottom sheet with peek, half and full snaps;
  - **landscape phone:** collapsible side panel.
- ✅ Panel-aware framing. The camera's principal point is shifted to the centre of the
  visible area, and presets and focus distances are fitted to it. The view glides when a
  panel opens or is dragged.
- ✅ Touch controls:
  - cabin walking joystick;
  - flight side-stick, thrust slider and quick actions;
  - pinch-to-zoom in first person.

  The flight controls feed the same input path as the keyboard and gamepad. The HUD has a
  compact layout for phones.
- ✅ Inspector, settings and help appear as sheets on phones; help shows touch gestures on
  touch devices.
- ✅ Wider field of view on portrait screens in the cockpit and cabin.
- ✅ Polish:
  - hover labels on parts;
  - headline figures in Explore;
  - reworked loading screen;
  - device-appropriate default graphics preset;
  - web app manifest, home-screen icons and a share preview image.

## Fidelity upgrade

- ✅ Three exterior LODs. `ultra` (about 1.05 M triangles) is used on High and Ultra, `hi` on
  Balanced and `lo` on Performance and phones.
- ✅ Ray-traced per-vertex ambient occlusion baked into every GLB and applied to indirect light.
- ✅ Image-based lighting from CC0 HDR panoramas, aligned with the sun, for the airport,
  golden-hour, night, hangar and interior views.
- ✅ Physically based materials:
  - clear-coated paint with panel tone variation, grime and APU soot;
  - polished inlet lips;
  - anisotropic fan, hub and galley metals;
  - light-grey painted landing gear with chrome sliders;
  - rubber with sheen;
  - reflective glazing.
- ✅ Landing gear detail:
  - collars and gland nuts;
  - scissor torque links with lugs and pins;
  - hydraulic and brake lines;
  - folding side braces;
  - tapered bogie beams with pitch trimmers.
- ✅ Exterior details: pitot probes, angle-of-attack vanes, temperature probes, a SATCOM
  radome and air-conditioning pack inlets.
- ✅ Cabin:
  - upholstered seats with dished backs, headrest wings and tubular frames;
  - a seat-back entertainment screen in every seat;
  - leather first-class suites;
  - window reveals with shades at varied heights;
  - curved overhead bins with door seams and latches;
  - passenger service units with reading lights, and cove lighting.
- ✅ Flight deck:
  - contoured crew seats on rails;
  - a populated overhead switch field;
  - EFIS knobs and an autopilot control panel body;
  - keyboard and cursor-control units with keys and trackballs;
  - shaped side-stick grips.
- ✅ Ground support equipment:
  - belt loaders;
  - a baggage train with LD3 containers;
  - a catering truck raised to the main deck;
  - a fuel tanker, pushback tug and ground power unit with its cable.
- ✅ A seamless polished-epoxy studio floor.
- 🟡 Photorealism has limits. Geometry is procedural, and the livery and textures are drawn
  on canvas rather than scanned or photographed. There are no ray-traced reflections, and
  global illumination is approximated by HDR lighting, baked AO and N8AO.

## Known limitations

- Several geometric details are approximations because Airbus drawings are proprietary or
  were unreachable: engine positions, gear and door stations, airfoil. The inboard nacelle
  ground clearance (about 0.9 m in the model) is probably lower than the real aircraft's.
- FPS was measured only under headless software rendering (SwiftShader), which does not
  represent a real GPU. Draw calls, triangle counts and transfer sizes are the meaningful
  numbers; RTX 4060 laptop and mobile frame rates have not been measured.
- No real-world weather or map data, by design: everything works offline once loaded.
