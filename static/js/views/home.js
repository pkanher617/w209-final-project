/* Home: combines Song Analysis, Genre, Compare, and Streaming Trends into one
   continuous scroll, gated by upload state. Playlist upload (step 1) and
   streaming-history upload (step 5) block further scrolling — everything
   below them stays `hidden` (zero rendered height) until satisfied, so
   there's simply nothing to scroll into yet; no scroll-trapping JS needed.
   Compare's second playlist (step 4) is optional and never gates anything.

   Each section below is a straight port of its standalone tab's render
   logic (songs.js / genre.js / compare.js / trends.js), targeting this
   page's own `home-`-prefixed ids with its own section-local state, so nothing
   here can affect (or be affected by) the standalone tabs' own state. All
   four sections read the same shared `store`, which is what keeps them in
   sync with the standalone tabs' data. */

/* global d3 scrollama */

import {
  store, FEATURES, featureValue, featureNorm, featureFormat, loadComparisonPlaylist,
} from "../data.js";
import {
  histogramChart, columnChart, radarChart, bubbleChart, barList,
  comparisonHistogramChart, comparisonColumnChart, lineAreaChart, heatmapChart, renderDataTable,
} from "../charts.js";
import { topSongs, genreRollup, topGenre, formatTopGenre, aggregate, MS_PER_HOUR } from "../lib/rollups.js";

const songState = { mode: "song", song: null, feature: null, bin: null };
const genreState = { selected: null };
const compareState = { feature: FEATURES[0].key };
let trendsCache = null;
let searchWired = false;
let scroller = null;

export function renderHome() {
  const tracksReady = !!store.tracks;
  document.getElementById("home-gate-exportify").hidden = tracksReady;
  document.getElementById("home-after-playlist").hidden = !tracksReady;

  if (tracksReady) {
    renderHomeSongs();
    renderHomeGenre();
    renderHomeCompare();
    renderHomeTrends();
  }

  positionProgressRail();
  initScrollama();
  window.__homeScroller?.resize();
}

// ════════════════════════════ Song Analysis ════════════════════════════════

function renderHomeSongs() {
  if (!songState.song || !store.tracks.includes(songState.song)) {
    songState.song = topSongs(store.tracks)[0] ?? store.tracks[0];
    songState.mode = "song";
  }
  renderHomeSongsStatus();
  renderHomeChips();
  renderHomeTopList();
  renderHomeSearch();
  renderHomeCenter();
}

function renderHomeSongsStatus() {
  const el = document.getElementById("home-songs-status");
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
    renderHome();
  });
  el.appendChild(btn);
}

function renderHomeChips() {
  const row = document.getElementById("home-feature-chips");
  row.replaceChildren();
  for (const f of FEATURES) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (songState.mode === "feature" && songState.feature === f.key ? " active" : "");
    chip.textContent = f.label;
    chip.addEventListener("click", () => {
      if (songState.mode === "feature" && songState.feature === f.key) {
        songState.mode = "song";
        songState.feature = null;
      } else {
        songState.mode = "feature";
        songState.feature = f.key;
      }
      songState.bin = null;
      renderHomeChips();
      renderHomeCenter();
    });
    row.appendChild(chip);
  }
}

function homeSongButton(track, { rank = null, valueText = null } = {}) {
  const li = document.createElement("li");
  if (songState.mode === "song" && songState.song === track) li.classList.add("selected");
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
    songState.mode = "song";
    songState.feature = null;
    songState.bin = null;
    songState.song = track;
    renderHomeChips();
    renderHomeTopList();
    renderHomeSearch();
    renderHomeCenter();
  });
  li.appendChild(btn);
  return li;
}

function renderHomeTopList() {
  const ol = document.getElementById("home-top-songs-list");
  ol.replaceChildren();
  topSongs(store.tracks).forEach((t, i) => {
    ol.appendChild(homeSongButton(t, { rank: i + 1, valueText: String(t.popularity) }));
  });
}

