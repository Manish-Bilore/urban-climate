/* ============================================================================
   Stations — observation points, obs-vs-model series, and the validation panel.

   This is where the model stops being a picture and starts being a claim. The
   panel therefore leads with the verdict (does this run clear the benchmark at
   this station?) and only then shows the curve.

   Statistics are recomputed in the browser whenever data/stations.json carries
   paired observations. When it does not — the committed demo file ships model
   series only — the panel falls back to the published table in config.js and
   says which it is showing, rather than quietly showing nothing.
   ========================================================================== */
window.DUCT = window.DUCT || {};

DUCT.stations = { data: null, chart: null, active: null, markers: null, _step: 0 };

/* ---- Statistics ---------------------------------------------------------- */
// Pairs are dropped wherever either series is missing, so a station with gaps
// reports on the hours it actually has.
DUCT.stations.stats = function (obs, model, skip) {
  if (!obs || !model || !obs.length) return null;
  const a = [], b = [];
  for (let i = skip || 0; i < Math.min(obs.length, model.length); i++) {
    const o = obs[i], m = model[i];
    if (o == null || m == null || Number.isNaN(o) || Number.isNaN(m)) continue;
    a.push(o); b.push(m);
  }
  const n = a.length;
  if (n < 3) return null;

  const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
  const oBar = mean(a), mBar = mean(b);

  let se = 0, ae = 0, num = 0, dO = 0, dM = 0, ioaDen = 0;
  for (let i = 0; i < n; i++) {
    const e = b[i] - a[i];
    se += e * e;
    ae += Math.abs(e);
    num += (a[i] - oBar) * (b[i] - mBar);
    dO += (a[i] - oBar) * (a[i] - oBar);
    dM += (b[i] - mBar) * (b[i] - mBar);
    const d = Math.abs(b[i] - oBar) + Math.abs(a[i] - oBar);
    ioaDen += d * d;
  }
  const bias = mBar - oBar;
  const rmse = Math.sqrt(se / n);
  return {
    n: n,
    bias: bias,
    mae: ae / n,
    rmse: rmse,
    // Centred RMSE isolates shape error from the mean offset. Clamped at zero
    // because floating point can push the difference microscopically negative.
    crmse: Math.sqrt(Math.max(0, rmse * rmse - bias * bias)),
    r: dO > 0 && dM > 0 ? num / Math.sqrt(dO * dM) : NaN,
    ioa: ioaDen > 0 ? 1 - se / ioaDen : NaN
  };
};

DUCT.stations.load = async function () {
  // Markers are DOM overlays, not style layers: they are immune to the glyph
  // differences between basemaps (OpenFreeMap ships Noto, Carto ships Open
  // Sans, a raster style ships neither) and they survive setStyle() intact.
  if (!DUCT.stations.data) {
    try {
      const res = await fetch(DUCT.config.paths.stations, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      DUCT.stations.data = await res.json();
    } catch (e) {
      console.info('stations not loaded (%s)', e.message);
      return;
    }
  }
  if (DUCT.stations.markers && DUCT.stations.markers.length) return;  // already placed

  DUCT.stations.markers = DUCT.stations.data.stations.map((s) => {
    const el = document.createElement('div');
    el.className = 'station-marker';
    el.innerHTML = '<i></i><b>' + s.name + '</b>';
    el.title = s.name + (s.lcz ? ' · LCZ ' + s.lcz : '');
    el.dataset.station = s.id;
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      DUCT.stations.select(s.id);
    });
    return new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([s.lon, s.lat])
      .addTo(DUCT.map);
  });
};

