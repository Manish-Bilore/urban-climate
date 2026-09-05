#!/usr/bin/env python3
''''exec python3 "$0" "$@" # '''
# ^ Runs correctly whether invoked as `python3 x.py`, `bash x.py`, `sh x.py`, or
#   `./x.py`. Under a shell the line above re-execs python3 on this same file;
#   under Python it is just an inert string. Arguments pass through either way.
# ============================================================================
# 10 — Export WRF d03 surface fields to georeferenced PNG frame stacks.
#
#   t2  air temperature at 2 m   — read directly from T2
#   rh  relative humidity at 2 m — derived from T2, Q2, PSFC
#   ws  wind speed at 10 m       — derived from U10, V10 (earth-relative)
#
# Each variable gets its own folder with hourly frames, a meta.json manifest and
# a colorbar. A wind vector field is also written, subsampled, for the arrow
# overlay. Frames are drawn with pcolormesh at true lon/lat with the axes mapped
# to the geographic bounds, so MapLibre overlays them in register.
#
# Files are read one at a time: each wrfout carries the full 3D state, and only
# a handful of 2D fields are needed here.
# ============================================================================
import glob
import json
import os
import sys
from datetime import datetime, timedelta

import numpy as np
import xarray as xr
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colorbar import ColorbarBase
from matplotlib.colors import Normalize

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from _duct_config import load_shell_config, pick      # noqa: E402
_SH = load_shell_config()

# ----------------------------- CONFIG (edit me) -----------------------------
CONFIG = {
    "wrf_dir":  pick(_SH, "WRF_DIR",
                     os.path.expanduser("~/WRF/runs_ucm/nagpur/apr2025_96h/wrf_lcz_slucm_v4_96h")),
    "wrf_glob": pick(_SH, "WRF_GLOB", "wrfout_d03_*"),
    "out_dir":  pick(_SH, "WRF_OUT", os.path.join(ROOT, "data", "wrf")),
    "width_px": 1000,
    "ist_offset_hours": 5.5,      # UTC -> IST for display timestamps
    "wind_arrows_max": 22,        # arrows across the widest axis (subsampling)
}

# vmin/vmax None => robust auto (1st/99th percentile of the whole run)
VARIABLES = {
    "t2": {"label": "Air temperature (2 m)", "short": "Air temp",
           "units": "\u00b0C",       "cmap": "turbo",  "vmin": None, "vmax": None},
    "rh": {"label": "Relative humidity (2 m)", "short": "Humidity",
           "units": "%",             "cmap": "YlGnBu", "vmin": None, "vmax": None},
    "ws": {"label": "Wind speed (10 m)", "short": "Wind",
           "units": "m s\u207b\u00b9", "cmap": "viridis", "vmin": 0.0, "vmax": None},
}
# ---------------------------------------------------------------------------


def decode_times(ds):
    """UTC datetimes from the WRF 'Times' character variable."""
    out = []
    for row in ds["Times"].values:
        if isinstance(row, bytes):
            s = row.decode()
        elif isinstance(row, np.ndarray):
            s = b"".join(row.tolist()).decode()
        else:
            s = str(row)
        out.append(datetime.strptime(s.strip(), "%Y-%m-%d_%H:%M:%S"))
    return out


def relative_humidity(t2_k, q2, psfc_pa):
    """RH (%) at 2 m from temperature, mixing ratio and surface pressure.

    Tetens/Bolton saturation vapour pressure, as used by wrf-python's `rh`.
    Verified against published saturation mixing-ratio tables to within 0.3%.
    """
    es = 6.112 * np.exp(17.67 * (t2_k - 273.15) / (t2_k - 29.65))     # hPa
    p_hpa = psfc_pa / 100.0
    qvs = 0.622 * es / np.maximum(p_hpa - es, 1e-6)                   # mixing ratio
    return np.clip(100.0 * q2 / qvs, 0.0, 100.0)


def read_stack(files):
    """Read the 2D fields needed, one file at a time, plus grid and timestamps."""
    want = ["T2", "Q2", "PSFC", "U10", "V10"]
    got = {k: [] for k in want}
    times, missing = [], set()
    lon = lat = sina = cosa = None
    n = len(files)

    for k, f in enumerate(files):
        with xr.open_dataset(f, decode_times=False) as d:
            for v in want:
                if v in d.variables:
                    got[v].append(d[v].values.astype("float32"))
                else:
                    missing.add(v)
            try:
                times.extend(decode_times(d))
            except Exception:
                pass
            if lon is None:
                lon = d["XLONG"].isel(Time=0).values
                lat = d["XLAT"].isel(Time=0).values
                if "SINALPHA" in d.variables and "COSALPHA" in d.variables:
                    sina = d["SINALPHA"].isel(Time=0).values
                    cosa = d["COSALPHA"].isel(Time=0).values
        if (k + 1) % 24 == 0 or k == n - 1:
            print(f"  read {k + 1}/{n} files")

    stacked = {v: (np.concatenate(got[v], axis=0) if got[v] else None) for v in want}
    if missing:
        print(f"  NOTE: not present in output: {', '.join(sorted(missing))}")
    return stacked, lon, lat, times, sina, cosa


