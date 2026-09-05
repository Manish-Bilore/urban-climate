#!/usr/bin/env bash
# ============================================================================
# 02 — Build a PMTiles vector archive from the clipped buildings, then mark
#      the buildings layer ready in data/metadata.json.
# ============================================================================
set -euo pipefail
source "$(dirname "$0")/config.sh"

command -v tippecanoe >/dev/null || {
  echo "ERROR: tippecanoe not found. Build it:"
  echo "  git clone https://github.com/felt/tippecanoe && cd tippecanoe && make -j && sudo make install"
  exit 1
}
[ -f "$BLD_GEOJSONL" ] || { echo "ERROR: run 01_export_buildings.sh first."; exit 1; }

rm -f "$BLD_PMTILES"
tippecanoe -o "$BLD_PMTILES" \
  -l buildings \
  -Z12 -z16 \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --no-tile-size-limit \
  --force \
  "$BLD_GEOJSONL"

SIZE_MB=$(du -m "$BLD_PMTILES" | cut -f1)
echo
echo "Wrote ${BLD_PMTILES} (${SIZE_MB} MB)"
if [ "${SIZE_MB}" -gt 95 ]; then
  echo "WARNING: >95 MB exceeds GitHub's 100 MB per-file limit."
  echo "         Host this .pmtiles on Cloudflare R2 / S3 and set paths.buildings"
  echo "         to that URL in src/config.js (PMTiles serves fine over HTTPS range requests)."
fi

# Flip the readiness flag so the layer toggle enables on next page load.
python3 - "$DATA_DIR/metadata.json" <<'PY'
import json, sys, datetime
p = sys.argv[1]
m = json.load(open(p))
m["layers"]["buildings"]["ready"] = True
m["generated"] = datetime.datetime.now().isoformat(timespec="seconds")
json.dump(m, open(p, "w"), indent=2)
print("metadata.json: buildings ready = True")
PY
echo "Next: scripts/10_export_wrf_t2_frames.py"
