#!/usr/bin/env python3
"""
Shared config bridge.

The shell scripts read scripts/config.sh. Rather than keeping a second copy of
every path inside each Python script, this sources config.sh in a subshell and
hands back the values, so config.sh stays the single place to edit.

Each script still has a CONFIG block: values from config.sh win when present,
and the literals in the script act as fallbacks if config.sh is missing or a
variable is blank.
"""
import os
import subprocess

_VARS = [
    "DUCT_ROOT", "DATA_DIR",
    "WRF_DIR", "WRF_GLOB",
    "LCZ_TIF", "STN_DIR",
    "WRF_OUT", "LCZ_OUT", "STN_OUT",
]


def load_shell_config(path=None):
    """Return a dict of values from config.sh ({} if it can't be read)."""
    here = os.path.dirname(os.path.abspath(__file__))
    cfg = path or os.path.join(here, "config.sh")
    if not os.path.exists(cfg):
        return {}
    dump = "; ".join(f'printf "%s\\t%s\\n" {v} "${v}"' for v in _VARS)
    try:
        out = subprocess.run(
            ["bash", "-c", f'source "{cfg}" >/dev/null 2>&1; {dump}'],
            capture_output=True, text=True, timeout=15,
        )
    except Exception:
        return {}
    values = {}
    for line in out.stdout.splitlines():
        if "\t" in line:
            key, val = line.split("\t", 1)
            if val.strip():
                values[key] = val.strip()
    return values


def pick(shell, key, fallback):
    """Prefer the config.sh value, fall back to the script literal."""
    v = shell.get(key)
    return v if v else fallback
