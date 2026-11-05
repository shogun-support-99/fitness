/**
 * IronLog — Calendar screen.
 *
 * A month of training at a glance. The grid is built from the workouts already
 * in the log — there is no separate calendar data to fall out of sync — and a
 * day is marked trained when at least one session completed on it.
 *
 * Six rows are generated and a wholly-empty trailing row is dropped, so the
 * panel never ends in a week of grey next-month dates.
 */

import {
  compactNumber,
  formatMinutes,
  monthGrid,
  rangeSummary,
  shiftMonth,
  trainedDays,
  workoutDurationMinutes,
  workoutsInRange,
  workoutVolume,
  WEEKDAY_LABELS,
} from "../stats.js";
import { esc, icon } from "../ui.js";
import { hrefWith, longDate, profileBack, sectionTitle } from "./profile-common.js";

export function renderCalendar(store, params) {
  const range = params?.get?.("range") || "";
  const today = new Date();
  const month = parseMonth(params?.get?.("m")) ?? { year: today.getFullYear(), month: today.getMonth() };
  const selected = params?.get?.("day") || null;

  const completed = store.completedWorkouts();
  const index = store.exerciseIndex();
  const units = store.settings.units;
  const activeDays = trainedDays(completed);
  const grid = monthGrid(month.year, month.month, { trainedDays: activeDays, today });

  const qs = new URLSearchParams(
    Object.entries({ range, m: monthParam(month) }).filter(([, v]) => v),
  ).toString();

  const prev = shiftMonth(month.year, month.month, -1);
  const next = shiftMonth(month.year, month.month, 1);

  const monthStart = new Date(month.year, month.month, 1);
  const monthEnd = new Date(month.year, month.month + 1, 1);
  const inMonth = workoutsInRange(completed, { start: monthStart, end: monthEnd });
  const summary = rangeSummary(inMonth);

  const selectedWorkouts = selected
    ? workoutsInRange(completed, {
        start: startOfDay(selected),
        end: endOfDay(selected),
      })
    : [];

  return `
    <section class="view view-calendar">
      ${profileBack("Calendar", qs)}

      <section class="panel" data-reveal="rise">
        <div class="week-picker">
          <a class="icon-btn" href="${esc(hrefWith("calendar", qs, { m: monthParam(prev), day: "" }))}" aria-label="Previous month">${icon("back")}</a>
          <h2>${esc(grid.label)}</h2>
          <a class="icon-btn" href="${esc(hrefWith("calendar", qs, { m: monthParam(next), day: "" }))}" aria-label="Next month">${icon("chevron")}</a>
        </div>

        <div class="month-head" aria-hidden="true">
          ${WEEKDAY_LABELS.map((d) => `<span>${esc(d)}</span>`).join("")}
        </div>
        <div class="month-grid" role="grid" aria-label="${esc(grid.label)}">
          ${grid.weeks
            .map((week) =>
              week
                .map((cell) => {
                  const classes = ["month-cell"];
                  if (!cell.inMonth) classes.push("is-outside");
                  if (cell.isToday) classes.push("is-today");
                  if (cell.trained) classes.push("is-trained");
                  if (cell.key === selected) classes.push("is-selected");
                  const label = `${longDate(cell.date)}${cell.trained ? ", trained" : ""}`;
                  return cell.trained
                    ? `<a class="${classes.join(" ")}" href="${esc(hrefWith("calendar", qs, { day: cell.key }))}" aria-label="${esc(label)}"><span>${esc(cell.day)}</span></a>`
                    : `<span class="${classes.join(" ")}" role="gridcell" aria-label="${esc(label)}"><span>${esc(cell.day)}</span></span>`;
                })
                .join(""),
            )
            .join("")}
        </div>
        <p class="panel-hint">${esc(summary.workouts)} ${summary.workouts === 1 ? "session" : "sessions"} · ${esc(formatMinutes(summary.minutes))} · ${esc(compactNumber(summary.volume))} ${esc(units)} this month</p>
      </section>

      ${
        selected
          ? `<section class="panel" data-reveal="rise">
              <div class="panel-head">
                <h2>${esc(longDate(selected))}</h2>
                <span class="panel-note">${esc(selectedWorkouts.length)} ${selectedWorkouts.length === 1 ? "session" : "sessions"}</span>
              </div>
              ${
                selectedWorkouts.length === 0
                  ? `<p class="panel-empty">Rest day.</p>`
                  : `<ul class="feed feed-compact">
                      ${selectedWorkouts
                        .map((w) => {
                          const names = (w.exercises ?? [])
                            .map((e) => index[e.exerciseId]?.name ?? "Unknown exercise")
                            .slice(0, 4);
                          return `<li class="feed-item">
                              <a class="feed-link" href="${esc(hrefWith("history", "", { id: w.id }))}">
                                <span class="feed-copy">
                                  <span class="feed-title">${esc(w.name || "Workout")}</span>
                                  <span class="feed-stats">${esc(formatMinutes(workoutDurationMinutes(w)))} · ${esc(compactNumber(workoutVolume(w)))} ${esc(units)}</span>
                                  <span class="feed-exercises">${esc(names.join(", "))}</span>
                                </span>
                              </a>
                            </li>`;
                        })
                        .join("")}
                    </ul>`
              }
            </section>`
          : sectionTitle("Pick a day", "marked days have a session")
      }
    </section>`;
}

function monthParam({ year, month }) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function parseMonth(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return null;
  return { year: Number(match[1]), month };
}

function startOfDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function endOfDay(key) {
  const date = startOfDay(key);
  date.setDate(date.getDate() + 1);
  return date;
}
