/* ============================================================================
   Layer management — add / toggle / update each data layer
   Every layer degrades gracefully: if its data is missing, the toggle is
   disabled and labelled, and the rest of the map keeps working.
   ========================================================================== */
window.DUCT = window.DUCT || {};

DUCT.layers = {
  // frame state for the WRF time series
  wrf: { catalog: null, vars: {}, active: null, index: 0, loaded: false, bounds: null }
};

/* ---- Draw order -----------------------------------------------------------
   Data overlays are inserted beneath the basemap's first symbol layer, so road
   and place labels stay legible on top. Within that band the add order below
   decides stacking: LCZ (ground classification) -> WRF (air temperature) ->
   boundary -> buildings. That ordering is why the buildings are no longer
   buried by the LCZ raster.
--------------------------------------------------------------------------- */
DUCT.layers.firstSymbolId = function () {
  const style = DUCT.map.getStyle && DUCT.map.getStyle();
  const list = (style && style.layers) || [];
  for (const l of list) {
    if (l.type === 'symbol') return l.id;
  }
  return undefined;   // raster-only styles have none; layers go on top
};

/* ---- City boundary (always on, cheap context) ---------------------------- */
DUCT.layers.addBoundary = async function () {
  const map = DUCT.map;
  try {
    const res = await fetch(DUCT.config.paths.boundary, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const geojson = await res.json();
    map.addSource('boundary', { type: 'geojson', data: geojson });
    map.addLayer({
      id: 'boundary-line',
      type: 'line',
      source: 'boundary',
      paint: {
        'line-color': '#3dd6c4',
        'line-width': 1.5,
        'line-opacity': 0.7,
        'line-dasharray': [3, 2]
      }
    }, DUCT.layers.firstSymbolId());
  } catch (e) {
    console.info('boundary not loaded (%s)', e.message);
  }
};

/* ---- Buildings: 3D extrusion from a PMTiles vector archive ---------------- */
DUCT.layers.addBuildings = function () {
  if (!DUCT.isReady('buildings')) return;   // no archive yet — skip to keep console clean
  const map = DUCT.map;
  const cfg = DUCT.config;
  const meta = DUCT.metadata && DUCT.metadata.layers && DUCT.metadata.layers.buildings;
  const sourceLayer = (meta && meta.sourceLayer) || 'buildings';
  const heightField = (meta && meta.heightField) || 'height';
  const hMin = cfg.buildingMinHeight != null ? cfg.buildingMinHeight : 2;
  const hExag = cfg.heightExaggeration != null ? cfg.heightExaggeration : 1;
  const hOff = cfg.heightOffsetM != null ? cfg.heightOffsetM : 0;

  map.addSource('buildings', {
    type: 'vector',
    url: 'pmtiles://' + cfg.paths.buildings
  });

  // rendered height = max(raw + offset, floor) * exaggeration
  const heightExpr = [
    '*',
    ['max', ['+', ['coalesce', ['get', heightField], 0], hOff], hMin],
    hExag
  ];

  // categorical colour from typology_label, with an explicit fallback
  const colorExpr = ['match', ['get', 'typology_label']];
  cfg.typologyOrder.forEach((label) => {
    colorExpr.push(label, cfg.typologyColors[label]);
  });
  colorExpr.push(cfg.typologyFallback);
  DUCT.layers._buildingColorExpr = colorExpr;

  map.addLayer({
    id: 'buildings-3d',
    type: 'fill-extrusion',
    source: 'buildings',
    'source-layer': sourceLayer,
    layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-color': colorExpr,
      'fill-extrusion-height': heightExpr,
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.92,
      'fill-extrusion-vertical-gradient': true
    }
  }, DUCT.layers.firstSymbolId());

  // Selected-building highlight. Filtered to nothing until a click lands, so it
  // costs a single feature to draw.
  map.addLayer({
    id: 'buildings-selected',
    type: 'fill-extrusion',
    source: 'buildings',
    'source-layer': sourceLayer,
    layout: { visibility: 'none' },
    filter: ['==', ['get', 'id'], '\u0000'],
    paint: {
      'fill-extrusion-color': '#3dd6c4',
      'fill-extrusion-height': heightExpr,
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 1
    }
  }, DUCT.layers.firstSymbolId());

  // Click a building → attribute card (CEA fields show as pending until wired).
  map.on('click', 'buildings-3d', (e) => {
    const p = e.features[0].properties || {};
    const raw = p[heightField];
    const shown = raw != null ? Math.max(Number(raw) + hOff, hMin) : null;
    const typ = p.typology_label || p.typology || '—';
    const swatch = cfg.typologyColors[typ] || cfg.typologyFallback;

    if (p.id != null && map.getLayer('buildings-selected')) {
      map.setFilter('buildings-selected', ['==', ['get', 'id'], p.id]);
      map.setLayoutProperty('buildings-selected', 'visibility', 'visible');
    }

    const rows = [
      ['Height', shown != null ? shown.toFixed(1) + ' m' : '—'],
      ['Typology', `<i class="popup-swatch" style="background:${swatch}"></i>${typ}`],
      ['ID', p.id || '—'],
      ['Cooling demand', p.cooling_demand != null ? p.cooling_demand + ' kWh/yr' : 'pending (CEA)'],
      ['PV potential', p.pv_potential != null ? p.pv_potential + ' kWh/yr' : 'pending (CEA)']
    ];
    const note = raw != null && hOff
      ? `<div class="popup-note">GBA ${Number(raw).toFixed(1)} m + ${hOff.toFixed(1)} m offset</div>`
      : '';
    const html =
      '<div class="popup"><div class="popup-title">Building</div>' +
      rows.map(([k, v]) => `<div class="popup-row"><span>${k}</span><b>${v}</b></div>`).join('') +
      note + '</div>';

    const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
      .setLngLat(e.lngLat).setHTML(html).addTo(map);
    popup.on('close', () => {
      if (map.getLayer('buildings-selected'))
        map.setLayoutProperty('buildings-selected', 'visibility', 'none');
    });
  });
  map.on('mouseenter', 'buildings-3d', () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', 'buildings-3d', () => (map.getCanvas().style.cursor = ''));
};

/* ---- Typology filter (driven by clicking legend swatches) ---------------- */
DUCT.layers.typologyOff = new Set();

DUCT.layers.applyTypologyFilter = function () {
  const map = DUCT.map;
  if (!map.getLayer('buildings-3d')) return;
  const off = DUCT.layers.typologyOff;
  if (off.size === 0) {
    map.setFilter('buildings-3d', null);
    return;
  }
  const keep = DUCT.config.typologyOrder.filter((l) => !off.has(l));
  map.setFilter('buildings-3d', [
    'in', ['get', 'typology_label'], ['literal', keep]
  ]);
};

DUCT.layers.toggleTypology = function (label) {
  const off = DUCT.layers.typologyOff;
  if (off.has(label)) off.delete(label);
  else off.add(label);
  DUCT.layers.applyTypologyFilter();
};

DUCT.layers.resetTypology = function () {
  DUCT.layers.typologyOff.clear();
  DUCT.layers.applyTypologyFilter();
};

/* ---- LCZ: pre-coloured PNG overlay --------------------------------------- */
DUCT.layers.addLCZ = async function () {
  if (!DUCT.isReady('lcz')) return;
  const map = DUCT.map;
  try {
    const res = await fetch(DUCT.config.paths.lczMeta, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const meta = await res.json();               // { bounds: [w,s,e,n], classes: [...] }
    DUCT.layers.lczMeta = meta;
    const [w, s, e, n] = meta.bounds;
    map.addSource('lcz', {
      type: 'image',
      url: DUCT.config.paths.lczImage,
      coordinates: [[w, n], [e, n], [e, s], [w, s]]
    });
    map.addLayer({
      id: 'lcz-raster',
      type: 'raster',
      source: 'lcz',
      layout: { visibility: 'none' },
      paint: {
        'raster-opacity': DUCT.config.lczOpacity != null
          ? DUCT.config.lczOpacity : DUCT.config.defaultOpacity,
        'raster-resampling': 'nearest'
      }
    }, DUCT.layers.firstSymbolId());
  } catch (err) {
    console.info('LCZ not loaded (%s)', err.message);
  }
};

/* ---- WRF surface fields: animated image-source frames --------------------
   One raster source, swapped both across time (frames) and across variables
   (T2 / RH / wind speed). Every variable shares the same grid, bounds and time
   axis, so switching variable keeps the current hour.
--------------------------------------------------------------------------- */
DUCT.layers.addWRF = async function () {
  if (!DUCT.isReady('wrf_t2')) return;
  const map = DUCT.map;
  const cfg = DUCT.config;
  try {
    const res = await fetch(cfg.paths.wrfIndex, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const index = await res.json();
    if (!index.variables || !index.variables.length) {
      console.info('WRF index present but lists no variables — run scripts/10');
      return;
    }
    DUCT.layers.wrf.catalog = index;

    const first = index.default || index.variables[0].id;
    const meta = await DUCT.layers.loadVarMeta(first);
    if (!meta) return;
    DUCT.layers.wrf.active = first;
    DUCT.layers.wrf.loaded = true;

    const [w, s, e, n] = meta.bounds;
    DUCT.layers.wrf.bounds = meta.bounds;

    map.addSource('wrf-field', {
      type: 'image',
      url: cfg.paths.wrfBase + first + '/' + meta.frames[0],
      coordinates: [[w, n], [e, n], [e, s], [w, s]]
    });
    map.addLayer({
      id: 'wrf-t2-raster',          // id kept stable for the visibility helpers
      type: 'raster',
      source: 'wrf-field',
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': cfg.defaultOpacity, 'raster-fade-duration': 0 }
    }, DUCT.layers.firstSymbolId());
  } catch (err) {
    console.info('WRF frames not loaded (%s)', err.message);
    DUCT.layers.wrf.loaded = false;
  }
};

// Fetch and cache one variable's manifest.
DUCT.layers.loadVarMeta = async function (id) {
  const cache = DUCT.layers.wrf.vars;
  if (cache[id]) return cache[id];
  try {
    const r = await fetch(DUCT.config.paths.wrfBase + id + '/meta.json', { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    cache[id] = await r.json();
    return cache[id];
  } catch (e) {
    console.info('variable %s not loaded (%s)', id, e.message);
    return null;
  }
};

// Switch displayed variable, holding the current hour.
DUCT.layers.setWRFVariable = async function (id) {
  const meta = await DUCT.layers.loadVarMeta(id);
  if (!meta) return;
  DUCT.layers.wrf.active = id;
  DUCT.layers.setWRFFrame(DUCT.layers.wrf.index);
  if (DUCT.legend && DUCT.legend.render) DUCT.legend.render();
};

// Active variable's manifest — what the timeline and legend read.
DUCT.layers.wrfMeta = function () {
  const w = DUCT.layers.wrf;
  return w.active ? w.vars[w.active] : null;
};

DUCT.layers.setWRFFrame = function (i) {
  const src = DUCT.map.getSource('wrf-field');
  const meta = DUCT.layers.wrfMeta();
  if (!src || !meta) return;
  const clamped = Math.max(0, Math.min(i, meta.frames.length - 1));
  DUCT.layers.wrf.index = clamped;
  src.updateImage({
    url: DUCT.config.paths.wrfBase + DUCT.layers.wrf.active + '/' + meta.frames[clamped]
  });
  DUCT.layers.setWindFrame(clamped);
};

/* ---- Wind vectors: arrows driven by the same timeline -------------------- */
DUCT.layers.wind = { data: null, ready: false };

DUCT.layers._arrowIcon = function () {
  // Drawn rather than sprited, so it needs no glyphs and survives basemap swaps.
  const S = 26, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.translate(S / 2, S / 2);
  ctx.beginPath();
  ctx.moveTo(0, -10); ctx.lineTo(4.5, 3); ctx.lineTo(0, 0.5); ctx.lineTo(-4.5, 3);
  ctx.closePath();
  ctx.fillStyle = '#16202e';
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.2;
  ctx.fill(); ctx.stroke();
  return ctx.getImageData(0, 0, S, S);
};

DUCT.layers.addWind = async function () {
  const map = DUCT.map;
  const cat = DUCT.layers.wrf.catalog;
  if (!cat || !cat.wind_vectors) return;
  try {
    if (!DUCT.layers.wind.data) {
      const r = await fetch(DUCT.config.paths.wrfBase + cat.wind_vectors, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      DUCT.layers.wind.data = await r.json();
    }
    if (!map.hasImage('wind-arrow')) {
      map.addImage('wind-arrow', DUCT.layers._arrowIcon(), { pixelRatio: 2 });
    }
    map.addSource('wind', { type: 'geojson', data: DUCT.layers._windGeoJSON(0) });
    map.addLayer({
      id: 'wind-arrows',
      type: 'symbol',
      source: 'wind',
      layout: {
        visibility: 'none',
        'icon-image': 'wind-arrow',
        'icon-rotate': ['get', 'bearing'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        // scale with speed so calm areas recede and gusty ones read
        'icon-size': ['interpolate', ['linear'], ['get', 'speed'], 0, 0.45, 8, 1.1]
      }
    });
    DUCT.layers.wind.ready = true;
    const l = DUCT.config.layers.find((x) => x.id === 'wrf_wind');
    if (l) l.ready = true;
  } catch (e) {
    console.info('wind vectors not loaded (%s)', e.message);
  }
};

DUCT.layers._windGeoJSON = function (frame) {
  const d = DUCT.layers.wind.data;
  if (!d) return { type: 'FeatureCollection', features: [] };
  const f = d.frames[Math.max(0, Math.min(frame, d.frames.length - 1))];
  return {
    type: 'FeatureCollection',
    features: d.points.map((p, k) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: p },
      // stored direction is meteorological (where wind comes FROM);
      // the arrow should point downwind, hence +180
      properties: { bearing: (f.d[k] + 180) % 360, speed: f.s[k] }
    }))
  };
};

DUCT.layers.setWindFrame = function (i) {
  const src = DUCT.map.getSource('wind');
  if (src && DUCT.layers.wind.data) src.setData(DUCT.layers._windGeoJSON(i));
};

/* ---- Add every data layer, bottom-up -------------------------------------
   Called at boot and again after each basemap switch, since setStyle() drops
   all app-added sources and layers.
--------------------------------------------------------------------------- */
DUCT.layers.addAll = async function () {
  await DUCT.layers.addLCZ();       // ground classification, lowest
  await DUCT.layers.addWRF();       // surface fields above it
  await DUCT.layers.addWind();      // arrows over the field
  await DUCT.layers.addBoundary();
  DUCT.layers.addBuildings();       // massing above both rasters
  await DUCT.stations.load();       // markers on top of everything
};

/* ---- Visibility + opacity helpers ---------------------------------------- */
DUCT.layers.setVisible = function (layerId, on) {
  const map = DUCT.map;
  const gl = {
    buildings: 'buildings-3d',
    lcz: 'lcz-raster',
    wrf_t2: 'wrf-t2-raster',
    wrf_wind: 'wind-arrows'
  }[layerId];
  if (!gl || !map.getLayer(gl)) return;
  map.setLayoutProperty(gl, 'visibility', on ? 'visible' : 'none');
  // the highlight is a child of the buildings layer; never leave it orphaned
  if (layerId === 'buildings' && !on && map.getLayer('buildings-selected')) {
    map.setLayoutProperty('buildings-selected', 'visibility', 'none');
  }
};

DUCT.layers.setOpacity = function (layerId, value) {
  const map = DUCT.map;
  if (DUCT.state && DUCT.state.opacity) DUCT.state.opacity[layerId] = value;
  if (layerId === 'lcz' && map.getLayer('lcz-raster'))
    map.setPaintProperty('lcz-raster', 'raster-opacity', value);
  if (layerId === 'wrf_t2' && map.getLayer('wrf-t2-raster'))
    map.setPaintProperty('wrf-t2-raster', 'raster-opacity', value);
};
