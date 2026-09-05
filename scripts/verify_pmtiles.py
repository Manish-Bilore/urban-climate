#!/usr/bin/env python3
''''exec python3 "$0" "$@" # '''
# ^ Runs correctly whether invoked as `python3 x.py`, `bash x.py`, `sh x.py`, or
#   `./x.py`. Under a shell the line above re-execs python3 on this same file;
#   under Python it is just an inert string. Arguments pass through either way.
"""
Inspect a PMTiles archive without a browser.

Prints the zoom range, geographic bounds, tile count and embedded layer name,
so you can confirm the archive matches what the viewer expects before
debugging a blank map. Reads only the 127-byte header plus the metadata block.

Usage:
    python3 scripts/verify_pmtiles.py [path]
    (defaults to data/buildings/nagpur_buildings.pmtiles)
"""
import gzip
import json
import os
import struct
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT = os.path.join(ROOT, "data", "buildings", "nagpur_buildings.pmtiles")

TILE_TYPES = {0: "unknown", 1: "MVT (vector)", 2: "PNG", 3: "JPEG", 4: "WEBP", 5: "AVIF"}
COMPRESSION = {0: "unknown", 1: "none", 2: "gzip", 3: "brotli", 4: "zstd"}


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT
    if not os.path.exists(path):
        sys.exit(f"ERROR: not found: {path}")

    size = os.path.getsize(path)
    with open(path, "rb") as f:
        head = f.read(127)
        if head[:7] != b"PMTiles":
            sys.exit("ERROR: not a PMTiles archive (bad magic bytes)")
        version = head[7]

        meta_off, meta_len = struct.unpack_from("<QQ", head, 24)
        n_addressed, n_entries, n_contents = struct.unpack_from("<QQQ", head, 72)
        internal_comp, tile_comp, tile_type = head[97], head[98], head[99]
        minzoom, maxzoom = head[100], head[101]
        w, s, e, n = (v / 1e7 for v in struct.unpack_from("<iiii", head, 102))

        f.seek(meta_off)
        raw = f.read(meta_len)

    print(f"File          {os.path.basename(path)}  ({size / 1e6:.1f} MB)")
    print(f"Format        PMTiles v{version} · {TILE_TYPES.get(tile_type, '?')}")
    print(f"Zoom range    z{minzoom} – z{maxzoom}")
    print(f"Bounds        W {w:.4f}  S {s:.4f}  E {e:.4f}  N {n:.4f}")
    print(f"Tiles         {n_addressed:,} addressed · {n_entries:,} entries "
          f"· {n_contents:,} unique")
    print(f"Compression   internal {COMPRESSION.get(internal_comp, '?')} "
          f"· tiles {COMPRESSION.get(tile_comp, '?')}")

    # Metadata block holds the vector layer names tippecanoe wrote.
    try:
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        meta = json.loads(raw)
    except Exception as ex:
        print(f"Metadata      unreadable ({ex})")
        return

    layers = []
    vl = meta.get("vector_layers")
    if isinstance(vl, str):
        try:
            vl = json.loads(vl)
        except Exception:
            vl = None
    if isinstance(vl, list):
        layers = [d.get("id") for d in vl if isinstance(d, dict)]

    if layers:
        print(f"Layer name(s) {', '.join(str(x) for x in layers)}")
        for d in vl:
            if isinstance(d, dict) and d.get("fields"):
                print(f"  fields in '{d.get('id')}': "
                      f"{', '.join(sorted(d['fields'].keys()))}")
    else:
        print("Layer name(s) not listed in metadata")

    print()
    print("Checks against the viewer's expectations:")
    src_layer = layers[0] if layers else None
    if src_layer == "buildings":
        print("  sourceLayer 'buildings'   OK")
    else:
        print(f"  sourceLayer 'buildings'   MISMATCH — archive has {src_layer!r}")
        print("                            update sourceLayer in data/metadata.json")
    print(f"  minzoom is z{minzoom}          set config.js `zoom` to at least this,")
    print("                            or buildings will not draw at the opening view")


if __name__ == "__main__":
    main()
