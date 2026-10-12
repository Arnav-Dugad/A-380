# 3D assets, licensing and attribution

## Decision

**The aircraft, cabin, flight deck, structure and airport are original, procedurally
generated geometry.** It is all written in TypeScript for this project
(`src/aircraft/geometry/*`, `src/scene/airport/*`) and exported to optimised glTF by
`scripts/build-aircraft.ts`. No third-party 3D model is redistributed, so the project's own
licence (MIT) covers all of it.

### Why not a downloaded model?

| Candidate | Licence (as listed) | Assessment |
|---|---|---|
| Sketchfab "Airbus A380" by KOG_THORNS (`2370a0ad…`), about 642k triangles | CC BY (version unverified) | Download needs a signed-in Sketchfab account, and sketchfab.com was unreachable from the build environment. The node hierarchy (separate control surfaces and gear) could not be inspected. |
| Sketchfab "Airbus A380 Model (Free)" by AirBuilds (`705b26ed…`), about 463k triangles | CC BY (version unverified) | Same access problem. Very high triangle count for the web. |
| Sketchfab "Airbus A380 (full interior hd)" by Raakesh.Madan (`3155062b…`) | CC BY according to one search summary only | Licence **unverified**; not usable until it is confirmed. |
| FlightGear `FGMEMBERS/A380` | GPL | Cloned and inspected. The exterior mesh is low-poly (about 6.8k surfaces for the fuselage and gear, dating from 2007–2010). Using it would make the asset GPL-licensed. Its JSBSim metrics served only as a cross-check of published numbers. |
| FlyByWire A380X | Code GPL-3.0; original 3D assets CC BY-NC 4.0 (per README summary) | The non-commercial licence and the MSFS format are unsuitable. Used as a reference for display page names only. |
| FlyByWire / MSFS / X-Plane payware models | Proprietary | Not used. Access controls were not bypassed. |

Building the aircraft procedurally from published dimensions has several advantages:

- Every moving part is a real, separately articulated node with a hinge axis: 12 slats and
  droop-nose devices, 6 flaps, 6 ailerons, 16 spoilers, 4 elevators, 2 rudders, gear legs,
  bogies, 22 wheels, doors, reversers and fans.
- Dimensions match the published values (see [ACCURACY.md](ACCURACY.md)).
- Every file is small: the largest GLB is under 700 kB.

## Optional: comparing with a CC BY reference model

To compare the procedural model against a licensed scan or artist model:

1. Sign in at sketchfab.com and open
   <https://sketchfab.com/3d-models/airbus-a380-model-free-705b26ed9bb1418294d03706083dec7f>.
   Alternatively, use
   <https://sketchfab.com/3d-models/airbus-a380-2370a0adb0a140fe962972effcd08cbb>.
2. Check the licence shown on the page (it must be CC BY), then choose **Download → glTF**.
3. Convert it to GLB and place it at `public/models/external/a380-reference.glb`. To keep it
   small, run
   `npx @gltf-transform/cli optimize in.glb public/models/external/a380-reference.glb --compress meshopt`.
4. Add the attribution string shown on the Sketchfab page to the **Credits** section below.
   Example: *"Airbus A380 Model (Free)" by AirBuilds, licensed under CC BY 4.0, modified
   (scaled and recompressed).*

This file is **not** included in the repository. The articulated, interactive model stays
the procedural one.

## Textures, fonts and other media

All of these are original or open-licensed:

- **HDR environment maps (image-based lighting), all CC0 from Poly Haven.** They light and
  reflect on the aircraft in the airport, golden-hour, night, hangar and interior views.
  They are copied from redistributions that the build environment could reach:
  - `blouberg_sunrise_2_1k.hdr` and `moonless_golf_1k.hdr` come from the three.js examples
    (`examples/textures/equirectangular`, MIT repository, CC0 assets);
  - `sky.exr` and `warehouse.exr` come from the `@pmndrs/assets` package (CC0).
- **Upholstery weave, leather grain, carpet and seat-back screen textures, and livery
  weathering.** Generated at runtime on HTML canvas; original work.

- **Livery, panel lines, runway asphalt, concrete, grass, clouds, display canvases.**
  Generated at runtime on HTML canvas; original work.
- **Fonts.** *Inter* (SIL Open Font License 1.1) and *JetBrains Mono* (SIL OFL 1.1), served
  locally from the `@fontsource-variable` packages.
- **Sky.** Preetham analytic sky model from `three.js` / `@react-three/drei` (MIT).
- **Sound.** Synthesised at runtime with the Web Audio API. No audio files are used.

## Trademarks

"Airbus" and "A380" are trademarks of Airbus; "Rolls-Royce" and "Trent" are trademarks of
Rolls-Royce plc. They are used nominatively to identify the aircraft type being studied.
The model carries no manufacturer or airline branding, and the project is not affiliated
with or endorsed by these companies.

## Credits

- Published A380 data: Airbus (Facts & Figures, Aircraft Characteristics) and EASA (TCDS
  E.012). Full list in [RESEARCH.md](RESEARCH.md).
- Cabin class totals: British Airways' published A380 fleet facts.
- Open-source software: three.js, React Three Fiber, drei, postprocessing, zustand, React,
  Vite, Tailwind CSS, glTF Transform, meshoptimizer, three-mesh-bvh, three-gpu-pathtracer,
  Playwright, Vitest. All are MIT or Apache-2.0 licensed.
- Reference photographs supplied by the project owner (exterior views, an A380 flight-deck
  overhead at night, and a contemporary A380 cabin) guided proportions, materials and
  colours. They are not redistributed and no airline branding was copied: titles, emblems
  and registrations on the model are fictional.
