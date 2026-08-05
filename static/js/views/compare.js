/* Compare view: overlays a second "comparison" playlist against the same
   main playlist (store.tracks) used by Song Analysis and Genre — uploading
   on any of those three pages fills the same shared playlist, so Compare only
   ever needs ONE new upload of its own. The comparison playlist itself is
   also kept in the shared store (store.comparison), not module-local state,
   so it stays in sync with Home's embedded Compare section too. */

/* global d3 */

import { store, FEATURES, featureValue, featureFormat } from "../data.js";
import {
  radarChart, comparisonHistogramChart, comparisonColumnChart, renderDataTable,
} from "../charts.js";
import { topGenre, formatTopGenre } from "../lib/rollups.js";

const state = {
  feature: FEATURES[0].key, // selected feature for the per-feature comparison chart
};

function clearPlaylist() {
  store.tracks = null;
  store.trackStats = null;
  store.exportifyFiles = [];
  renderCompare();
}

function clearComparison() {
  store.comparison = null;
  store.comparisonStats = null;
  store.comparisonFiles = [];
  renderCompare();
}

export function renderCompare() {
  const root = document.getElementById("view-compare");
  const gate = root.querySelector(".gate");
  const loaded = root.querySelector(".loaded");

  renderPlaylistSlot();
  renderComparisonSlot();

  const ready = store.tracks && store.comparison;
  gate.hidden = ready;
  loaded.hidden = !ready;
  if (!ready) return;

  renderStatus(loaded);
  renderStats();
  renderRadar();
  renderFeatureChips();
  renderFeatureComparison();
}

function renderPlaylistSlot() {
  const slot = document.getElementById("compare-slot-playlist");
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
  btn.addEventListener("click", clearPlaylist);
  summary.appendChild(btn);
}

function renderComparisonSlot() {
  const slot = document.getElementById("compare-slot-comparison");
  const dropzone = slot.querySelector(".dropzone");
  const summary = slot.querySelector(".data-status");

  if (!store.comparison) {
    dropzone.hidden = false;
    summary.hidden = true;
    return;
  }
  dropzone.hidden = true;
  summary.hidden = false;
  summary.replaceChildren();
  summary.appendChild(document.createTextNode(
    `${d3.format(",")(store.comparison.length)} tracks from ${store.comparisonFiles.join(", ")} · `));
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
    `Playlist: ${d3.format(",")(store.tracks.length)} tracks from ${store.exportifyFiles.join(", ")} `));
  const btnLib = document.createElement("button");
  btnLib.type = "button";
  btnLib.textContent = "replace file";
  btnLib.addEventListener("click", clearPlaylist);
  el.appendChild(btnLib);

  el.appendChild(document.createTextNode(" · "));

  el.appendChild(document.createTextNode(
    `Comparison playlist: ${d3.format(",")(store.comparison.length)} tracks from ${store.comparisonFiles.join(", ")} `));
  const btnCmp = document.createElement("button");
  btnCmp.type = "button";
  btnCmp.textContent = "replace file";
  btnCmp.addEventListener("click", clearComparison);
  el.appendChild(btnCmp);
}

// Short chart-facing labels ("Playlist (file.csv)") — used in the radar
// legend, stats table headers, and per-feature comparison chart, where a
// full "Comparison playlist" reads redundant once the filename is appended.
function chartLabel(base, names) {
  if (!names || !names.length) return base;
  const suffix = names.length === 1 ? names[0] : `${names.length} files`;
  return `${base} (${suffix})`;
}

