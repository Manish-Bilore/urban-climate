/* ============================================================================
   App orchestrator — boot sequence and UI wiring.
   ========================================================================== */
window.DUCT = window.DUCT || {};
DUCT.state = { visible: {}, opacity: {} };

// Build the layer panel from the config registry + runtime readiness.
DUCT.buildPanel = function () {
  const list = document.getElementById('layer-list');
  list.innerHTML = '';
  DUCT.config.layers.forEach((layer) => {
    const ready = layer.ready;
    const row = document.createElement('div');
    row.className = 'layer' + (ready ? '' : ' is-pending');

    const left = document.createElement('label');
    left.className = 'layer-toggle';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.disabled = !ready;
    cb.dataset.layer = layer.id;
    const name = document.createElement('span');
    name.textContent = layer.name;
    left.appendChild(cb);
    left.appendChild(name);

    const status = document.createElement('span');
    status.className = 'layer-status';
    status.textContent = ready ? '' : (layer.note || 'pending');

    row.appendChild(left);
    row.appendChild(status);

    // Variable selector — the WRF layer carries several surface fields on one
    // shared time axis, so switching variable holds the current hour.
    if (ready && layer.id === 'wrf_t2') {
      const cat = DUCT.layers.wrf.catalog;
      if (cat && cat.variables && cat.variables.length > 1) {
        const seg = document.createElement('div');
        seg.className = 'layer-vars';
        cat.variables.forEach((v) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'var-chip' + (v.id === DUCT.layers.wrf.active ? ' is-active' : '');
          b.textContent = v.short || v.id.toUpperCase();
          b.title = v.label + ' (' + v.units + ')';
          b.dataset.variable = v.id;
          b.disabled = true;
          b.addEventListener('click', async () => {
            if (v.id === DUCT.layers.wrf.active) return;
            seg.querySelectorAll('.var-chip').forEach((c) =>
              c.classList.toggle('is-active', c.dataset.variable === v.id));
            await DUCT.layers.setWRFVariable(v.id);
            if (DUCT.permalink) DUCT.permalink.write();
          });
          seg.appendChild(b);
        });
        row.appendChild(seg);
        row._vars = seg;
      }
    }

    // Opacity slider for raster/timeseries layers
    if (ready && (layer.kind === 'raster' || layer.kind === 'timeseries')) {
      const op = document.createElement('input');
      op.type = 'range'; op.min = 0; op.max = 1; op.step = 0.05;
      op.value = layer.id === 'lcz' && DUCT.config.lczOpacity != null
        ? DUCT.config.lczOpacity
        : DUCT.config.defaultOpacity;
      op.className = 'layer-opacity';
      op.title = 'Opacity';
      op.addEventListener('input', () => DUCT.layers.setOpacity(layer.id, parseFloat(op.value)));
      op.disabled = true;                        // enabled when layer is toggled on
      row.appendChild(op);
      row._opacity = op;
      DUCT.state.opacity[layer.id] = parseFloat(op.value);
    }

    cb.addEventListener('change', () => {
      const on = cb.checked;
      DUCT.state.visible[layer.id] = on;
      DUCT.layers.setVisible(layer.id, on);
      if (row._opacity) row._opacity.disabled = !on;
      if (row._vars) row._vars.querySelectorAll('.var-chip').forEach((c) => (c.disabled = !on));
      if (layer.id === 'wrf_t2') {
        document.getElementById('timeline').classList.toggle('is-active', on);
      }
      DUCT.legend.sync();
      if (DUCT.permalink) DUCT.permalink.write();
    });

    list.appendChild(row);
  });
};

