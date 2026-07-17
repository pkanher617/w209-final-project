/* Song Analysis view: top-10 list, search, per-song radar, per-feature
   histograms across the whole library. */

/* global d3 */

import { store, FEATURES, featureValue, featureNorm, featureFormat } from "../data.js";
import { histogramChart, columnChart, radarChart, renderDataTable } from "../charts.js";

const state = {
  mode: "song",   // "song" | "feature"
  song: null,
  feature: null,
};

const section = () => document.getElementById("view-songs");

export function renderSongs() {
  const root = section();
  const gate = root.querySelector(".gate");
  const loaded = root.querySelector(".loaded");
  if (!store.tracks) {
    gate.hidden = false;
    loaded.hidden = true;
    return;
  }
  gate.hidden = true;
  loaded.hidden = false;

  if (!state.song || !store.tracks.includes(state.song)) {
    state.song = topSongs()[0] ?? store.tracks[0];
    state.mode = "song";
  }

  renderStatus(loaded);
  renderChips();
  renderTopList();
  renderSearch();
  renderCenter();
}

function topSongs() {
  return [...store.tracks]
    .filter((t) => t.popularity != null)
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 10);
}

function renderStatus(loaded) {
  const el = loaded.querySelector(".data-status");
  el.replaceChildren();
  el.appendChild(document.createTextNode(
    `${d3.format(",")(store.tracks.length)} tracks from ${store.exportifyFiles.join(", ")} · `));
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "replace file";
  btn.addEventListener("click", () => {
    store.tracks = null;
    store.trackStats = null;
    store.exportifyFiles = [];
    renderSongs();
  });
  el.appendChild(btn);
}

function renderChips() {
  const row = document.getElementById("feature-chips");
  row.replaceChildren();
  for (const f of FEATURES) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (state.mode === "feature" && state.feature === f.key ? " active" : "");
    chip.textContent = f.label;
    chip.addEventListener("click", () => {
      if (state.mode === "feature" && state.feature === f.key) {
        state.mode = "song"; // toggling the active chip returns to the song view
        state.feature = null;
      } else {
        state.mode = "feature";
        state.feature = f.key;
      }
      renderChips();
      renderCenter();
    });
    row.appendChild(chip);
  }
}

function songButton(track, { rank = null, valueText = null } = {}) {
  const li = document.createElement("li");
  if (state.mode === "song" && state.song === track) li.classList.add("selected");
  const btn = document.createElement("button");
  btn.type = "button";
  if (rank != null) {
    const r = document.createElement("span");
    r.className = "rank";
    r.textContent = String(rank);
    btn.appendChild(r);
  }
  const text = document.createElement("span");
  text.style.minWidth = "0";
  text.style.flex = "1";
  const title = document.createElement("span");
  title.className = "song-title";
  title.textContent = track.name;
  title.title = track.name;
  const sub = document.createElement("span");
  sub.className = "song-sub";
  sub.textContent = track.artists ?? "";
  text.appendChild(title);
  text.appendChild(sub);
  btn.appendChild(text);
  if (valueText != null) {
    const v = document.createElement("span");
    v.className = "song-value";
    v.textContent = valueText;
    btn.appendChild(v);
  }
  btn.addEventListener("click", () => {
    state.mode = "song";
    state.feature = null;
    state.song = track;
    renderChips();
    renderTopList();
    renderSearch();
    renderCenter();
  });
  li.appendChild(btn);
  return li;
}

function renderTopList() {
  const ol = document.getElementById("top-songs-list");
  ol.replaceChildren();
  topSongs().forEach((t, i) => {
    ol.appendChild(songButton(t, { rank: i + 1, valueText: String(t.popularity) }));
  });
}

let searchWired = false;

function renderSearch() {
  const input = document.getElementById("song-search");
  if (!searchWired) {
    searchWired = true;
    input.addEventListener("input", () => renderResults(input.value));
  }
  renderResults(input.value);
}

function renderResults(query) {
  const ul = document.getElementById("search-results");
  ul.replaceChildren();
  const q = (query ?? "").trim().toLowerCase();
  if (!q) {
    const hint = document.createElement("li");
    hint.className = "empty-hint";
    hint.textContent = "Type to search your library by title or artist.";
    ul.appendChild(hint);
    return;
  }
  const hits = store.tracks
    .filter((t) => (t.name ?? "").toLowerCase().includes(q)
      || (t.artists ?? "").toLowerCase().includes(q))
    .slice(0, 25);
  if (!hits.length) {
    const none = document.createElement("li");
    none.className = "empty-hint";
    none.textContent = "No matches.";
    ul.appendChild(none);
    return;
  }
  hits.forEach((t) => ul.appendChild(songButton(t)));
}

