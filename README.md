# W209 Final Project — Your Music & the World

Flask app serving Altair visualizations for the DATASCI 209 final project
(Prithvi Kanherkar & Sabrina Lam). All charts are currently **placeholders on
synthetic data**; swap them for real Spotify Charts / Exportify data as the
pipeline lands.

## Structure

```
api/
  index.py      Flask app (Vercel serverless entry point) + routes
  charts.py     Altair chart builders — one function per chart, registered in CHARTS
templates/      Jinja pages; charts render client-side with vega-embed
static/css/     Stylesheet
vercel.json     Routes all traffic to api/index.py and bundles templates/static
```

Pages: `/` (overview), `/personal` (audio-feature charts), `/global` (world map).
Chart specs are served as JSON from `/api/chart/<name>`.

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

## Adding / replacing a chart

1. Write a function in `api/charts.py` that returns an `alt.Chart`
   (load real data with pandas instead of the `_placeholder_*` helpers —
   put CSVs under `static/data/` so Vercel bundles them).
2. Register it in the `CHARTS` dict with a URL-safe name.
3. Drop a `<div id="...">` in a template and call
   `renderChart('div-id', 'chart-name')`.
