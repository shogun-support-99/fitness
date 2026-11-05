/**
 * IronLog — Training-year heatmap.
 *
 * A GitHub-style contribution calendar, rebuilt dependency-free for the app.
 * One square per day, Monday-first, with four tints for daily volume. The
 * grid is a single `role="img"` for assistive tech; pointer users get a
 * lightweight tooltip from the delegated handler in motion.js.
 *
 * The design direction comes from the "Activity Heatmap" component by
 * kuratlielia on 21st.dev. No React, tooltip library or animation package is
 * carried over: the markup, CSS and motion here are original to IronLog.
 */

import { activityLevels, compactNumber, trainingYear } from "../stats.js";
import { esc } from "../ui.js";

const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", ""];

/**
 * @param {object[]} workouts completed workouts (the view passes the same list
 *   it already has, so Home does not read storage twice)
 * @param {string} units "kg" or "lb"
 */
export function renderTrainingYear(workouts, units) {
  const year = trainingYear(workouts);
  const levels = activityLevels(year);
  const totals = year.totals;
  const sessions = totals.sessions;
  const plural = (value, one, many) =>
    `${value} ${value === 1 ? one : many}`;

  const volumePart =
    totals.volume > 0 ? ` · ${compactNumber(totals.volume)} ${units} lifted` : "";
  const summary =
    sessions === 0
      ? "No sessions yet — your first workout starts the grid."
      : `${plural(sessions, "session", "sessions")}${sessions === totals.activeDays ? "" : ` across ${plural(totals.activeDays, "active day", "active days")}`}${volumePart}`;
  const label =
    sessions === 0
      ? "Training year heatmap. No sessions logged in the last 12 months."
      : `Training year heatmap. ${plural(sessions, "session", "sessions")} across ${plural(totals.activeDays, "active day", "active days")} in the last 12 months.`;

  return `
    <section class="panel training-year" data-reveal="rise" aria-labelledby="training-year-title">
      <div class="panel-head training-year-head">
        <div>
          <h2 id="training-year-title">Training year</h2>
          <p class="training-year-summary">${esc(summary)}</p>
        </div>
        <span class="panel-note">Last 12 months</span>
      </div>
      <div class="heatmap" data-heatmap>
        ${renderPlot(year, levels, units, label)}
        <div class="heatmap-foot">
          <span>${sessions === 0 ? "A square appears the day you finish a session." : "Darker squares are heavier training days."}</span>
          ${renderLegend()}
        </div>
        <div class="heatmap-tip" data-heatmap-tip hidden></div>
      </div>
    </section>`;
}

function renderPlot(year, levels, units, label) {
  const weeks = year.weeks
    .map((week, col) => {
      const cells = week
        .map((day, row) => {
          if (!day) {
            return `<span class="heatmap-cell is-empty" style="--row:${row}" aria-hidden="true"></span>`;
          }
          const level = levels.get(day.date) ?? 0;
          const tip = dayTip(day, units);
          return `<span class="heatmap-cell" data-level="${level}" style="--row:${row}" data-tip="${esc(tip)}" title="${esc(tip)}" aria-hidden="true"></span>`;
        })
        .join("");
      return `<div class="heatmap-week" style="--col:${col}">${cells}</div>`;
    })
    .join("");

  const months = year.months
    .map(
      (month) =>
        `<span class="heatmap-month" style="grid-column:${month.col + 1}">${esc(month.label)}</span>`,
    )
    .join("");

  return `
    <div class="heatmap-plot">
      <div class="heatmap-weekdays" aria-hidden="true">
        ${WEEKDAYS.map((day) => `<span>${day}</span>`).join("")}
      </div>
      <div class="heatmap-scroll" data-heatmap-scroll>
        <div class="heatmap-months" aria-hidden="true" style="--weeks:${year.weeks.length}">${months}</div>
        <div class="heatmap-grid" role="img" aria-label="${esc(label)}" style="--weeks:${year.weeks.length}">${weeks}</div>
      </div>
    </div>`;
}

function dayTip(day, units) {
  const date = new Date(`${day.date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  if (!day.sessions) return `${date} · rest day`;

  const parts = [
    `${day.sessions} session${day.sessions === 1 ? "" : "s"}`,
  ];
  if (day.volume > 0) parts.push(`${compactNumber(day.volume)} ${units}`);
  if (day.sets > 0) parts.push(`${day.sets} set${day.sets === 1 ? "" : "s"}`);
  return `${date} · ${parts.join(" · ")}`;
}

function renderLegend() {
  return `<span class="heatmap-legend" aria-hidden="true">
    Less
    <span class="heatmap-keys">${[0, 1, 2, 3, 4]
      .map((level) => `<i class="heatmap-key" data-level="${level}"></i>`)
      .join("")}</span>
    More
  </span>`;
}
