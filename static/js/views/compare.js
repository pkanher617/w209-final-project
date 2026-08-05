/* Compare view: overlays a second "comparison" playlist against the same
   main library (store.tracks) used by Song Analysis and Genre — uploading
   on any of those three pages fills the same shared library, so Compare only
   ever needs ONE new upload of its own. The comparison playlist is kept in
   this module's own local state, never merged into the shared store. */

/* global d3 */

import { store, FEATURES, featureFormat, parseExportifyFiles, computeTrackStats } from "../data.js";
import { radarChart, renderDataTable } from "../charts.js";

const state = {
  comparison: null, // { tracks, stats, names } | null
};

export async function loadComparisonPlaylist(files) {
  const { tracks, names } = await parseExportifyFiles(files);
  state.comparison = { tracks, stats: computeTrackStats(tracks), names };
  renderCompare();
}

function clearLibrary() {
  store.tracks = null;
  store.trackStats = null;
  store.exportifyFiles = [];
  renderCompare();
}

function clearComparison() {
  state.comparison = null;
  renderCompare();
}

export function renderCompare() {
  const root = document.getElementById("view-compare");
  const gate = root.querySelector(".gate");
  const loaded = root.querySelector(".loaded");

  renderLibrarySlot();
  renderComparisonSlot();

  const ready = store.tracks && state.comparison;
  gate.hidden = ready;
  loaded.hidden = !ready;
  if (!ready) return;

  renderStatus(loaded);
  renderStats();
  renderRadar();
}

function renderLibrarySlot() {
  const slot = document.getElementById("compare-slot-library");
  const dropzone = slot.querySelector(".dropzone");
  const summary = slot.querySelector(".data-status");

  if (!store.tracks) {
    dropzone.hidden = false;
    summary.hidden = true;
    return;
  }
  dropzone.hidden = true;
  summary.hidden = false;
  summary.replaceChildren();
  summary.appendChild(document.createTextNode(
    `${d3.format(",")(store.tracks.length)} tracks from ${store.exportifyFiles.join(", ")} · `));
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "replace file";
  btn.addEventListener("click", clearLibrary);
  summary.appendChild(btn);
}

function renderComparisonSlot() {
  const slot = document.getElementById("compare-slot-comparison");
  const info = state.comparison;
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
  btn.textContent = "replace file";
  btn.addEventListener("click", clearComparison);
  summary.appendChild(btn);
}

function renderStatus(loaded) {
  const el = loaded.querySelector(".data-status");
  el.replaceChildren();

  el.appendChild(document.createTextNode(
    `Library: ${d3.format(",")(store.tracks.length)} tracks from ${store.exportifyFiles.join(", ")} `));
  const btnLib = document.createElement("button");
  btnLib.type = "button";
  btnLib.textContent = "replace file";
  btnLib.addEventListener("click", clearLibrary);
  el.appendChild(btnLib);

  el.appendChild(document.createTextNode(" · "));

  el.appendChild(document.createTextNode(
    `Comparison playlist: ${d3.format(",")(state.comparison.tracks.length)} tracks from ${state.comparison.names.join(", ")} `));
  const btnCmp = document.createElement("button");
  btnCmp.type = "button";
  btnCmp.textContent = "replace file";
  btnCmp.addEventListener("click", clearComparison);
  el.appendChild(btnCmp);
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

  const libTracks = store.tracks;
  const libStats = store.trackStats;
  const cmpTracks = state.comparison.tracks;
  const cmpStats = state.comparison.stats;

  const rows = [
    ["Tracks", d3.format(",")(libTracks.length), d3.format(",")(cmpTracks.length)],
    ["Avg. popularity",
      libStats.popularity.mean != null ? `${d3.format(".0f")(libStats.popularity.mean)} / 100` : "—",
      cmpStats.popularity.mean != null ? `${d3.format(".0f")(cmpStats.popularity.mean)} / 100` : "—"],
    ["Top genre",
      formatTopGenre(topGenre(libTracks), libTracks.length),
      formatTopGenre(topGenre(cmpTracks), cmpTracks.length)],
  ];

  const table = document.createElement("table");
  table.className = "compare-stats-table";
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  for (const label of ["", "Library", "Comparison playlist"]) {
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
  const libStats = store.trackStats;
  const cmpStats = state.comparison.stats;
  const axes = FEATURES.map((f) => ({
    label: f.label,
    desc: f.desc,
    norm: libStats[f.key].meanNorm,
    rawText: featureFormat(f, libStats[f.key].mean),
    avgNorm: cmpStats[f.key].meanNorm,
    avgRawText: featureFormat(f, cmpStats[f.key].mean),
  }));
  radarChart(chartEl, axes, { songLabel: "Library", avgLabel: "Comparison playlist" });

  const slot = document.getElementById("compare-radar-table");
  renderDataTable(slot,
    ["Feature", "Library", "Comparison playlist"],
    axes.map((ax) => [ax.label, ax.rawText, ax.avgRawText]),
    "Data table — audio-feature comparison");
}
