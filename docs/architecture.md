# Architecture & decision log

## Shape
A static site. No server, no database, no build step.

```
        GitHub Pages (static host)
        ├── index.html + src/*.js + styles/main.css
        └── data/  ── metadata.json (readiness)
                    ├── boundary/nagpur.geojson
                    ├── buildings/nagpur_buildings.pmtiles   (vector, range-requested)
                    ├── lcz/lcz.png + lcz_meta.json          (image overlay)
                    ├── wrf/t2/*.png + meta.json             (animated image source)
                    └── stations.json                        (obs vs model)

  Browser: MapLibre GL JS + pmtiles.js + Chart.js (UMD from CDN)
           window.DUCT namespace, plain scripts loaded in order:
           config → map → layers → timeline → legend → stations → app
```

The pipeline (`scripts/`) runs on the workstation/HPC and writes into `data/`.
The frontend only ever reads those files; the two sides meet at `docs/data_spec.md`.

## Rendering approach per layer
- **Buildings:** single PMTiles archive served by HTTP range requests →
  `fill-extrusion`. One file, no tile server.
- **LCZ:** pre-coloured PNG → `raster` image source. Categorical, static.
- **WRF T2:** pre-rendered PNG frames swapped on the image source. Cheap,
  deterministic, and avoids shipping a raster tile pyramid for the demo.
- **Stations:** GeoJSON points + a Chart.js line chart on click.

## Decision log
| # | Decision | Why | Trade-off / revisit |
|---|----------|-----|---------------------|
| 16 | Basemaps limited to **explicitly-licensed free services** | OpenFreeMap and CARTO publish their style URLs with stated attribution; EOX states CC BY-NC-SA for Sentinel-2. Esri World Imagery was dropped as ambiguous for non-ArcGIS apps | Revisit if a sub-metre imagery source with clear terms becomes available |
| 1 | **MapLibre GL**, not Mapbox | Keyless, no token, no billing; visitors don't paste a token (the reference site does) | Lose a few Mapbox-only conveniences |
| 2 | Basemap = **OpenFreeMap positron** | Free, no key, light canvas so data reads | Carto positron as drop-in fallback |
| 3 | WRF = **PNG frames**, not raster tiles | Fast to build, trivially hostable, good enough at d03 | Upgrade to tiles for multi-variable / zoom |
| 4 | Buildings = **PMTiles** | Single static file, range requests, no tile server | >95 MB → move to R2/S3 |
| 5 | **No build step**; UMD globals + plain scripts | Robust, no bundler/import-map fragility; edit-and-refresh | Less module hygiene than ESM |
| 6 | **T2 only** for the demo | Single-axis discipline; prove the pipeline first | Add variables once the shape is right |
| 7 | PALM-4U / CEA = **greyed stubs** | Ship now, reveal later without a rewrite | — |
| 8 | Readiness via **metadata.json flags** | Layers light up as data lands; missing data never breaks the map | Manual flip if a script is skipped |
| 9 | Geo-reg via **pcolormesh + axes→bounds** | Correct overlay registration, not just corner-stretching | Reproject if the domain rotation grows |
| 10 | Timestamps exported in **IST** | Reviewers read local wall-clock | Keep a UTC copy if needed later |
| 11 | Buildings coloured by **typology**, not height | 7 functional classes carry more planning meaning than a height ramp on stock with 2.7 m median; residential stays recessive so the other six read as figure | Revisit if a height-banded view is wanted for massing studies |
| 13 | Overlays inserted **beneath the basemap's first symbol layer**, stacked LCZ → WRF → boundary → buildings | Labels stay legible on top, and the LCZ ground classification no longer buries the building massing — this was the real cause, not opacity | `firstSymbolId()` returns undefined on raster-only styles, where layers stack on top instead |
| 14 | LCZ competing with buildings solved by **draw order alone**, not blending | Inserting the overlay beneath the extrusions fixed it outright; blend presets were built, tried, and removed as unnecessary UI weight. A single opacity slider remains | Revisit only if MapLibre gains true raster blend modes |
| 15 | Stations drawn as **HTML markers**, not a symbol layer | Glyph availability differs per basemap (OpenFreeMap ships Noto, CARTO ships Open Sans, raster styles ship none), so symbol labels vanished on some; markers are font-independent and survive `setStyle()` | Markers do not occlusion-cull against 3D extrusions |
| 12 | **+2 m display offset** on GBA heights | GBA is globally trained and under-estimates Indian low-rise; raw median 2.7 m renders as a flat sheet | Display-only, not a corrected dataset: popup shows both values, legend states the offset, `heightOffsetM: 0` restores raw |

## Signature UI
The **diurnal-shaded time-scrubber**: the 96-hour track is banded by day/night,
so the diurnal cycle that dominates the UHI signal is visible before pressing
play. Scrubbing time = watching the heat island breathe. Everything else in the
chrome stays quiet so the map and the heat colormap carry the attention.

## Known caveats carried from the modelling
- Domain-wide cold bias (~6–8 °C) is a documented systematic offset; the
  **relative inter-station ΔT** is the interpretable product, not absolute T.
- Placeholder geometry/fields (e.g. CEA attributes) are labelled pending and
  never rendered as results.

## Extension path
- **PALM-4U:** add a `data/palm4u/` layer once `palm_csd` is unblocked; likely a
  finer image/raster overlay or a CesiumJS 3D view for volumetric fields.
- **CEA:** join per-building energy onto the buildings PMTiles attributes; the
  click-popup already has slots for `cooling_demand` / `pv_potential`.
- **2050 scenarios:** a scenario switch selecting alternate frame sets
  (CMIP6 delta, SSP2-4.5 / SSP5-8.5).