DUCT.stations.select = function (id) {
  const data = DUCT.stations.data;
  if (!data) return;
  const s = data.stations.find((x) => x.id === id);
  if (!s) return;

  DUCT.stations.active = s;
  document.querySelectorAll('.station-marker').forEach((el) =>
    el.classList.toggle('is-active', el.dataset.station === id));

  const panel = document.getElementById('station-panel');
  panel.classList.add('is-open');
  document.getElementById('station-name').textContent = s.name;
  document.getElementById('station-meta').textContent =
    (s.lcz ? DUCT.stations._lczLabel(s.lcz) + ' · ' : '') +
    s.lat.toFixed(3) + ', ' + s.lon.toFixed(3);

  DUCT.stations.drawVerdict(s);
  DUCT.stations.drawChart(s);
  DUCT.stations.markStep(DUCT.layers.wrf.index);
  if (DUCT.permalink) DUCT.permalink.write();
};

DUCT.stations.close = function () {
  document.getElementById('station-panel').classList.remove('is-open');
  DUCT.stations.active = null;
  document.querySelectorAll('.station-marker').forEach((el) => el.classList.remove('is-active'));
  if (DUCT.permalink) DUCT.permalink.write();
};

DUCT.stations._lczLabel = function (lcz) {
  const full = DUCT.config.lczLabels && DUCT.config.lczLabels[lcz];
  return full ? full.replace(/^LCZ [^·]*· /, 'LCZ ' + lcz + ' · ') : 'LCZ ' + lcz;
};

// Hours of spin-up to exclude, derived from the manifest's timestep.
DUCT.stations._skip = function () {
  const meta = DUCT.layers.wrfMeta && DUCT.layers.wrfMeta();
  return meta && meta.dt_hours ? Math.round(24 / meta.dt_hours) : 24;
};

/* ---- Verdict block ------------------------------------------------------- */
// Order matters: benchmark first, then the numbers behind it. A reader who
// stops after one line should still leave with the right impression.
DUCT.stations.drawVerdict = function (s) {
  const host = document.getElementById('station-verdict');
  if (!host) return;

  const v = DUCT.config.validation || {};
  const runId = (DUCT.config.run && DUCT.config.run.id) || '';
  const run = (v.runs || {})[runId] || null;

  // Live statistics win over the published table whenever observations exist.
  const live = DUCT.stations.stats(s.obs, s.model, DUCT.stations._skip());
  const table = run && run.stations ? run.stations[s.id] : null;
  const m = live || table;

  if (!m) {
    host.innerHTML =
      '<p class="verdict-empty">No validation record for this station in this run.</p>';
    return;
  }

  const bench = (v.benchmark && v.benchmark.rmse) || 2;
  const passes = m.rmse <= bench;
  const state = (v.states || {})[(run && run.status) || 'unvalidated'] ||
                { dot: 'none', label: 'Unvalidated' };

  const num = (x, d) => (x == null || Number.isNaN(x) ? '—' : x.toFixed(d == null ? 2 : d));
  const cell = (k, val, cls) =>
    '<div class="metric ' + (cls || '') + '"><span class="mv">' + val +
    '</span><span class="mk">' + k + '</span></div>';

  host.innerHTML =
    '<div class="verdict-head">' +
      '<span class="dot dot-' + state.dot + '"></span>' +
      '<span class="verdict-state">' + state.label + '</span>' +
      '<span class="verdict-bench ' + (passes ? 'is-pass' : 'is-miss') + '">RMSE ' +
        num(m.rmse) + ' K vs ' + ((v.benchmark && v.benchmark.label) || '≤ 2 K') +
      '</span>' +
    '</div>' +
    '<div class="metric-grid">' +
      cell('bias', num(m.bias) + ' K', m.bias < 0 ? 'is-cold' : 'is-warm') +
      cell('cRMSE', num(m.crmse) + ' K') +
      cell('MAE', num(m.mae) + ' K') +
      cell('r', num(m.r)) +
      cell('IOA', num(m.ioa)) +
      cell('n', String(m.n), 'is-quiet') +
    '</div>' +
    '<p class="verdict-source">' + (live
      ? 'Computed in the browser from the paired series below, spin-up excluded.'
      : 'Published record. This build ships model series without paired observations.') +
      (v.window ? ' ' + v.window + '.' : '') + '</p>';
};

