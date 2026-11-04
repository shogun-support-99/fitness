/**
 * IronLog — shared UI helpers.
 *
 * Views return HTML strings and main.js wires behaviour through event
 * delegation on [data-action]. That keeps every view a pure function of store
 * state, which is easy to reason about and cheap to re-render.
 */

/** Escape text before it goes into innerHTML. */
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inline stroke icons — hand-drawn paths, no icon font, no external request. */
const ICONS = {
  home: "M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.7-4 3.1-6 7-6s6.3 2 7 6",
  dumbbell:
    "M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10",
  history: "M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4.5V10h5.5M12 7.5V12l3 1.8",
  stats: "M4 19V10M10 19V5M16 19v-6M22 19H2",
  library: "M4 5.5h7v13H4zM13 5.5h7v13h-7z",
  settings:
    "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm8.4-3.2 1.9-1.5-1.9-3.3-2.3.7a7.6 7.6 0 0 0-1.6-.9L14.1 4h-4l-.4 2.5c-.6.2-1.1.5-1.6.9l-2.3-.7-1.9 3.3 1.9 1.5a7.9 7.9 0 0 0 0 1.8L3.9 15l1.9 3.3 2.3-.7c.5.4 1 .7 1.6.9l.4 2.5h4l.4-2.5c.6-.2 1.1-.5 1.6-.9l2.3.7 1.9-3.3-1.9-1.5a7.9 7.9 0 0 0 0-1.8Z",
  plus: "M12 5v14M5 12h14",
  check: "M4.5 12.5 9.5 17.5 19.5 6.5",
  trash: "M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5",
  timer: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 9v4l2.5 1.5M9 2.5h6",
  flame: "M12 22c3.9 0 6.5-2.5 6.5-6 0-4.4-4.2-6-4.2-10.5C14.3 3 13 2 12 2c.8 3-1.4 4.3-2.8 6C7 10.6 5.5 13 5.5 16c0 3.5 2.6 6 6.5 6Z",
  trophy: "M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5A3.5 3.5 0 0 1 16.5 11M9.5 20h5M12 14v6",
  play: "M7 4.5 19 12 7 19.5Z",
  stop: "M6 6h12v12H6z",
  chevron: "M9 5l7 7-7 7",
  back: "M15 5l-7 7 7 7",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM16.2 16.2 21 21",
  save: "M5 4h11l3 3v13H5zM8 4v6h8V4M8 20v-6h8v6",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v6M12 7.6v.8",
  download: "M12 3v12M7 11l5 5 5-5M4 21h16",
  upload: "M12 17V5M7 9l5-5 5 5M4 21h16",
  bolt: "M13 2 4.5 13.5H11L10 22l8.5-11.5H12z",
};

export function icon(name, className = "") {
  const path = ICONS[name];
  if (!path) return "";
  return `<svg class="icon ${esc(className)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
}

export function emptyState({ icon: iconName = "info", title, body, action = "" }) {
  return `
    <div class="empty">
      <div class="empty-mark">${icon(iconName)}</div>
      <h3>${esc(title)}</h3>
      ${body ? `<p>${esc(body)}</p>` : ""}
      ${action}
    </div>`;
}

export function statTile({ label, value, unit = "", hint = "", tone = "", countTo = null }) {
  // A real count can roll like an odometer; a formatted figure (12.4k) cannot,
  // because the digits are no longer the value. `countTo` is opt-in for that
  // reason, and motion.js settles the text immediately under reduced motion.
  const canCount = countTo !== null && countTo !== undefined && Number.isFinite(Number(countTo));
  const figure = canCount
    ? `<span class="odo" data-count-to="${esc(countTo)}" data-count-decimals="0">${esc(value)}</span>`
    : esc(value);
  return `
    <div class="tile ${tone} hover-lift" data-reveal="rise">
      <span class="tile-label">${esc(label)}</span>
      <span class="tile-value">${figure}${unit ? `<em>${esc(unit)}</em>` : ""}</span>
      ${hint ? `<span class="tile-hint">${esc(hint)}</span>` : ""}
    </div>`;
}

/**
 * Simple bar chart with no charting dependency.
 *
 * The columns are HTML, not SVG: the plot stretches to the panel width, and a
 * stretched SVG turns a one-week series into a hundred-pixel slab. With layout
 * boxes the bar keeps a real pixel width while the slots stay fluid.
 */
export function barChart(points, { height = 132, ariaLabel = "chart" } = {}) {
  if (!points || points.length === 0) {
    return `<div class="chart-empty">Not enough sessions yet.</div>`;
  }
  const values = points.map((p) => Number(p.value) || 0);
  const max = Math.max(...values, 1);
  // Keep sparse histories readable: one workout week should be one bar, not a
  // full-width rectangle. Six slots leave room for the series to grow while
  // the populated group stays centred and full series remain edge to edge.
  const slots = Math.max(points.length, 6);
  const pad = slots - points.length;
  const lead = Math.floor(pad / 2);
  const trailing = pad - lead;
  // Bars stop at 86% so the value label above the tallest bar keeps a clean
  // gap under the panel rule instead of clipping against it.
  const plotHeight = 86;

  const empty = `<span class="chart-col"></span>`;
  const cols = [
    ...Array.from({ length: lead }, () => empty),
    ...points.map((p) => {
      const v = Number(p.value) || 0;
      const h = Math.max(max > 0 ? (v / max) * plotHeight : 0, 0.8);
      return `<span class="chart-col has-point" style="--bar:${h.toFixed(2)}%">
          <span class="chart-value">${esc(p.display ?? v)}</span>
          <span class="chart-bar" style="height:${h.toFixed(2)}%" title="${esc(p.label ?? "")}: ${esc(p.display ?? v)}"></span>
        </span>`;
    }),
    ...Array.from({ length: trailing }, () => empty),
  ].join("");

  return `
    <div class="chart" style="--chart-h:${height}px" role="img" aria-label="${esc(ariaLabel)}">
      <div class="chart-plot">
        <span class="chart-grid" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="chart-cols" style="grid-template-columns:repeat(${slots}, minmax(0, 1fr))">${cols}</span>
      </div>
      <div class="chart-axis${points.length === 1 ? " chart-axis-single" : ""}">
        <span>${esc(points[0].axis ?? "")}</span>
        ${points.length > 1 ? `<span>${esc(points[points.length - 1].axis ?? "")}</span>` : ""}
      </div>
    </div>`;
}

/** Horizontal muscle-group distribution bars. */
export function distributionBars(rows) {
  if (!rows || rows.length === 0) {
    return `<p class="chart-empty">No sets logged yet.</p>`;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  return `
    <ul class="dist">
      ${rows
        .map((r, i) => {
          const share = total > 0 ? Math.round((r.value / total) * 100) : 0;
          // Only the leading row carries the accent hue; ties stay neutral so
          // the list keeps one focal point instead of a wall of green.
          const lead = i === 0 ? " is-lead" : "";
          return `
        <li class="dist-row${lead}">
          <span class="dist-name"><span class="dist-dot" aria-hidden="true"></span>${esc(r.label)}</span>
          <span class="dist-track"><span class="dist-fill bar-animate" style="width:${Math.max((r.value / max) * 100, 4).toFixed(1)}%"></span></span>
          <span class="dist-value"><strong>${esc(r.display ?? r.value)}</strong><em>${share}%</em></span>
        </li>`;
        })
        .join("")}
    </ul>`;
}

export function muscleBadge(muscle) {
  return `<span class="badge badge-${esc(muscle)}">${esc(muscle)}</span>`;
}
