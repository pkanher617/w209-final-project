/* Compare view: upload two separate Exportify playlists and see their
   average audio-feature profiles overlaid on one radar, plus a quick
   side-by-side stats table. Kept independent of the main library
   (store.tracks) used by Song Analysis/Genre, which merges every upload
   into one combined set — Compare needs the two playlists to stay separate. */

/* global d3 */

import { FEATURES, featureFormat, parseExportifyFiles, computeTrackStats } from "../data.js";
import { radarChart, renderDataTable } from "../charts.js";

const state = {
  a: null, // { tracks, stats, names } | null
  b: null,
};

export async function loadPlaylistA(files) {
  const { tracks, names } = await parseExportifyFiles(files);
  state.a = { tracks, stats: computeTrackStats(tracks), names };
  renderCompare();
}

export async function loadPlaylistB(files) {
  const { tracks, names } = await parseExportifyFiles(files);
  state.b = { tracks, stats: computeTrackStats(tracks), names };
  renderCompare();
}

function clearSlot(letter) {
  state[letter] = null;
  renderCompare();
}

export function renderCompare() {
  const root = document.getElementById("view-compare");
  const gate = root.querySelector(".gate");
  const loaded = root.querySelector(".loaded");

  renderSlot("a");
  renderSlot("b");

  const ready = state.a && state.b;
  gate.hidden = ready;
  loaded.hidden = !ready;
  if (!ready) return;

  renderStatus(loaded);
  renderStats();
  renderRadar();
}

function renderSlot(letter) {
  const slot = document.getElementById(`compare-slot-${letter}`);
  const info = state[letter];
  const dropzone = slot.querySelector(".dropzone");
  const summary = slot.querySelector(".data-status");

  if (!info) {
    dropzone.hidden = false;
    summary.hidden = true;
    return;
  }
  dropzone.hidden = true;
  summary.hidden = false;
  summary.replaceChildren();
  summary.appendChild(document.createTextNode(
    `${d3.format(",")(info.tracks.length)} tracks from ${info.names.join(", ")} · `));
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "replace";
  btn.addEventListener("click", () => clearSlot(letter));
  summary.appendChild(btn);
}

function renderStatus(loaded) {
  const el = loaded.querySelector(".data-status");
  el.replaceChildren();
  const addPart = (letter, label) => {
    const info = state[letter];
    el.appendChild(document.createTextNode(
      `${label}: ${d3.format(",")(info.tracks.length)} tracks from ${info.names.join(", ")} `));
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "replace";
    btn.addEventListener("click", () => clearSlot(letter));
    el.appendChild(btn);
  };
  addPart("a", "Playlist A");
  el.appendChild(document.createTextNode(" · "));
  addPart("b", "Playlist B");
}

function topGenre(tracks) {
  const counts = new Map();
  for (const t of tracks) {
    for (const g of t.genreList) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  if (!counts.size) return null;
  return [...counts.entries()].sort((x, y) => y[1] - x[1])[0]; // [name, count]
}

function formatTopGenre(entry, total) {
  if (!entry) return "—";
  const [name, count] = entry;
  return `${name} (${d3.format(".0%")(count / total)})`;
}

function renderStats() {
  const el = document.getElementById("compare-stats");
  el.replaceChildren();

  const rows = [
    ["Tracks", d3.format(",")(state.a.tracks.length), d3.format(",")(state.b.tracks.length)],
    ["Avg. popularity",
      state.a.stats.popularity.mean != null ? `${d3.format(".0f")(state.a.stats.popularity.mean)} / 100` : "—",
      state.b.stats.popularity.mean != null ? `${d3.format(".0f")(state.b.stats.popularity.mean)} / 100` : "—"],
    ["Top genre",
      formatTopGenre(topGenre(state.a.tracks), state.a.tracks.length),
      formatTopGenre(topGenre(state.b.tracks), state.b.tracks.length)],
  ];

  const table = document.createElement("table");
  table.className = "compare-stats-table";
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  for (const label of ["", "Playlist A", "Playlist B"]) {
    const th = document.createElement("th");
    th.textContent = label;
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const [label, a, b] of rows) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = label;
    const tdA = document.createElement("td");
    tdA.textContent = a;
    const tdB = document.createElement("td");
    tdB.textContent = b;
    tr.append(th, tdA, tdB);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  el.appendChild(table);
}

function renderRadar() {
  const chartEl = document.getElementById("compare-radar");
  const axes = FEATURES.map((f) => ({
    label: f.label,
    desc: f.desc,
    norm: state.a.stats[f.key].meanNorm,
    rawText: featureFormat(f, state.a.stats[f.key].mean),
    avgNorm: state.b.stats[f.key].meanNorm,
    avgRawText: featureFormat(f, state.b.stats[f.key].mean),
  }));
  radarChart(chartEl, axes, { songLabel: "Playlist A", avgLabel: "Playlist B" });

  const slot = document.getElementById("compare-radar-table");
  renderDataTable(slot,
    ["Feature", "Playlist A", "Playlist B"],
    axes.map((ax) => [ax.label, ax.rawText, ax.avgRawText]),
    "Data table — audio-feature comparison");
}
