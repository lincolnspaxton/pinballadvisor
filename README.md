# Pinball Advisor

Source for pinballadvisor.com: machine reviews, buying guide, where to play, and service.

## How it's put together

| Path | What it is |
| --- | --- |
| `index.html` | The whole site (one static page with routes like `#machines` and `#machine-godzilla`). |
| `data/machines.json` | Hand-written reviews: scores, prices, pros/cons, Pinside slug. **Edit this to add or change machines.** |
| `data/guides.json` | The guides and advice articles (routes like `#guide-moving`). Each section is made of blocks: `p`, `ul`, `ol`, `tip`, `warn`, `table`. |
| `data/opdb.json` | Release date, display type, player count and features from the Open Pinball Database. Written by the daily refresh; don't edit by hand. |
| `scripts/refresh-data.mjs` | Downloads the daily OPDB export and matches each machine in `machines.json`. |
| `.github/workflows/refresh-data.yml` | Runs the refresh every day and commits any changes. |

The "Where to play" search calls the Pinball Map API live from the visitor's browser, so it's always current.

## Setup

1. **GitHub Pages:** Settings → Pages → Deploy from a branch → `main` / root.
2. **First data pull:** Actions tab → "Refresh machine data" → Run workflow. After that it runs daily on its own. No API key is needed: it uses the free daily OPDB export that Match Play hosts (https://docs.matchplay.events/data-exports).

If the refresh log says "No OPDB match" for a machine, add its `"opdb_id"` to that machine in `data/machines.json`.

## Adding a machine

Copy an entry in `data/machines.json`, give it a new `id` (lowercase, hyphens; it becomes the page link `#machine-<id>`), and fill in the fields. The `pinside` field is the end of the game's Pinside URL, e.g. `godzilla-premium` from `pinside.com/pinball/machine/godzilla-premium`.

## Adding a guide

Add an entry to `guides` in `data/guides.json` with an `id`, `category` (one of the `categories` ids), `title`, `summary`, `minutes` and `sections`. Use `ol` only for real step-by-step sequences.

## Testing locally

The site loads its data with `fetch`, so open it through a local server rather than double-clicking the file:

```
python3 -m http.server
```

Then visit http://localhost:8000.

Location data from [Pinball Map](https://pinballmap.com). Machine details from the [Open Pinball Database](https://opdb.org), via the [Match Play](https://matchplay.events) data export.
