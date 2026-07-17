/* Client-side data store + parsers. Uploaded files are read with FileReader
   and kept in memory only — nothing is sent to the server. */

/* global d3 */

// ── store ────────────────────────────────────────────────────────────────────

export const store = {
  tracks: null,        // normalized Exportify rows
  trackStats: null,    // min/max/mean per radar feature
  exportifyFiles: [],  // file names, for the status line
  plays: null,         // normalized streaming-history rows
  streamingFiles: [],
};

const listeners = new Set();
export function onStoreChange(fn) { listeners.add(fn); }
function emit() { listeners.forEach((fn) => fn()); }

// ── feature metadata (radar axes, chips, histograms) ────────────────────────

const PITCHES = ["C", "C♯/D♭", "D", "D♯/E♭", "E", "F",
  "F♯/G♭", "G", "G♯/A♭", "A", "A♯/B♭", "B"];

function fmtDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return "—";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Each feature: how to read it off a track, how to place it on the 0–1 radar,
// how to print the raw value, and the histogram flavor.
export const FEATURES = [
  {
    key: "acousticness", label: "Acousticness",
    desc: "A confidence measure from 0.0 to 1.0 of whether the track is acoustic. 1.0 represents high confidence the track is acoustic.",
  },
  {
    key: "energy", label: "Energy",
    desc: "A perceptual measure of intensity and activity from 0.0 to 1.0. Energetic tracks feel fast, loud, and noisy — think death metal (high) versus a Bach prelude (low).",
  },
  {
    key: "danceability", label: "Danceability",
    desc: "How suitable a track is for dancing based on tempo, rhythm stability, beat strength, and overall regularity. 0.0 is least danceable and 1.0 is most danceable.",
  },
  {
    key: "valence", label: "Valence",
    desc: "The musical positiveness conveyed by a track, from 0.0 to 1.0. High valence sounds happy or euphoric; low valence sounds sad, depressed, or angry.",
  },
  {
    key: "liveness", label: "Liveness",
    desc: "Detects the presence of an audience in the recording. Values above 0.8 indicate a strong likelihood the track was performed live.",
  },
  {
    key: "speechiness", label: "Speechiness",
    desc: "Detects spoken words. Above 0.66 the track is probably all speech; 0.33–0.66 mixes music and speech (e.g. rap); below 0.33 it is mostly music.",
  },
  {
    key: "instrumentalness", label: "Instrumentalness",
    desc: "Predicts whether a track has no vocals. The closer to 1.0, the more likely the track is instrumental; values above 0.5 are intended to represent instrumental tracks.",
  },
  {
    key: "loudness", label: "Loudness",
    desc: "Overall loudness in decibels (dB), averaged across the track. Values typically range from −60 to 0 dB — closer to 0 is louder.",
    norm: (v) => clamp01((v + 60) / 60),
    fmt: (v) => `${v.toFixed(1)} dB`,
  },
  {
    key: "length", label: "Length", column: "durationMs",
    desc: "Track duration. Shown on the radar relative to the shortest and longest songs in your library.",
    normBy: "minmax",
    fmt: fmtDuration,
  },
  {
    key: "tempo", label: "Tempo",
    desc: "Estimated tempo in beats per minute (BPM). Shown on the radar relative to the slowest and fastest songs in your library.",
    normBy: "minmax",
    fmt: (v) => `${Math.round(v)} BPM`,
  },
  {
    key: "popularity", label: "Popularity",
    desc: "Spotify popularity from 0 to 100, driven mostly by how recently and how often the track has been played across all of Spotify.",
    norm: (v) => clamp01(v / 100),
    fmt: (v) => String(Math.round(v)),
    discrete: false,
  },
  {
    key: "mode", label: "Mode",
    desc: "The modality of the track: major (1) or minor (0). Major keys tend to sound brighter; minor keys darker.",
    fmt: (v) => (v >= 0.5 ? "Major" : "Minor"),
    discrete: true,
    categories: [{ value: 0, label: "Minor" }, { value: 1, label: "Major" }],
  },
  {
    key: "key", label: "Key",
    desc: "The pitch class the track is in, using standard notation: 0 = C, 1 = C♯/D♭, 2 = D, and so on up to 11 = B.",
    norm: (v) => clamp01(v / 11),
    fmt: (v) => PITCHES[Math.round(v)] ?? "—",
    discrete: true,
    categories: PITCHES.map((p, i) => ({ value: i, label: p })),
  },
  {
    key: "time_signature", label: "Time signature", column: "timeSignature",
    desc: "The estimated meter of the track — how many beats per bar. Ranges from 3 to 7, read as 3/4 through 7/4.",
    norm: (v) => clamp01((v - 3) / 4),
    fmt: (v) => `${Math.round(v)}/4`,
    discrete: true,
    categories: [3, 4, 5, 6, 7].map((v) => ({ value: v, label: `${v}/4` })),
  },
  {
    key: "release_year", label: "Release year", column: "releaseYear",
    desc: "The year the track's album was released, from your library's oldest to newest.",
    normBy: "minmax",
    fmt: (v) => String(Math.round(v)),
    discrete: false,
  },
];

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

export function featureValue(track, feature) {
  return track[feature.column ?? feature.key];
}

// Normalized 0–1 position for the radar. Default: value already lives in 0–1.
export function featureNorm(track, feature, stats) {
  const v = featureValue(track, feature);
  if (v == null || Number.isNaN(v)) return null;
  if (feature.normBy === "minmax") {
    const { min, max } = stats[feature.key];
    return max > min ? clamp01((v - min) / (max - min)) : 0.5;
  }
  if (feature.norm) return feature.norm(v);
  return clamp01(v);
}

