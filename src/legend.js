/* ============================================================================
   Legend — colorbar for the active variable, building typology, LCZ classes.
   Typology swatches are also the filter control: click one to drop that class
   from the map, click again to bring it back.
   ========================================================================== */
window.DUCT = window.DUCT || {};

DUCT.legend = {};

DUCT.legend.render = function () {
  const box = document.getElementById('legend');
  if (!box) return;
  box.innerHTML = '';
  const cfg = DUCT.config;

  // --- Active WRF variable colorbar ----------------------------------------
  const meta = DUCT.layers.wrfMeta();
  if (meta) {
    const wrap = document.createElement('div');
    wrap.className = 'legend-block';
    wrap.dataset.for = 'wrf_t2';
    const units = meta.units || '';
    const bar = cfg.paths.wrfBase + DUCT.layers.wrf.active + '/colorbar.png';
    const dp = (meta.vmax - meta.vmin) < 5 ? 1 : 0;
    wrap.innerHTML =
      `<div class="legend-title">${meta.long_name || 'WRF field'}</div>
       <img class="legend-bar" src="${bar}" alt="colour scale"
            onerror="this.style.display='none'"/>
       <div class="legend-scale">
         <span>${meta.vmin.toFixed(dp)}</span>
         <span>${((meta.vmin + meta.vmax) / 2).toFixed(dp)}</span>
         <span>${meta.vmax.toFixed(dp)} ${units}</span>
       </div>`;
    box.appendChild(wrap);
  }

  // --- Wind arrow key -------------------------------------------------------
  if (DUCT.map.getLayer && DUCT.map.getLayer('wind-arrows')) {
    const wrap = document.createElement('div');
    wrap.className = 'legend-block';
    wrap.dataset.for = 'wrf_wind';
    wrap.innerHTML =
      `<div class="legend-title">Wind vectors (10 m)</div>
       <div class="legend-note" style="margin-top:0;padding-top:0;border:0">
         arrows point downwind · size scales with speed</div>`;
    box.appendChild(wrap);
  }

  // --- Building typology (clickable filter) ---------------------------------
  if (DUCT.map.getLayer && DUCT.map.getLayer('buildings-3d')) {
    const wrap = document.createElement('div');
    wrap.className = 'legend-block';
    wrap.dataset.for = 'buildings';

    const head = document.createElement('div');
    head.className = 'legend-head';
    head.innerHTML =
      `<span class="legend-title">Building typology</span>
       <button class="legend-reset" type="button" hidden>reset</button>`;
    wrap.appendChild(head);

    cfg.typologyOrder.forEach((label) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'legend-row is-toggle';
      row.dataset.typology = label;
      row.setAttribute('aria-pressed', 'true');
      row.innerHTML =
        `<i style="background:${cfg.typologyColors[label]}"></i><span>${label}</span>`;
      row.addEventListener('click', () => {
        DUCT.layers.toggleTypology(label);
        DUCT.legend.syncTypology();
      });
      wrap.appendChild(row);
    });

    if (cfg.heightOffsetM) {
      const note = document.createElement('div');
      note.className = 'legend-note';
      note.textContent = `heights: GBA + ${cfg.heightOffsetM} m offset`;
      wrap.appendChild(note);
    }

    head.querySelector('.legend-reset').addEventListener('click', () => {
      DUCT.layers.resetTypology();
      DUCT.legend.syncTypology();
    });

    box.appendChild(wrap);
  }

  // --- LCZ swatches (only the classes actually in the raster) ---------------
  if (DUCT.map.getLayer && DUCT.map.getLayer('lcz-raster')) {
    const wrap = document.createElement('div');
    wrap.className = 'legend-block';
    wrap.dataset.for = 'lcz';

    const lm = DUCT.layers.lczMeta;
    const present = (lm && Array.isArray(lm.classes) && lm.classes.length)
      ? lm.classes.slice()
      : Object.keys(cfg.lczColors).map(Number);
    present.sort((a, b) => a - b);

    const counts = (lm && lm.counts) || null;
    const total = counts
      ? Object.values(counts).reduce((a, b) => a + b, 0)
      : 0;

    const row = (k) => {
      const share = counts && counts[String(k)] && total
        ? `<em>${(counts[String(k)] / total * 100).toFixed(1)}%</em>` : '';
      return `<div class="legend-row">
                <i style="background:${cfg.lczColors[k] || '#999'}"></i>
                <span>${cfg.lczLabels[k] || 'LCZ ' + k}</span>${share}
              </div>`;
    };

    const urban = present.filter((k) => k <= 10);
    const natural = present.filter((k) => k > 10);

    let html = '<div class="legend-title">Local Climate Zones</div>';
    html += urban.map(row).join('');
    if (natural.length) {
      html += '<div class="legend-sub">natural cover</div>' + natural.map(row).join('');
    }
    if (lm && lm.band) {
      html += `<div class="legend-note">band ${lm.band}` +
              (lm.band === 1 ? ' · unfiltered' : ' · filtered') + '</div>';
    }
    wrap.innerHTML = html;
    box.appendChild(wrap);
  }

  DUCT.legend.syncTypology();
  DUCT.legend.sync();
};

// Reflect which typologies are currently filtered out.
DUCT.legend.syncTypology = function () {
  const off = (DUCT.layers && DUCT.layers.typologyOff) || new Set();
  document.querySelectorAll('.legend-row[data-typology]').forEach((el) => {
    const isOff = off.has(el.dataset.typology);
    el.classList.toggle('is-off', isOff);
    el.setAttribute('aria-pressed', String(!isOff));
  });
  const reset = document.querySelector('.legend-reset');
  if (reset) reset.hidden = off.size === 0;
};

// Show only the legend blocks for currently-visible layers.
DUCT.legend.sync = function () {
  document.querySelectorAll('.legend-block').forEach((el) => {
    const id = el.dataset.for;
    const active = DUCT.state && DUCT.state.visible && DUCT.state.visible[id];
    el.style.display = active ? '' : 'none';
  });
  const box = document.getElementById('legend');
  const anyVisible = [...document.querySelectorAll('.legend-block')].some(
    (el) => el.style.display !== 'none'
  );
  box.classList.toggle('is-empty', !anyVisible);
};
