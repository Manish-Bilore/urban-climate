#!/usr/bin/env bash
# ============================================================================
# 01 — Clip building footprints to the Nagpur extent and export as
#      newline-delimited GeoJSON (the input tippecanoe wants).
#
# Handles projected source data (e.g. UTM): -t_srs reprojects the output to
# EPSG:4326, and -spat_srs tells GDAL the filter box is in lon/lat rather than
# the source CRS. Without -spat_srs a lon/lat box against UTM data matches
# nothing and you get an empty file.
# ============================================================================
set -euo pipefail
source "$(dirname "$0")/config.sh"

command -v ogr2ogr >/dev/null || { echo "ERROR: GDAL (ogr2ogr) not found."; exit 1; }
[ -f "$GBA_GPKG" ] || { echo "ERROR: GPKG not found: $GBA_GPKG"; exit 1; }

# --- Resolve the layer name (first layer unless GBA_LAYER is set) -----------
LAYER="${GBA_LAYER}"
if [ -z "$LAYER" ]; then
  LAYER=$(ogrinfo -so "$GBA_GPKG" | sed -n 's/^[0-9]\+: \(.*\) (.*)$/\1/p' | head -1)
fi
[ -n "$LAYER" ] || { echo "ERROR: could not resolve layer name; set GBA_LAYER."; exit 1; }
echo "Layer:  ${LAYER}"

FIELDS=$(ogrinfo -so "$GBA_GPKG" "$LAYER")
echo "$FIELDS" | grep -E "Feature Count|Extent" || true
echo "$FIELDS" | grep -E "PROJCRS|GEOGCRS|^Layer SRS" | head -2 || true
echo

# --- Verify the height field exists ----------------------------------------
if ! echo "$FIELDS" | grep -qE "^${HEIGHT_FIELD}: "; then
  echo "ERROR: HEIGHT_FIELD='${HEIGHT_FIELD}' not found. Available fields:"
  echo "$FIELDS" | grep -E "^[A-Za-z_][A-Za-z0-9_]*: " | sed 's/^/  /'
  exit 1
fi

# --- Fields to carry through ------------------------------------------------
# The viewer needs 'height'. The popup labels features with building_id, and
# falls back to 'id'. A typology field is carried through when present — it is
# the natural join key for CEA archetypes later.
SEL="${HEIGHT_FIELD}"
[ -n "${ID_FIELD}" ] && SEL="${SEL},${ID_FIELD}"
for extra in typology_label typology; do
  if echo "$FIELDS" | grep -qE "^${extra}: "; then SEL="${SEL},${extra}"; break; fi
done
echo "Fields: ${SEL}"
echo

rm -f "$BLD_GEOJSONL"
ogr2ogr -f GeoJSONSeq "$BLD_GEOJSONL" "$GBA_GPKG" "$LAYER" \
  -t_srs EPSG:4326 \
  -spat ${CLIP_W} ${CLIP_S} ${CLIP_E} ${CLIP_N} \
  -spat_srs EPSG:4326 \
  -clipdst ${CLIP_W} ${CLIP_S} ${CLIP_E} ${CLIP_N} \
  -select "${SEL}" \
  -progress

N=$(wc -l < "$BLD_GEOJSONL" | tr -d ' ')
echo
if [ "$N" -eq 0 ]; then
  echo "ERROR: zero features written. Check that the clip extent overlaps the"
  echo "       layer extent printed above (reproject it to lon/lat if needed)."
  exit 1
fi
echo "Wrote ${N} building features → ${BLD_GEOJSONL}"
echo "Next: scripts/02_make_pmtiles.sh"
