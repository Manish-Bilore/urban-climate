# Licence & attribution

## Code
Application code in this repository (`src/`, `styles/`, `scripts/`) — © iFOREST /
IHCAP. Choose and add a licence (e.g. MIT) before public release.

## Libraries
- MapLibre GL JS — BSD-3-Clause
- PMTiles — BSD-3-Clause
- Chart.js — MIT
- IBM Plex fonts — SIL Open Font License 1.1

## Basemaps
All basemaps are keyless. Attribution is carried by MapLibre's attribution
control, which updates automatically when the basemap is switched.

- **OpenFreeMap** (Positron, Bright, Liberty, Fiord) — © OpenFreeMap
  contributors, © OpenMapTiles, © OpenStreetMap contributors.
- **CARTO** (Positron, Voyager, Dark Matter) — © CARTO,
  © OpenStreetMap contributors. Free for use with attribution.
- **Sentinel-2 cloudless** (EOX) — required attribution: "Sentinel-2 cloudless -
  https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus
  Sentinel data 2024)", with the links live in online use. The 2018–2024
  vintages are **CC BY-NC-SA 4.0**, free for this project's non-commercial
  research use; the 2016 vintage is plain CC BY 4.0 should unrestricted terms
  ever be needed. Resolution is 10 m — good for urban context, not for reading
  individual footprints. EOX's public endpoint is **fair-use, not unlimited**:
  fine for a demo or a low-traffic project site, but mirror the tiles or take a
  paid plan before pointing sustained public traffic at it.

Esri World Imagery was considered and **deliberately excluded**: the anonymous
arcgisonline endpoint is widely used, but Esri's terms are written around ArcGIS
clients and are ambiguous for a standalone public web app.

## Data (attribute per source before publishing)
- **Buildings:** GBA / Global Building Atlas — check and cite its licence.
- **LCZ map:** WUDAPT-derived; cite the classification source.
- **WRF outputs:** IHCAP Nagpur DUCT (this project).
- **Station observations:** MPCB — cite as required.
- **Boundary:** replace the placeholder with the official NMC boundary and cite.

The reference twin that inspired this viewer: Cooling Singapore / Singapore-ETH
Centre, urbandt.org.
