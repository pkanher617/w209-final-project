/* Shared D3 chart components, all drawn against the dark-theme tokens.
   Mark green #1aad4e and the sequential ramp below were checked with the
   dataviz palette validator against the #181818 card surface. */

/* global d3 */

export const COLORS = {
  series: "#1aad4e",       // validated mark green
  seriesLift: "#25c05b",   // hover lift
  context: "#898781",      // de-emphasis series (library average)
  surface: "#181818",
  grid: "#2c2c2a",
  axis: "#3a3a37",
  muted: "#8a8a85",
  text: "#ffffff",
  textSecondary: "#b3b3b3",
};

// Sequential green ramp (dark mode: near-zero recedes toward the surface).
export const GREEN_RAMP = ["#12291c", "#0e4429", "#00602d", "#149244", "#25c05b", "#3be477"];

const AXIS_FONT = "11px system-ui, -apple-system, 'Segoe UI', sans-serif";

// ── tooltip (one per page, DOM built with textContent — labels are data) ────

const tip = (() => {
  let el = null;
  function ensure() {
    if (!el) {
      el = document.createElement("div");
      el.id = "viz-tooltip";
      el.hidden = true;
      document.body.appendChild(el);
    }
    return el;
  }
  function show(evt, { title, rows = [] }) {
    const t = ensure();
    t.replaceChildren();
    if (title) {
      const d = document.createElement("div");
      d.className = "tip-title";
      d.textContent = title;
      t.appendChild(d);
    }
    for (const r of rows) {
      const row = document.createElement("div");
      row.className = "tip-row";
      if (r.color) {
        const key = document.createElement("span");
        key.className = "key";
        key.style.borderTopColor = r.color;
        row.appendChild(key);
      }
      const label = document.createElement("span");
      label.textContent = r.label;
      row.appendChild(label);
      const val = document.createElement("span");
      val.className = "val";
      val.textContent = r.value;
      row.appendChild(val);
      t.appendChild(row);
    }
    t.hidden = false;
    move(evt);
  }
  function move(evt) {
    if (!el || el.hidden) return;
    const pad = 14;
    const { innerWidth: vw, innerHeight: vh } = window;
    const rect = el.getBoundingClientRect();
    let x = evt.clientX + pad;
    let y = evt.clientY + pad;
    if (x + rect.width > vw - 8) x = evt.clientX - rect.width - pad;
    if (y + rect.height > vh - 8) y = evt.clientY - rect.height - pad;
    el.style.left = `${Math.max(8, x)}px`;
    el.style.top = `${Math.max(8, y)}px`;
  }
  function hide() { if (el) el.hidden = true; }
  return { show, move, hide };
})();

export { tip };

// ── small shared helpers ─────────────────────────────────────────────────────

function baseSvg(el, width, height) {
  el.replaceChildren();
  return d3.select(el).append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);
}

function chartWidth(el, fallback = 600) {
  return el.clientWidth || fallback;
}

function yGrid(svg, y, x0, x1) {
  const g = svg.append("g");
  g.selectAll("line")
    .data(y.ticks(4))
    .join("line")
    .attr("x1", x0).attr("x2", x1)
    .attr("y1", (d) => y(d)).attr("y2", (d) => y(d))
    .attr("stroke", COLORS.grid);
  return g;
}

function yTicks(svg, y, x0, fmt = d3.format("~s")) {
  svg.append("g")
    .selectAll("text")
    .data(y.ticks(4))
    .join("text")
    .attr("x", x0 - 8).attr("y", (d) => y(d))
    .attr("dy", "0.32em")
    .attr("text-anchor", "end")
    .attr("fill", COLORS.muted)
    .style("font", AXIS_FONT)
    .text(fmt);
}

