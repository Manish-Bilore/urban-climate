# PRD (lite) — Nagpur DUCT web viewer

## Problem
The Nagpur DUCT produces WRF → PALM-4U → CEA outputs that currently live
in NetCDF/CSV and static plots. Reviewers and planners can't explore them
spatially or over time. We need a shareable web viewer, modelled on the
Singapore-ETH reference twin (urbandt.org), that makes the urban heat-island
signal legible and grows as each model stage lands.

## Users
- **Milestone reviewers** — sanity-check spatial/temporal
  behaviour of the current run.
- **Planners / stakeholders** — see where heat concentrates and how the built
  form relates to it.
- **The project team** — a single URL to point at in M8/M9.

## Goal for this demo
A live GitHub Pages URL showing, for the frozen **v4** run (d03, Apr 2025, 96 h):
buildings in 3D, Local Climate Zones, and **T2** animated across the 96-hour
window, with station obs-vs-model comparison.

## Scope
**In:** MapLibre viewer; buildings (PMTiles, extruded by height); LCZ overlay;
WRF T2 hourly frames with a diurnal time-scrubber; per-station T2 chart;
PALM-4U and CEA as clearly-labelled pending layers; keyless + static hosting.

**Out (this pass):** raster tiles for WRF (PNG frames instead); multiple
variables (T2 only — single-axis discipline); future-scenario toggles;
PALM-4U volumetric / CesiumJS 3D; live CEA numbers.

## Non-goals / guardrails
- No fabricated results. Placeholders are watermarked and never presented as
  model output.
- The **relative inter-station ΔT (UHI)** is the interpretable product; the
  documented domain cold bias is noted, not hidden.

## Success criteria
- Public URL loads on desktop + mobile; basemap + boundary render with no token.
- Toggling layers works; the T2 scrubber plays smoothly across 96 frames.
- A reviewer can pick a station and see observed vs modelled T2.
- Adding a later model stage = drop files in `data/` + flip a flag; no rewrite.

## Milestones
- **This week:** scaffold + pipeline + hello-map (Tue); buildings + LCZ (Wed);
  WRF frames + scrubber (Thu); legend + stations + share URL (Fri).
- **Later:** PALM-4U once `palm_csd` is unblocked; CEA when Rohit's morphology
  lands; 2050 CMIP6 delta scenarios.
