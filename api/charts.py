"""Placeholder Altair charts for the W209 final project.

Each public function returns an Altair chart built from synthetic data shaped
like the real sources (Exportify track exports, Spotify Charts country data).
When the final datasets are ready, swap the _placeholder_* frames for real
DataFrames — the chart code and the Flask routes stay the same.
"""

import altair as alt
import numpy as np
import pandas as pd

# Reference palette (validated for CVD safety / contrast on the light surface).
CATEGORICAL = [
    "#2a78d6",  # blue
    "#1baf7a",  # aqua
    "#eda100",  # yellow
    "#008300",  # green
    "#4a3aa7",  # violet
    "#e34948",  # red
    "#e87ba4",  # magenta
    "#eb6834",  # orange
]
SEQUENTIAL_BLUES = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]
SURFACE = "#fcfcfb"
GRID = "#e1e0d9"
AXIS = "#c3c2b7"
INK = "#0b0b0b"
MUTED = "#898781"
FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif"


def _themed(chart: alt.Chart) -> alt.Chart:
    """Apply the shared look so every chart reads as one system."""
    return (
        chart.configure(background=SURFACE, font=FONT)
        .configure_axis(
            gridColor=GRID,
            domainColor=AXIS,
            tickColor=AXIS,
            labelColor=MUTED,
            titleColor=INK,
        )
        .configure_legend(labelColor=INK, titleColor=INK)
        .configure_title(color=INK, fontSize=16, anchor="start")
        .configure_view(stroke=None)
    )


def _placeholder_tracks(n: int = 250) -> pd.DataFrame:
    """Synthetic Exportify-style track table (Tempo, Valence, Danceability, ...)."""
    rng = np.random.default_rng(209)
    tempo = rng.normal(120, 25, n).clip(60, 200)
    # Faster songs get noisier valence, matching the Hypothesis 1 storyline.
    valence = (0.35 + 0.0015 * tempo + rng.normal(0, 0.05 + 0.0012 * tempo, n)).clip(0, 1)
    danceability = rng.beta(5, 2.2, n)  # left-skewed, like the liked-songs list
    energy = (0.35 * danceability + rng.beta(4, 2.5, n) * 0.65).clip(0, 1)
    popularity = (danceability * 45 + rng.normal(25, 18, n)).clip(0, 100).round()
    return pd.DataFrame(
        {
            "Track": [f"Track {i + 1}" for i in range(n)],
            "Tempo": tempo.round(1),
            "Valence": valence.round(3),
            "Danceability": danceability.round(3),
            "Energy": energy.round(3),
            "Popularity": popularity,
        }
    )


def valence_by_tempo() -> alt.Chart:
    """Hypothesis 1: valence spread across tempo bands (boxplot)."""
    df = _placeholder_tracks()
    order = ["Low (<100 BPM)", "Medium (100-140 BPM)", "High (>140 BPM)"]
    df["Tempo band"] = pd.cut(df["Tempo"], bins=[0, 100, 140, 1000], labels=order)
    chart = (
        alt.Chart(df)
        .mark_boxplot(size=44)
        .encode(
            x=alt.X("Tempo band:N", sort=order, title="Tempo", axis=alt.Axis(labelAngle=0)),
            y=alt.Y("Valence:Q", title="Valence"),
            color=alt.Color(
                "Tempo band:N",
                sort=order,
                scale=alt.Scale(range=CATEGORICAL[:3]),
                legend=None,
            ),
        )
        .properties(title="Valence by tempo range (placeholder data)", width=440, height=360)
    )
    return _themed(chart)


def danceability_histogram() -> alt.Chart:
    """Hypothesis 2: distribution of danceability scores."""
    df = _placeholder_tracks()
    chart = (
        alt.Chart(df)
        .mark_bar(color=CATEGORICAL[0], cornerRadiusTopLeft=4, cornerRadiusTopRight=4)
        .encode(
            x=alt.X("Danceability:Q", bin=alt.Bin(maxbins=20), title="Danceability"),
            y=alt.Y("count():Q", title="Songs"),
            tooltip=[alt.Tooltip("count():Q", title="Songs")],
        )
        .properties(title="Danceability of liked songs (placeholder data)", width=440, height=360)
    )
    return _themed(chart)


def danceability_scatter() -> alt.Chart:
    """Hypothesis 3: danceability vs popularity, colored by energy."""
    df = _placeholder_tracks()
    chart = (
        alt.Chart(df)
        .mark_circle(size=70)
        .encode(
            x=alt.X("Danceability:Q", title="Danceability"),
            y=alt.Y("Popularity:Q", title="Popularity"),
            color=alt.Color(
                "Energy:Q",
                scale=alt.Scale(range=SEQUENTIAL_BLUES),
                title="Energy",
            ),
            tooltip=["Track", "Danceability", "Popularity", "Energy"],
        )
        .interactive()
        .properties(title="Danceability vs popularity (placeholder data)", width=560, height=400)
    )
    return _themed(chart)


