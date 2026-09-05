# Data spec — the contract between the pipeline and the viewer

Each layer is a set of static files under `data/` plus a readiness flag in
`data/metadata.json`. The frontend reads `metadata.json` at load and enables a
layer only when its flag is `true`, so missing data never breaks the map.

## metadata.json
```jsonc
{
  "layers": {
    "buildings": { "ready": bool, "source": "…pmtiles", "sourceLayer": "buildings", "heightField": "height" },
    "lcz":       { "ready": bool },
    "wrf_t2":    { "ready": bool },
    "palm4u":    { "ready": bool, "note": "…" },
    "cea":       { "ready": bool, "note": "…" }
  }
}
```

## Buildings — `data/buildings/nagpur_buildings.pmtiles`
- Vector PMTiles, layer name `buildings`, zooms 12–16.
- Required attribute: `height` (float, metres). Carried when present: `id`,
  `typology_label`. Added later by CEA: `cooling_demand`, `pv_potential`.
- Source: Nagpur typology footprints (757,922 features), **EPSG:32644
  (UTM 44N)**. Script 01 reprojects to EPSG:4326 on export; the clip box is
  lon/lat and is passed with `-spat_srs EPSG:4326` so it is not misread in the
  source CRS.
- Rendered as `fill-extrusion`, colour + height driven by `height`, with a
  minimum-height floor (`buildingMinHeight`) because the source contains
  near-zero values. Observed distribution: Q1 1.8 m, median 2.7 m, Q3 4.0 m,
  max 55.2 m — the colour ramp in `src/config.js` is calibrated to this.
- `typology_label` (7 classes) drives building colour and the legend filter, and
  is the natural join key for CEA archetypes: Residential, Commercial / Retail,
  Government / Civic, Industrial / Warehousing, Recreational / Open Space,
  Transport Hub, Religious / Cultural.
- **Displayed height is not the raw field.** `src/config.js` applies
  `heightOffsetM` (currently 2 m) then a `buildingMinHeight` floor. GBA is
  globally trained and under-estimates Indian low-rise stock; the offset is a
  display calibration only. The popup reports the raw GBA value alongside the
  rendered one, and the legend carries the offset note. Set `heightOffsetM: 0`
  to render the source values unchanged.

## Local Climate Zones — `data/lcz/lcz.png` + `lcz_meta.json`
- RGBA PNG using the official WUDAPT palette, covering every class present in
  the raster (built 1–10 and natural A–G / 11–17).
- Source is LCZ Generator output with three bands: `lcz` (raw), `lczFilter`
  (smoothed), `classProbability`. `CONFIG["band"]` in script 11 selects one —
  **use the same band that was fed to W2W**, so the site and the WRF run agree.
  Filtering is lossy for minor classes: on the Nagpur export it removes ~87% of
  LCZ 8 and roughly halves LCZ 10 and LCZ 13.
- Categorical data, so any reprojection uses nearest-neighbour. Prefer the
  original EPSG:4326 export over a reprojected copy so it is resampled at most
  once.
- `lcz_meta.json` carries `bounds` ([w, s, e, n], EPSG:4326), `band`, `size`,
  the `classes` drawn, and per-class pixel `counts`. The legend is built from
  these, so it lists only the classes that actually occur and shows each share.
- Rendered as a `raster` image overlay with nearest-neighbour resampling.
- The `classProbability` band is unused so far; it is the obvious basis for a
  future classification-confidence layer.

## WRF T2 — `data/wrf/t2/` (`meta.json`, `t2_NNN.png`, `colorbar.png`)
```jsonc
{
  "variable": "T2", "units": "°C", "cmap": "turbo",
  "vmin": <float>, "vmax": <float>,        // fixed across all frames
  "bounds": [w, s, e, n],                   // EPSG:4326, from XLONG/XLAT
  "t0": "<ISO, IST wall-clock>", "dt_hours": <float>, "tz_label": "IST",
  "nframes": <int>, "frames": ["t2_000.png", …]
}
```
- One transparent PNG per hour, drawn with `pcolormesh` at true lon/lat and axes
  mapped to `bounds` → overlays in register.
- Frames swapped via the MapLibre image source's `updateImage`.
- Colour range is fixed across frames so animation is comparable frame-to-frame.

## Stations — `data/stations.json`
```jsonc
{ "stations": [
  { "id": "mahal", "name": "Mahal", "lcz": 3, "lon": …, "lat": …, "grid": [i, j],
    "model": [<°C per frame>], "obs": [<°C per frame | null>] }
] }
```
- `lon`/`lat` are the sampled grid cell's `XLONG`/`XLAT` (marker sits on the
  extracted cell). Canonical LCZ-snapped cells: Mahal (60,50)/L3,
  Ram Nagar (40,51)/L6, Ambazari (41,43)/L9.
- `model` length = `wrf/t2/meta.json.nframes`; `obs` aligned by nearest hour,
  `null` where no observation exists.

## Boundary — `data/boundary/nagpur.geojson`
- Single Polygon/MultiPolygon, EPSG:4326. Replace the placeholder with the
  official NMC boundary when available.

## Coordinate + time conventions
- All spatial data in **EPSG:4326** (lon, lat).
- Image sources use corner order `[[w,n], [e,n], [e,s], [w,s]]`.
- Timestamps are shifted **UTC → IST (+5:30)** at export; the viewer renders
  them as-is with an `IST` label (no second offset).
