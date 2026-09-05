# Nagpur Digital Urban Climate Twin (DUCT)

An interactive web map for Nagpur that layers the city's building fabric, Local
Climate Zones, and WRF near-surface temperature (T2) over a 96-hour window,
with PALM-4U microclimate and CEA building-energy layers stubbed for later.

Built with **MapLibre GL JS** (keyless) + **PMTiles**, deployed as a static site
on **GitHub Pages**. No backend, no map token, no build step.

---

Explore the architecture 
https://manish-bilore.github.io/urban-climate/architecture/

Explore the Nagpur DUCT
https://manish-bilore.github.io/urban-climate/

## Quick start (local preview)

Serve over HTTP rather than opening the file directly — and use the bundled
server, not `python3 -m http.server`. The stock server ignores HTTP Range
requests, and PMTiles reads the buildings archive in byte slices, so every tile
fetch would pull the whole ~90 MB file.

```bash
cd urban-climate
python3 scripts/serve.py          # → http://localhost:8000
python3 scripts/serve.py 8080     # custom port
```

It prints which layers have data on disk, so a blank map is diagnosable from
the terminal. GitHub Pages supports Range natively, so this only matters
locally.

On first load you get the basemap + city outline. Layer toggles stay disabled
until their data is generated (below); they enable automatically as each export
script flips its flag in `data/metadata.json`.

---

## Deploy to GitHub Pages

1. Create a **public** repo and push this folder.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main`. The workflow in `.github/workflows/deploy.yml` publishes the
   site; the URL appears in the Actions run and under Settings → Pages.

Limits to keep in mind: 100 MB per file, ~1 GB site, ~100 GB/month bandwidth.
If the buildings PMTiles exceeds ~95 MB, host it on Cloudflare R2/S3 and point
`paths.buildings` in `src/config.js` at that URL (PMTiles works fine over HTTPS
range requests).

---

## Data runbook

Edit paths in `scripts/config.sh` (shell) and the `CONFIG` block at the top of
each Python script, then run in order. Every script writes into `data/` and
flips the matching readiness flag.

```bash
cd scripts
pip install -r requirements.txt

bash 01_export_buildings.sh          # footprints GPKG -> clipped GeoJSONSeq
bash 02_make_pmtiles.sh              # tippecanoe -> data/buildings/*.pmtiles
python3 10_export_wrf_t2_frames.py   # wrfout d03 -> hourly PNG frames + meta.json
python3 11_export_lcz_overlay.py     # LCZ GeoTIFF -> coloured PNG overlay
python3 20_export_stations.py        # model + obs series -> stations.json
```

`bash <script>` rather than `./<script>` matters on filesystems that cannot
carry the execute bit (NTFS, exFAT, or any `noexec` mount).

Useful extras:

```bash
python3 scripts/verify_pmtiles.py            # zoom range, bounds, layer, fields
python3 scripts/11_export_lcz_overlay.py --band 1   # unfiltered LCZ band
```

External tools required: **GDAL** (`ogr2ogr`) and **tippecanoe** (build from
source: <https://github.com/felt/tippecanoe>).

---

## Layout

```
index.html            app shell (map, dock, timeline, legend, station panel)
src/
  config.js           single source of truth (extent, palettes, basemaps, layers)
  map.js              MapLibre + PMTiles bootstrap, metadata loader
  basemaps.js         basemap catalogue + state-preserving style switching
  layers.js           draw order, buildings (3D), LCZ, WRF frame swapping
  timeline.js         diurnal-shaded scrubber + play/pause
  legend.js           colorbar, typology filter, LCZ classes
  stations.js         station markers + obs-vs-model chart
  app.js              boot sequence, layer panel, basemap picker
styles/main.css       instrument chrome
data/                 boundary, metadata, and script outputs
scripts/              numbered preprocessing pipeline + serve/verify helpers
docs/                 PRD, data spec, architecture + decision log, runbook
```

See `docs/` for scope, the per-layer data contract, and the decision log.
