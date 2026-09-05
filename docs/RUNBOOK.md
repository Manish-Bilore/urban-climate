# Implementation runbook

Two roles (can be the same machine):
- **Data machine** — wherever your `wrfout` d03, GBA GPKG, and LCZ tif live
  (workstation or HPC). Runs the export scripts.
- **Site** — the static files + git + a browser.

Each export script writes into `data/` and flips its readiness flag in
`data/metadata.json`, so layers enable themselves as data lands — no frontend edits.

---

## 1 · Unzip + first light (no data yet)
Use `scripts/serve.py`, not `python3 -m http.server` — the stock server ignores
HTTP Range requests and PMTiles needs them.

```bash
unzip nagpur-duct.zip && cd nagpur-duct
python3 scripts/serve.py           # → http://localhost:8000
```
You should see the positron basemap + the dashed city outline. If that renders,
the frontend is good. Layer toggles stay disabled until their data exists.

## 2 · Deploy to GitHub Pages now, while it's trivial
Shake out Pages/Actions before any data is involved.
```bash
git init && git add -A && git commit -m "DUCT scaffold"
git branch -M main
git remote add origin https://github.com/<you>/nagpur-duct.git
git push -u origin main
```
On GitHub: **Settings → Pages → Source: GitHub Actions**. If the first push ran
before you set that, re-run it (Actions → Deploy → Run workflow). URL:
`https://<you>.github.io/nagpur-duct/` — confirm basemap + outline load there too.

## 3 · Tooling on the data machine
```bash
ogr2ogr --version                         # GDAL — you likely have it
pip install -r scripts/requirements.txt
# tippecanoe (usually not preinstalled):
git clone https://github.com/felt/tippecanoe && cd tippecanoe && make -j && sudo make install && cd ..
```

## 4 · Point the scripts at your data
Edit `scripts/config.sh` (shell) **and** the `CONFIG` block atop each `.py`:
`GBA_GPKG`, `HEIGHT_FIELD`, `ID_FIELD`; `WRF_DIR`, `WRF_GLOB` (`wrfout_d03_*`);
`LCZ_TIF`; `STN_DIR` (MPCB CSVs named `<id>.csv`, columns `time,temp_c`).
Keep the shared paths consistent between the two.

## 5 · Buildings → PMTiles   ⟨gate: height field name⟩
```bash
ogrinfo -so "$GBA_GPKG"           # confirm the real height column → set HEIGHT_FIELD
cd scripts
bash 01_export_buildings.sh       # clips + reprojects, prints feature count
bash 02_make_pmtiles.sh           # writes nagpur_buildings.pmtiles, flips flag
```
If it warns PMTiles > 95 MB, host it on R2/S3 and point `paths.buildings` in
`src/config.js` at that URL. Reload localhost → tick **Buildings (3D)**.

## 6 · LCZ overlay
```bash
python3 11_export_lcz_overlay.py  # expect: classes present: [3, 6, 9, 10]
```
Reload → tick **Local Climate Zones**. Classes outside 3/6/9/10 render
transparent by design.

## 7 · WRF T2 frames   ⟨the main one⟩
```bash
python3 10_export_wrf_t2_frames.py   # renders one PNG per hour + colorbar + meta.json
```
Check: frame count = your hours, and `bounds` in `meta.json` are Nagpur lon/lat.
Reload → tick **Air temp (2 m)**, press play, scrub. Colour range auto-fits
(1st–99th pct); to pin it, set `vmin`/`vmax` in the CONFIG block and rerun.

## 8 · Stations   ⟨gate: i/j axis order⟩
```bash
python3 20_export_stations.py
```
Read the printed `cell=(i,j) -> lat,lon` per station — **those coords must land on
the real station**. If transposed, set `axis_order="ij"` in the CONFIG block and
rerun. Obs are matched by nearest hour; a station with no CSV gets model-only.
Reload → click a station dot for the obs-vs-model chart.

## 9 · Commit the data + push
`.gitignore` already keeps the raw `.geojsonl` out and commits the PMTiles + PNG
frames (right for a zero-hosting demo).
```bash
cd .. && git add -A && git commit -m "v4 data: buildings, LCZ, T2, stations" && git push
```
Refresh the Pages URL and re-check every layer live. Re-running exports and
re-committing grows git history — fine for the demo; switch to Git LFS or R2 if
you iterate heavily.

## 10 · Polish (optional)
- Replace `data/boundary/nagpur.geojson` with the official NMC boundary.
- Set the run label/window in `src/config.js` → `run`.
- PALM-4U / CEA stay greyed; they enable the same way when those outputs arrive.

---

## Troubleshooting
- **Layer still disabled after its script ran** → flag didn't flip; check
  `data/metadata.json`, and be sure you're serving over http (not `file://`) so
  the app can read it.
- **Heat frames misplaced** → re-check `bounds` in `data/wrf/t2/meta.json`.
- **Basemap blank on Pages but fine locally** → OpenFreeMap network; swap
  `basemapStyle` in `src/config.js` to the Carto URL noted there.
- **`ModuleNotFoundError: dask`** → you're on an old copy; these scripts open +
  concat directly and don't need dask. Re-pull.
