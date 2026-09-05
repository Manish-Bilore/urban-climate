# Deploying to GitHub Pages

The site is static and hosts fine on GitHub Pages. The only real risk is the
multi-GB raw WRF run and the source GPKG ending up in git or on the published
site — everything here is built to prevent that.

## One-time identity (if you've never set it)
```bash
git config --global user.name  "Manish Bilore"
git config --global user.email "you@example.com"
```

## 1 · Audit, then commit
```bash
bash scripts/prepare_git.sh            # dry run: audit sizes + what git will track
bash scripts/prepare_git.sh --commit   # git init + first commit (after the audit looks right)
```
The script refuses to commit if raw output would be tracked or `.gitignore` has
gaps, and offers to delete the stale `data/wrf/t2/` duplicate from the earlier
mis-nested export.

## 2 · Create an EMPTY repo on GitHub
Public, named `nagpur-duct`, **no** README/licence/gitignore (the repo already
has them). Then:
```bash
git remote add origin https://github.com/<you>/nagpur-duct.git
git push -u origin main
```

## 3 · Turn on Pages
Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
The workflow in `.github/workflows/deploy.yml` runs on every push to `main`.

## What actually gets published
The workflow does not publish the repo root. It stages a clean `dist/` with only
the files the viewer serves — `index.html`, `src/`, `styles/`, and the runtime
data (`metadata.json`, `stations.json`, `boundary/`, `lcz/`, the buildings
PMTiles, and `wrf/{index.json, t2, rh, ws, wind_vectors.json}`). Raw `wrfout_*`,
`wrfinput_*`, any `apr2025_96h/` run directory, and the source `.gpkg` are
excluded even if a checkout contains them. Published payload is ~87 MB, well
under the 1 GB site limit and the 100 MB per-file limit.

## Live URL
`https://<you>.github.io/nagpur-duct/` — appears in the Actions run summary and
under Settings → Pages once the first deploy is green. Range requests (which
PMTiles needs) work on Pages natively, so the buildings layer loads the same way
it does under `scripts/serve.py` locally.

## Re-deploying after new data
Re-run the relevant export script, then:
```bash
git add -A && git commit -m "refresh <what changed>" && git push
```
Each committed PMTiles/frame change adds to git history permanently — fine for a
demo; if you iterate heavily, move the PMTiles to R2 and uncomment its line in
`.gitignore`.
