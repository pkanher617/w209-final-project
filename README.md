# W209 Final Project — Spotify Song/Playlist Analyzer

Personal Spotify analysis app for the DATASCI 209 final project
(Prithvi Kanherkar & Sabrina Lam). Upload your own data and explore it in
three views — **all parsing and charting happens client-side in the browser
with D3; uploaded files never leave your machine** (which is also what lets
the app run on Vercel's stateless serverless Flask).

| View | Data it needs | What it shows |
|---|---|---|
| **Song Analysis** | Exportify CSV | Top 10 by popularity, song search, per-song radar (15 audio features vs. library average), per-feature histograms with explanations |
| **Genre** | Exportify CSV | Packed bubble chart of your genres; click a bubble to drill into that genre's most popular songs |
| **Streaming Trends** | Extended Streaming History JSON | KPI tiles, hours by year, hours by month, day-of-week × hour-of-day heatmap, top artists by hours, top songs by plays |

## Getting the data

- **Exportify CSV** — export a playlist at [exportify.net](https://exportify.net)
  (enable audio features / additional columns). Multiple CSVs can be uploaded
  together; tracks are deduped by URI.
- **Extended Streaming History** — request it from Spotify's
  [privacy page](https://www.spotify.com/account/privacy/) (takes up to a
  week), unzip, and upload all `Streaming_History_Audio_*.json` files.

## Structure

```
api/index.py        Flask app (Vercel serverless entry) — serves the SPA shell
templates/          base.html + index.html (all three views; hash-routed so
                    uploaded data survives navigation)
static/css/         Dark theme (Spotify-style: #121212 page, green accents)
static/js/
  app.js            Router + upload wiring (drag-drop / file picker)
  data.js           Store + parsers (Exportify CSV, streaming JSON) +
                    feature metadata (radar normalization, descriptions)
  charts.js         D3 components: columns, histogram, line+area w/ crosshair,
                    heatmap, radar, bubble pack, HTML bar lists, tooltip,
                    data-table twins
  views/            songs.js · genre.js · trends.js
vercel.json         Routes all traffic to api/index.py, bundles templates/static
```

Chart colors were checked with a palette validator (contrast + lightness bands
against the dark surface): marks use `#1aad4e`, UI accent text `#1DB954`, and
the heatmap uses a single-hue green ramp that recedes to the surface at zero.

## Run locally

```
python -m venv .venv
.venv\Scripts\activate        # Windows (source .venv/bin/activate on Mac/Linux)
pip install -r requirements.txt
flask --app api/index run --debug
```

Then open http://127.0.0.1:5000.

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. In Vercel: **Add New Project** → import the repo → framework preset
   **Other** → deploy. No build settings needed; `vercel.json` handles routing.

(Or from the CLI: `npm i -g vercel && vercel` in this directory.)

## Roadmap

- Scrollytelling intro with [scrollama](https://github.com/russellsamora/scrollama)
  once the classic three-view app is settled.
- More streaming-history views: skip rate, platform split, listening by
  country, artist-discovery timeline.
