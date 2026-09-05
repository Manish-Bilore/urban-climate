#!/usr/bin/env python3
''''exec python3 "$0" "$@" # '''
# ^ Runs correctly whether invoked as `python3 x.py`, `bash x.py`, `sh x.py`, or
#   `./x.py`. Under a shell the line above re-execs python3 on this same file;
#   under Python it is just an inert string. Arguments pass through either way.
# ============================================================================
# 11 — Colour an LCZ GeoTIFF into an RGBA PNG overlay (official WUDAPT palette)
#      and write its EPSG:4326 bounds for the MapLibre image source.
#
# Handles multi-band LCZ Generator output (lcz / lczFilter / classProbability):
# pick the band with CONFIG["band"]. Prints a class breakdown so the overlay can
# be checked against what was fed to W2W/WRF.
#
# Reprojection uses nearest-neighbour — LCZ values are categorical, and any
# averaging would invent classes that do not exist. Prefer feeding this script
# the original EPSG:4326 export rather than a reprojected copy, so the data is
# resampled at most once.
# ============================================================================
import json
import os
import sys
from datetime import datetime

import numpy as np
import rioxarray as rxr
from rasterio.enums import Resampling
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from _duct_config import load_shell_config, pick      # noqa: E402
_SH = load_shell_config()      # values from scripts/config.sh win

CONFIG = {
    "lcz_tif": pick(_SH, "LCZ_TIF", os.path.expanduser("~/WRF/gis/nagpur/lcz_nagpur.tif")),
    "out_dir": pick(_SH, "LCZ_OUT", os.path.join(ROOT, "data", "lcz")),
    # LCZ Generator exports 3 bands: 1 = lcz (raw), 2 = lczFilter (smoothed),
    # 3 = classProbability. Override per-run with --band. Keep this matched to
    # the band fed to W2W if the site is meant to mirror the WRF run.
    "band": 2,
    # Draw natural classes (11-17) as well as urban ones. Set False to show only
    # the built classes that drive the urban canopy scheme.
    "show_natural": True,
    "alpha": 235,
}

# Official WUDAPT / LCZ Generator palette (Stewart & Oke).
LCZ_RGB = {
    1:  (140, 0, 0),     2:  (209, 0, 0),     3:  (255, 0, 0),
    4:  (191, 77, 0),    5:  (255, 102, 0),   6:  (255, 153, 85),
    7:  (250, 238, 5),   8:  (188, 188, 188), 9:  (255, 204, 170),
    10: (85, 85, 85),
    11: (0, 106, 0),     12: (0, 170, 0),     13: (100, 133, 37),
    14: (185, 219, 121), 15: (0, 0, 0),       16: (251, 247, 174),
    17: (106, 106, 255),
}
LCZ_NAME = {
    1: "Compact high-rise", 2: "Compact mid-rise", 3: "Compact low-rise",
    4: "Open high-rise", 5: "Open mid-rise", 6: "Open low-rise",
    7: "Lightweight low-rise", 8: "Large low-rise", 9: "Sparsely built",
    10: "Heavy industry",
    11: "Dense trees (A)", 12: "Scattered trees (B)", 13: "Bush, scrub (C)",
    14: "Low plants (D)", 15: "Bare rock / paved (E)", 16: "Bare soil / sand (F)",
    17: "Water (G)",
}
URBAN = set(range(1, 11))


def parse_args():
    import argparse
    p = argparse.ArgumentParser(
        description="Export an LCZ overlay PNG + metadata for the DUCT viewer.")
    p.add_argument("--band", type=int, default=CONFIG["band"],
                   help="band to render: 1 = lcz (raw), 2 = lczFilter (smoothed). "
                        "Default: %(default)s")
    p.add_argument("--no-natural", action="store_true",
                   help="draw only built classes (1-10), leaving natural cover transparent")
    p.add_argument("--tif", default=None, help="override the LCZ GeoTIFF path")
    a = p.parse_args()
    CONFIG["band"] = a.band
    if a.no_natural:
        CONFIG["show_natural"] = False
    if a.tif:
        CONFIG["lcz_tif"] = a.tif
    return a