// Rounded top, square base — the data-end treatment for columns.
function roundedColumnPath(x, yTop, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${yTop + h}
          L${x},${yTop + rr}
          Q${x},${yTop} ${x + rr},${yTop}
          L${x + w - rr},${yTop}
          Q${x + w},${yTop} ${x + w},${yTop + rr}
          L${x + w},${yTop + h}Z`;
}

// Legend as HTML under the chart. items: {label, color, mark: "line"|"rect"}
export function renderLegend(el, items) {
  const legend = document.createElement("div");
  legend.className = "legend";
  for (const it of items) {
    const key = document.createElement("span");
    key.className = "key";
    const swatch = document.createElement("span");
    swatch.className = it.mark === "rect" ? "swatch-rect" : "swatch-line";
    if (it.mark === "rect") swatch.style.background = it.color;
    else swatch.style.borderTopColor = it.color;
    key.appendChild(swatch);
    key.appendChild(document.createTextNode(it.label));
    legend.appendChild(key);
  }
  el.appendChild(legend);
  return legend;
}

// The accessibility twin: a collapsed table with the chart's data.
export function renderDataTable(slot, columns, rows, summary = "Data table") {
  if (!slot) return;
  slot.replaceChildren();
  const details = document.createElement("details");
  details.className = "data-table";
  const sum = document.createElement("summary");
  sum.textContent = summary;
  details.appendChild(sum);
  const scroll = document.createElement("div");
  scroll.className = "scroll";
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  for (const c of columns) {
    const th = document.createElement("th");
    th.textContent = c;
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const cell of row) {
      const td = document.createElement("td");
      td.textContent = String(cell);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  scroll.appendChild(table);
  details.appendChild(scroll);
  slot.appendChild(details);
}

// ── column chart (band x): hours by year, discrete-feature histograms ───────

export function columnChart(el, data, {
  height = 300,
  valueFmt = (v) => d3.format(",.1f")(v),
  ariaName = (d) => `${d.label}: ${valueFmt(d.value)}`,
} = {}) {
  const width = chartWidth(el);
  const m = { top: 22, right: 8, bottom: 28, left: 46 };
  const svg = baseSvg(el, width, height);

  const x = d3.scaleBand()
    .domain(data.map((d) => d.label))
    .range([m.left, width - m.right])
    .paddingInner(0.25).paddingOuter(0.1);
  const y = d3.scaleLinear()
    .domain([0, (d3.max(data, (d) => d.value) || 1) * 1.06])
    .range([height - m.bottom, m.top]);

  yGrid(svg, y, m.left, width - m.right);
  yTicks(svg, y, m.left);

  // baseline
  svg.append("line")
    .attr("x1", m.left).attr("x2", width - m.right)
    .attr("y1", y(0)).attr("y2", y(0))
    .attr("stroke", COLORS.axis);

  const barW = Math.min(x.bandwidth(), 24);
  const bars = svg.append("g")
    .selectAll("path")
    .data(data)
    .join("path")
    .attr("d", (d) => roundedColumnPath(
      x(d.label) + (x.bandwidth() - barW) / 2, y(d.value), barW,
      Math.max(0, y(0) - y(d.value)), 4))
    .attr("fill", COLORS.series);

  // x tick labels — thin out when crowded
  const every = Math.ceil(data.length / Math.floor((width - m.left - m.right) / 42));
  svg.append("g")
    .selectAll("text")
    .data(data.filter((_, i) => i % Math.max(1, every) === 0))
    .join("text")
    .attr("x", (d) => x(d.label) + x.bandwidth() / 2)
    .attr("y", height - m.bottom + 16)
    .attr("text-anchor", "middle")
    .attr("fill", COLORS.muted)
    .style("font", AXIS_FONT)
    .text((d) => d.label);

  // selective direct label: the extreme only
  const maxD = data.reduce((a, b) => (b.value > a.value ? b : a), data[0]);
  if (maxD && maxD.value > 0) {
    svg.append("text")
      .attr("x", x(maxD.label) + x.bandwidth() / 2)
      .attr("y", y(maxD.value) - 6)
      .attr("text-anchor", "middle")
      .attr("fill", COLORS.textSecondary)
      .style("font", AXIS_FONT)
      .text(valueFmt(maxD.value));
  }

  // hover/focus: whole band is the hit target
  svg.append("g")
    .selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", (d) => x(d.label))
    .attr("y", m.top)
    .attr("width", x.bandwidth())
    .attr("height", height - m.top - m.bottom)
    .attr("fill", "transparent")
    .attr("tabindex", 0)
    .attr("role", "img")
    .attr("aria-label", ariaName)
    .style("cursor", "default")
    .on("pointerenter focus", function (evt, d) {
      bars.filter((b) => b === d).attr("fill", COLORS.seriesLift);
      const e = evt.clientX != null ? evt : fakeEventFor(this);
      tip.show(e, { title: String(d.label), rows: [{ label: "", value: valueFmt(d.value), color: COLORS.series }] });
    })
    .on("pointermove", (evt) => tip.move(evt))
    .on("pointerleave blur", (evt, d) => {
      bars.filter((b) => b === d).attr("fill", COLORS.series);
      tip.hide();
    });
}

// Keyboard focus has no pointer position; anchor the tooltip to the mark.
function fakeEventFor(node) {
  const r = node.getBoundingClientRect();
  return { clientX: r.x + r.width / 2, clientY: r.y };
}

// ── histogram (continuous x) ─────────────────────────────────────────────────

export function histogramChart(el, values, {
  height = 320,
  bins = 24,
  xFmt = d3.format("~g"),
  unitLabel = "songs",
} = {}) {
  const width = chartWidth(el);
  const m = { top: 22, right: 14, bottom: 30, left: 46 };
  const svg = baseSvg(el, width, height);

  const [lo, hi] = d3.extent(values);
  const x = d3.scaleLinear().domain([lo, hi]).nice().range([m.left, width - m.right]);
  const binned = d3.bin().domain(x.domain()).thresholds(bins)(values);
  const y = d3.scaleLinear()
    .domain([0, (d3.max(binned, (b) => b.length) || 1) * 1.06])
    .range([height - m.bottom, m.top]);

  yGrid(svg, y, m.left, width - m.right);
  yTicks(svg, y, m.left, d3.format("~d"));

  svg.append("line")
    .attr("x1", m.left).attr("x2", width - m.right)
    .attr("y1", y(0)).attr("y2", y(0))
    .attr("stroke", COLORS.axis);

  const bars = svg.append("g")
    .selectAll("path")
    .data(binned.filter((b) => b.length > 0))
    .join("path")
    .attr("d", (b) => {
      const bx = x(b.x0) + 1;                            // 2px surface gap
      const bw = Math.max(1, x(b.x1) - x(b.x0) - 2);
      return roundedColumnPath(bx, y(b.length), bw, Math.max(0, y(0) - y(b.length)), 4);
    })
    .attr("fill", COLORS.series);

  // x axis ticks
  svg.append("g")
    .selectAll("text")
    .data(x.ticks(Math.min(10, Math.floor(width / 70))))
    .join("text")
    .attr("x", (d) => x(d))
    .attr("y", height - m.bottom + 16)
    .attr("text-anchor", "middle")
    .attr("fill", COLORS.muted)
    .style("font", AXIS_FONT)
    .text(xFmt);

  // hit targets per bin
  svg.append("g")
    .selectAll("rect")
    .data(binned)
    .join("rect")
    .attr("x", (b) => x(b.x0))
    .attr("y", m.top)
    .attr("width", (b) => Math.max(1, x(b.x1) - x(b.x0)))
    .attr("height", height - m.top - m.bottom)
    .attr("fill", "transparent")
    .attr("tabindex", (b) => (b.length ? 0 : null))
    .attr("role", "img")
    .attr("aria-label", (b) => `${xFmt(b.x0)} to ${xFmt(b.x1)}: ${b.length} ${unitLabel}`)
    .on("pointerenter focus", function (evt, b) {
      bars.filter((d) => d === b).attr("fill", COLORS.seriesLift);
      const e = evt.clientX != null ? evt : fakeEventFor(this);
      tip.show(e, {
        title: `${xFmt(b.x0)} – ${xFmt(b.x1)}`,
        rows: [{ label: unitLabel, value: String(b.length), color: COLORS.series }],
      });
    })
    .on("pointermove", (evt) => tip.move(evt))
    .on("pointerleave blur", (evt, b) => {
      bars.filter((d) => d === b).attr("fill", COLORS.series);
      tip.hide();
    });

  return binned;
}

// ── line + area (hours by month) ─────────────────────────────────────────────

export function lineAreaChart(el, points, {
  height = 300,
  valueFmt = (v) => d3.format(",.1f")(v),
  valueLabel = "hours",
  timeFmt = d3.timeFormat("%b %Y"),
} = {}) {
  const width = chartWidth(el);
  const m = { top: 20, right: 14, bottom: 28, left: 46 };
  const svg = baseSvg(el, width, height);

  const x = d3.scaleTime()
    .domain(d3.extent(points, (d) => d.date))
    .range([m.left, width - m.right]);
  const y = d3.scaleLinear()
    .domain([0, (d3.max(points, (d) => d.value) || 1) * 1.08])
    .range([height - m.bottom, m.top]);

  yGrid(svg, y, m.left, width - m.right);
  yTicks(svg, y, m.left);

  svg.append("line")
    .attr("x1", m.left).attr("x2", width - m.right)
    .attr("y1", y(0)).attr("y2", y(0))
    .attr("stroke", COLORS.axis);

  svg.append("g")
    .selectAll("text")
    .data(x.ticks(Math.min(8, Math.floor(width / 90))))
    .join("text")
    .attr("x", (d) => x(d))
    .attr("y", height - m.bottom + 16)
    .attr("text-anchor", "middle")
    .attr("fill", COLORS.muted)
    .style("font", AXIS_FONT)
    .text(d3.timeFormat("%Y"));

  svg.append("path")
    .datum(points)
    .attr("fill", COLORS.series)
    .attr("fill-opacity", 0.1)
    .attr("d", d3.area().x((d) => x(d.date)).y0(y(0)).y1((d) => y(d.value)));

  svg.append("path")
    .datum(points)
    .attr("fill", "none")
    .attr("stroke", COLORS.series)
    .attr("stroke-width", 2)
    .attr("stroke-linejoin", "round")
    .attr("stroke-linecap", "round")
    .attr("d", d3.line().x((d) => x(d.date)).y((d) => y(d.value)));

  // selective direct label: the peak month
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a), points[0]);
  if (peak) {
    svg.append("text")
      .attr("x", Math.min(Math.max(x(peak.date), m.left + 30), width - m.right - 30))
      .attr("y", y(peak.value) - 8)
      .attr("text-anchor", "middle")
      .attr("fill", COLORS.textSecondary)
      .style("font", AXIS_FONT)
      .text(`${timeFmt(peak.date)} · ${valueFmt(peak.value)}`);
  }

  // crosshair + snapped tooltip
  const cross = svg.append("line")
    .attr("y1", m.top).attr("y2", height - m.bottom)
    .attr("stroke", COLORS.axis)
    .attr("visibility", "hidden");
  const dot = svg.append("circle")
    .attr("r", 4)
    .attr("fill", COLORS.series)
    .attr("stroke", COLORS.surface)
    .attr("stroke-width", 2)
    .attr("visibility", "hidden");

  const bisect = d3.bisector((d) => d.date).center;
  svg.append("rect")
    .attr("x", m.left).attr("y", m.top)
    .attr("width", width - m.left - m.right)
    .attr("height", height - m.top - m.bottom)
    .attr("fill", "transparent")
    .on("pointermove", (evt) => {
      const [mx] = d3.pointer(evt);
      const d = points[bisect(points, x.invert(mx))];
      if (!d) return;
      cross.attr("x1", x(d.date)).attr("x2", x(d.date)).attr("visibility", "visible");
      dot.attr("cx", x(d.date)).attr("cy", y(d.value)).attr("visibility", "visible");
      tip.show(evt, {
        title: timeFmt(d.date),
        rows: [{ label: valueLabel, value: valueFmt(d.value), color: COLORS.series }],
      });
    })
    .on("pointerleave", () => {
      cross.attr("visibility", "hidden");
      dot.attr("visibility", "hidden");
      tip.hide();
    });
}

// ── heatmap (day of week × hour of day) ─────────────────────────────────────

export function heatmapChart(el, cells, {
  dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  valueFmt = (v) => `${d3.format(",.1f")(v)} h`,
} = {}) {
  const width = chartWidth(el);
  const m = { top: 8, right: 8, bottom: 46, left: 78 };
  const cellW = Math.max(10, (width - m.left - m.right) / 24);
  const cellH = Math.min(26, Math.max(14, cellW * 0.9));
  const height = m.top + cellH * 7 + m.bottom;
  const svg = baseSvg(el, width, height);

  const max = d3.max(cells, (c) => c.value) || 1;
  const color = d3.scaleSequential(d3.piecewise(d3.interpolateRgb, GREEN_RAMP)).domain([0, max]);

  svg.append("g")
    .selectAll("rect")
    .data(cells)
    .join("rect")
    .attr("x", (c) => m.left + c.hour * cellW + 1)     // 2px surface gap
    .attr("y", (c) => m.top + c.day * cellH + 1)
    .attr("width", cellW - 2)
    .attr("height", cellH - 2)
    .attr("rx", 2)
    .attr("fill", (c) => color(c.value))
    .on("pointerenter", (evt, c) => {
      tip.show(evt, {
        title: `${dayNames[c.day]} · ${String(c.hour).padStart(2, "0")}:00–${String((c.hour + 1) % 24).padStart(2, "0")}:00`,
        rows: [{ label: "streamed", value: valueFmt(c.value), color: COLORS.series }],
      });
    })
    .on("pointermove", (evt) => tip.move(evt))
    .on("pointerleave", () => tip.hide());

  svg.append("g")
    .selectAll("text")
    .data(dayNames)
    .join("text")
    .attr("x", m.left - 8)
    .attr("y", (_, i) => m.top + i * cellH + cellH / 2)
    .attr("dy", "0.32em")
    .attr("text-anchor", "end")
    .attr("fill", COLORS.muted)
    .style("font", AXIS_FONT)
    .text((d) => d.slice(0, 3));

  svg.append("g")
    .selectAll("text")
    .data(d3.range(0, 24, 3))
    .join("text")
    .attr("x", (h) => m.left + h * cellW + cellW / 2)
    .attr("y", m.top + 7 * cellH + 14)
    .attr("text-anchor", "middle")
    .attr("fill", COLORS.muted)
    .style("font", AXIS_FONT)
    .text((h) => `${h}:00`);

  // gradient legend
  const gradId = `heat-grad-${Math.random().toString(36).slice(2, 8)}`;
  const grad = svg.append("defs").append("linearGradient").attr("id", gradId);
  GREEN_RAMP.forEach((c, i) => {
    grad.append("stop").attr("offset", `${(i / (GREEN_RAMP.length - 1)) * 100}%`).attr("stop-color", c);
  });
  const legendW = Math.min(180, width / 3);
  const ly = m.top + 7 * cellH + 26;
  svg.append("rect")
    .attr("x", m.left).attr("y", ly)
    .attr("width", legendW).attr("height", 8)
    .attr("rx", 4)
    .attr("fill", `url(#${gradId})`);
  svg.append("text")
    .attr("x", m.left + legendW + 8).attr("y", ly + 8)
    .attr("fill", COLORS.muted).style("font", AXIS_FONT)
    .text(`0 → ${valueFmt(max)}`);
}

// ── radar / spider chart ─────────────────────────────────────────────────────
// axes: [{label, norm 0–1, rawText, avgNorm, avgRawText}]

export function radarChart(el, axes, {
  size = 460,
  songLabel = "This song",
  avgLabel = "Library average",
} = {}) {
  const width = Math.min(chartWidth(el, size), 560);
  const height = Math.min(width, size);
  const cx = width / 2;
  const cy = height / 2;
  const labelPad = 54;
  const R = Math.min(width, height) / 2 - labelPad;
  const svg = baseSvg(el, width, height);

  const n = axes.length;
  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i, r) => [cx + Math.cos(angle(i)) * r * R, cy + Math.sin(angle(i)) * r * R];

  // rings + spokes (hairline, recessive)
  for (const r of [0.25, 0.5, 0.75, 1]) {
    svg.append("circle")
      .attr("cx", cx).attr("cy", cy).attr("r", r * R)
      .attr("fill", "none").attr("stroke", COLORS.grid);
  }
  for (let i = 0; i < n; i++) {
    const [x2, y2] = pt(i, 1);
    svg.append("line")
      .attr("x1", cx).attr("y1", cy).attr("x2", x2).attr("y2", y2)
      .attr("stroke", COLORS.grid);
  }

  // axis labels
  for (let i = 0; i < n; i++) {
    const a = angle(i);
    const [lx, ly] = [cx + Math.cos(a) * (R + 12), cy + Math.sin(a) * (R + 12)];
    const cos = Math.cos(a);
    svg.append("text")
      .attr("x", lx).attr("y", ly)
      .attr("dy", "0.32em")
      .attr("text-anchor", cos > 0.35 ? "start" : cos < -0.35 ? "end" : "middle")
      .attr("fill", COLORS.textSecondary)
      .style("font", AXIS_FONT)
      .text(axes[i].label);
  }

  const polygon = (get) => axes.map((ax, i) => pt(i, Math.max(0, get(ax) ?? 0))).map((p) => p.join(",")).join(" ");

  // library average — context series, drawn first so the song sits on top
  if (axes.some((ax) => ax.avgNorm != null)) {
    svg.append("polygon")
      .attr("points", polygon((ax) => ax.avgNorm))
      .attr("fill", COLORS.context).attr("fill-opacity", 0.08)
      .attr("stroke", COLORS.context).attr("stroke-width", 2)
      .attr("stroke-linejoin", "round");
  }

  svg.append("polygon")
    .attr("points", polygon((ax) => ax.norm))
    .attr("fill", COLORS.series).attr("fill-opacity", 0.12)
    .attr("stroke", COLORS.series).attr("stroke-width", 2)
    .attr("stroke-linejoin", "round");

  const dots = svg.append("g")
    .selectAll("circle")
    .data(axes)
    .join("circle")
    .attr("cx", (ax, i) => pt(i, Math.max(0, ax.norm ?? 0))[0])
    .attr("cy", (ax, i) => pt(i, Math.max(0, ax.norm ?? 0))[1])
    .attr("r", 3.5)
    .attr("fill", COLORS.series)
    .attr("stroke", COLORS.surface)
    .attr("stroke-width", 2);

  // hover: nearest axis by angle, generous target (the whole disc)
  svg.append("circle")
    .attr("cx", cx).attr("cy", cy).attr("r", R + labelPad / 2)
    .attr("fill", "transparent")
    .on("pointermove", (evt) => {
      const [mx, my] = d3.pointer(evt);
      let a = Math.atan2(my - cy, mx - cx) + Math.PI / 2;
      if (a < 0) a += Math.PI * 2;
      const i = Math.round((a / (Math.PI * 2)) * n) % n;
      const ax = axes[i];
      dots.attr("r", (d) => (d === ax ? 5.5 : 3.5));
      const rows = [{ label: songLabel, value: ax.rawText, color: COLORS.series }];
      if (ax.avgRawText != null) rows.push({ label: avgLabel, value: ax.avgRawText, color: COLORS.context });
      tip.show(evt, { title: ax.label, rows });
    })
    .on("pointerleave", () => {
      dots.attr("r", 3.5);
      tip.hide();
    });

  renderLegend(el, [
    { label: songLabel, color: COLORS.series, mark: "line" },
    { label: avgLabel, color: COLORS.context, mark: "line" },
  ]);
}

