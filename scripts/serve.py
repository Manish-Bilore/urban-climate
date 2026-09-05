#!/usr/bin/env python3
''''exec python3 "$0" "$@" # '''
# ^ Runs correctly whether invoked as `python3 x.py`, `bash x.py`, `sh x.py`, or
#   `./x.py`. Under a shell the line above re-execs python3 on this same file;
#   under Python it is just an inert string. Arguments pass through either way.
"""
Local preview server with HTTP Range support.

PMTiles reads slices of a single archive using HTTP range requests. Python's
stock `http.server` ignores the Range header and returns the whole file, so an
87 MB buildings archive would be re-downloaded on every tile fetch. This server
implements Range (206 Partial Content) so local preview behaves like GitHub
Pages, which supports ranges natively.

Usage, from the repo root:
    python3 scripts/serve.py            # http://localhost:8000
    python3 scripts/serve.py 8080       # custom port
"""
import os
import re
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


class RangeHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # Ranges are what PMTiles needs; no-store keeps edited JSON from sticking.
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        rng = self.headers.get("Range")
        if not rng:
            return super().send_head()

        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        try:
            size = os.path.getsize(path)
            f = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        m = RANGE_RE.match(rng.strip())
        if not m:
            f.close()
            self.send_error(400, "Malformed Range header")
            return None

        start_s, end_s = m.group(1), m.group(2)
        if start_s == "":                       # bytes=-N  → final N bytes
            length = int(end_s or 0)
            start = max(0, size - length)
            end = size - 1
        else:
            start = int(start_s)
            end = int(end_s) if end_s else size - 1
        end = min(end, size - 1)

        if start >= size or start > end:
            f.close()
            self.send_response(416, "Requested Range Not Satisfiable")
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None

        self.send_response(206, "Partial Content")
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        f.seek(start)
        return _Slice(f, end - start + 1)

    def log_message(self, fmt, *args):          # quieter console
        if "404" in (fmt % args) or "416" in (fmt % args):
            super().log_message(fmt, *args)


class _Slice:
    """File wrapper that yields only the requested byte span."""

    def __init__(self, f, remaining):
        self.f, self.remaining = f, remaining

    def read(self, n=-1):
        if self.remaining <= 0:
            return b""
        if n < 0 or n > self.remaining:
            n = self.remaining
        data = self.f.read(n)
        self.remaining -= len(data)
        return data

    def close(self):
        self.f.close()


# .pmtiles isn't in Python's mime table by default
RangeHandler.extensions_map = dict(SimpleHTTPRequestHandler.extensions_map)
RangeHandler.extensions_map.update({
    ".pmtiles": "application/octet-stream",
    ".geojson": "application/geo+json",
    ".json": "application/json",
})


def _readiness():
    """Summarise which layers have data on disk, so a blank map is diagnosable."""
    import json
    rows = []
    bld = os.path.join(ROOT, "data", "buildings", "nagpur_buildings.pmtiles")
    rows.append(("buildings", f"{os.path.getsize(bld) / 1e6:.1f} MB archive"
                 if os.path.exists(bld) else "no .pmtiles"))
    lcz = os.path.join(ROOT, "data", "lcz", "lcz.png")
    rows.append(("lcz", "overlay present" if os.path.exists(lcz) else "no lcz.png"))
    wmeta = os.path.join(ROOT, "data", "wrf", "t2", "meta.json")
    n = 0
    if os.path.exists(wmeta):
        try:
            n = len(json.load(open(wmeta)).get("frames", []))
        except Exception:
            n = 0
    rows.append(("wrf_t2", f"{n} frames" if n else "no frames"))

    flags = {}
    mpath = os.path.join(ROOT, "data", "metadata.json")
    if os.path.exists(mpath):
        try:
            flags = {k: v.get("ready") for k, v in
                     json.load(open(mpath)).get("layers", {}).items()}
        except Exception:
            pass

    print("Data on disk:")
    for name, detail in rows:
        ready = flags.get(name)
        mark = "on " if ready else "off"
        print(f"  [{mark}] {name:<10} {detail}")
    print("  (a layer toggle stays disabled until its flag is on in "
          "data/metadata.json)")


def main():
    want = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    srv = None
    for port in range(want, want + 10):
        try:
            srv = HTTPServer(("0.0.0.0", port), RangeHandler)
            break
        except OSError as ex:
            if ex.errno != 98:
                raise
            print(f"port {port} is already in use", file=sys.stderr)
    if srv is None:
        sys.exit(f"ERROR: no free port in {want}–{want + 9}. Free one with:\n"
                 f"  fuser -k {want}/tcp")

    if port != want:
        print(f"NOTE: {want} was taken — if an older server is still running "
              f"there,\n      close it, or it will serve stale files without "
              f"Range support.")
    print(f"Serving {ROOT}")
    print(f"  → http://localhost:{port}   (Range requests enabled)")
    print()
    _readiness()
    print("\nCtrl-C to stop")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