/* ---- Series chart -------------------------------------------------------- */
DUCT.stations.drawChart = function (s) {
  const canvas = document.getElementById('station-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  const ctx = canvas.getContext('2d');

  const n = Math.max((s.model || []).length, (s.obs || []).length);
  const labels = Array.from({ length: n }, (_, i) => i);
  const hasObs = (s.obs || []).length > 0;
  const skip = DUCT.stations._skip();

  const runId = (DUCT.config.run && DUCT.config.run.id) || '';
  const runLabel = runId ? 'WRF ' + runId.toUpperCase() : 'WRF';

  const datasets = [];
  if (hasObs) {
    datasets.push({ label: 'Observed', data: s.obs, borderColor: '#e6edf5',
                    borderWidth: 1.5, pointRadius: 0, tension: 0.3 });
  }
  datasets.push({ label: runLabel, data: s.model || [], borderColor: '#3dd6c4',
                  borderWidth: 1.5, pointRadius: 0, tension: 0.3 });

  // Shade the spin-up so nobody reads statistics off hours that were discarded.
  const spinup = {
    id: 'spinup',
    beforeDatasetsDraw: function (chart) {
      if (!chart.scales.x || skip <= 0 || n < 2) return;
      const x0 = chart.scales.x.getPixelForValue(0);
      const x1 = chart.scales.x.getPixelForValue(Math.min(skip, n - 1));
      const area = chart.chartArea;
      const c = chart.ctx;
      c.save();
      c.fillStyle = 'rgba(138,155,176,0.12)';
      c.fillRect(x0, area.top, x1 - x0, area.bottom - area.top);
      c.restore();
    }
  };

  // Vertical rule at the hour currently on the map, so the panel and the
  // timeline read the same instant. Inline rather than pulling in the
  // annotation plugin for one line.
  const playhead = {
    id: 'playhead',
    afterDatasetsDraw: function (chart) {
      const i = DUCT.stations._step;
      if (i == null || !chart.scales.x) return;
      const x = chart.scales.x.getPixelForValue(i);
      const area = chart.chartArea;
      const c = chart.ctx;
      c.save();
      c.strokeStyle = 'rgba(61,214,196,0.6)';
      c.lineWidth = 1;
      c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(x, area.top); c.lineTo(x, area.bottom); c.stroke();
      c.restore();
    }
  };

  const opts = {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: { title: { display: true, text: 'hour', color: '#8a9bb0' },
           ticks: { color: '#8a9bb0', maxTicksLimit: 8 },
           grid: { color: 'rgba(255,255,255,0.05)' } },
      y: { title: { display: true, text: '°C', color: '#8a9bb0' },
           ticks: { color: '#8a9bb0' }, grid: { color: 'rgba(255,255,255,0.05)' } }
    },
    plugins: {
      legend: { labels: { color: '#e6edf5', boxWidth: 12, font: { size: 11 } } },
      tooltip: { backgroundColor: '#16202e', borderColor: '#263346', borderWidth: 1 }
    }
  };

  if (DUCT.stations.chart) DUCT.stations.chart.destroy();
  DUCT.stations.chart = new Chart(ctx, {
    type: 'line',
    data: { labels: labels, datasets: datasets },
    options: opts,
    plugins: [spinup, playhead]
  });
};

/* ---- Follow the timeline ------------------------------------------------- */
DUCT.stations.markStep = function (i) {
  DUCT.stations._step = i;
  const s = DUCT.stations.active;
  const readout = document.getElementById('station-now');
  if (readout) {
    const mv = s ? (s.model || [])[i] : null;
    const ov = s ? (s.obs || [])[i] : null;
    readout.innerHTML = (mv == null) ? '' :
      '<span class="now-v">' + mv.toFixed(1) + '<i>°C</i></span>' +
      '<span class="now-k">modelled · hour ' + String(i + 1).padStart(2, '0') + '</span>' +
      (ov == null ? '' : '<span class="now-obs">observed ' + ov.toFixed(1) + ' °C</span>');
  }
  if (DUCT.stations.chart) DUCT.stations.chart.update('none');
};