function renderStats() {
  const el = document.getElementById("compare-stats");
  el.replaceChildren();

  const libTracks = store.tracks;
  const libStats = store.trackStats;
  const cmpTracks = store.comparison;
  const cmpStats = store.comparisonStats;
  const labelA = chartLabel("Playlist", store.exportifyFiles);
  const labelB = chartLabel("Comparison", store.comparisonFiles);

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
  for (const label of ["", labelA, labelB]) {
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
  const cmpStats = store.comparisonStats;
  const labelA = chartLabel("Playlist", store.exportifyFiles);
  const labelB = chartLabel("Comparison", store.comparisonFiles);

  const axes = FEATURES.map((f) => ({
    label: f.label,
    desc: f.desc,
    norm: libStats[f.key].meanNorm,
    rawText: featureFormat(f, libStats[f.key].mean),
    avgNorm: cmpStats[f.key].meanNorm,
    avgRawText: featureFormat(f, cmpStats[f.key].mean),
  }));
  radarChart(chartEl, axes, { songLabel: labelA, avgLabel: labelB });

  const slot = document.getElementById("compare-radar-table");
  renderDataTable(slot,
    ["Feature", labelA, labelB],
    axes.map((ax) => [ax.label, ax.rawText, ax.avgRawText]),
    "Data table — audio-feature comparison");
}

function histFormatter(f) {
  if (f.key === "release_year") return d3.format("d");
  if (f.key === "length") return (v) => featureFormat(f, v);
  return d3.format("~g");
}

function renderFeatureChips() {
  const row = document.getElementById("compare-feature-chips");
  row.replaceChildren();
  for (const f of FEATURES) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (state.feature === f.key ? " active" : "");
    chip.textContent = f.label;
    chip.addEventListener("click", () => {
      state.feature = state.feature === f.key ? null : f.key;
      renderFeatureChips();
      renderFeatureComparison();
    });
    row.appendChild(chip);
  }
}

function renderFeatureComparison() {
  const heading = document.getElementById("compare-feature-heading");
  const desc = document.getElementById("compare-feature-desc");
  const chartEl = document.getElementById("compare-feature-chart");
  const tableSlot = document.getElementById("compare-feature-table");

  const f = FEATURES.find((x) => x.key === state.feature);
  if (!f) {
    heading.textContent = "Compare a specific feature";
    desc.textContent = "Select an audio feature above to compare its distribution between the two playlists.";
    chartEl.replaceChildren();
    tableSlot.replaceChildren();
    return;
  }

  heading.textContent = f.label;
  desc.textContent = f.desc;

  const labelA = chartLabel("Playlist", store.exportifyFiles);
  const labelB = chartLabel("Comparison", store.comparisonFiles);

  if (f.discrete && f.categories) {
    const rawA = store.tracks.map((t) => featureValue(t, f)).filter((v) => v != null && !Number.isNaN(v));
    const rawB = store.comparison.map((t) => featureValue(t, f)).filter((v) => v != null && !Number.isNaN(v));
    const countsA = d3.rollup(rawA, (v) => v.length, (v) => Math.round(v));
    const countsB = d3.rollup(rawB, (v) => v.length, (v) => Math.round(v));
    const categories = f.categories.map((c) => c.label);
    const valuesA = f.categories.map((c) => (countsA.get(c.value) ?? 0) / (rawA.length || 1));
    const valuesB = f.categories.map((c) => (countsB.get(c.value) ?? 0) / (rawB.length || 1));

    comparisonColumnChart(chartEl, categories, valuesA, valuesB, { labelA, labelB });
    renderDataTable(tableSlot,
      [f.label, labelA, labelB],
      categories.map((c, i) => [c, d3.format(".0%")(valuesA[i]), d3.format(".0%")(valuesB[i])]),
      `Data table — ${f.label.toLowerCase()} comparison`);
  } else {
    const valuesA = store.tracks.map((t) => featureValue(t, f)).filter((v) => v != null && !Number.isNaN(v));
    const valuesB = store.comparison.map((t) => featureValue(t, f)).filter((v) => v != null && !Number.isNaN(v));
    const xFmt = histFormatter(f);

    const combined = comparisonHistogramChart(chartEl, valuesA, valuesB, {
      xFmt, labelA, labelB,
      bins: f.key === "release_year" ? Math.min(30, new Set([...valuesA, ...valuesB]).size) : 20,
    });
    renderDataTable(tableSlot,
      ["Range", labelA, labelB],
      combined.map((b) => [`${xFmt(b.x0)} – ${xFmt(b.x1)}`, d3.format(".0%")(b.pctA), d3.format(".0%")(b.pctB)]),
      `Data table — ${f.label.toLowerCase()} comparison`);
  }
}
