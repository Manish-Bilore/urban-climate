/* ============================================================================
   Map bootstrap — MapLibre GL + PMTiles protocol
   ========================================================================== */
window.DUCT = window.DUCT || {};

DUCT.map = null;
DUCT.metadata = null;

// Register the pmtiles:// protocol so vector tiles can be served from a single
// static .pmtiles archive over HTTP range requests (no tile server needed).
(function registerPMTiles() {
  if (window.pmtiles && window.maplibregl) {
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    DUCT._pmtilesProtocol = protocol;
  }
})();

// Fetch the runtime layer-readiness manifest. Falls back gracefully to the
// config defaults when the file is missing (e.g. opened from file://).
DUCT.loadMetadata = async function () {
  try {
    const res = await fetch(DUCT.config.paths.metadata, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    DUCT.metadata = await res.json();
  } catch (e) {
    console.info('metadata.json not loaded (%s) — using config defaults', e.message);
    DUCT.metadata = null;
  }
  // Merge readiness flags onto the config layer registry.
  DUCT.config.layers.forEach((layer) => {
    const m = DUCT.metadata && DUCT.metadata.layers && DUCT.metadata.layers[layer.id];
    if (m && typeof m.ready === 'boolean') layer.ready = m.ready;
    if (m && m.note) layer.note = m.note;
  });
};

// True when a layer's data has been generated (flag set by the export scripts).
DUCT.isReady = function (id) {
  const l = DUCT.config.layers.find((x) => x.id === id);
  return !!(l && l.ready);
};

DUCT.initMap = function () {
  const c = DUCT.config;
  const map = new maplibregl.Map({
    container: 'map',
    style: c.basemapStyle,
    center: c.center,
    zoom: c.zoom,
    minZoom: c.minZoom,
    maxZoom: c.maxZoom,
    pitch: c.pitch,
    bearing: c.bearing,
    attributionControl: false,
    hash: false
  });

  map.addControl(
    new maplibregl.AttributionControl({ compact: true }),
    'bottom-right'
  );
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');

  DUCT.map = map;
  return map;
};
