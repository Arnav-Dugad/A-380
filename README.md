# A380 — The Digital Twin

An interactive, educational digital twin of the **Airbus A380-800 (A380-842, Rolls-Royce
Trent 900)** that runs in the browser. You can orbit a detailed model whose proportions
match the published dimensions, and inspect its components with sourced facts. You can also
separate it into assemblies and look through the skin at its structure. The cockpit is
operable, both passenger decks can be walked, and the systems can be driven through
power-up, engine start, gear, flaps and doors. A simplified six-degree-of-freedom flight
model lets you fly it.

> Educational approximation — not certified data, not a training device, not affiliated
> with Airbus. See [docs/ACCURACY.md](docs/ACCURACY.md).

## Sections

| | |
|---|---|
| **Explore** | Hero viewer with camera presets, a cinematic tour, one-click demonstrations (gear swing on jacks, flaps, engine start, doors, lights) and five lighting environments |
| **Anatomy** | Exploded view, X-ray skin, structural skeleton, LD3 cargo, longitudinal and horizontal section planes, system isolation, component browser and inspector |
| **Systems** | Electrical, APU, bleed, hydraulics, engines, gear, brakes, flight controls, doors, lights and ECAM-style alerts, all sharing one deterministic model |
| **Cockpit** | Flight deck with eight live displays (PFD, ND, EWD, seven SD pages, MFD), FCU, OIT and operable levers, knobs and overhead buttons |
| **Cabin** | 469 seats in four classes across two decks, first-person walking with collisions, seat map, *sit here* and *look outside*, lighting presets |
| **Flight** | Ten scenarios from cold & dark to landing, protected or direct control law, autopilot and autothrust, weather and time of day, five cameras, HUD, replay; keyboard and gamepad |
| **Specifications** | Published data, each value marked verified, approximation or unverified, with its source |

## Quick start

```bash
npm ci
npm run dev          # generates the GLBs, then starts Vite on http://localhost:5173
npm test             # unit tests (systems, flight model, geometry)
npm run build        # production build in dist/
npm run test:e2e     # Playwright tests against `vite preview`
```

Node 22 or later is required. All dependencies are free and open source.

## How the aircraft is made

The A380 is generated procedurally from published dimensions and the Airbus three-view in
`src/aircraft/geometry/`:

- **Fuselage:** super-elliptic double-deck lofts.
- **Wings and tail:** airfoil-section lifting surfaces split into their real control
  surfaces.
- **Engines:** lathed Trent 900 nacelles with 24 swept fan blades and translating
  reversers on engines 2 and 3.
- **Landing gear:** 22 wheels, with steering on the nose gear and the body-gear rear axles.
- **Interior:** structure, cabin and cockpit.

`scripts/build-aircraft.ts` exports the geometry as meshopt-compressed glTF in two LODs.
Every moving part is a separate node carrying its hinge axis and limits. See
[docs/ASSETS.md](docs/ASSETS.md) for why no third-party model is redistributed.

## Documentation

- [docs/RESEARCH.md](docs/RESEARCH.md): sources and technical data
- [docs/ACCURACY.md](docs/ACCURACY.md): what is verified, approximated or illustrative
- [docs/ASSETS.md](docs/ASSETS.md): asset evaluation, licensing and credits
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): code structure and design decisions
- [docs/PERFORMANCE.md](docs/PERFORMANCE.md): measured sizes, draw calls and test results
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Cloudflare Pages (free tier)
- [PROJECT_STATUS.md](PROJECT_STATUS.md): implementation checklist and known limitations

## Keyboard

| Key | Action |
|---|---|
| `1`–`7` | Switch section |
| `H` | Home view |
| `F` | Frame the selection |
| `X` | Toggle X-ray |
| `E` | Toggle exploded view |
| `G` | Gear lever |
| `[` / `]` | Flap lever up / down |
| `L` | Exterior lights |
| `C` | Cinematic tour |
| `P` | Photo mode |
| `?` | Help |
| `Esc` | Clear selection or exit the current mode |

In flight mode:

| Key | Action |
|---|---|
| `W` / `S` | Pitch |
| `A` / `D` | Roll |
| `Q` / `E` | Yaw |
| `Shift` / `Ctrl` | Thrust up / down |
| `B` | Brakes |
| `K` | Parking brake |
| `G` | Gear |
| `F` / `V` | Flaps down / up |
| `/` | Speed brake |
| `T` | Reverse thrust |
| `U` | Autopilot |
| `J` | Autothrust |
| `C` | Change camera |
| `Space` | Pause |

## Licence

The code and the generated 3D assets are licensed under MIT; see [LICENSE](LICENSE).
Fonts are under the SIL OFL. Trademarks belong to their owners.