function renderHomeSearch() {
  const input = document.getElementById("home-song-search");
  if (!searchWired) {
    searchWired = true;
    input.addEventListener("input", () => renderHomeResults(input.value));
  }
  renderHomeResults(input.value);
}

function renderHomeResults(query) {
  const ul = document.getElementById("home-search-results");
  ul.replaceChildren();
  const q = (query ?? "").trim().toLowerCase();
  if (!q) {
    const hint = document.createElement("li");
    hint.className = "empty-hint";
    hint.textContent = "Type to search your playlist by title or artist.";
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
  hits.forEach((t) => ul.appendChild(homeSongButton(t)));
}

function renderHomeCenter() {
  const center = document.getElementById("home-song-center");
  center.replaceChildren();
  if (songState.mode === "feature") renderHomeFeaturePanel(center);
  else renderHomeSongPanel(center);
}

function renderHomeSongPanel(center) {
  const t = songState.song;
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
      desc: f.desc,
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
    ["Feature", "This song", "Playlist average"],
    axes.map((a) => [a.label, a.rawText, a.avgRawText]),
    "Data table — radar values");
}

function renderHomeFeaturePanel(center) {
  const f = FEATURES.find((x) => x.key === songState.feature);
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
    columnChart(chartEl, data, {
      valueFmt: d3.format(","), height: 320,
      selectedLabel: songState.bin?.kind === "category" ? songState.bin.label : null,
      onBarClick: (d) => {
        const cat = f.categories.find((c) => c.label === d.label);
        songState.bin = { kind: "category", label: d.label, catValue: cat?.value };
        renderHomeCenter();
      },
    });
    if (songState.bin?.kind === "category") renderHomeBinDrill(center, f, songState.bin);
    center.appendChild(slot);
    renderDataTable(slot, [f.label, "Songs"], data.map((d) => [d.label, d.value]),
      `Data table — songs by ${f.label.toLowerCase()}`);
  } else {
    const xFmt = homeHistFormatter(f);
    const bins = histogramChart(chartEl, values, {
      xFmt,
      bins: f.key === "release_year" ? Math.min(30, new Set(values).size) : 24,
      unitLabel: "songs",
      selectedBin: songState.bin?.kind === "range" ? songState.bin : null,
      onBinClick: (b) => {
        songState.bin = { kind: "range", x0: b.x0, x1: b.x1 };
        renderHomeCenter();
      },
    });
    if (songState.bin?.kind === "range") renderHomeBinDrill(center, f, songState.bin);
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

function homeHistFormatter(f) {
  if (f.key === "release_year") return d3.format("d");
  if (f.key === "length") return (v) => featureFormat(f, v);
  return d3.format("~g");
}

function homeTracksForBin(f, bin) {
  if (bin.kind === "category") {
    return store.tracks.filter((t) => {
      const v = featureValue(t, f);
      return v != null && Math.round(v) === bin.catValue;
    });
  }
  return store.tracks.filter((t) => {
    const v = featureValue(t, f);
    return v != null && v >= bin.x0 && v <= bin.x1;
  });
}

function renderHomeBinDrill(center, f, bin) {
  const tracks = homeTracksForBin(f, bin);

  const panel = document.createElement("div");
  panel.className = "bin-drill";

  const head = document.createElement("div");
  head.className = "bin-drill-head";
  const h3 = document.createElement("h3");
  h3.textContent = bin.kind === "range"
    ? `Songs with ${f.label.toLowerCase()} between ${homeHistFormatter(f)(bin.x0)} and ${homeHistFormatter(f)(bin.x1)}`
    : `Songs with ${f.label.toLowerCase()} "${bin.label}"`;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "bin-drill-close";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", () => {
    songState.bin = null;
    renderHomeCenter();
  });
  head.appendChild(h3);
  head.appendChild(closeBtn);
  panel.appendChild(head);

  const count = document.createElement("p");
  count.className = "note";
  count.textContent = `${d3.format(",")(tracks.length)} song${tracks.length === 1 ? "" : "s"}`;
  panel.appendChild(count);

  const list = document.createElement("ol");
  list.className = "song-list bin-drill-list";
  const shown = [...tracks].sort((a, b) => (b.popularity ?? -1) - (a.popularity ?? -1)).slice(0, 50);
  shown.forEach((t) => list.appendChild(homeSongButton(t)));
  panel.appendChild(list);
  if (tracks.length > shown.length) {
    const more = document.createElement("p");
    more.className = "note";
    more.textContent = `Showing the top ${shown.length} of ${d3.format(",")(tracks.length)} by popularity.`;
    panel.appendChild(more);
  }

  center.appendChild(panel);
}

