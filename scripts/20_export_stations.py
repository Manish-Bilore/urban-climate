#!/usr/bin/env python3
''''exec python3 "$0" "$@" # '''
# ^ Runs correctly whether invoked as `python3 x.py`, `bash x.py`, `sh x.py`, or
#   `./x.py`. Under a shell the line above re-execs python3 on this same file;
#   under Python it is just an inert string. Arguments pass through either way.
# ============================================================================
# 20 — Build data/stations.json: extract modelled T2 at the LCZ-snapped grid
#      cells and align observed MPCB series to the WRF window.
#
# Model series are read at the canonical (i, j) cells (matching the R
# validation workflow). Marker coordinates are set to the extracted cell's
# XLONG/XLAT so the dot sits exactly on the sampled cell. Set AXIS_ORDER if
# your indices are (row, col) instead of (col, row).
# ============================================================================
import glob
import json
import os
import sys
from datetime import datetime, timedelta

import numpy as np
import xarray as xr

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from _duct_config import load_shell_config, pick      # noqa: E402
_SH = load_shell_config()      # values from scripts/config.sh win

CONFIG = {
    "wrf_dir":  pick(_SH, "WRF_DIR",
                     os.path.expanduser("~/WRF/runs_ucm/nagpur/apr2025_96h/wrf_lcz_slucm_v4_96h")),
    "wrf_glob": pick(_SH, "WRF_GLOB", "wrfout_d03_*"),
    "obs_dir":  pick(_SH, "STN_DIR",
                     os.path.expanduser("~/WRF/obs/mpcb")),   # <id>.csv: time,temp_c
    "axis_order": "ji",          # "ji" => T2[:, j, i] ; "ij" => T2[:, i, j]
    "ist_offset_hours": 5.5,
    "stations": [
        {"id": "mahal",    "name": "Mahal",     "lcz": 3, "i": 60, "j": 50},
        {"id": "ramnagar", "name": "Ram Nagar", "lcz": 6, "i": 40, "j": 51},
        {"id": "ambazari", "name": "Ambazari",  "lcz": 9, "i": 41, "j": 43},
    ],
}


def decode_times(ds):
    out = []
    for row in ds["Times"].values:
        s = row.decode() if isinstance(row, bytes) else b"".join(row.tolist()).decode()
        out.append(datetime.strptime(s.strip(), "%Y-%m-%d_%H:%M:%S"))
    return out


def load_obs(path, frame_times_ist):
    """Return a list aligned to frame_times_ist (nearest-hour match), or []."""
    if not os.path.exists(path):
        return []
    try:
        import pandas as pd
        df = pd.read_csv(path)
        tcol = df.columns[0]
        vcol = "temp_c" if "temp_c" in df.columns else df.columns[1]
        df[tcol] = pd.to_datetime(df[tcol])
        lut = {t.replace(minute=0, second=0, microsecond=0): float(v)
               for t, v in zip(df[tcol], df[vcol])}
        return [lut.get(ft.replace(minute=0, second=0, microsecond=0), None)
                for ft in frame_times_ist]
    except Exception as ex:
        print(f"  WARN: obs parse failed for {path}: {ex}")
        return []


def main():
    files = sorted(glob.glob(os.path.join(CONFIG["wrf_dir"], CONFIG["wrf_glob"])))
    if not files:
        sys.exit(f"ERROR: no wrfout files in {CONFIG['wrf_dir']}")

    # Read one file at a time: each wrfout carries the full 3D state, and only
    # T2 plus the grid is needed here.
    chunks, times_utc = [], []
    lon = lat = None
    for f in files:
        with xr.open_dataset(f, decode_times=False) as d:
            chunks.append(d["T2"].values.astype("float32") - 273.15)
            times_utc.extend(decode_times(d))
            if lon is None:
                lon = d["XLONG"].isel(Time=0).values
                lat = d["XLAT"].isel(Time=0).values
    t2c = np.concatenate(chunks, axis=0)

    off = timedelta(hours=CONFIG["ist_offset_hours"])
    frame_times = [t + off for t in times_utc]
    print(f"Read {len(files)} files -> {t2c.shape[0]} times, grid "
          f"{t2c.shape[1]}x{t2c.shape[2]}")

    out_stations = []
    for st in CONFIG["stations"]:
        i, j = st["i"], st["j"]
        if CONFIG["axis_order"] == "ji":
            series = t2c[:, j, i]; clon, clat = float(lon[j, i]), float(lat[j, i])
        else:
            series = t2c[:, i, j]; clon, clat = float(lon[i, j]), float(lat[i, j])

        obs = load_obs(os.path.join(CONFIG["obs_dir"], st["id"] + ".csv"), frame_times)
        out_stations.append({
            "id": st["id"], "name": st["name"], "lcz": st["lcz"],
            "lon": round(clon, 5), "lat": round(clat, 5),
            "grid": [i, j],
            "model": [round(float(v), 2) for v in series],
            "obs": [None if v is None else round(v, 2) for v in obs],
        })
        print(f"  {st['name']:10s} cell=({i},{j}) -> {clat:.4f},{clon:.4f} "
              f"model[{len(series)}] obs[{len([o for o in obs if o is not None])}]")

    payload = {"generated": datetime.now().isoformat(timespec="seconds"),
               "stations": out_stations}
    op = os.path.join(ROOT, "data", "stations.json")
    json.dump(payload, open(op, "w"), indent=2)
    print(f"Wrote {op}")


if __name__ == "__main__":
    main()
