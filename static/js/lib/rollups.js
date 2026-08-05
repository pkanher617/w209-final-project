/* Shared pure aggregation helpers — no store reads, no DOM. Used by both the
   standalone tab views and Home, which renders the same aggregates into its
   own parallel DOM. */

/* global d3 */

export function topSongs(tracks) {
  return [...tracks]
    .filter((t) => t.popularity != null)
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 10);
}

export function genreRollup(tracks) {
  const byGenre = new Map();
  let untagged = 0;
  for (const t of tracks) {
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

export function topGenre(tracks) {
  const counts = new Map();
  for (const t of tracks) {
    for (const g of t.genreList) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  if (!counts.size) return null;
  return [...counts.entries()].sort((x, y) => y[1] - x[1])[0]; // [name, count]
}

export function formatTopGenre(entry, total) {
  if (!entry) return "—";
  const [name, count] = entry;
  return `${name} (${d3.format(".0%")(count / total)})`;
}

export const MS_PER_HOUR = 3.6e6;
const PLAY_THRESHOLD_MS = 30000; // Spotify counts a stream at 30s

export function aggregate(plays) {
  const hoursByYear = d3.rollup(plays, (v) => d3.sum(v, (p) => p.ms) / MS_PER_HOUR,
    (p) => p.ts.getFullYear());

  const hoursByMonth = d3.rollup(plays, (v) => d3.sum(v, (p) => p.ms) / MS_PER_HOUR,
    (p) => new Date(p.ts.getFullYear(), p.ts.getMonth(), 1).getTime());

  const heat = d3.rollup(plays, (v) => d3.sum(v, (p) => p.ms) / MS_PER_HOUR,
    (p) => p.ts.getDay(), (p) => p.ts.getHours());
  const cells = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      cells.push({ day, hour, value: heat.get(day)?.get(hour) ?? 0 });
    }
  }

  const music = plays.filter((p) => p.isMusic && p.track);
  const artistHours = d3.rollups(
    music.filter((p) => p.artist),
    (v) => d3.sum(v, (p) => p.ms) / MS_PER_HOUR,
    (p) => p.artist)
    .sort((a, b) => b[1] - a[1]);
  const trackPlays = d3.rollups(
    music.filter((p) => p.ms >= PLAY_THRESHOLD_MS),
    (v) => ({ plays: v.length, track: v[0].track, artist: v[0].artist }),
    (p) => `${p.track}::${p.artist}`)
    .sort((a, b) => b[1].plays - a[1].plays);

  return {
    source: plays,
    totalHours: d3.sum(plays, (p) => p.ms) / MS_PER_HOUR,
    totalPlays: music.filter((p) => p.ms >= PLAY_THRESHOLD_MS).length,
    uniqueArtists: new Set(music.filter((p) => p.artist).map((p) => p.artist)).size,
    uniqueTracks: new Set(music.map((p) => `${p.track}::${p.artist}`)).size,
    first: plays[0].ts,
    last: plays[plays.length - 1].ts,
    hoursByYear: [...hoursByYear.entries()].sort((a, b) => a[0] - b[0]),
    hoursByMonth: [...hoursByMonth.entries()].sort((a, b) => a[0] - b[0])
      .map(([t, v]) => ({ date: new Date(+t), value: v })),
    cells,
    artistHours,
    trackPlays,
  };
}
