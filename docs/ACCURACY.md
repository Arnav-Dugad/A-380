# Accuracy statement

A380 — The Digital Twin is an **educational approximation**. It is not certified data, not a
flight-training device and not an engineering reference. It is not affiliated with or
endorsed by Airbus, Rolls-Royce or any airline. The livery, the airport (DTX) and the flight
plan are fictional.

This document sorts every part of the model into one of three categories:

- **Verified** — published figures with a source, listed in [RESEARCH.md](RESEARCH.md).
- **Approximation** — engineering estimates for things that are not public, chosen so that
  the model looks right and behaves plausibly.
- **Illustrative** — representative content that does not claim to show any real aircraft.

The in-app inspector and the specifications page show the same categories as coloured
badges: *Verified*, *Approximation* and *Unverified*.

## 1. Geometry

### Measured against published dimensions

These values come from `npx tsx scripts/measure.ts`, which builds the generated geometry and
measures it.

| Quantity | Published | Model | Status |
|---|---|---|---|
| Overall length | 72.72 m | 72.77 m | Verified target. The extra 5 cm is the APU nozzle lip. |
| Wing span | 79.75 m | 79.74 m | Verified target |
| Overall height (on gear) | 24.09 m | 24.08 m | Verified target |
| Wing reference area | 845 m² | 843 m² (trapezoidal integration including the body-carried portion) | Verified target |
| Quarter-chord sweep | 33.5° | ≈ 33° | Verified target; planform approximated |
| Fuselage width | 7.14 m | 7.14 m | Verified |
| Fuselage height | ≈ 8.4 m | 8.41 m | Approximation |
| Wheelbase / wheel track | 31.9 m / 14.3 m | 30.4–33.6 m (nose to wing and body gears) / 14.30 m | Verified target |
| Horizontal stabiliser span | 30.4 m | 30.4 m | Verified |
| Fan diameter | 2.95 m | 2.95 m | Verified |

### Approximations

- **Cross-section and side profiles.** Super-elliptic sections with monotone spline profiles
  for the nose, crown, keel and tail cone. They are tuned visually against the Airbus
  three-view; frame-by-frame geometry is not public.
- **Wing.** Planform, kink position, dihedral (6°), incidence and washout are estimated. The
  airfoil is a NACA-style thickness distribution (13.5 % at the root, 8.2 % at the tip) with
  an aft-loaded camber line. It is not the A380 section.
- **Control-surface spans and chord fractions.** Approximated. The surface **counts** are
  verified: per wing, 2 droop-nose devices, 6 slats, 3 flaps, 3 ailerons and 8 spoilers;
  4 elevators; 2 rudder panels.
- **Engine position and nacelle lines.** Spanwise stations, nacelle profiles and pylons are
  scaled from the three-view. The inboard nacelle's ground clearance in the model is about
  0.9 m. The real value is in the Airbus AC (section 2), which could not be read for this
  project.
- **Door stations, window pitch and window size.** Representative.
- **Landing-gear geometry.** Representative. Wheel count and arrangement are verified (22
  wheels: 2 nose, 2 × 4 wing, 2 × 6 body), as is the steerable rear axle of the body gears.
- **Retraction directions.** Body gears retract aft (cited). Wing gears folding inboard and
  the nose gear retracting forward are commonly described but **unverified** from a primary
  source.
- **Primary structure** (X-ray view: frames, stringers, floors, spars, ribs, bulkheads).
  Typical transport-aircraft layout. Frames are drawn at every third frame bay for
  legibility.

### Photograph overlay check (October 2026)

A near-orthographic side silhouette of the model (6° lens from 700 m) was overlaid on a
side-view photograph of an A380 scaled to the same nose-to-tail length. Nose profile, crown
hump, upper-deck taper, belly fairing, nacelles, nose-gear station and tail-cone upsweep
agree to within a few pixels (roughly 0.2–0.3 m). The fin tip sat about 1.2 m too far
forward; its leading-edge tip station moved from 66.4 m to 67.6 m (quarter-chord sweep about
37°), keeping the tip trailing edge inside the published 72.72 m overall length. The
photograph has some perspective, so this is a visual check, not a measurement. The
in-app **Reference image** tool repeats the comparison with any image.

### Illustrative

- The livery: a fictional "Digital Twin" scheme.
- Antenna positions.
- The flight-deck layout. The eight displays (2 PFD, 2 ND, EWD, SD, 2 MFD) at 150 × 200 mm
  are verified; their placement is approximate.
- Cabin monuments: galleys, lavatories, staircases and partitions.

## 2. Cabin configuration

