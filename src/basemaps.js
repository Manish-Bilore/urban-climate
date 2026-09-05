/* ============================================================================
   Basemaps — switch the underlying style without losing the data layers.

   map.setStyle() discards every source and layer the app added, so a switch has
   to capture the app's state, swap the style, re-add everything, then restore.
   ========================================================================== */
window.DUCT = window.DUCT || {};

DUCT.basemaps = { current: null, switching: false };

DUCT.basemaps.get = function (id) {
  return DUCT.config.basemaps.find((b) => b.id === id) || null;
};

// Build a minimal MapLibre style around an XYZ raster service. Glyphs are
// borrowed so symbol layers (station labels) still render over imagery.
DUCT.basemaps.rasterStyle = function (bm) {
  return {
    version: 8,
    glyphs: DUCT.config.rasterGlyphs,
    sources: {
      'basemap-raster': {
        type: 'raster',
        tiles: bm.tiles,
        tileSize: bm.tileSize || 256,
        maxzoom: bm.maxzoom || 19,
        attribution: bm.attribution || ''
      }
    },
    layers: [
      { id: 'basemap-bg', type: 'background', paint: { 'background-color': '#0b0f14' } },
      { id: 'basemap-raster', type: 'raster', source: 'basemap-raster',
        paint: { 'raster-opacity': 1 } }
    ]
  };
};

DUCT.basemaps.styleFor = function (bm) {
  return bm.type === 'raster' ? DUCT.basemaps.rasterStyle(bm) : bm.url;
};

// Imagery basemaps are dark; nudge chrome that assumes a light canvas.
DUCT.basemaps._applyTheme = function (bm) {
  document.body.classList.toggle('basemap-dark',
    bm.group === 'imagery' || bm.group === 'dark');
};

DUCT.basemaps.set = async function (id) {
  const bm = DUCT.basemaps.get(id);
  const map = DUCT.map;
  if (!bm || !map || DUCT.basemaps.switching) return;
  if (DUCT.basemaps.current === id) return;

  DUCT.basemaps.switching = true;
  DUCT.basemaps.current = id;

  // --- capture everything the new style will destroy ------------------------
  const snapshot = {
    visible: Object.assign({}, DUCT.state.visible),
    opacity: Object.assign({}, DUCT.state.opacity),
    typologyOff: new Set(DUCT.layers.typologyOff),
    variable: DUCT.layers.wrf.active,
    frame: DUCT.layers.wrf.index
  };

  DUCT.basemaps._applyTheme(bm);
  map.setStyle(DUCT.basemaps.styleFor(bm));

  map.once('styledata', async () => {
    try {
      await DUCT.layers.addAll();

      // --- restore ---------------------------------------------------------
      DUCT.layers.typologyOff = snapshot.typologyOff;
      DUCT.layers.applyTypologyFilter();

      Object.keys(snapshot.opacity).forEach((k) => {
        DUCT.layers.setOpacity(k, snapshot.opacity[k]);
      });

      Object.keys(snapshot.visible).forEach((k) => {
        DUCT.state.visible[k] = snapshot.visible[k];
        DUCT.layers.setVisible(k, snapshot.visible[k]);
      });

      if (snapshot.variable) await DUCT.layers.setWRFVariable(snapshot.variable);
      if (DUCT.layers.wrfMeta()) DUCT.layers.setWRFFrame(snapshot.frame);

      DUCT.legend.render();
      DUCT.applyLightRig();
    } catch (err) {
      console.warn('basemap switch: re-adding layers failed', err);
    } finally {
      DUCT.basemaps.switching = false;
    }
  });
};