// ═════════════════════════════════ Genre ════════════════════════════════════

const GENRE_MAX_BUBBLES = 40;

function renderHomeGenre() {
  const { genres, untagged } = genreRollup(store.tracks);
  if (genreState.selected && !genres.some((g) => g.name === genreState.selected)) {
    genreState.selected = null;
  }
  if (!genreState.selected && genres.length) genreState.selected = genres[0].name;

  renderHomeGenreStatus(genres, untagged);

  const bubblesEl = document.getElementById("home-genre-bubbles");
  bubbleChart(bubblesEl, genres.slice(0, GENRE_MAX_BUBBLES), {
    selected: genreState.selected,
    onSelect: (name) => {
      genreState.selected = name;
      renderHomeGenre();
    },
  });
  if (genres.length > GENRE_MAX_BUBBLES) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = `Showing the ${GENRE_MAX_BUBBLES} most common genres; the full list is in the data table.`;
    bubblesEl.appendChild(note);
  }

  renderDataTable(document.getElementById("home-genre-table"),
    ["Genre", "Songs", "Avg popularity"],
    genres.map((g) => [g.name, g.count, d3.format(".0f")(g.meanPop)]),
    "Data table — all genres");

  renderHomeGenreDrill(genres);
}

function renderHomeGenreStatus(genres, untagged) {
  const el = document.getElementById("home-genre-status");
  el.replaceChildren();
  el.appendChild(document.createTextNode(
    `${d3.format(",")(store.tracks.length)} tracks · ${d3.format(",")(genres.length)} genres`
    + (untagged ? ` · ${d3.format(",")(untagged)} tracks without genre tags` : "")
    + " · "));
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "replace file";
  btn.addEventListener("click", () => {
    store.tracks = null;
    store.trackStats = null;
    store.exportifyFiles = [];
    renderHome();
  });
  el.appendChild(btn);
}