// ── genre bubble chart (d3.pack) ─────────────────────────────────────────────
// items: [{name, count, meanPop}]

export function bubbleChart(el, items, {
  height = 480,
  selected = null,
  onSelect = () => {},
} = {}) {
  const width = chartWidth(el);
  const svg = baseSvg(el, width, height);

  const root = d3.hierarchy({ children: items }).sum((d) => d.count);
  d3.pack().size([width, height]).padding(4)(root);

  const node = svg.append("g")
    .selectAll("g")
    .data(root.leaves())
    .join("g")
    .attr("transform", (d) => `translate(${d.x},${d.y})`)
    .style("cursor", "pointer")
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", (d) => `${d.data.name}: ${d.data.count} songs`);

  const isSel = (d) => d.data.name === selected;

  const circles = node.append("circle")
    .attr("r", (d) => d.r)
    .attr("fill", COLORS.series)
    .attr("fill-opacity", (d) => (isSel(d) ? 0.34 : 0.16))
    .attr("stroke", (d) => (isSel(d) ? "#3be477" : COLORS.series))
    .attr("stroke-width", (d) => (isSel(d) ? 2.5 : 1.25));

  // labels only where they fit comfortably inside the bubble
  node.each(function (d) {
    const g = d3.select(this);
    const name = d.data.name;
    const approx = name.length * 6.4;
    if (approx < d.r * 1.8) {
      g.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", d.r > 30 ? "-0.15em" : "0.32em")
        .attr("fill", COLORS.text)
        .style("font", d.r > 46 ? "12.5px system-ui, sans-serif" : AXIS_FONT)
        .style("pointer-events", "none")
        .text(name);
      if (d.r > 30) {
        g.append("text")
          .attr("text-anchor", "middle")
          .attr("dy", "1.05em")
          .attr("fill", COLORS.textSecondary)
          .style("font", AXIS_FONT)
          .style("pointer-events", "none")
          .text(d3.format(",")(d.data.count));
      }
    }
  });

  node
    .on("pointerenter focus", function (evt, d) {
      circles.filter((c) => c === d).attr("fill-opacity", isSel(d) ? 0.34 : 0.28);
      const e = evt.clientX != null ? evt : fakeEventFor(this);
      tip.show(e, {
        title: d.data.name,
        rows: [
          { label: "songs", value: d3.format(",")(d.data.count), color: COLORS.series },
          { label: "avg popularity", value: d3.format(".0f")(d.data.meanPop), color: COLORS.series },
        ],
      });
    })
    .on("pointermove", (evt) => tip.move(evt))
    .on("pointerleave blur", (evt, d) => {
      circles.filter((c) => c === d).attr("fill-opacity", isSel(d) ? 0.34 : 0.16);
      tip.hide();
    })
    .on("click", (evt, d) => onSelect(d.data.name))
    .on("keydown", (evt, d) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        onSelect(d.data.name);
      }
    });
}

// ── HTML bar list (top-10 rows: name + track bar + value) ───────────────────

export function barList(el, rows, {
  valueFmt = (v) => d3.format(",")(v),
  onClick = null,
} = {}) {
  el.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "bar-list";
  const max = Math.max(...rows.map((r) => r.value), 1);
  rows.forEach((r) => {
    const row = document.createElement(onClick ? "button" : "div");
    row.className = "bar-row";
    if (onClick) {
      row.type = "button";
      row.style.cssText = "background:none;border:none;padding:0;width:100%;cursor:pointer;font:inherit;text-align:left;";
      row.addEventListener("click", () => onClick(r));
    }
    const head = document.createElement("div");
    head.className = "bar-head";
    const name = document.createElement("span");
    name.className = "bar-name";
    name.textContent = r.name;
    name.title = r.title ?? r.name;
    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = valueFmt(r.value);
    head.appendChild(name);
    head.appendChild(value);
    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${(r.value / max) * 100}%`;
    track.appendChild(fill);
    row.appendChild(head);
    row.appendChild(track);
    wrap.appendChild(row);
  });
  el.appendChild(wrap);
}