The cabin uses a representative four-class, 469-seat layout. Its class totals match
British Airways' published A380 figures: **14 First, 97 Club, 55 Premium Economy, 303
Economy**, with economy seated 3-4-3 on the main deck and 2-4-2 on the upper deck. The split
of seats between decks, seat pitch, row positions and monument positions are
**illustrative**; BA's exact per-deck split is unverified. A380 cabins differ widely between
operators, and this is not a universal A380 layout.

## 3. Systems model (`src/sim/systems.ts`)

A deterministic model, simplified for education:

| System | What is represented | Simplifications |
|---|---|---|
| Electrical | Battery, external power, APU generator, four engine generators, AC/DC availability | No bus topology, no load shedding |
| APU | Master, start sequence (~45 s), bleed, EGT | Single-parameter start curve |
| Engines | Ignition-mode selector, masters, starter → fuel → light-off → idle; N1/N2/EGT/fuel flow; spool lag | Not a thermodynamic model. Idle N1 of 20 % and N2 of 62 % are illustrative |
| Hydraulics | Green (engines 1 & 2) and Yellow (engines 3 & 4) at 5,000 psi, electric pumps on the ground; EHA/EBHA backup lets surfaces move with AC power | No accumulators, no priority valves |
| Landing gear | Lever with weight-on-wheels interlock, door → gear → door sequence, gravity extension, maintenance-jack swing test | Timings approximate |
| High lift | Lever detents 0/1/2/3/FULL with CONF 1 vs 1+F logic; slat/flap targets 0/20/20/20/23/23 and 0/0/8/17/26/32° | Angles come from **secondary sources** (unverified); rates approximate |
| Spoilers | Speed brake, ground-spoiler arming and deployment, roll assistance | Panel scheduling simplified |
| Doors | 16 passenger doors with slide arming, 3 cargo doors; interlocks for flight, movement, arming and power | Plug-door kinematics simplified to two phases |
| Lights and brakes | All exterior lights, cabin lighting presets, parking brake, autobrake modes, brake temperature | Brake energy model is qualitative |
| ECAM | Warnings, cautions and memos for common configuration errors | A small educational subset, not Airbus logic |

## 4. Flight model (`src/sim/flight.ts`)

- **Model.** Rigid-body six-degree-of-freedom dynamics with diagonal inertia, integrated
  with semi-implicit Euler at a fixed 1/120 s step. It is deterministic: turbulence uses a
  seeded PRNG.
- **Atmosphere.** International Standard Atmosphere, troposphere and lower stratosphere.
- **Aerodynamics.** Textbook transport-aircraft coefficients, not A380 wind-tunnel data. They
  cover:
  - the lift-curve slope and a smooth stall break;
  - lift and drag increments for each high-lift configuration;
  - ground effect;
  - induced drag, wave drag above Mach 0.86, and gear and spoiler drag;
  - control derivatives and damping derivatives.

  The values are tuned so that take-off, approach and cruise conditions fall in realistic
  ranges. At 480 t in CONF 1+F with TOGA thrust, the model rotates at about 150 kt and lifts
  off at about 164 kt after roughly 1,800 m. VREF at maximum landing weight in CONF FULL is
  about 131 kt.
- **Thrust.** 4 × 341 kN at sea level (Trent 972-84 rating, verified), with an approximate
  density and Mach lapse.
- **Ground.** A spring-damper model at each of the five gear legs, with rolling, braking and
  cornering friction and nose-wheel steering. The ground is flat everywhere.
- **Control law.** A simplified, Airbus-inspired "normal law":
  - in the air, the side-stick commands pitch rate and a neutral stick holds the flight-path
    angle;
  - roll is rate-commanded, with bank held up to 33° and limited to 67°;
  - pitch attitude is limited to +30/−15°, with angle-of-attack protection;
  - a yaw damper and turn coordination are included;
  - on the ground, pitch is rate-commanded for rotation.

  **Direct law** removes the protections, so the aircraft can be stalled. Neither law is
  Airbus's control-law logic.
- **Autopilot and autothrust.** Altitude hold and capture, vertical-speed and heading
  modes, and speed hold through autothrust. All simplified.
- **Not modelled.** Fuel transfer and centre-of-gravity shift, trimmable-stabiliser
  scheduling, engine failures, weight-and-balance limits, terrain, and real navigation or
  ILS.

## 5. Rendering

- **Fan rotation** is shown at 12 % of the computed speed to avoid stroboscopic aliasing.
- **Engine N1 values** do not correspond to certified thrust settings.
- **Environment.** The airport, terrain and weather are illustrative. Rain and cloud effects
  are visual only; wind and turbulence feed into the flight model.