# ISO-3166 numeric ids used by the world-110m TopoJSON, with placeholder
# "top genre" / stream figures until the Spotify Charts rollup is ready.
_PLACEHOLDER_COUNTRIES = [
    ("United States", 840, "Hip-hop", 92),
    ("Canada", 124, "Hip-hop", 41),
    ("Mexico", 484, "Latin", 68),
    ("Brazil", 76, "Latin", 88),
    ("Argentina", 32, "Latin", 37),
    ("Colombia", 170, "Latin", 44),
    ("United Kingdom", 826, "Pop", 74),
    ("France", 250, "Hip-hop", 52),
    ("Germany", 276, "Electronic", 58),
    ("Spain", 724, "Latin", 46),
    ("Italy", 380, "Pop", 40),
    ("Sweden", 752, "Electronic", 22),
    ("Turkey", 792, "Pop", 30),
    ("Nigeria", 566, "Afrobeats", 35),
    ("South Africa", 710, "Afrobeats", 21),
    ("Egypt", 818, "Pop", 18),
    ("India", 356, "Pop", 79),
    ("Japan", 392, "Pop", 61),
    ("South Korea", 410, "K-pop", 49),
    ("Indonesia", 360, "Pop", 43),
    ("Philippines", 608, "Pop", 39),
    ("Australia", 36, "Pop", 33),
]

_GENRE_ORDER = ["Pop", "Hip-hop", "Latin", "Electronic", "K-pop", "Afrobeats"]

WORLD_110M_URL = "https://cdn.jsdelivr.net/npm/vega-datasets@2/data/world-110m.json"


def _placeholder_country_df() -> pd.DataFrame:
    return pd.DataFrame(
        _PLACEHOLDER_COUNTRIES,
        columns=["Country", "id", "Top genre", "Streams (M)"],
    )


def world_genre_map() -> alt.Chart:
    """Choropleth of each country's top genre (placeholder assignments)."""
    df = _placeholder_country_df()
    countries = alt.topo_feature(WORLD_110M_URL, "countries")
    base = (
        alt.Chart(countries)
        .mark_geoshape(stroke=SURFACE, strokeWidth=0.6, fill="#f0efec")
        .properties(width=760, height=430)
    )
    overlay = (
        alt.Chart(countries)
        .mark_geoshape(stroke=SURFACE, strokeWidth=0.6)
        .transform_lookup(
            lookup="id",
            from_=alt.LookupData(df, "id", ["Country", "Top genre", "Streams (M)"]),
        )
        .transform_filter(alt.datum["Top genre"] != None)
        .encode(
            color=alt.Color(
                "Top genre:N",
                sort=_GENRE_ORDER,
                scale=alt.Scale(domain=_GENRE_ORDER, range=CATEGORICAL[: len(_GENRE_ORDER)]),
                title="Top genre",
            ),
            tooltip=[
                alt.Tooltip("Country:N"),
                alt.Tooltip("Top genre:N"),
                alt.Tooltip("Streams (M):Q", title="Streams (millions)"),
            ],
        )
    )
    chart = (
        (base + overlay)
        .project("equalEarth")
        .properties(title="Top genre by country (placeholder data)")
    )
    return _themed(chart)


def top_genres_bar() -> alt.Chart:
    """Total placeholder streams by genre across the charted countries."""
    df = (
        _placeholder_country_df()
        .groupby("Top genre", as_index=False)["Streams (M)"]
        .sum()
        .sort_values("Streams (M)", ascending=False)
    )
    chart = (
        alt.Chart(df)
        .mark_bar(cornerRadiusTopRight=4, cornerRadiusBottomRight=4)
        .encode(
            x=alt.X("Streams (M):Q", title="Streams (millions)"),
            y=alt.Y("Top genre:N", sort="-x", title=None),
            color=alt.Color(
                "Top genre:N",
                sort=_GENRE_ORDER,
                scale=alt.Scale(domain=_GENRE_ORDER, range=CATEGORICAL[: len(_GENRE_ORDER)]),
                legend=None,
            ),
            tooltip=[alt.Tooltip("Top genre:N"), alt.Tooltip("Streams (M):Q")],
        )
        .properties(title="Genre totals across charted countries (placeholder data)", width=560, height=280)
    )
    return _themed(chart)


# Registry the Flask API uses: /api/chart/<name> -> spec JSON.
CHARTS = {
    "valence-by-tempo": valence_by_tempo,
    "danceability-histogram": danceability_histogram,
    "danceability-scatter": danceability_scatter,
    "world-genre-map": world_genre_map,
    "top-genres-bar": top_genres_bar,
}
