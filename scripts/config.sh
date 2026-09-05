#!/usr/bin/env bash
# ============================================================================
# Shared configuration for Nagpur DUCT preprocessing.
# Edit these paths to point at your local data, then run the numbered scripts.
# ============================================================================

# --- Repo root (this file lives in <repo>/scripts) --------------------------
DUCT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DUCT_ROOT}/data"

# --- Source data (CHANGE THESE) ---------------------------------------------
# Building footprints (GBA / Global Building Atlas), GeoPackage with a height field.
GBA_GPKG="/home/manish-iforest/Desktop/Web_3D_Model/nagpur-duct/data/buildings/nagpur_buildings_typology_all_buildings.gpkg"
GBA_LAYER=""                       # leave blank to use the first layer; set if multiple
HEIGHT_FIELD="height"              # verify with:  ogrinfo -so "$GBA_GPKG" <layer>
ID_FIELD="id"             # set to "" if absent

# WRF output (innermost domain d03) covering the 96 h window.
WRF_DIR="/home/manish-iforest/Desktop/Web_3D_Model/nagpur-duct/data/wrf/apr2025_96h/wrf_lcz_slucm_v4_96h"
WRF_GLOB="wrfout_d03_*"            # frames are read in filename order

# LCZ map (GeoTIFF, integer classes, EPSG:4326 preferred).
LCZ_TIF="/media/mb/HDD/3D Model/check/LCZ/8e11db745cab0704475758468c17490367248c8d.tif"

# Station observations (MPCB). CSV per station with columns: time,temp_c
STN_DIR="${HOME}/WRF/obs/mpcb"

# --- Clip extent for buildings (w s e n, EPSG:4326) -------------------------
CLIP_W=78.95; CLIP_S=21.00; CLIP_E=79.22; CLIP_N=21.25

# --- Output targets (inside the repo, served by GitHub Pages) ---------------
BLD_GEOJSONL="${DATA_DIR}/buildings/nagpur_buildings.geojsonl"
BLD_PMTILES="${DATA_DIR}/buildings/nagpur_buildings.pmtiles"
WRF_OUT="${DATA_DIR}/wrf"
LCZ_OUT="${DATA_DIR}/lcz"
STN_OUT="${DATA_DIR}/stations.json"

echo "DUCT_ROOT = ${DUCT_ROOT}"
