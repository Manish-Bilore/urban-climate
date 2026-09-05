#!/usr/bin/env bash
# ============================================================================
# prepare_git.sh — get the repo ready for its first GitHub push, safely.
#
# Audits the tree for things that must NOT enter git history (raw model output,
# source datasets, duplicate/stale exports, build cruft), reports total sizes,
# then — only with --commit — initialises git and makes the first commit. It
# never runs `git push`; you do that after creating the remote, so the remote
# URL is always your choice.
#
#   bash scripts/prepare_git.sh            # dry run: audit + what git would track
#   bash scripts/prepare_git.sh --commit   # also: git init + add + first commit
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
COMMIT=0; [ "${1:-}" = "--commit" ] && COMMIT=1

echo "Repo: $ROOT"
echo

# --- 1. Stale / duplicate exports ------------------------------------------
# The WRF exporter now writes data/wrf/{index.json,t2,rh,ws,wind_vectors.json}.
# An earlier mis-nested run can leave a second copy under data/wrf/t2/.
STALE=""
if [ -d data/wrf/t2/t2 ] || [ -d data/wrf/t2/rh ] || [ -d data/wrf/t2/ws ]; then
  STALE="data/wrf/t2"
fi
if [ -n "$STALE" ]; then
  echo "!! STALE NESTED EXPORT: $STALE ($(du -sh "$STALE" 2>/dev/null | cut -f1))"
  echo "   The current run lives in data/wrf/{t2,rh,ws}/ directly. This is a"
  echo "   duplicate from the earlier mis-nested run."
  if [ "$COMMIT" = "1" ]; then
    read -r -p "   Delete $STALE ? [y/N] " a
    [ "$a" = "y" ] && rm -rf "$STALE" && echo "   removed."
  else
    echo "   (dry run — would offer to delete under --commit)"
  fi
  echo
fi

# --- 2. Things that must stay out of git -----------------------------------
echo "== Excluded from git (inputs / large / generated) =="
declare -a BIG=(
  "data/wrf/apr2025_96h:raw WRF run (wrfout + wrfinput)"
  "data/buildings/nagpur_buildings_typology_all_buildings.gpkg:source GPKG"
  "data/buildings/nagpur_buildings.geojsonl:raw intermediate"
  "scripts/__pycache__:python cache"
  "typescript:stray script(1) capture"
)
for entry in "${BIG[@]}"; do
  path="${entry%%:*}"; desc="${entry##*:}"
  if [ -e "$path" ]; then
    printf "  %-52s %8s  (%s)\n" "$path" "$(du -sh "$path" 2>/dev/null | cut -f1)" "$desc"
  fi
done
echo

# --- 3. Confirm .gitignore actually covers them ----------------------------
echo "== .gitignore coverage check =="
miss=0
for pat in "wrfout_*" "wrfinput_*" "*.gpkg" "*.geojsonl" "__pycache__/" "typescript"; do
  if grep -qF "$pat" .gitignore 2>/dev/null; then
    echo "  ok   $pat"
  else
    echo "  MISS $pat  <- add to .gitignore"; miss=1
  fi
done
[ "$miss" = "1" ] && echo "  (fix .gitignore before committing)"
echo

# --- 4. What WILL be tracked, and how big ----------------------------------
echo "== Tracked payload (what gets pushed) =="
KEEP_PM="data/buildings/nagpur_buildings.pmtiles"
[ -f "$KEEP_PM" ] && printf "  %-40s %8s\n" "buildings PMTiles" "$(du -h "$KEEP_PM"|cut -f1)"
for d in t2 rh ws; do
  [ -d "data/wrf/$d" ] && printf "  %-40s %8s\n" "WRF $d frames" "$(du -sh data/wrf/$d|cut -f1)"
done
[ -f data/wrf/wind_vectors.json ] && printf "  %-40s %8s\n" "wind vectors" "$(du -h data/wrf/wind_vectors.json|cut -f1)"
[ -f data/lcz/lcz.png ] && printf "  %-40s %8s\n" "LCZ overlay" "$(du -h data/lcz/lcz.png|cut -f1)"
echo
echo "  Per-file 100 MB limit — anything over:"
find . -path ./.git -prune -o -type f -size +95M -print 2>/dev/null | grep -vE '\.gpkg$|apr2025_96h|\.geojsonl$' | sed 's/^/    OVER: /' || true
echo "  (nothing listed above = all tracked files are under the limit)"
echo

# --- 5. Commit, if asked ----------------------------------------------------
if [ "$COMMIT" = "0" ]; then
  echo "Dry run complete. Re-run with --commit to git init + first commit."
  echo "Then create an EMPTY GitHub repo and:"
  echo "    git remote add origin https://github.com/<you>/urban-climate.git"
  echo "    git push -u origin main"
  exit 0
fi

[ "$miss" = "1" ] && { echo "ABORT: .gitignore gaps above. Fix them first."; exit 1; }

# Commit needs an identity; check now rather than fail cryptically mid-commit.
if ! git config user.email >/dev/null 2>&1 && ! git config --global user.email >/dev/null 2>&1; then
  echo "ABORT: git has no author identity set. Set it once, then re-run:"
  echo "    git config --global user.name  \"Manish Bilore\""
  echo "    git config --global user.email \"you@example.com\""
  exit 1
fi

if [ ! -d .git ]; then
  git init -q && git branch -M main
  echo "git initialised (branch main)"
fi
git add -A
echo
echo "== git status (staged) =="
git status --short | head -40
STAGED_BIG=$(git ls-files -z | xargs -0 -I{} du -m "{}" 2>/dev/null | sort -rn | head -1)
echo
echo "largest staged file: ${STAGED_BIG}"
# hard stop if anything raw slipped through
if git ls-files | grep -qE 'wrfout_|wrfinput_|\.gpkg$'; then
  echo "ABORT: raw data is staged despite .gitignore. Unstage and fix."
  git ls-files | grep -E 'wrfout_|wrfinput_|\.gpkg$' | sed 's/^/  /'
  exit 1
fi
git commit -qm "Nagpur DUCT: buildings, LCZ, WRF (T2/RH/wind), stations" && echo "committed."
echo
echo "Next:"
echo "  1. Create an EMPTY public repo on GitHub named urban-climate (no README)."
echo "  2. git remote add origin https://github.com/<you>/urban-climate.git"
echo "  3. git push -u origin main"
echo "  4. Settings -> Pages -> Source: GitHub Actions."
