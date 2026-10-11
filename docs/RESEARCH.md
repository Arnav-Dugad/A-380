# Research — Airbus A380-800 (A380-842, Rolls-Royce Trent 900)

This file records the technical research behind the model, with a source for every figure.
It was compiled on 2026-10-11.

> **How this research was done.** The build environment could not fetch most websites
> directly: airbus.com, aircraft.airbus.com, easa.europa.eu, sketchfab.com and Wikipedia
> were blocked or failed DNS lookup. The figures below therefore come from search-engine
> summaries of the cited pages, not from reading the PDFs in full. Each figure links its
> source, and anything without a reliable source is marked **UNVERIFIED**.
>
> Before treating any value as authoritative, check it against the Airbus *Aircraft
> Characteristics — Airport and Maintenance Planning* document (linked below). How each
> value is used in the model is set out in [ACCURACY.md](ACCURACY.md).

## Primary documents (located, not fully read)

- Airbus A380 Aircraft Characteristics – Airport and Maintenance Planning (AC), Rev Dec 01/25 (latest found): https://www.aircraft.airbus.com/sites/g/files/jlcbta126/files/2025-12/AC_A380_20251201.pdf
- AC Rev Dec 01/23: https://aircraft.airbus.com/sites/g/files/jlcbta126/files/2023-12/ac_a380_1223.pdf
- AC (Nov 2021 upload): https://www.airbus.com/sites/g/files/jlcbta136/files/2021-11/Airbus-Aircraft-AC-A380.pdf
- AC landing page: https://aircraft.airbus.com/en/customer-care/fleet-wide-care/airport-operations-and-aircraft-characteristics/aircraft-characteristics
- Airbus A380 Facts & Figures (Dec 2021): https://www.airbus.com/sites/g/files/jlcbta136/files/2021-12/EN-Airbus-A380-Facts-and-Figures-December-2021_0.pdf
- Airbus A380 product page: https://www.airbus.com/en/products-services/commercial-aircraft/passenger-aircraft/a380
- EASA TCDS A.110 (index; Issue 17 current, Issue 16 dated 04 Jul 2023 covers A380-841/-842/-861): https://www.easa.europa.eu/en/document-library/type-certificates — body (limitations section) NOT read.
- EASA TCDS E.012 Trent 900 (Issue 04, 24 May 2007 mirror): https://docslide.us/documents/easa-tcds-e012-rolls-royce-plc-rb211-trent-900-series-engines-04-24052007.html
- Note: the AC document carries an Airbus copyright notice forbidding reproduction without written permission (per search summary of https://aircraft.airbus.com/en/customer-care/fleet-wide-care/airport-operations-and-aircraft-characteristics/aircraft-characteristics). Use numbers (facts) only; do not redistribute the PDF or its drawings.

## 1. Geometry

| Item | Value | Source |
|---|---|---|
| Overall length | 72.72 m (Airbus F&F rounds to 72.7 m) | https://www.dimensions.com/element/airbus-a380-800 ; https://www.airbus.com/sites/g/files/jlcbta136/files/2021-12/EN-Airbus-A380-Facts-and-Figures-December-2021_0.pdf |
| Wingspan | 79.75 m (Airbus F&F: 79.8 m) | same as above |
| Overall height | 24.09 m (Airbus F&F: 24.1 m) | same as above |
| Fuselage max width (external) | 7.14 m | https://www.globalair.com/aircraft-specifications/airbus/airbus-a380-specifications/1545 (via search summary) |
| Fuselage height (external) | ~8.40 m (French encyclopedic source: "8.40 m high by 7.15 m wide"); exact 8.41 m **UNVERIFIED** | https://www.techno-science.net/definition/9.html |
| Cabin width main deck | 6.50 m (Airbus F&F: 6.5 m; one spec copy says max 6.54 m) | Airbus F&F Dec 2021 (above); https://www.scribd.com/doc/52976213/airbus-a380-specifications |
| Cabin width upper deck | 5.80 m | Airbus F&F Dec 2021 (above) |
| Wing reference area | 845 m² | Airbus F&F Dec 2021; https://www.airbus.com/sites/g/files/jlcbta136/files/2021-11/EN-Airbus-A380-Facts-and-Figures-Nov%20-2021.pdf |
| Wing sweep (25% chord) | 33.5° | Airbus F&F Nov 2021 (above) |
| Aspect ratio | 7.53 (academic estimate) | https://archive.aoe.vt.edu/mason/Mason_f/A380Hosder.pdf |
| Dihedral | **UNVERIFIED** (only "small dihedral" stated) | https://archive.aoe.vt.edu/mason/Mason_f/A380Roedts.pdf |
| Horizontal stabilizer span | 30.4 m (Airbus); 30.37 m (FlightGlobal) | Airbus F&F Nov 2021; https://www.flightglobal.com/creating-a-titan/60787.article |
| Vertical tail height (fin itself) | "just under 14.6 m" (design-era 1990s article) | https://www.flightglobal.com/creating-a-titan/60787.article |
| Wheelbase | 31.9 m (Airbus F&F) / 31.88 m | Airbus F&F Dec 2021; https://downloads.regulations.gov/TSA-2013-0004-5585/attachment_20.pdf |
| Wheel track | 14.3 m (Airbus F&F) / 14.34 m — measured on wing gear (outer main gear) per standard AC convention; body-gear track **UNVERIFIED** | same as above |
| Engine spanwise y-stations | **UNVERIFIED** (in AC section 2 drawings; not retrievable) | AC PDF above |
| Ground clearances (engines, wingtip, fuselage) | **UNVERIFIED** (AC section 2-3; not retrievable) | AC PDF above |
| ICAO aerodrome code | Code F (span 79.75 m) | https://flyawaysimulation.com/ask/answers/airbus-a380-dimensions-capacity-layout/ |

### Doors
- 8 pairs of Type A doors (16 total): main deck M1–M5 (M3 overwing), upper deck U1–U3. M1, M2, M4, M5, U1, U3 are service doors; M3 and U2 are emergency exits only. Source: https://en.wikipedia.org/wiki/Seat_configurations_of_Airbus_A380 and https://pdfcoffee.com/a380-general-familiarization-course-pdf-free.html (training course mirror).
- Cargo: two doors in the lower RH fuselage give access to forward and aft holds, sized for 96 in x 125 in pallets (training course mirror, above). Bulk door details **UNVERIFIED**.
- Cargo door sill height 3.05–3.30 m depending on load: https://www.internationalairportreview.com/article/1792/a380-gse-requirements/
- Door x-stations and clear-opening dimensions: **UNVERIFIED** (in AC; not retrievable).

## 2. Weights, fuel, performance

Airbus AC weight-variant table (per search summary of AC Rev Dec 2023/2025, https://www.aircraft.airbus.com/sites/g/files/jlcbta126/files/2023-12/ac_a380_1223.pdf):

| WV | MTOW | MLW | MZFW |
|---|---|---|---|
| WV000 | 560,000 kg | 386,000 kg | 361,000 kg |
| WV001 | (not captured) | 394,000 kg | 372,000 kg |
| WV002 | 569,000 kg | 391,000 kg | 366,000 kg |
| WV003 | 510,000 kg | 395,000 kg | 373,000 kg |
| 575 t variant | 575,000 kg | 394,000 kg | 369,000 kg |

- 575 t variant labelled **WV008** by FlightGlobal (2013): https://www.flightglobal.com/airbus-details-three-newest-a380-weight-variants/107917.article ; an older AC revision may label it WV009 (per search summary) — label **UNVERIFIED**, values agree.
- Recommended model default: MTOW 575 t / MLW 394 t / MZFW 369 t.
- OEW: **UNVERIFIED** (no Airbus figure found). FlightGear JSBSim file uses emptywt 725,004 lb (≈ 328.9 t) — a hobbyist value, not Airbus: https://github.com/FGMEMBERS/A380/blob/master/A380.xml
- Max fuel capacity: 323,546 L (≈ 253,984 kg) — third-party performance profile https://aircraftinvestigation.info/airplanes/A380-800.html ; Airbus-primary litre figure **UNVERIFIED** (AC not read).
- Range: 8,000 nm / ~15,000 km in standard 4-class 545-seat configuration (Airbus F&F): https://www.airbus.com/sites/g/files/jlcbta136/files/2021-12/EN-Airbus-A380-Facts-and-Figures-December-2021_0.pdf
- Seating: 545 typical 4-class; certified max 853 (Airbus F&F, same URL).
- VMO 340 KIAS / MMO 0.89: https://flyawaysimulation.com/ask/answers/airbus-a380-airspeed-indicator-speed-limits/ ; flight test confirms MMO 0.89 protection behaviour: https://www.flightglobal.com/flight-test-airbus-a380/69725.article — EASA TCDS confirmation **UNVERIFIED**.
- Max certified altitude: 43,000 ft (FlightGlobal flight test, above). The often-quoted 43,100 ft is **UNVERIFIED**.
- Typical cruise: Mach 0.85: https://flyawaysimulation.com/ask/answers/airbus-a380-speed/
- Takeoff field length: **UNVERIFIED** (not captured).

### Engine — Rolls-Royce Trent 900 (A380-841 = Trent 970, A380-842 = Trent 972)
- Fan diameter 2.95 m (116 in), swept fan: EASA TCDS E.012 Issue 04 mirror https://docslide.us/documents/easa-tcds-e012-rolls-royce-plc-rb211-trent-900-series-engines-04-24052007.html ; 116 in / 24 blades also in https://www.aircraft-commerce.com/wp-content/uploads/aircraft-commerce-docs1/Aircraft%20guides/RR%20TRENT/ISSUE83_TRENT_SPECS.pdf
- Take-off thrust (ISA SLS, net, 5-min) per TCDS E.012 Issue 04: Trent 970-84 334.29 kN; Trent 972-84 341.41 kN; 970B-84 348.31 kN; 972B-84 356.81 kN (same docslide URL). Nominal marketing ratings 70,000 lbf (970) / 72,000 lbf (972): aircraft-commerce URL above.
- Current TCDS issue not checked — **UNVERIFIED** whether later issues changed ratings.
- FlyByWire A380X models A380-842 with Trent 972B-84: https://github.com/flybywiresim/aircraft/
- APU: Pratt & Whitney Canada PW980A (1.3 MW class): https://www.tumblr.com/a380flightdeck/153872435500/pratt-whitney-canada-pwc-pw-980a-apu-pratt ; https://www.aeroexpo.online/prod/pratt-whitney/product-170325-20224.html (secondary sources; P&WC primary page not read).

### Speeds for an educational flight model (NOT certified data)
- Rotation ~145–165 KIAS; final approach ~130–150 KIAS (illustrative explainer): https://flyawaysimulation.com/ask/answers/airbus-a380-speed/
- VR 140–170 kt depending on weight/flaps, ~155 kt at MTOW CONF 2; final approach 125 kt (empty) to 145 kt (MLW) CONF FULL — virtual-airline manual (low reliability): https://virtualaircadetairlines.weebly.com/uploads/5/0/6/9/50696965/airbus_a380_basic_manual_vaca.pdf
- Example 500 t takeoff: V1 130 / VR 140 / V2 150 (PPRuNe, informal): https://www.pprune.org/tech-log/505580-a380-speeds.html
- Example SimBrief-derived set in FBW docs: V1 136 / VR 136 / V2 142: https://docs.flybywiresim.com/pilots-corner/a380x/a380x-beginner-guide/03_preparing-fms/
- "Approach ~138 kt": consistent with the ranges above but no primary source — **UNVERIFIED**.
- Stall speeds, lift-off pitch attitude, typical climb rate: **UNVERIFIED** (no source found).

## 3. Landing gear
- 22 wheels: twin-wheel nose gear, two 4-wheel wing gears, two 6-wheel body gears: https://www.airport-technology.com/projects/airbus_a380/ ; total 22 also https://flyawaysimulation.com/ask/answers/airbus-a380-dimensions-capacity-layout/
- Suppliers: nose gear Messier-Dowty; main (wing + body) gear Goodrich: https://www.flightglobal.com/ops-safety/2003/05/resetting-standards/ (search summary)
- Steering: nose gear plus rear axle of each body gear: https://www.airport-technology.com/projects/airbus_a380/ ; body-gear rear axle locked centred if unpowered during towing (same). One source says aft wheels steer up to 16° — **UNVERIFIED** angle.
- Retraction: body gear retracts aft into a fuselage bay; bogie pitch trimmer sets nose-down for landing and nose-up for stowage: https://www.slideshare.net/slideshow/landing-gear-system-of-the-airbus-a-380/77289257 ; https://www.pprune.org/tech-log/172865-a380-landing-gear.html (forum)
- Wing gear folds inboard (conventional inward folding) — forum claim only: https://www.airliners.net/forum/viewtopic.php?f=5&t=744489 — **UNVERIFIED** officially.
- Nose gear retraction direction (forward?) — **UNVERIFIED**.
- Tyre sizes, gear door count/arrangement — **UNVERIFIED**.

## 4. Flight controls
Source of record: Airbus presentation "A380 Flight Controls overview" (Xavier Le Tron, Airbus, 2007): https://www.fzt.haw-hamburg.de/pers/Scholz/dglr/hh/text_2007_09_27_A380_Flight_Controls.pdf ; ICAS 2006 paper on A380 EHAs: https://www.icas.org/icas_archive/ICAS2006/PAPERS/048.PDF

- Ailerons: 3 per wing, all outboard of the outer engine pylon; outermost aileron locked out above 240 KIAS: https://www.flightglobal.com/flight-test-airbus-a380/69725.article
- Spoilers: 8 per wing (16 total), all used as speedbrakes/ground spoilers; the 6 outboard pairs also assist roll: ICAS 2006 paper (above)
- High-lift: slats 6 per wing (6x2), droop-nose devices 2 per wing (2x2, inboard), flaps 3 per wing (3x2): Airbus Le Tron presentation (above). Flap type (single-slotted, Fowler-motion) **UNVERIFIED** from primary source.
- Pitch: 2 pairs of elevators (4 total) + trimmable horizontal stabilizer (THS): ICAS 2006 (above)
- Yaw: double-panel rudder (upper + lower, 2 total): ICAS 2006 (above)
- Electrical backup actuators can drive both rudders, half of the elevators, one spoiler and two ailerons per wing: https://www.flightglobal.com/flight-test-airbus-a380/69725.article

### Flap/slat configurations (handle detents: 0, 1, 2, 3, FULL; CONF 1 vs 1+F chosen by SFCC)
Not from Airbus primary documentation — both sources are secondary:

| CONF | Slat ° | Flap ° (forum / EADS-quoted) | Flap ° (FBW issue) |
|---|---|---|---|
| 0 | 0 | 0 | 0 |
| 1 | 20 | 0 | 0 |
| 1+F | 20 | 8 | 8 |
| 2 | 20 | 17 | 17 |
| 3 | 23 | 26 | 22 or 26 (see issue) |
| FULL | 23 | 32 | 33 |

Sources: https://www.airliners.net/forum/viewtopic.php?t=754487 (post quoting an EADS document); https://github.com/flybywiresim/aircraft/issues/10183 (flap list 0, 8, 17, 22, 26, 33; slats 20/23). Whether CONF 3 is 22° or 26° flap and FULL 32° vs 33° — **UNVERIFIED**.

## 5. Cockpit, ECAM, systems
- 8 identical interactive LCDs, 150 x 200 mm (5.9 x 7.8 in) in production (pre-production said 6x8 in): https://www.key.aero/article/airbus-a380-cockpit-explained ; https://www.aviationtoday.com/2003/03/01/a380-innovations-a-balancing-act/
- Roles: 2 PFD, 2 ND, 1 EWD (engine/warning), 1 SD, 2 MFD: https://www.flightglobal.com/cockpit-mock-up-shows-off-a380s-avionics-integration/47845.article (search summary)
- 2 KCCUs (keyboard and cursor control units), each paired with an MFD: same FlightGlobal URL.
- OIT (onboard information terminals), 2, with keyboard/pointer in slide-out tables — weak source (blog): https://ahmadidriss.wordpress.com/2019/02/21/airbus-a380-cockpit/ ; paperless OIS by Sagem: key.aero URL above.
- Side-sticks and FCU (glareshield) — standard Airbus FBW layout; specific A380 primary citation **UNVERIFIED** in this session.
- SD pages (16) per FlyByWire A380X docs: ENG, APU, BLEED, COND, PRESS, DOOR, EL/AC, EL/DC, FUEL, WHEEL, HYD, F/CTL, C/B, CRUISE, STATUS, VIDEO: https://docs.flybywiresim.com/pilots-corner/a380x/a380x-briefing/flight-deck/main-panel/sd/ (community-sim documentation, not Airbus).
- Hydraulics: 2 independent systems, Green and Yellow, 5,000 psi: https://www.powermotiontech.com/hydraulics/hydraulic-pumps-motors/article/21884281/a380-pushes-5000-psi-into-realm-of-the-common-man ; https://docs.flybywiresim.com/pilots-corner/a380x/a380x-briefing/flight-deck/ovhd/hyd/
- Backup: electrical actuators EHA and EBHA replace a third hydraulic circuit: https://oat.aero/2023/11/25/airbus-a380-general-familiarisation-hydraulics/ ; ICAS 2006 paper (above). The "2H/2E" label is common usage but not found in a source here — **UNVERIFIED** wording.
- Electrical: 4 engine-driven variable-frequency generators, 150 kVA each (2001 design-stage article): https://www.aviationtoday.com/2001/10/01/a380-more-electric-aircraft/ ; APU generator count/rating **UNVERIFIED**.

## 6. Representative cabin configuration (one documented example)
**British Airways A380-800 (pre-retrofit), 469 seats**: First 14 (main deck, forward), Club World 97, World Traveller Plus 55, World Traveller 303. Upper deck holds Club World and World Traveller Plus (plus some economy); main deck holds First and most economy. Sources: https://www.britishairways.com/content/information/about-ba/fleet-facts/airbus-a380-800 ; https://www.seatmaestro.com/wp-content/uploads/pdfs/airplanes/british-airways-airbus-a380-800-388.pdf
- BA World Traveller: 199 seats main deck (3-4-3) and 109 upper deck (2-4-2) per review — note 199+109 = 308, does not match 303; exact split **UNVERIFIED**: https://thepointsguy.com/reviews/british-airways-economy-a380-review
- BA announced (Oct 2026) retrofit to 417 seats: 12 F / 106 J / 84 W / 215 Y, entire upper deck Club World: https://mediacentre.britishairways.com/news/05102026/british-airways-reveals-all-new-first-club-suite-world-traveller-plus-and-world-traveller-cabins-as-part-of-its-multi-billion-investment-into-customer-experience
- Abreast: main-deck economy 10-abreast 3-4-3; upper-deck economy 8-abreast 2-4-2 (where fitted): https://thepointsguy.com/reviews/british-airways-economy-a380-review ; https://runwaygirlnetwork.com/2016/07/11/when-more-seats-mean-a-more-comfortable-ride-in-economy/
- Airbus generic: 545 seats typical 4-class (Airbus F&F, above). Per-deck split of the Airbus typical layout **UNVERIFIED**.

## 7. Open-source references

| Project | License | Notes / source |
|---|---|---|
| FGMEMBERS/A380 (FlightGear) | GPL (A380-set.xml help text: "The A380 Aircraft is released under GPL as part of the FlightGear.org project"); exact version (GPL-2.0-or-later expected for FG aircraft) **UNVERIFIED** — no LICENSE file confirmed | https://github.com/FGMEMBERS/A380 . Contains JSBSim FDM `A380.xml` and `A380_RJ.xml`. Metrics: wingspan 261.82 ft (79.80 m), chord 34.13 ft, htailarea 2233.74 ft², wingarea 8934.95 ft² (≈830 m², appears inside an XML comment in the snippet), emptywt 725,004 lb, CG x 1580.8 in. Repo last updated 2026-08-26 (GitHub search API). Also has Nasal FMS code. FG contribution policy GPL2+: https://blueprints.launchpad.net/ubuntu/trusty/+source/flightgear/+copyright |
| flybywiresim/aircraft (A32NX + A380X, MSFS) | Code GPL-3.0; original 3D assets CC BY-NC 4.0; MS-derived assets under Microsoft Game Content Usage Rules (per README summary, third-party copy) | https://github.com/flybywiresim/aircraft/ ; https://opencollective.ecosyste.ms/projects/298633 . Useful as a reference for systems logic only; GPL-3.0 is viral — do not copy code into a non-GPL app. |
| JSBSim | LGPL-2.1 (core + Python module); Unreal plugin MIT; MATLAB S-Function BSD | https://awesome.ecosyste.ms/projects/github.com%2Fjsbsim-team%2Fjsbsim ; https://github.com/aero-coder/jsbsim (fork mirror of README) |
| @0x62/jsbsim-wasm | MIT (npm metadata), wraps JSBSim 1.2.4 (LGPL) via Emscripten | npm: https://www.npmjs.com/package/@0x62/jsbsim-wasm (latest 1.2.4-beta.4, published 2026-02-22, checked via registry.npmjs.org); repo https://github.com/0x62/jsbsim-wasm (6 stars, updated 2026-10-08); demo https://0x62.github.io/jsbsim-wasm/ . README: "still in early development and may contain bugs". Provides TS SDK (`JSBSimSdk.create`, `writeDataFile` into MEMFS). |
| jsbsim.js | npm 0.0.4 (2015), old JS port — abandoned | https://github.com/csbrandt/JSBSim.js |

**Feasibility summary:** Running JSBSim in-browser is possible today via `@0x62/jsbsim-wasm` (only maintained-ish option; beta, single maintainer, low adoption). LGPL-2.1 allows use from a web app if the JSBSim part remains replaceable/relinkable and source is offered (a separate .wasm file + link to source satisfies the spirit; confirm with legal). The FlightGear A380.xml is GPL, so bundling it makes the FDM data GPL — acceptable for an open-source GPL educational app, otherwise write own coefficients. Lowest-risk path for an educational twin: a custom simplified 6-DOF/point-mass model in JS using the Airbus numbers above, with JSBSim-wasm as an optional later upgrade.
