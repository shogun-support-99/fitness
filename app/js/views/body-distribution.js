/**
 * IronLog — Body distribution screen.
 *
 * The same question as muscle distribution, asked at a different resolution:
 * not "how did this month split" but "what did I actually hit on Tuesday".
 * A Sunday-first week picker, a day strip, a body map heat-mapped to that day,
 * and a muscle table underneath for the people who would rather read numbers.
 *
 * The week is the anchor and the day is the selection, both in the URL. Moving
 * a week keeps the weekday you were on, which is what makes stepping back
 * through a training block feel like flipping through it.
 */

import { bodyMap, platesFromTargetCounts, targetLabel } from "../body.js";
import {
  calendarWeek,
  dateKey,
  rangeLabel,
  shiftWeek,
  targetSetCounts,
  trainedDays,
  workoutsInRange,
} from "../stats.js";
import { esc, icon } from "../ui.js";
import {
  figureSwitch,
  hrefWith,
  profileBack,
  sectionTitle,
} from "./profile-common.js";

export function renderBodyDistribution(store, params) {
  const range = params?.get?.("range") || "";
  const side = params?.get?.("side") === "back" ? "back" : "front";
  const anchor = parseDate(params?.get?.("week")) ?? new Date();
  const completed = store.completedWorkouts();
  const index = store.exerciseIndex();
  const activeDays = trainedDays(completed);

  const selected = parseDate(params?.get?.("day")) ?? anchor;
  const week = calendarWeek(anchor, { selected, trainedDays: activeDays });

  const dayStart = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const dayWorkouts = workoutsInRange(completed, { start: dayStart, end: dayEnd });
  const counts = targetSetCounts(dayWorkouts, index);

  const base = { range, side, week: dateKey(anchor) };
  const qs = new URLSearchParams(
    Object.entries({ ...base, day: dateKey(selected) }).filter(([, v]) => v),
  ).toString();

  // Stepping forward stops at the week you are in. There are no sets in a week
  // that has not happened, so letting the picker run into the future only
  // offers the user an endless scroll of empty body maps.
  const nextWeekStart = calendarWeek(shiftWeek(anchor, 1)).start;
  const canGoForward = nextWeekStart <= new Date();

  return `
    <section class="view view-body-distribution">
      ${profileBack("Body distribution", qs)}

      <section class="panel panel-week" data-reveal="rise">
        <div class="week-picker">
          <a class="icon-btn" href="${esc(hrefWith("body-distribution", qs, { week: dateKey(shiftWeek(anchor, -1)), day: "" }))}" aria-label="Previous week">${icon("back")}</a>
          <h2>${esc(week.label)}</h2>
          ${
            canGoForward
              ? `<a class="icon-btn" href="${esc(hrefWith("body-distribution", qs, { week: dateKey(shiftWeek(anchor, 1)), day: "" }))}" aria-label="Next week">${icon("chevron")}</a>`
              : `<button class="icon-btn" type="button" disabled aria-label="Next week">${icon("chevron")}</button>`
          }
        </div>
        <ol class="day-strip">
          ${week.days
            .map(
              (day) => `<li>
                <a class="day-cell${day.isSelected ? " is-selected" : ""}${day.isToday ? " is-today" : ""}${day.trained ? " is-trained" : ""}" href="${esc(
                  hrefWith("body-distribution", qs, { day: day.key }),
                )}"${day.isSelected ? ' aria-current="date"' : ""}>
                  <span class="day-initial" aria-hidden="true">${esc(day.weekday)}</span>
                  <span class="day-number">${esc(day.day)}</span>
                  <span class="day-dot" aria-hidden="true"></span>
                  <span class="sr-only">${esc(day.weekdayName)} ${esc(day.day)}${day.trained ? ", trained" : ""}</span>
                </a>
              </li>`,
            )
            .join("")}
        </ol>
      </section>

      <section class="panel panel-figure" data-reveal="rise">
        <div class="panel-head">
          <h2>Muscle map</h2>
          <span class="panel-note">${esc(week.days.find((d) => d.isSelected)?.weekdayName ?? "")}</span>
        </div>
        ${figureSwitch("body-distribution", qs, side)}
        <div class="figure-wrap">
          ${bodyMap({
            view: side,
            setsByPlate: platesFromTargetCounts(counts),
            summary: `Muscles trained on the selected day, ${side} view`,
          })}
        </div>
      </section>

      ${sectionTitle("Muscles", range ? rangeLabel(range) : "selected day")}
      <table class="muscle-table">
        <caption class="sr-only">Sets per muscle for the selected day</caption>
        <thead><tr><th scope="col">Muscle</th><th scope="col" class="num">Sets</th></tr></thead>
        <tbody>
          <tr class="is-total"><th scope="row">Total</th><td class="num">${esc(total(counts))}</td></tr>
          ${rows(counts, week.days.filter((d) => d.trained).length)}
        </tbody>
      </table>
    </section>`;
}

function rows(counts, trainedInWeek) {
  const entries = [...counts.entries()].sort((a, b) =>
    targetLabel(a[0]).localeCompare(targetLabel(b[0])),
  );
  if (entries.length === 0) {
    // A rest day is a legitimate answer, but only say so plainly when there is
    // nothing else to look at in this week; otherwise point at the days that
    // do have data instead of leaving the user staring at an empty map.
    const hint = trainedInWeek > 0 ? " Pick a marked day above." : "";
    return `<tr class="is-empty"><td colspan="2">No sets logged on this day.${hint}</td></tr>`;
  }
  return entries
    .map(
      ([target, sets]) =>
        `<tr><th scope="row">${esc(targetLabel(target))}</th><td class="num">${esc(sets)}</td></tr>`,
    )
    .join("");
}

function total(counts) {
  let sum = 0;
  for (const value of counts.values()) sum += Number(value) || 0;
  return sum;
}

/** `YYYY-MM-DD` to a local-midnight Date, or null when unusable. */
function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}