export function featureFormat(feature, v) {
  if (v == null || Number.isNaN(v)) return "—";
  if (feature.fmt) return feature.fmt(v);
  return v.toFixed(2);
}

// ── Exportify CSV parsing ────────────────────────────────────────────────────

// Exportify column headers have shifted across versions; accept the variants.
const COLUMNS = {
  trackUri: ["Track URI", "Spotify ID", "URI"],
  name: ["Track Name"],
  album: ["Album Name"],
  artists: ["Artist Name(s)", "Artist Name"],
  releaseDate: ["Release Date", "Album Release Date"],
  durationMs: ["Duration (ms)", "Track Duration (ms)"],
  popularity: ["Popularity"],
  explicit: ["Explicit"],
  genres: ["Genres", "Artist Genres", "Genre"],
  label: ["Record Label", "Label"],
  addedAt: ["Added At"],
  danceability: ["Danceability"],
  energy: ["Energy"],
  key: ["Key"],
  loudness: ["Loudness"],
  mode: ["Mode"],
  speechiness: ["Speechiness"],
  acousticness: ["Acousticness"],
  instrumentalness: ["Instrumentalness"],
  liveness: ["Liveness"],
  valence: ["Valence"],
  tempo: ["Tempo"],
  timeSignature: ["Time Signature"],
};

const NUMERIC = new Set(["durationMs", "popularity", "danceability", "energy",
  "key", "loudness", "mode", "speechiness", "acousticness", "instrumentalness",
  "liveness", "valence", "tempo", "timeSignature"]);

function resolveColumns(headers) {
  const lower = new Map(headers.map((h) => [h.trim().toLowerCase(), h]));
  const map = {};
  for (const [canon, candidates] of Object.entries(COLUMNS)) {
    for (const c of candidates) {
      const hit = lower.get(c.toLowerCase());
      if (hit) { map[canon] = hit; break; }
    }
  }
  return map;
}

export async function loadExportifyFiles(files) {
  const rows = [];
  const names = [];
  for (const file of files) {
    const text = await file.text();
    const parsed = d3.csvParse(text);
    const cols = resolveColumns(parsed.columns ?? []);
    if (!cols.name || !cols.artists) {
      throw new Error(`"${file.name}" doesn't look like an Exportify export — no "Track Name" / "Artist Name(s)" columns.`);
    }
    names.push(file.name);
    for (const raw of parsed) {
      const t = {};
      for (const [canon, header] of Object.entries(cols)) {
        let v = raw[header];
        if (v === "" || v == null) { t[canon] = null; continue; }
        if (NUMERIC.has(canon)) {
          const n = +v;
          t[canon] = Number.isNaN(n) ? null : n;
        } else {
          t[canon] = v.trim();
        }
      }
      if (!t.name) continue;
      t.explicit = /^true$/i.test(t.explicit ?? "");
      t.releaseYear = t.releaseDate ? +String(t.releaseDate).slice(0, 4) || null : null;
      t.genreList = (t.genres ?? "")
        .split(",")
        .map((g) => g.trim().toLowerCase())
        .filter(Boolean);
      rows.push(t);
    }
  }

  // Dedupe across multiple playlist exports.
  const seen = new Set();
  const tracks = rows.filter((t) => {
    const id = t.trackUri ?? `${t.name}::${t.artists}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (!tracks.length) throw new Error("No tracks found in the uploaded file(s).");

  store.tracks = tracks;
  store.trackStats = computeTrackStats(tracks);
  store.exportifyFiles = names;
  emit();
}

function computeTrackStats(tracks) {
  const stats = {};
  for (const f of FEATURES) {
    const values = tracks
      .map((t) => featureValue(t, f))
      .filter((v) => v != null && !Number.isNaN(v));
    stats[f.key] = {
      min: values.length ? d3.min(values) : 0,
      max: values.length ? d3.max(values) : 1,
      mean: values.length ? d3.mean(values) : null,
      count: values.length,
    };
  }
  // Mean of normalized values — the "library average" radar polygon.
  for (const f of FEATURES) {
    const norms = tracks
      .map((t) => featureNorm(t, f, stats))
      .filter((v) => v != null);
    stats[f.key].meanNorm = norms.length ? d3.mean(norms) : null;
  }
  return stats;
}

// ── Extended Streaming History parsing ───────────────────────────────────────

export async function loadStreamingFiles(files) {
  const plays = [];
  const names = [];
  for (const file of files) {
    const text = await file.text();
    let entries;
    try {
      entries = JSON.parse(text);
    } catch {
      throw new Error(`"${file.name}" is not valid JSON.`);
    }
    if (!Array.isArray(entries)) {
      throw new Error(`"${file.name}" doesn't look like a streaming-history file (expected a JSON array).`);
    }
    names.push(file.name);
    for (const e of entries) {
      if (!e || e.ts == null || e.ms_played == null) continue;
      const ts = new Date(e.ts); // parsed as UTC, displayed in local time
      if (Number.isNaN(ts.getTime())) continue;
      plays.push({
        ts,
        ms: +e.ms_played || 0,
        track: e.master_metadata_track_name ?? null,
        artist: e.master_metadata_album_artist_name ?? null,
        album: e.master_metadata_album_album_name ?? null,
        episode: e.episode_name ?? null,
        isMusic: e.spotify_track_uri != null,
        skipped: e.skipped === true,
        platform: e.platform ?? null,
        country: e.conn_country ?? null,
      });
    }
  }
  if (!plays.length) throw new Error("No streaming entries found in the uploaded file(s).");
  plays.sort((a, b) => a.ts - b.ts);

  store.plays = plays;
  store.streamingFiles = names;
  emit();
}
