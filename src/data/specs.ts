/**
 * Specification sheet. `status` follows docs/ACCURACY.md:
 *   verified  — published figure from a cited source
 *   approx    — engineering approximation used by this model
 *   unverified— commonly quoted but not confirmed from a reliable source in this project
 */
export interface Spec {
  label: string;
  value: string;
  status: 'verified' | 'approx' | 'unverified';
  sources: string[];
  note?: string;
}
export interface SpecGroup {
  title: string;
  items: Spec[];
}

export const SPEC_GROUPS: SpecGroup[] = [
  {
    title: 'Dimensions',
    items: [
      { label: 'Overall length', value: '72.72 m', status: 'verified', sources: ['airbusFF'] },
      { label: 'Wing span', value: '79.75 m', status: 'verified', sources: ['airbusFF'], note: 'ICAO aerodrome reference code F' },
      { label: 'Overall height', value: '24.09 m', status: 'verified', sources: ['airbusFF'] },
      { label: 'Fuselage width', value: '7.14 m', status: 'verified', sources: ['airbusFF'] },
      { label: 'Fuselage height', value: '≈ 8.4 m', status: 'approx', sources: ['airbusAC'] },
      { label: 'Cabin width — main deck', value: '6.50 m', status: 'verified', sources: ['airbusFF'] },
      { label: 'Cabin width — upper deck', value: '5.80 m', status: 'verified', sources: ['airbusFF'] },
      { label: 'Wheelbase', value: '31.9 m', status: 'verified', sources: ['airbusFF'] },
      { label: 'Wheel track', value: '14.3 m', status: 'verified', sources: ['airbusFF'] },
      { label: 'Horizontal stabiliser span', value: '30.4 m', status: 'verified', sources: ['airbusFF', 'flightCreatingTitan'] },
    ],
  },
  {
    title: 'Wing',
    items: [
      { label: 'Reference area', value: '845 m²', status: 'verified', sources: ['airbusFF'] },
      { label: 'Sweep (25 % chord)', value: '33.5°', status: 'verified', sources: ['airbusFF'] },
      { label: 'Ailerons', value: '3 per wing', status: 'verified', sources: ['airbusFlightControls'] },
      { label: 'Spoilers', value: '8 per wing', status: 'verified', sources: ['airbusFlightControls', 'icas2006'] },
      { label: 'Slats / droop-nose devices', value: '6 + 2 per wing', status: 'verified', sources: ['airbusFlightControls'] },
      { label: 'Trailing-edge flaps', value: '3 per wing', status: 'verified', sources: ['airbusFlightControls'] },
      { label: 'Dihedral (model)', value: '6.0°', status: 'approx', sources: ['airbus3view'], note: 'Not published; tuned to the three-view' },
    ],
  },
  {
    title: 'Weights (575 t weight variant)',
    items: [
      { label: 'Maximum take-off weight', value: '575,000 kg', status: 'verified', sources: ['airbusAC'] },
      { label: 'Maximum landing weight', value: '394,000 kg', status: 'verified', sources: ['airbusAC'] },
      { label: 'Maximum zero-fuel weight', value: '369,000 kg', status: 'verified', sources: ['airbusAC'] },
      { label: 'Fuel capacity', value: '≈ 323,500 L', status: 'unverified', sources: [], note: 'Third-party figure; Airbus AC not read in full' },
    ],
  },
  {
    title: 'Performance',
    items: [
      { label: 'Range (545 seats, 4-class)', value: '8,000 nm / ≈ 15,000 km', status: 'verified', sources: ['airbusFF'] },
      { label: 'Typical cruise', value: 'Mach 0.85', status: 'unverified', sources: [], note: 'Widely quoted; secondary sources only' },
      { label: 'VMO / MMO', value: '340 kt / M 0.89', status: 'verified', sources: ['flightTest'] },
      { label: 'Maximum certified altitude', value: '43,000 ft', status: 'verified', sources: ['flightTest'] },
      { label: 'Typical seating', value: '545 (4-class)', status: 'verified', sources: ['airbusFF'] },
      { label: 'Maximum certified seating', value: '853', status: 'verified', sources: ['airbusFF'] },
    ],
  },
  {
    title: 'Powerplant — A380-842',
    items: [
      { label: 'Engines', value: '4 × Rolls-Royce Trent 900 (Trent 972)', status: 'verified', sources: ['easaTrent'] },
      { label: 'Fan diameter', value: '2.95 m (116 in), 24 swept blades', status: 'verified', sources: ['easaTrent'] },
      { label: 'Take-off thrust, Trent 972-84', value: '341.4 kN', status: 'verified', sources: ['easaTrent'] },
      { label: 'Thrust reversers', value: 'Inboard engines (2 & 3) only', status: 'unverified', sources: [], note: 'Widely documented; primary source not read in this project' },
      { label: 'APU', value: 'Pratt & Whitney Canada PW980A', status: 'unverified', sources: [], note: 'Secondary sources only' },
    ],
  },
  {
    title: 'Systems',
    items: [
      { label: 'Hydraulic systems', value: '2 (Green, Yellow) at 5,000 psi', status: 'verified', sources: ['hyd5000'] },
      { label: 'Backup actuation', value: 'Electro-hydrostatic (EHA / EBHA)', status: 'verified', sources: ['icas2006'] },
      { label: 'Engine generators', value: '4 × 150 kVA variable frequency', status: 'verified', sources: ['moreElectric'], note: 'Design-stage article (2001)' },
      { label: 'Flight deck displays', value: '8 identical LCDs (2 PFD, 2 ND, EWD, SD, 2 MFD)', status: 'verified', sources: ['keyAeroCockpit'] },
      { label: 'Landing gear', value: '22 wheels: 2 nose, 2 × 4 wing, 2 × 6 body', status: 'verified', sources: ['airportTech'] },
    ],
  },
];