// Basemap picker, grouped light / dark / imagery.
DUCT.buildBasemapPicker = function () {
  const host = document.getElementById('basemap-list');
  if (!host) return;
  host.innerHTML = '';
  const groups = { light: 'Light', dark: 'Dark', imagery: 'Imagery' };
  Object.keys(groups).forEach((g) => {
    const items = DUCT.config.basemaps.filter((b) => b.group === g);
    if (!items.length) return;
    const label = document.createElement('div');
    label.className = 'basemap-group';
    label.textContent = groups[g];
    host.appendChild(label);
    const wrap = document.createElement('div');
    wrap.className = 'basemap-chips';
    items.forEach((bm) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'basemap-chip';
      chip.dataset.basemap = bm.id;
      chip.textContent = bm.name;
      if (bm.id === DUCT.basemaps.current) chip.classList.add('is-active');
      chip.addEventListener('click', () => {
        if (DUCT.basemaps.switching || bm.id === DUCT.basemaps.current) return;
        document.querySelectorAll('.basemap-chip').forEach((c) =>
          c.classList.toggle('is-active', c.dataset.basemap === bm.id));
        DUCT.basemaps.set(bm.id);
        if (DUCT.permalink) DUCT.permalink.write();
      });
      wrap.appendChild(chip);
    });
    host.appendChild(wrap);
  });
};

// Directional light so extrusions read as massing rather than flat blocks.
DUCT.applyLightRig = function () {
  const map = DUCT.map;
  if (typeof map.setLight !== 'function') return;
  try {
    map.setLight({ anchor: 'viewport', position: [1.4, 200, 40],
                   color: '#ffffff', intensity: 0.32 });
  } catch (e) { /* style has no light support; extrusions still render */ }
};

DUCT.setStatusChip = function () {
  const chip = document.getElementById('status-chip');
  const r = DUCT.config.run;
  const v = DUCT.config.validation || {};
  const run = (v.runs || {})[r.id] || null;
  const state = (v.states || {})[(run && run.status) || 'unvalidated'] ||
                { dot: 'none', label: 'Unvalidated' };

  chip.innerHTML =
    '<button class="chip-face" id="chip-face" aria-expanded="false">' +
      '<b>' + r.label + '</b>' +
      '<span>' + r.window + '</span>' +
      '<em><i class="dot dot-' + state.dot + '"></i>' + state.label + '</em>' +
    '</button>' +
    '<div class="chip-detail" id="chip-detail" hidden>' +
      (run ? '<p class="chip-run">' + run.label + '</p>' +
             '<p class="chip-note">' + run.note + '</p>' : '') +
      '<p class="chip-window">' + (v.window || '') + '</p>' +
      '<p class="chip-hint">Click a station marker for its validation record.</p>' +
    '</div>';

  const face = document.getElementById('chip-face');
  const detail = document.getElementById('chip-detail');
  face.addEventListener('click', () => {
    const open = detail.hasAttribute('hidden');
    detail.toggleAttribute('hidden', !open);
    face.setAttribute('aria-expanded', String(open));
    chip.classList.toggle('is-open', open);
  });
};

// Chain status — which stage of the twin is live. The downstream toggles are
// disabled anyway; saying why is more honest than leaving them greyed out.
DUCT.buildChainStatus = function () {
  const host = document.getElementById('chain-status');
  if (!host || !DUCT.config.chain) return;
  host.innerHTML = DUCT.config.chain.map((c) =>
    '<div class="chain-row is-' + c.state + '">' +
      '<span class="dot dot-' + (c.state === 'active' ? 'ok' : 'none') + '"></span>' +
      '<span class="chain-tier">' + c.tier + '</span>' +
      '<span class="chain-label">' + c.label + '</span>' +
      '<span class="chain-state">' + (c.note || c.state) + '</span>' +
    '</div>').join('');
};

DUCT.boot = async function () {
  DUCT.setStatusChip();
  await DUCT.loadMetadata();

  const map = DUCT.initMap();
  DUCT.basemaps.current = DUCT.config.defaultBasemap;
  map.on('load', async () => {
    DUCT.applyLightRig();
    await DUCT.layers.addAll();

    DUCT.buildPanel();
    DUCT.buildBasemapPicker();
    DUCT.buildChainStatus();
    DUCT.timeline.init();
    DUCT.legend.render();

    // Close the station panel from the button or by clicking bare map.
    const closeBtn = document.getElementById('station-close');
    if (closeBtn) closeBtn.addEventListener('click', () => DUCT.stations.close());

    // Restore whatever the URL asked for, then keep it in step with the view.
    if (DUCT.permalink) {
      await DUCT.permalink.apply();
      DUCT.permalink.watchMap();
    }

    // Reveal chrome after first paint (respects reduced motion via CSS).
    document.body.classList.add('is-ready');
  });
};

document.addEventListener('DOMContentLoaded', DUCT.boot);
