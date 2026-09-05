/* ============================================================================
   Permalink — the visible state of the map, encoded in the URL hash.

   Written so the documentation site can link to a specific hour of a specific
   field rather than to the app's front door: a sentence about the 18:00 heat
   maximum can point at the 18:00 heat maximum. Also survives a reload, which
   matters when you are comparing two configurations in two tabs.

   Format:  #v=t2&h=18&l=buildings,lcz,wrf_t2&b=dark&s=mahal&m=21.15/79.09/12.4
   Every field is optional; anything unrecognised is ignored rather than fatal.
   ========================================================================== */
window.DUCT = window.DUCT || {};

DUCT.permalink = { _suspend: false };

DUCT.permalink.parse = function () {
  const raw = (location.hash || '').replace(/^#/, '');
  if (!raw) return null;
  const out = {};
  raw.split('&').forEach((pair) => {
    const i = pair.indexOf('=');
    if (i < 1) return;
    out[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1));
  });
  return Object.keys(out).length ? out : null;
};

// Called after every state change. Uses replaceState so scrubbing the timeline
// does not fill the back button with 96 history entries.
DUCT.permalink.write = function () {
  if (DUCT.permalink._suspend) return;
  const parts = [];
  const wrf = DUCT.layers && DUCT.layers.wrf;

  if (wrf && wrf.active) parts.push('v=' + wrf.active);
  if (wrf && wrf.index != null) parts.push('h=' + wrf.index);

  const on = Object.keys(DUCT.state.visible).filter((k) => DUCT.state.visible[k]);
  if (on.length) parts.push('l=' + on.join(','));

  if (DUCT.basemaps && DUCT.basemaps.current) parts.push('b=' + DUCT.basemaps.current);
  if (DUCT.stations && DUCT.stations.active) parts.push('s=' + DUCT.stations.active.id);

  const map = DUCT.map;
  if (map) {
    const c = map.getCenter();
    parts.push('m=' + c.lat.toFixed(4) + '/' + c.lng.toFixed(4) + '/' + map.getZoom().toFixed(1));
  }

  const hash = '#' + parts.join('&');
  if (hash !== location.hash) history.replaceState(null, '', hash);
};

// Applied once, after the panel exists. Layer state goes through the checkboxes
// rather than straight to the map, so the dock never disagrees with what is
// drawn.
DUCT.permalink.apply = async function () {
  const q = DUCT.permalink.parse();
  if (!q) return;
  DUCT.permalink._suspend = true;

  try {
    if (q.m) {
      const bits = q.m.split('/').map(parseFloat);
      if (bits.length === 3 && bits.every((n) => !Number.isNaN(n))) {
        DUCT.map.jumpTo({ center: [bits[1], bits[0]], zoom: bits[2] });
      }
    }

    if (q.b && DUCT.basemaps && q.b !== DUCT.basemaps.current) {
      const known = DUCT.config.basemaps.some((b) => b.id === q.b);
      if (known) {
        document.querySelectorAll('.basemap-chip').forEach((c) =>
          c.classList.toggle('is-active', c.dataset.basemap === q.b));
        DUCT.basemaps.set(q.b);
      }
    }

    if (q.l) {
      const want = q.l.split(',');
      document.querySelectorAll('#layer-list input[type="checkbox"]').forEach((cb) => {
        if (cb.disabled) return;
        const should = want.indexOf(cb.dataset.layer) !== -1;
        if (cb.checked !== should) {
          cb.checked = should;
          cb.dispatchEvent(new Event('change'));
        }
      });
    }

    if (q.v && DUCT.layers.setWRFVariable && q.v !== DUCT.layers.wrf.active) {
      const cat = DUCT.layers.wrf.catalog;
      const known = cat && cat.variables && cat.variables.some((v) => v.id === q.v);
      if (known) {
        document.querySelectorAll('.var-chip').forEach((c) =>
          c.classList.toggle('is-active', c.dataset.variable === q.v));
        await DUCT.layers.setWRFVariable(q.v);
      }
    }

    if (q.h != null) {
      const h = parseInt(q.h, 10);
      if (!Number.isNaN(h)) DUCT.timeline.goto(h);
    }

    if (q.s && DUCT.stations && DUCT.stations.data) DUCT.stations.select(q.s);
  } catch (e) {
    console.info('permalink not fully applied (%s)', e.message);
  } finally {
    DUCT.permalink._suspend = false;
    DUCT.permalink.write();
  }
};

DUCT.permalink.watchMap = function () {
  if (!DUCT.map) return;
  DUCT.map.on('moveend', () => DUCT.permalink.write());
};
