/* ============================================================================
   Nagpur DUCT — central configuration
   Single source of truth. Edit values here; the rest of the app reads them.
   ========================================================================== */
window.DUCT = window.DUCT || {};

DUCT.config = {
  // ---- Map view --------------------------------------------------------------
  center: [79.0882, 21.1458],   // Nagpur city centre [lon, lat]
  zoom: 12.2,                   // must be >= the buildings PMTiles minzoom (z12),
                                // or the extrusion layer draws nothing at open
  minZoom: 8,
  maxZoom: 18,
  pitch: 45,                    // tilt so building extrusions read as 3D
  bearing: -17,

  // Keyless vector basemap. See `basemaps` below for the switchable catalogue.
  basemapStyle: 'https://tiles.openfreemap.org/styles/positron',

  // ---- Basemap catalogue (all keyless) --------------------------------------
  // `style` entries load a MapLibre style URL. `raster` entries build a minimal
  // style around an XYZ tile service, borrowing OpenFreeMap's glyphs so symbol
  // layers still render.
  basemaps: [
    { id: 'positron', name: 'Positron', group: 'light',
      type: 'style', url: 'https://tiles.openfreemap.org/styles/positron' },
    { id: 'bright', name: 'Bright', group: 'light',
      type: 'style', url: 'https://tiles.openfreemap.org/styles/bright' },
    { id: 'liberty', name: 'Liberty', group: 'light',
      type: 'style', url: 'https://tiles.openfreemap.org/styles/liberty' },
    { id: 'carto-voyager', name: 'Carto Voyager', group: 'light',
      type: 'style', url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json' },
    { id: 'dark', name: 'Dark Matter', group: 'dark',
      type: 'style', url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' },
    { id: 'fiord', name: 'Fiord', group: 'dark',
      type: 'style', url: 'https://tiles.openfreemap.org/styles/fiord' },
    // Sentinel-2 cloudless: CC BY-NC-SA 4.0, free for non-commercial use with
    // the attribution below. EOX's public endpoint is fair-use, not unlimited.
    { id: 's2cloudless', name: 'Sentinel-2 cloudless', group: 'imagery', type: 'raster',
      tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg'],
      tileSize: 256, maxzoom: 16,
      attribution: '<a href="https://s2maps.eu">Sentinel-2 cloudless</a> by <a href="https://eox.at">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2024)' }
  ],
  defaultBasemap: 'positron',
  // Glyphs for raster-only styles, so station labels still draw.
  rasterGlyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',

  // LCZ is a full-coverage categorical wash, so it opens a little lighter than
  // the other rasters. Draw order does the real work: the overlay sits beneath
  // the buildings and beneath the basemap labels.
  lczOpacity: 0.72,

  // ---- Run metadata (shown in the status chip) ------------------------------
  // `run.id` keys into `validation.runs` below, so the chip and the station
  // panel can never disagree about which simulation is on screen.
  run: {
    id: 'v4',
    label: 'WRF v4 · d03 · SLUCM-LCZ',
    window: '22–26 Apr 2025 · 96 h',
    note: 'demo build — T2 · RH · wind'
  },

  // ---- Validation record -----------------------------------------------------
  // Station statistics over the 72 h analysis window, first 24 h dropped as
  // spin-up. Recomputed in the browser when data/stations.json carries paired
  // observations; until it does, this table is what the station panel reports.
  // Add a run here when you export frames from it, and point run.id at it.
  validation: {
    window: '23–25 Apr 2025 · 72 h analysis, 24 h spin-up dropped',
    benchmark: { rmse: 2.0, label: '≤ 2 K', source: 'Gunwani et al. (2020), NCR' },
    states: {
      validated:   { dot: 'ok',      label: 'Validated' },
      conditional: { dot: 'partial', label: 'Conditional' },
      unvalidated: { dot: 'none',    label: 'Unvalidated' }
    },
    runs: {
      v4: {
        label: 'WRF v4 · SLUCM + WUDAPT LCZ + anthropogenic heat',
        status: 'conditional',
        note: 'Tracks the diurnal cycle and carries a systematic daytime cold bias. ' +
              'Suitable as a driver for the microscale stage; not a publication-grade ' +
              'temperature prediction.',
        stations: {
          mahal:     { bias: -2.06, mae: 2.45, rmse: 3.27, crmse: 2.54, r: 0.81, ioa: 0.81, n: 73 },
          ramnagar:  { bias: -2.08, mae: 2.64, rmse: 3.25, crmse: 2.51, r: 0.75, ioa: 0.79, n: 73 },
          ambazari:  { bias: -2.54, mae: 3.54, rmse: 4.03, crmse: 3.13, r: 0.84, ioa: 0.86, n: 73 }
        }
      },
      v6: {
        label: 'WRF v6 · SLUCM, tuned albedo, road and roof width',
        status: 'conditional',
        note: 'Best configuration to date. Bias halved from the v1 LCZ run while ' +
              'centred RMSE barely moved: the tuning has been correcting the mean ' +
              'state, not the model\u2019s ability to track the diurnal cycle.',
        stations: {
          mahal:     { bias: -2.08, mae: 2.42, rmse: 3.23, crmse: 2.47, r: 0.82, ioa: 0.81, n: 73 },
          ramnagar:  { bias: -2.13, mae: 2.64, rmse: 3.25, crmse: 2.46, r: 0.76, ioa: 0.79, n: 73 },
          ambazari:  { bias: -2.53, mae: 3.66, rmse: 4.12, crmse: 3.26, r: 0.83, ioa: 0.85, n: 73 }
        }
      }
    }
  },

  // ---- Chain status ----------------------------------------------------------
  // The dock states which stage of the twin is live rather than leaving the
  // downstream toggles greyed out with no explanation.
  chain: [
    { tier: 'Atmosphere',    label: 'WRF · mesoscale',        state: 'active',  note: 'd03 · 300 m' },
    { tier: 'Microscale',    label: 'PALM-4U · 10 m LES',     state: 'next'  },
    { tier: 'Energy',        label: 'CEA · building energy',  state: 'next'  },
    { tier: 'Interventions', label: 'Albedo · green space',   state: 'planned' }
  ],

  // ---- Data paths ------------------------------------------------------------
  paths: {
    metadata:  'data/metadata.json',
    boundary:  'data/boundary/nagpur.geojson',
    stations:  'data/stations.json',
    buildings: 'data/buildings/nagpur_buildings.pmtiles',
    wrfIndex:  'data/wrf/index.json', // variable catalogue written by script 10
    wrfBase:   'data/wrf/',           // <base>/<var>/meta.json + frames + colorbar
    lczImage:  'data/lcz/lcz.png',
    lczMeta:   'data/lcz/lcz_meta.json'
  },

  // ---- Building height treatment --------------------------------------------
  // GBA heights are globally trained and under-estimate Indian low-rise stock
  // (source median 2.7 m for Nagpur). A flat +2 m offset is applied for display
  // so the fabric reads at a plausible storey height. This is a display
  // calibration, not a corrected dataset — the popup shows both values, and the
  // legend states the offset. Set to 0 to render raw GBA heights.
  heightOffsetM: 2,
  buildingMinHeight: 2,     // floor applied after the offset
  heightExaggeration: 1,    // visual aid only — label the map if you raise it

  // ---- Building colour by typology -------------------------------------------
  // Keyed on `typology_label` (the field carried into the PMTiles archive).
  // Residential is ~the whole city, so it stays recessive and acts as the
  // fabric; the six functional classes are saturated so they read as figure
  // against it. Hues avoid the warm band the T2 colormap occupies, so "what
  // kind of building" never reads as "how hot".
  typologyColors: {
    'Residential':               '#93a6c0',
    'Commercial / Retail':       '#e0559b',
    'Government / Civic':        '#3f7fd0',
    'Industrial / Warehousing':  '#5a6472',
    'Recreational / Open Space': '#3fb98a',
    'Religious / Cultural':      '#c9a227',
    'Transport Hub':             '#8a5fd4'
  },
  typologyFallback: '#9aa8b8',
  // Legend order: dominant class first, then by how much they shape the city.
  typologyOrder: [
    'Residential',
    'Commercial / Retail',
    'Industrial / Warehousing',
    'Government / Civic',
    'Transport Hub',
    'Religious / Cultural',
    'Recreational / Open Space'
  ],

  // ---- LCZ palette (official WUDAPT / Stewart & Oke) ------------------------
  // The legend renders only the classes actually present, read from
  // data/lcz/lcz_meta.json; this table is the lookup, not the display list.
  lczColors: {
    1:  '#8c0000', 2:  '#d10000', 3:  '#ff0000', 4:  '#bf4d00',
    5:  '#ff6600', 6:  '#ff9955', 7:  '#faee05', 8:  '#bcbcbc',
    9:  '#ffccaa', 10: '#555555',
    11: '#006a00', 12: '#00aa00', 13: '#648525', 14: '#b9db79',
    15: '#000000', 16: '#fbf7ae', 17: '#6a6aff'
  },
  lczLabels: {
    1:  'LCZ 1 · Compact high-rise',
    2:  'LCZ 2 · Compact mid-rise',
    3:  'LCZ 3 · Compact low-rise',
    4:  'LCZ 4 · Open high-rise',
    5:  'LCZ 5 · Open mid-rise',
    6:  'LCZ 6 · Open low-rise',
    7:  'LCZ 7 · Lightweight low-rise',
    8:  'LCZ 8 · Large low-rise',
    9:  'LCZ 9 · Sparsely built',
    10: 'LCZ 10 · Heavy industry',
    11: 'LCZ A · Dense trees',
    12: 'LCZ B · Scattered trees',
    13: 'LCZ C · Bush, scrub',
    14: 'LCZ D · Low plants',
    15: 'LCZ E · Bare rock / paved',
    16: 'LCZ F · Bare soil / sand',
    17: 'LCZ G · Water'
  },

  // ---- Layer registry --------------------------------------------------------
  // `ready` is the fallback when data/metadata.json cannot be fetched (e.g. file://).
  // metadata.json overrides these at runtime as real data lands.
  layers: [
    { id: 'buildings', name: 'Buildings (3D)',        ready: false, kind: 'vector'  },
    { id: 'lcz',       name: 'Local Climate Zones',   ready: false, kind: 'raster'  },
    // id kept as wrf_t2 for continuity with data/metadata.json; the layer now
    // carries every surface field script 10 exports (T2, RH, wind speed).
    { id: 'wrf_t2',    name: 'WRF · surface fields',  ready: false, kind: 'timeseries' },
    { id: 'wrf_wind',  name: 'Wind vectors (10 m)',   ready: false, kind: 'vector' },
    { id: 'palm4u',    name: 'PALM-4U · microclimate', ready: false, kind: 'pending', note: 'awaiting model output' },
    { id: 'cea',       name: 'CEA · building energy',  ready: false, kind: 'pending', note: 'awaiting model output' }
  ],

  defaultOpacity: 0.78
};