function renderHomeGenreDrill(genres) {
  const panel = document.getElementById("home-genre-drill");
  panel.replaceChildren();

  const g = genres.find((x) => x.name === genreState.selected);
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

// ════════════════════════════════ Compare ═══════════════════════════════════
// Not gated on its own upload — always shown once the main playlist is ready,
// scrollable past without uploading a comparison playlist.

function renderHomeCompare() {
  renderHomeComparisonSlot();

  const ready = !!store.comparison;
  document.getElementById("home-compare-content").hidden = !ready;
  if (!ready) return;

  renderHomeCompareStats();
  renderHomeCompareRadar();
  renderHomeCompareChips();
  renderHomeCompareFeature();
}

function renderHomeComparisonSlot() {
  const slot = document.getElementById("home-compare-slot");
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
  btn.addEventListener("click", () => {
    store.comparison = null;
    store.comparisonStats = null;
    store.comparisonFiles = [];
    renderHome();
  });
  summary.appendChild(btn);
}

function homeChartLabel(base, names) {
  if (!names || !names.length) return base;
  const suffix = names.length === 1 ? names[0] : `${names.length} files`;
  return `${base} (${suffix})`;
}

function renderHomeCompareStats() {
  const el = document.getElementById("home-compare-stats");
  el.replaceChildren();

  const libTracks = store.tracks;
  const libStats = store.trackStats;
  const cmpTracks = store.comparison;
  const cmpStats = store.comparisonStats;
  const labelA = homeChartLabel("Playlist", store.exportifyFiles);
  const labelB = homeChartLabel("Comparison", store.comparisonFiles);

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

function renderHomeCompareRadar() {
  const chartEl = document.getElementById("home-compare-radar");
  const libStats = store.trackStats;
  const cmpStats = store.comparisonStats;
  const labelA = homeChartLabel("Playlist", store.exportifyFiles);
  const labelB = homeChartLabel("Comparison", store.comparisonFiles);

  const axes = FEATURES.map((f) => ({
    label: f.label,
    desc: f.desc,
    norm: libStats[f.key].meanNorm,
    rawText: featureFormat(f, libStats[f.key].mean),
    avgNorm: cmpStats[f.key].meanNorm,
    avgRawText: featureFormat(f, cmpStats[f.key].mean),
  }));
  radarChart(chartEl, axes, { songLabel: labelA, avgLabel: labelB });

  const slot = document.getElementById("home-compare-radar-table");
  renderDataTable(slot,
    ["Feature", labelA, labelB],
    axes.map((ax) => [ax.label, ax.rawText, ax.avgRawText]),
    "Data table — audio-feature comparison");
}

function renderHomeCompareChips() {
  const row = document.getElementById("home-compare-feature-chips");
  row.replaceChildren();
  for (const f of FEATURES) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (compareState.feature === f.key ? " active" : "");
    chip.textContent = f.label;
    chip.addEventListener("click", () => {
      compareState.feature = compareState.feature === f.key ? null : f.key;
      renderHomeCompareChips();
      renderHomeCompareFeature();
    });
    row.appendChild(chip);
  }
}

function renderHomeCompareFeature() {
  const heading = document.getElementById("home-compare-feature-heading");
  const desc = document.getElementById("home-compare-feature-desc");
  const chartEl = document.getElementById("home-compare-feature-chart");
  const tableSlot = document.getElementById("home-compare-feature-table");

  const f = FEATURES.find((x) => x.key === compareState.feature);
  if (!f) {
    heading.textContent = "Compare a specific feature";
    desc.textContent = "Select an audio feature above to compare its distribution between the two playlists.";
    chartEl.replaceChildren();
    tableSlot.replaceChildren();
    return;
  }

  heading.textContent = f.label;
  desc.textContent = f.desc;

  const labelA = homeChartLabel("Playlist", store.exportifyFiles);
  const labelB = homeChartLabel("Comparison", store.comparisonFiles);

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
    const xFmt = homeHistFormatter(f);

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

// ═══════════════════════════ Streaming Trends ═══════════════════════════════
// Keeps its own inner gate (store.plays), nested inside the outer
// playlist-gate wrapper — reachable only once step 1 is done, and itself
// blocking the trends charts below it until satisfied.

function renderHomeTrends() {
  const plays = store.plays;
  document.getElementById("home-gate-streaming").hidden = !!plays;
  const loadedEl = document.getElementById("home-trends-loaded");
  loadedEl.hidden = !plays;
  if (!plays) return;

  if (!trendsCache || trendsCache.source !== plays) trendsCache = aggregate(plays);

  renderHomeTrendsStatus();
  renderHomeTrendsTiles();
  renderHomeTrendsYear();
  renderHomeTrendsMonth();
  renderHomeTrendsHeatmap();
  renderHomeTrendsTopLists();
}

function renderHomeTrendsStatus() {
  const el = document.getElementById("home-trends-status");
  const span = `${d3.timeFormat("%b %Y")(trendsCache.first)} – ${d3.timeFormat("%b %Y")(trendsCache.last)}`;
  el.replaceChildren();
  el.appendChild(document.createTextNode(
    `${store.streamingFiles.length} files · ${d3.format(",")(store.plays.length)} entries · ${span} · `));
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "replace files";
  btn.addEventListener("click", () => {
    store.plays = null;
    store.streamingFiles = [];
    trendsCache = null;
    renderHome();
  });
  el.appendChild(btn);
}

function homeTile(label, value, sub = null) {
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

function renderHomeTrendsTiles() {
  const wrap = document.getElementById("home-trend-tiles");
  wrap.replaceChildren();
  const years = (trendsCache.last - trendsCache.first) / (365.25 * 24 * MS_PER_HOUR);
  wrap.appendChild(homeTile("Hours streamed", d3.format(",.0f")(trendsCache.totalHours),
    `over ${years.toFixed(1)} years`));
  wrap.appendChild(homeTile("Plays", d3.format(",")(trendsCache.totalPlays), "streams of 30s or more"));
  wrap.appendChild(homeTile("Artists", d3.format(",")(trendsCache.uniqueArtists)));
  wrap.appendChild(homeTile("Songs", d3.format(",")(trendsCache.uniqueTracks)));
}

function renderHomeTrendsYear() {
  const el = document.getElementById("home-trend-year");
  const data = trendsCache.hoursByYear.map(([year, v]) => ({ label: String(year), value: v }));
  columnChart(el, data, { valueFmt: d3.format(",.0f") });
  renderDataTable(el.parentElement.querySelector(".table-slot"),
    ["Year", "Hours"], data.map((d) => [d.label, d3.format(",.1f")(d.value)]),
    "Data table — hours by year");
}

function renderHomeTrendsMonth() {
  const el = document.getElementById("home-trend-month");
  lineAreaChart(el, trendsCache.hoursByMonth, { valueLabel: "hours" });
  renderDataTable(el.parentElement.querySelector(".table-slot"),
    ["Month", "Hours"],
    trendsCache.hoursByMonth.map((d) => [d3.timeFormat("%b %Y")(d.date), d3.format(",.1f")(d.value)]),
    "Data table — hours by month");
}

function renderHomeTrendsHeatmap() {
  const el = document.getElementById("home-trend-heatmap");
  heatmapChart(el, trendsCache.cells);
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  renderDataTable(el.parentElement.querySelector(".table-slot"),
    ["Day", ...d3.range(24).map((h) => `${h}:00`)],
    dayNames.map((name, day) => [
      name,
      ...d3.range(24).map((hour) =>
        d3.format(".1f")(trendsCache.cells.find((c) => c.day === day && c.hour === hour)?.value ?? 0)),
    ]),
    "Data table — hours by day and hour");
}

function renderHomeTrendsTopLists() {
  barList(document.getElementById("home-trend-artists"),
    trendsCache.artistHours.slice(0, 10).map(([name, hours]) => ({ name, value: hours })),
    { valueFmt: (v) => `${d3.format(",.1f")(v)} h` });

  barList(document.getElementById("home-trend-tracks"),
    trendsCache.trackPlays.slice(0, 10).map(([, info]) => ({
      name: info.track,
      title: `${info.track} — ${info.artist ?? ""}`,
      value: info.plays,
    })),
    { valueFmt: d3.format(",") });
}

// ═══════════════════════ scroll progress rail (cosmetic) ════════════════════
// Purely a wayfinding aid — gating/reveal above never depends on this. If the
// scrollama CDN is blocked or slow, the page still works, just without the
// active-step highlight.

function positionProgressRail() {
  const header = document.querySelector("header");
  const bar = document.getElementById("home-progress");
  if (header && bar) bar.style.top = `${header.offsetHeight}px`;
}

function setActiveProgressStep(name) {
  document.querySelectorAll(".home-progress-step").forEach((b) => {
    b.classList.toggle("active", b.dataset.step === name);
  });
}

function initScrollama() {
  if (scroller || typeof scrollama !== "function") return;
  try {
    scroller = scrollama();
    scroller
      .setup({ step: "#view-home .step", offset: 0.5 })
      .onStepEnter(({ element }) => setActiveProgressStep(element.dataset.step));
    window.__homeScroller = scroller;
  } catch (err) {
    console.warn("scrollama unavailable; progress rail disabled", err);
  }
}
