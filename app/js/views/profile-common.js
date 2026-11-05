/**
 * IronLog — shared chrome for the profile screens.
 *
 * The profile grew from one view into a small family: overview, statistics,
 * muscle distribution, body distribution, measures and calendar. They share a
 * range picker, a dashboard grid and a handful of small widgets, and copying
 * that markup into six files would guarantee they drift apart. Everything here
 * returns an HTML string and takes plain data, so the views stay pure.
 */

import { esc, icon } from "../ui.js";
import { RANGES, WEEKDAY_FULL, rangeLabel } from "../stats.js";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Build a route href, optionally replacing query parameters.
 *
 * The range lives in the URL rather than in component state: it survives a
 * reload, it is shareable, and switching it is a navigation the router already
 * knows how to render.
 */
export function hrefWith(route, params, patch = {}) {
  const seed = typeof params === "string" ? params : (params?.toString?.() ?? "");
  const next = new URLSearchParams(seed);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === "") next.delete(key);
    else next.set(key, String(value));
  }
  const search = next.toString();
  return `#/${route}${search ? `?${search}` : ""}`;
}

/** Up to two letters for the avatar plate. */
export function initials(name, fallback = "IL") {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return fallback;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

/** "Friday, Feb 20, 2026" — the workout-feed format. */
export function longDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${WEEKDAY_FULL[d.getDay()]}, ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "Nov 4, 2026" — for single-row lists where the weekday is just noise. */
export function mediumDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "20 Feb" — compact enough for a table row. */
export function shortDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

/**
 * The range ladder as pills. Rendered as links, not buttons: selecting a range
 * is navigation, and a link gives middle-click, copy-address and back-button
 * behaviour for free.
 */
export function rangeChips(route, active, params) {
  const chips = RANGES.map((range) => {
    const isActive = range.id === active;
    return `<a class="chip${isActive ? " is-active" : ""}" href="${esc(hrefWith(route, params, { range: range.id }))}"${isActive ? ' aria-current="true"' : ""}>${esc(range.label)}</a>`;
  }).join("");
  return `<div class="range-row"><div class="chip-row chip-scroll" role="group" aria-label="Time range">${chips}</div></div>`;
}

/** One tile of the dashboard grid: a link with an icon, a label and a detail. */
export function dashTile({ href, icon: iconName, label, detail }) {
  return `<a class="dash-tile hover-lift" href="${esc(href)}">
      <span class="dash-icon" aria-hidden="true">${icon(iconName)}</span>
      <span class="dash-copy"><strong>${esc(label)}</strong><small>${esc(detail)}</small></span>
      <span class="dash-go" aria-hidden="true">${icon("chevron")}</span>
    </a>`;
}

/**
 * A previous → current comparison cell.
 *
 * The previous figure is printed above in grey and the current one below in
 * ink, which is how Hevy reads the pair without needing a plus or minus sign
 * the user has to decode. The arrow carries the direction; colour is left off
 * deliberately, because a training volume going down is not always bad news.
 */
export function deltaCell({ label, previous, current, format = String }) {
  const prev = format(previous ?? 0);
  const now = format(current ?? 0);
  const changed = Number(current ?? 0) !== Number(previous ?? 0);
  return `<div class="delta-cell">
      <span class="delta-label">${esc(label)}</span>
      <span class="delta-prev">${esc(prev)}</span>
      <span class="delta-now${changed ? " is-changed" : ""}"><span class="delta-arrow" aria-hidden="true">→</span>${esc(now)}</span>
    </div>`;
}

/**
 * Seven-day consistency strip. A dot under a trained day is the whole point:
 * it answers "did I actually get in this week" faster than any total.
 */
export function weekStrip(days) {
  const cells = days
    .map((day) => {
      const classes = ["week-cell"];
      if (day.isToday) classes.push("is-today");
      if (day.trained) classes.push("is-trained");
      return `<li class="${classes.join(" ")}">
          <span class="week-initial" aria-hidden="true">${esc(day.weekday)}</span>
          <span class="week-day">${esc(day.day)}</span>
          <span class="week-dot" aria-hidden="true"></span>
          <span class="sr-only">${esc(day.weekdayName)} ${esc(day.day)}${day.trained ? ", trained" : ""}</span>
        </li>`;
    })
    .join("");
  return `<ol class="week-strip">${cells}</ol>`;
}

/** Front/back switch for a body map, as two links. */
export function figureSwitch(route, params, side) {
  const options = [
    { id: "front", label: "Front" },
    { id: "back", label: "Back" },
  ];
  return `<div class="seg" role="group" aria-label="Body side">${options
    .map(
      (option) =>
        `<a class="seg-btn${option.id === side ? " is-active" : ""}" href="${esc(
          hrefWith(route, params, { side: option.id }),
        )}"${option.id === side ? ' aria-current="true"' : ""}>${esc(option.label)}</a>`,
    )
    .join("")}</div>`;
}

/** Empty state for a range that contains nothing. */
export function noDataInRange(rangeId, { action = "" } = {}) {
  return `<div class="panel panel-quiet">
      <p class="panel-empty">No data in time period</p>
      <p class="panel-hint">Nothing was logged in the ${esc(rangeLabel(rangeId).toLowerCase())}. Widen the range above to see earlier training.</p>
      ${action}
    </div>`;
}

/** A titled row above a group of panels, matching the rest of the app. */
export function sectionTitle(title, note = "") {
  return `<div class="section-title-row"><h2>${esc(title)}</h2>${note ? `<span class="panel-note">${esc(note)}</span>` : ""}</div>`;
}

/** Back-to-profile link used by every screen in the family. */
export function profileBack(title, params) {
  return `<div class="profile-back-row">
      <a class="back-link" href="${esc(hrefWith("stats", params))}">${icon("back")}<span>Profile</span></a>
      <h1>${esc(title)}</h1>
    </div>`;
}
