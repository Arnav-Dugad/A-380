/**
 * Reference registry. Every fact in the part catalogue and specification sheet cites one or
 * more of these ids. `tier` describes reliability: primary (Airbus / authority),
 * secondary (reputable press / academic), community (simulator projects, forums).
 */
export interface Source {
  id: string;
  title: string;
  url: string;
  tier: 'primary' | 'secondary' | 'community';
}

export const SOURCES: Record<string, Source> = {
  airbusFF: {
    id: 'airbusFF',
    title: 'Airbus — A380 Facts & Figures (Dec 2021)',
    url: 'https://www.airbus.com/sites/g/files/jlcbta136/files/2021-12/EN-Airbus-A380-Facts-and-Figures-December-2021_0.pdf',
    tier: 'primary',
  },
  airbusProduct: {
    id: 'airbusProduct',
    title: 'Airbus — A380 product page',
    url: 'https://www.airbus.com/en/products-services/commercial-aircraft/passenger-aircraft/a380',
    tier: 'primary',
  },
  airbusAC: {
    id: 'airbusAC',
    title: 'Airbus — A380 Aircraft Characteristics, Airport & Maintenance Planning (Rev. Dec 2025)',
    url: 'https://www.aircraft.airbus.com/sites/g/files/jlcbta126/files/2025-12/AC_A380_20251201.pdf',
    tier: 'primary',
  },
  airbus3view: {
    id: 'airbus3view',
    title: 'Airbus — AutoCAD 3-view aircraft drawings',
    url: 'https://www.aircraft.airbus.com/en/customer-care/fleet-wide-care/airport-operations-and-aircraft-characteristics/autocad-3-view-aircraft-drawings',
    tier: 'primary',
  },
  easaTrent: {
    id: 'easaTrent',
    title: 'EASA TCDS E.012 — Rolls-Royce Trent 900 series (Issue 04)',
    url: 'https://www.easa.europa.eu/en/document-library/type-certificates',
    tier: 'primary',
  },
  airbusFlightControls: {
    id: 'airbusFlightControls',
    title: 'Airbus — A380 Flight Controls overview (X. Le Tron, 2007)',
    url: 'https://www.fzt.haw-hamburg.de/pers/Scholz/dglr/hh/text_2007_09_27_A380_Flight_Controls.pdf',
    tier: 'primary',
  },
  icas2006: {
    id: 'icas2006',
    title: 'ICAS 2006 — A380 electro-hydrostatic actuation paper',
    url: 'https://www.icas.org/icas_archive/ICAS2006/PAPERS/048.PDF',
    tier: 'secondary',
  },
  flightTest: {
    id: 'flightTest',
    title: 'FlightGlobal — Flight test: Airbus A380',
    url: 'https://www.flightglobal.com/flight-test-airbus-a380/69725.article',
    tier: 'secondary',
  },
  flightCreatingTitan: {
    id: 'flightCreatingTitan',
    title: 'FlightGlobal — Creating a titan',
    url: 'https://www.flightglobal.com/creating-a-titan/60787.article',
    tier: 'secondary',
  },
  airportTech: {
    id: 'airportTech',
    title: 'Airport Technology — Airbus A380 project profile',
    url: 'https://www.airport-technology.com/projects/airbus_a380/',
    tier: 'secondary',
  },
  keyAeroCockpit: {
    id: 'keyAeroCockpit',
    title: 'Key.Aero — Airbus A380 cockpit explained',
    url: 'https://www.key.aero/article/airbus-a380-cockpit-explained',
    tier: 'secondary',
  },
  hyd5000: {
    id: 'hyd5000',
    title: 'Power & Motion — A380 pushes 5,000 psi',
    url: 'https://www.powermotiontech.com/hydraulics/hydraulic-pumps-motors/article/21884281/a380-pushes-5000-psi-into-realm-of-the-common-man',
    tier: 'secondary',
  },
  moreElectric: {
    id: 'moreElectric',
    title: 'Aviation Today — A380: more electric aircraft (2001)',
    url: 'https://www.aviationtoday.com/2001/10/01/a380-more-electric-aircraft/',
    tier: 'secondary',
  },
  baFleet: {
    id: 'baFleet',
    title: 'British Airways — A380-800 fleet facts',
    url: 'https://www.britishairways.com/content/information/about-ba/fleet-facts/airbus-a380-800',
    tier: 'primary',
  },
  fbwA380: {
    id: 'fbwA380',
    title: 'FlyByWire Simulations — A380X documentation (community simulator)',
    url: 'https://docs.flybywiresim.com/pilots-corner/a380x/',
    tier: 'community',
  },
  fbwFlaps: {
    id: 'fbwFlaps',
    title: 'FlyByWire issue #10183 — A380 flap/slat settings',
    url: 'https://github.com/flybywiresim/aircraft/issues/10183',
    tier: 'community',
  },
  fgA380: {
    id: 'fgA380',
    title: 'FlightGear A380 (FGMEMBERS) — JSBSim model, GPL',
    url: 'https://github.com/FGMEMBERS/A380',
    tier: 'community',
  },
};