def render_stack(field, lon, lat, spec, out_dir, prefix, bounds, width_px):
    """Write one transparent PNG per timestep plus a colorbar; return manifest bits."""
    w, s, e, n = bounds
    vmin = spec["vmin"] if spec["vmin"] is not None else float(np.floor(np.nanpercentile(field, 1)))
    vmax = spec["vmax"] if spec["vmax"] is not None else float(np.ceil(np.nanpercentile(field, 99)))
    if vmax <= vmin:
        vmax = vmin + 1.0
    cmap = plt.get_cmap(spec["cmap"])

    dx, dy = (e - w), (n - s)
    W = width_px
    H = max(1, int(round(W * dy / dx)))
    dpi = 100
    os.makedirs(out_dir, exist_ok=True)

    nt = field.shape[0]
    frames = []
    for i in range(nt):
        fig = plt.figure(figsize=(W / dpi, H / dpi), dpi=dpi)
        ax = fig.add_axes([0, 0, 1, 1])
        ax.set_axis_off()
        ax.pcolormesh(lon, lat, field[i], cmap=cmap, vmin=vmin, vmax=vmax, shading="auto")
        ax.set_xlim(w, e)
        ax.set_ylim(s, n)
        fname = f"{prefix}_{i:03d}.png"
        fig.savefig(os.path.join(out_dir, fname), transparent=True, dpi=dpi)
        plt.close(fig)
        frames.append(fname)
        if (i + 1) % 24 == 0 or i == nt - 1:
            print(f"    rendered {i + 1}/{nt}")

    fig, ax = plt.subplots(figsize=(2.4, 0.32), dpi=200)
    fig.subplots_adjust(bottom=0.0, top=1.0, left=0.0, right=1.0)
    cb = ColorbarBase(ax, cmap=cmap, norm=Normalize(vmin=vmin, vmax=vmax),
                      orientation="horizontal")
    cb.outline.set_visible(False)
    ax.set_xticks([])
    fig.savefig(os.path.join(out_dir, "colorbar.png"), transparent=True, dpi=200)
    plt.close(fig)

    return frames, vmin, vmax


