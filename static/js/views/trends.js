/* Streaming Trends view: KPI tiles, hours by year / by month, a day-of-week ×
   hour-of-day heatmap, and top artists & songs from the extended history.
   All timestamps arrive as UTC and are shown in the viewer's local timezone. */

/* global d3 */

import { store } from "../data.js";
import { columnChart, lineAreaChart, heatmapChart, barList, renderDataTable } from "../charts.js";
import { aggregate, MS_PER_HOUR } from "../lib/rollups.js";

let cache = null; // aggregates, recomputed when the plays array changes

export function renderTrends() {
  const root = document.getElementById("view-trends");
  const gate = root.querySelector(".gate");
  const loaded = root.querySelector(".loaded");
  if (!store.plays) {
    gate.hidden = false;
    loaded.hidden = true;
    return;
  }
  gate.hidden = true;
  loaded.hidden = false;

  if (!cache || cache.source !== store.plays) cache = aggregate(store.plays);

  renderStatus(loaded);
  renderTiles();
  renderYear();
  renderMonth();
  renderHeatmap();
  renderTopLists();
}

function renderStatus(loaded) {
  const el = loaded.querySelector(".data-status");
  const span = `${d3.timeFormat("%b %Y")(cache.first)} – ${d3.timeFormat("%b %Y")(cache.last)}`;
  el.replaceChildren();
  el.appendChild(document.createTextNode(
    `${store.streamingFiles.length} files · ${d3.format(",")(store.plays.length)} entries · ${span} · `));
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "replace files";
  btn.addEventListener("click", () => {
    store.plays = null;
    store.streamingFiles = [];
    cache = null;
    renderTrends();
  });
  el.appendChild(btn);
}

function tile(label, value, sub = null) {
  const div = document.createElement("div");
  div.className = "tile";
  const l = document.createElement("div");
  l.className = "label";
  l.textContent = label;
  const v = document.createElement("div");
  v.className = "value";
  v.textContent = value;
  div.appendChild(l);
  div.appendChild(v);
  if (sub) {
    const s = document.createElement("div");
    s.className = "sub";
    s.textContent = sub;
    div.appendChild(s);
  }
  return div;
}

function renderTiles() {
  const wrap = document.getElementById("trend-tiles");
  wrap.replaceChildren();
  const years = (cache.last - cache.first) / (365.25 * 24 * MS_PER_HOUR);
  wrap.appendChild(tile("Hours streamed", d3.format(",.0f")(cache.totalHours),
    `over ${years.toFixed(1)} years`));
  wrap.appendChild(tile("Plays", d3.format(",")(cache.totalPlays), "streams of 30s or more"));
  wrap.appendChild(tile("Artists", d3.format(",")(cache.uniqueArtists)));
  wrap.appendChild(tile("Songs", d3.format(",")(cache.uniqueTracks)));
}

function renderYear() {
  const el = document.getElementById("trend-year");
  const data = cache.hoursByYear.map(([year, v]) => ({ label: String(year), value: v }));
  columnChart(el, data, { valueFmt: d3.format(",.0f") });
  renderDataTable(el.parentElement.querySelector(".table-slot"),
    ["Year", "Hours"], data.map((d) => [d.label, d3.format(",.1f")(d.value)]),
    "Data table — hours by year");
}

function renderMonth() {
  const el = document.getElementById("trend-month");
  lineAreaChart(el, cache.hoursByMonth, { valueLabel: "hours" });
  renderDataTable(el.parentElement.querySelector(".table-slot"),
    ["Month", "Hours"],
    cache.hoursByMonth.map((d) => [d3.timeFormat("%b %Y")(d.date), d3.format(",.1f")(d.value)]),
    "Data table — hours by month");
}

function renderHeatmap() {
  const el = document.getElementById("trend-heatmap");
  heatmapChart(el, cache.cells);
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  renderDataTable(el.parentElement.querySelector(".table-slot"),
    ["Day", ...d3.range(24).map((h) => `${h}:00`)],
    dayNames.map((name, day) => [
      name,
      ...d3.range(24).map((hour) =>
        d3.format(".1f")(cache.cells.find((c) => c.day === day && c.hour === hour)?.value ?? 0)),
    ]),
    "Data table — hours by day and hour");
}

function renderTopLists() {
  barList(document.getElementById("trend-artists"),
    cache.artistHours.slice(0, 10).map(([name, hours]) => ({ name, value: hours })),
    { valueFmt: (v) => `${d3.format(",.1f")(v)} h` });

  barList(document.getElementById("trend-tracks"),
    cache.trackPlays.slice(0, 10).map(([, info]) => ({
      name: info.track,
      title: `${info.track} — ${info.artist ?? ""}`,
      value: info.plays,
    })),
    { valueFmt: d3.format(",") });
}