def main():
    parse_args()
    tif = CONFIG["lcz_tif"]
    if not os.path.exists(tif):
        sys.exit(f"ERROR: LCZ GeoTIFF not found: {tif}")

    da = rxr.open_rasterio(tif, masked=True)

    # --- Band selection -----------------------------------------------------
    if "band" in da.dims:
        n_bands = da.sizes["band"]
        names = da.attrs.get("long_name")
        if isinstance(names, str):
            names = [names]
        want = CONFIG["band"]
        if want < 1 or want > n_bands:
            sys.exit(f"ERROR: band {want} requested but file has {n_bands}")
        label = names[want - 1] if names and len(names) >= want else f"band {want}"
        print(f"File     {os.path.basename(tif)}  ({n_bands} band(s))")
        if names:
            print(f"Bands    {', '.join(f'{i+1}:{n}' for i, n in enumerate(names))}")
        print(f"Using    band {want} ({label})")
        da = da.sel(band=want)
    else:
        print(f"File     {os.path.basename(tif)}  (single band)")
    da = da.squeeze(drop=True)

    # --- Reproject to EPSG:4326 if needed, nearest-neighbour ---------------
    src_crs = da.rio.crs
    if src_crs is None:
        sys.exit("ERROR: raster has no CRS")
    if src_crs.to_epsg() != 4326:
        print(f"Reproj   {src_crs.to_string()} -> EPSG:4326 (nearest)")
        da = da.rio.reproject("EPSG:4326", resampling=Resampling.nearest)
    else:
        print("CRS      EPSG:4326 (no reprojection needed)")

    arr = np.nan_to_num(da.values, nan=0).astype(int)
    h, w = arr.shape

    # --- Class inventory ----------------------------------------------------
    vals, counts = np.unique(arr, return_counts=True)
    total = int(counts.sum())
    present = []
    print()
    print(f"{'LCZ':<5}{'class':<26}{'pixels':>10}{'share':>9}")
    for v, c in zip(vals, counts):
        v = int(v)
        if v == 0 or v not in LCZ_RGB:
            continue
        present.append(v)
        print(f"{v:<5}{LCZ_NAME[v]:<26}{int(c):>10,}{c / total * 100:>8.2f}%")

    urban_present = [v for v in present if v in URBAN]
    urban_px = sum(int(c) for v, c in zip(vals, counts) if int(v) in URBAN)
    if urban_px:
        print()
        print("share among urban classes only:")
        for v, c in zip(vals, counts):
            if int(v) in URBAN:
                print(f"  LCZ {int(v):<3} {int(c) / urban_px * 100:6.2f}%")

    # --- Render RGBA --------------------------------------------------------
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    drawn = []
    for cls in present:
        if not CONFIG["show_natural"] and cls not in URBAN:
            continue
        r, g, b = LCZ_RGB[cls]
        rgba[arr == cls] = (r, g, b, CONFIG["alpha"])
        drawn.append(cls)

    os.makedirs(CONFIG["out_dir"], exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(os.path.join(CONFIG["out_dir"], "lcz.png"))

    b = da.rio.bounds()   # (left, bottom, right, top) in EPSG:4326
    meta = {
        "band": CONFIG["band"],
        "bounds": [float(b[0]), float(b[1]), float(b[2]), float(b[3])],
        "size": [int(w), int(h)],
        "classes": drawn,
        "counts": {str(v): int(c) for v, c in zip(vals, counts) if int(v) in drawn},
        "show_natural": CONFIG["show_natural"],
        "generated": datetime.now().isoformat(timespec="seconds"),
    }
    with open(os.path.join(CONFIG["out_dir"], "lcz_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    print()
    print(f"Wrote    lcz.png ({w} x {h}) + lcz_meta.json")
    print(f"Bounds   W {b[0]:.4f}  S {b[1]:.4f}  E {b[2]:.4f}  N {b[3]:.4f}")
    print(f"Drawn    {len(drawn)} classes: {drawn}")

    mp = os.path.join(ROOT, "data", "metadata.json")
    m = json.load(open(mp))
    m["layers"]["lcz"]["ready"] = True
    m["generated"] = datetime.now().isoformat(timespec="seconds")
    json.dump(m, open(mp, "w"), indent=2)
    print("metadata.json: lcz ready = True")


if __name__ == "__main__":
    main()
