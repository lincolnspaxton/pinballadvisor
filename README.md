# Pinball Advisor

Source for pinballadvisor.com: machine reviews, buying guide, where to play, and service.

## How it's put together

| Path | What it is |
| --- | --- |
| `index.html` | The whole site (one static page with routes like `#machines` and `#machine-godzilla`). |
| `data/machines.json` | Hand-written reviews: scores, prices, pros/cons, Pinside slug. **Edit this to add or change machines.** |
| `data/opdb.json` | Release date, display type, player count and features from the Open Pinball Database. Written by the daily refresh; don't edit by hand. |
| `scripts/refresh-data.mjs` | Pulls from OPDB and matches each machine in `machines.json`. |
| `.github/workflows/refresh-data.yml` | Runs the refresh every day and commits any changes. |

The "Where to play" search calls the Pinball Map API live from the visitor's browser, so it's always current.

## Setup

1. **GitHub Pages:** Settings → Pages → Deploy from a branch → `main` / root.
2. **OPDB token:** make a free account at opdb.org, generate an API token, then add it in this repo under Settings → Secrets and variables → Actions → New repository secret, named `OPDB_API_TOKEN`.
3. **First run:** Actions tab → "Refresh machine data" → Run workflow. After that it runs daily on its own.

If the refresh log says "No OPDB match" for a machine, add its `"opdb_id"` to that machine in `data/machines.json`.

## Adding a machine

Copy an entry in `data/machines.json`, give it a new `id` (lowercase, hyphens; it becomes the page link `#machine-<id>`), and fill in the fields. The `pinside` field is the end of the game's Pinside URL, e.g. `godzilla-premium` from `pinside.com/pinball/machine/godzilla-premium`.

## Testing locally

The site loads its data with `fetch`, so open it through a local server rather than double-clicking the file:

```
python3 -m http.server
```

Then visit http://localhost:8000.

Location data from [Pinball Map](https://pinballmap.com). Machine details from the [Open Pinball Database](https://opdb.org).
