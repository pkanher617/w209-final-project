/* Genre view: packed bubble chart of the library's genres with a
   drill-down panel of the most popular songs in the selected genre. */

/* global d3 */

import { store } from "../data.js";
import { bubbleChart, barList, renderDataTable } from "../charts.js";

const MAX_BUBBLES = 40;

const state = {
  selected: null,
};

export function renderGenre() {
  const root = document.getElementById("view-genre");
  const gate = root.querySelector(".gate");
  const loaded = root.querySelector(".loaded");
  if (!store.tracks) {
    gate.hidden = false;
    loaded.hidden = true;
    return;
  }
  gate.hidden = true;
  loaded.hidden = false;

  const { genres, untagged } = genreRollup();
  if (state.selected && !genres.some((g) => g.name === state.selected)) {
    state.selected = null;
  }
  if (!state.selected && genres.length) state.selected = genres[0].name;

  const status = loaded.querySelector(".data-status");
  status.textContent =
    `${d3.format(",")(store.tracks.length)} tracks · ${d3.format(",")(genres.length)} genres`
    + (untagged ? ` · ${d3.format(",")(untagged)} tracks without genre tags` : "");

  const bubblesEl = document.getElementById("genre-bubbles");
  bubbleChart(bubblesEl, genres.slice(0, MAX_BUBBLES), {
    selected: state.selected,
    onSelect: (name) => {
      state.selected = name;
      renderGenre();
    },
  });
  if (genres.length > MAX_BUBBLES) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = `Showing the ${MAX_BUBBLES} most common genres; the full list is in the data table.`;
    bubblesEl.appendChild(note);
  }

  renderDataTable(document.getElementById("genre-table"),
    ["Genre", "Songs", "Avg popularity"],
    genres.map((g) => [g.name, g.count, d3.format(".0f")(g.meanPop)]),
    "Data table — all genres");

  renderDrill(genres);
}

function genreRollup() {
  const byGenre = new Map();
  let untagged = 0;
  for (const t of store.tracks) {
    if (!t.genreList.length) { untagged += 1; continue; }
    for (const g of t.genreList) {
      let entry = byGenre.get(g);
      if (!entry) {
        entry = { name: g, count: 0, tracks: [] };
        byGenre.set(g, entry);
      }
      entry.count += 1;
      entry.tracks.push(t);
    }
  }
  const genres = [...byGenre.values()]
    .map((g) => ({
      ...g,
      meanPop: d3.mean(g.tracks, (t) => t.popularity) ?? 0,
    }))
    .sort((a, b) => b.count - a.count);
  return { genres, untagged };
}

function renderDrill(genres) {
  const panel = document.getElementById("genre-drill");
  panel.replaceChildren();

  const g = genres.find((x) => x.name === state.selected);
  if (!g) {
    const hint = document.createElement("p");
    hint.className = "empty-hint";
    hint.textContent = "Click a genre bubble to see its most popular songs.";
    panel.appendChild(hint);
    return;
  }

  const h = document.createElement("h2");
  h.textContent = `Most popular songs in "${g.name}"`;
  panel.appendChild(h);

  const meta = document.createElement("p");
  meta.className = "note";
  meta.textContent =
    `${d3.format(",")(g.count)} songs · average Spotify popularity ${d3.format(".0f")(g.meanPop)} / 100`;
  panel.appendChild(meta);

  const top = [...g.tracks]
    .filter((t) => t.popularity != null)
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 10);

  const chartEl = document.createElement("div");
  chartEl.className = "chart";
  panel.appendChild(chartEl);
  barList(chartEl, top.map((t) => ({
    name: t.name,
    title: `${t.name} — ${t.artists ?? ""}`,
    value: t.popularity,
  })), { valueFmt: d3.format("d") });

  const slot = document.createElement("div");
  slot.className = "table-slot";
  panel.appendChild(slot);
  renderDataTable(slot,
    ["Song", "Artist", "Popularity"],
    top.map((t) => [t.name, t.artists ?? "", t.popularity]),
    "Data table — top songs");
}