// ── center panel ─────────────────────────────────────────────────────────────

function renderCenter() {
  const center = document.getElementById("song-center");
  center.replaceChildren();
  if (state.mode === "feature") renderFeaturePanel(center);
  else renderSongPanel(center);
}

function renderSongPanel(center) {
  const t = state.song;
  if (!t) return;

  const head = document.createElement("div");
  head.className = "song-detail-head";
  const h = document.createElement("h2");
  h.textContent = t.name;
  const p = document.createElement("p");
  p.textContent = t.artists ?? "";
  head.appendChild(h);
  head.appendChild(p);
  center.appendChild(head);

  const rows = [
    ["Album", t.album],
    ["Release date", t.releaseDate],
    ["Duration", featureFormat(FEATURES.find((f) => f.key === "length"), t.durationMs)],
    ["Popularity", t.popularity != null ? `${t.popularity} / 100` : null],
    ["Explicit", t.explicit ? "Yes" : "No"],
    ["Genres", t.genreList.length ? t.genreList.join(", ") : null],
    ["Label", t.label],
  ].filter(([, v]) => v != null && v !== "");

  const table = document.createElement("table");
  table.className = "detail-table";
  const tbody = document.createElement("tbody");
  for (const [k, v] of rows) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = k;
    const td = document.createElement("td");
    td.textContent = String(v);
    tr.appendChild(th);
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  center.appendChild(table);

  const chartEl = document.createElement("div");
  chartEl.className = "chart";
  center.appendChild(chartEl);

  const stats = store.trackStats;
  const axes = FEATURES.map((f) => {
    const raw = featureValue(t, f);
    return {
      label: f.label,
      norm: featureNorm(t, f, stats),
      rawText: featureFormat(f, raw),
      avgNorm: stats[f.key].meanNorm,
      avgRawText: featureFormat(f, stats[f.key].mean),
    };
  });
  radarChart(chartEl, axes);

  const slot = document.createElement("div");
  slot.className = "table-slot";
  center.appendChild(slot);
  renderDataTable(slot,
    ["Feature", "This song", "Library average"],
    axes.map((a) => [a.label, a.rawText, a.avgRawText]),
    "Data table — radar values");
}

function renderFeaturePanel(center) {
  const f = FEATURES.find((x) => x.key === state.feature);
  if (!f) return;

  const head = document.createElement("div");
  head.className = "song-detail-head";
  const h = document.createElement("h2");
  h.textContent = f.label;
  head.appendChild(h);
  center.appendChild(head);

  const desc = document.createElement("p");
  desc.className = "feature-desc";
  desc.textContent = f.desc;
  center.appendChild(desc);

  const chartEl = document.createElement("div");
  chartEl.className = "chart";
  center.appendChild(chartEl);

  const values = store.tracks
    .map((t) => featureValue(t, f))
    .filter((v) => v != null && !Number.isNaN(v));

  const slot = document.createElement("div");
  slot.className = "table-slot";

  if (f.discrete && f.categories) {
    const counts = d3.rollup(values, (v) => v.length, (v) => Math.round(v));
    const data = f.categories.map((c) => ({ label: c.label, value: counts.get(c.value) ?? 0 }));
    columnChart(chartEl, data, { valueFmt: d3.format(","), height: 320 });
    center.appendChild(slot);
    renderDataTable(slot, [f.label, "Songs"], data.map((d) => [d.label, d.value]),
      `Data table — songs by ${f.label.toLowerCase()}`);
  } else {
    const xFmt = f.key === "release_year" ? d3.format("d")
      : f.key === "length" ? (v) => featureFormat(f, v)
        : d3.format("~g");
    const bins = histogramChart(chartEl, values, {
      xFmt,
      bins: f.key === "release_year" ? Math.min(30, new Set(values).size) : 24,
      unitLabel: "songs",
    });
    center.appendChild(slot);
    renderDataTable(slot, ["Range", "Songs"],
      bins.filter((b) => b.length).map((b) => [`${xFmt(b.x0)} – ${xFmt(b.x1)}`, b.length]),
      `Data table — ${f.label.toLowerCase()} distribution`);
  }

  const n = document.createElement("p");
  n.className = "note";
  n.textContent = `${d3.format(",")(values.length)} of ${d3.format(",")(store.tracks.length)} tracks have a ${f.label.toLowerCase()} value.`;
  center.appendChild(n);
}