def main():
    # Earlier versions exported only T2 and pointed WRF_OUT straight at
    # data/wrf/t2. Each variable now gets its own subfolder, so a WRF_OUT ending
    # in a variable name would nest everything one level too deep and the viewer
    # would look for data/wrf/index.json in vain.
    out = CONFIG["out_dir"].rstrip("/")
    if os.path.basename(out) in VARIABLES:
        CONFIG["out_dir"] = os.path.dirname(out)
        print(f"NOTE: WRF_OUT pointed at '{os.path.basename(out)}/', which is now a "
              f"per-variable folder.\n      Writing to {CONFIG['out_dir']} instead — "
              f"update WRF_OUT in scripts/config.sh.")

    files = sorted(glob.glob(os.path.join(CONFIG["wrf_dir"], CONFIG["wrf_glob"])))
    if not files:
        sys.exit(f"ERROR: no files match {CONFIG['wrf_dir']}/{CONFIG['wrf_glob']}")
    print(f"Found {len(files)} wrfout file(s)")

    raw, lon, lat, times_utc, sina, cosa = read_stack(files)

    # --- assemble the fields we can actually build --------------------------
    fields = {}
    if raw["T2"] is not None:
        fields["t2"] = raw["T2"] - 273.15
    if all(raw[v] is not None for v in ("T2", "Q2", "PSFC")):
        fields["rh"] = relative_humidity(raw["T2"], raw["Q2"], raw["PSFC"])
    else:
        print("  SKIP rh: needs T2, Q2 and PSFC in the output")

    u10 = v10 = None
    if raw["U10"] is not None and raw["V10"] is not None:
        u10, v10 = raw["U10"], raw["V10"]
        if sina is not None and cosa is not None:
            # grid-relative -> earth-relative
            u10 = raw["U10"] * cosa + raw["V10"] * sina
            v10 = raw["V10"] * cosa - raw["U10"] * sina
            print(f"  wind rotated to earth-relative (max |alpha| "
                  f"{np.degrees(np.abs(np.arcsin(sina))).max():.2f} deg)")
        else:
            print("  NOTE: SINALPHA/COSALPHA absent — wind left grid-relative")
        fields["ws"] = np.hypot(u10, v10)
    else:
        print("  SKIP ws: needs U10 and V10 in the output")

    if not fields:
        sys.exit("ERROR: none of the requested variables could be built")

    nt = next(iter(fields.values())).shape[0]
    ny, nx = lon.shape
    print(f"Frames: {nt}   grid: {ny}x{nx}   variables: {', '.join(fields)}")

    w, e = float(lon.min()), float(lon.max())
    s, n = float(lat.min()), float(lat.max())
    bounds = [w, s, e, n]

    if times_utc:
        off = timedelta(hours=CONFIG["ist_offset_hours"])
        t0_ist = times_utc[0] + off
        dt_h = ((times_utc[1] - times_utc[0]).total_seconds() / 3600.0
                if len(times_utc) > 1 else 1.0)
        print(f"Period: {times_utc[0]:%Y-%m-%d %H:%M} to {times_utc[-1]:%Y-%m-%d %H:%M} UTC"
              f"  ({(len(times_utc) - 1) * dt_h:.0f} h, {dt_h:g} h steps)")
        print(f"        {t0_ist:%Y-%m-%d %H:%M} IST at frame 0")
    else:
        print("WARN: could not parse Times; assuming hourly from 00 IST")
        t0_ist, dt_h = datetime(2025, 4, 22, 0, 0, 0), 1.0

    base = CONFIG["out_dir"]
    os.makedirs(base, exist_ok=True)
    index = {"variables": [], "default": "t2" if "t2" in fields else next(iter(fields)),
             "bounds": bounds, "nframes": nt,
             "t0": t0_ist.isoformat(), "dt_hours": dt_h, "tz_label": "IST",
             "generated": datetime.now().isoformat(timespec="seconds")}

    for vid, field in fields.items():
        spec = VARIABLES[vid]
        out_dir = os.path.join(base, vid)
        print(f"  {vid}: {spec['label']}")
        frames, vmin, vmax = render_stack(field, lon, lat, spec, out_dir, vid,
                                          bounds, CONFIG["width_px"])
        meta = {
            "variable": vid, "long_name": spec["label"], "short_name": spec["short"],
            "units": spec["units"], "cmap": spec["cmap"],
            "vmin": vmin, "vmax": vmax, "bounds": bounds,
            "t0": t0_ist.isoformat(), "dt_hours": dt_h, "tz_label": "IST",
            "nframes": nt, "frames": frames,
        }
        with open(os.path.join(out_dir, "meta.json"), "w") as f:
            json.dump(meta, f, indent=2)
        index["variables"].append({
            "id": vid, "label": spec["label"], "short": spec["short"],
            "units": spec["units"], "dir": vid, "vmin": vmin, "vmax": vmax,
        })
        print(f"    range {vmin:g} .. {vmax:g} {spec['units']}")

    # --- wind vector field for the arrow overlay ----------------------------
    if u10 is not None:
        stride = max(1, int(round(max(ny, nx) / CONFIG["wind_arrows_max"])))
        sl = (slice(stride // 2, None, stride), slice(stride // 2, None, stride))
        pts = [[round(float(lon[sl][j, i]), 5), round(float(lat[sl][j, i]), 5)]
               for j in range(lon[sl].shape[0]) for i in range(lon[sl].shape[1])]
        frames_out = []
        for t in range(nt):
            us, vs = u10[t][sl], v10[t][sl]
            spd = np.hypot(us, vs).ravel()
            drc = (270.0 - np.degrees(np.arctan2(vs, us))) % 360.0   # meteorological
            frames_out.append({
                "s": [round(float(x), 1) for x in spd],
                "d": [round(float(x), 0) for x in drc.ravel()],
            })
        wind = {"note": "direction is meteorological (the bearing the wind comes FROM)",
                "stride": stride, "npoints": len(pts),
                "points": pts, "frames": frames_out}
        wpath = os.path.join(base, "wind_vectors.json")
        with open(wpath, "w") as f:
            json.dump(wind, f, separators=(",", ":"))
        index["wind_vectors"] = "wind_vectors.json"
        print(f"  wind vectors: {len(pts)} points x {nt} frames "
              f"(stride {stride}) -> {os.path.getsize(wpath) / 1e6:.2f} MB")

    with open(os.path.join(base, "index.json"), "w") as f:
        json.dump(index, f, indent=2)
    print(f"Wrote {base}/index.json")

    mp = os.path.join(ROOT, "data", "metadata.json")
    m = json.load(open(mp))
    m.setdefault("layers", {})
    m["layers"].setdefault("wrf_t2", {})["ready"] = True
    flagged = ["wrf_t2"]
    if u10 is not None:
        m["layers"].setdefault("wrf_wind", {})["ready"] = True
        flagged.append("wrf_wind")
    m["generated"] = datetime.now().isoformat(timespec="seconds")
    json.dump(m, open(mp, "w"), indent=2)
    print("metadata.json: " + ", ".join(f"{k} ready = True" for k in flagged))


if __name__ == "__main__":
    main()
