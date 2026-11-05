/**
 * IronLog — Statistics screen.
 *
 * The analytics deep-dive behind the profile's Statistics tile. Reading order
 * follows Hevy's: a body map that shows where the work went, a seven-day strip
 * that shows whether the week happened at all, the totals for the selected
 * range, then the two advanced screens and the longer-running series.
 *
 * The map is a heat map, not a checklist: a plate is filled in proportion to
 * how many sets landed on it relative to the busiest plate in the range, so
 * "chest day four times this week" is visible before any number is read.
 */

import { bodyMap, platesFromMuscleCounts } from "../body.js";
import {
  DEFAULT_RANGE,
  compactNumber,
  formatMinutes,
  muscleSetCounts,
  rangeLabel,
  rangeSummary,
  rangeStart,
  trailingWeek,
  trainedDays,
  weekKey,
  weeklyVolume,
  workoutsInRange,
} from "../stats.js";
import { barChart, distributionBars, esc, icon, statTile } from "../ui.js";
import {
  figureSwitch,
  hrefWith,
  noDataInRange,
  profileBack,
  rangeChips,
  sectionTitle,
  weekStrip,
} from "./profile-common.js";

const PR_CAP = 10;

export function renderStatistics(store, params) {
  const range = params?.get?.("range") || DEFAULT_RANGE;
  const side = params?.get?.("side") === "back" ? "back" : "front";
  const qs = `range=${encodeURIComponent(range)}&side=${side}`;

  const completed = store.completedWorkouts();
  const index = store.exerciseIndex();
  const units = store.settings.units;

  const inRange = workoutsInRange(completed, { start: rangeStart(range) });
  const summary = rangeSummary(inRange);
  const muscleCounts = muscleSetCounts(inRange, index);
  const plates = platesFromMuscleCounts(muscleCounts);
  const days = trailingWeek(new Date(), trainedDays(completed));
  // The weekly series obeys the selected range like every other panel here.
  // Leaving it all-time under a "last 7 days" chip reads as a bug: the chips sit
  // directly above it. ISO week keys sort correctly as plain strings, including
  // across a year boundary ("2025-W52" < "2026-W01").
  const windowStart = rangeStart(range);
  const floorWeek = windowStart ? weekKey(windowStart) : null;
  const weeks = weeklyVolume(completed)
    .filter((w) => !floorWeek || w.week >= floorWeek)
    .slice(-12);
  const records = store.personalRecords();

  const figure =
    summary.sets === 0
      ? `<div class="figure-empty">No sets in the ${esc(rangeLabel(range).toLowerCase())}</div>`
      : bodyMap({
          view: side,
          setsByPlate: plates,
          summary: `Muscle map, ${side} view, ${rangeLabel(range).toLowerCase()}`,
        });

  return `
    <section class="view view-statistics">
      ${profileBack("Statistics", qs)}
      ${rangeChips("statistics", range, qs)}

      <section class="panel panel-figure" data-reveal="rise">
        <div class="panel-head">
          <h2>Muscle map</h2>
          <span class="panel-note">${esc(rangeLabel(range))}</span>
        </div>
        ${figureSwitch("statistics", qs, side)}
        <div class="figure-wrap">${figure}</div>
        ${summary.sets === 0 ? "" : heatLegend()}
      </section>

      <section class="panel" data-reveal="rise">
        <div class="panel-head"><h2>This week</h2><span class="panel-note">last 7 days</span></div>
        ${weekStrip(days)}
      </section>

      ${summary.workouts === 0
        ? noDataInRange(range)
        : `<div class="tile-grid tile-grid-4 tile-grid-headline">
            ${statTile({ label: "Workouts", value: String(summary.workouts), countTo: summary.workouts })}
            ${statTile({ label: "Duration", value: formatMinutes(summary.minutes), tone: "tone-data" })}
            ${statTile({ label: "Volume", value: compactNumber(summary.volume), unit: units })}
            ${statTile({ label: "Sets", value: String(summary.sets), countTo: summary.sets })}
          </div>`}

      ${sectionTitle("Advanced statistics")}
      <ul class="adv-list">
        ${advRow({
          href: hrefWith("muscle-distribution", qs),
          icon: "stats",
          title: "Muscle distribution",
          body: "Compare current and previous muscle distributions across six body parts.",
        })}
        ${advRow({
          href: hrefWith("body-distribution", qs),
          icon: "user",
          title: "Body distribution",
          body: "Sets per muscle on a body map, for any week you pick.",
        })}
      </ul>

      <section class="panel" data-reveal="rise">
        <div class="panel-head">
          <h2>Weekly volume</h2>
          <span class="panel-note">last ${weeks.length} ${weeks.length === 1 ? "week" : "weeks"}</span>
        </div>
        ${barChart(
          weeks.map((w) => ({
            value: w.volume,
            label: `${w.week}: ${compactNumber(w.volume)} ${units} across ${w.workouts} ${w.workouts === 1 ? "session" : "sessions"}`,
            display: `${compactNumber(w.volume)} ${units}`,
            axis: w.week.replace(/^\d{4}-/, ""),
          })),
          { ariaLabel: "Weekly training volume" },
        )}
      </section>

      <section class="panel" data-reveal="rise">
        <div class="panel-head"><h2>Set count per muscle group</h2><span class="panel-note">${esc(rangeLabel(range))}</span></div>
        ${distributionBars(
          [...muscleCounts.entries()]
            .map(([label, value]) => ({ label, value, display: `${value} ${value === 1 ? "set" : "sets"}` }))
            .sort((a, b) => b.value - a.value),
        )}
      </section>

      ${renderRecords(records, units)}
    </section>`;
}

function advRow({ href, icon: iconName, title, body }) {
  return `<li>
      <a class="adv-row hover-lift" href="${esc(href)}">
        <span class="adv-icon" aria-hidden="true">${icon(iconName)}</span>
        <span class="adv-copy"><strong>${esc(title)}</strong><small>${esc(body)}</small></span>
        <span class="dash-go" aria-hidden="true">${icon("chevron")}</span>
      </a>
    </li>`;
}

function heatLegend() {
  return `<div class="heat-legend" aria-hidden="true">
      <span class="heat-label">Less</span>
      <span class="heat-scale"><i style="--t:0.15"></i><i style="--t:0.4"></i><i style="--t:0.65"></i><i style="--t:0.9"></i></span>
      <span class="heat-label">More</span>
    </div>`;
}

function renderRecords(records, units) {
  const rows = [...records.values()].sort((a, b) => b.maxOneRm - a.maxOneRm).slice(0, PR_CAP);
  return `
    <section class="panel" data-reveal="rise">
      <div class="panel-head">
        <h2>${icon("trophy")} Personal records</h2>
        <span class="panel-note">${records.size} tracked</span>
      </div>
      ${
        rows.length === 0
          ? `<p class="panel-empty">Complete a set with weight to start recording personal bests.</p>`
          : `<ul class="pr-list">${rows
              .map(
                (r) => `<li class="pr-row">
                    <span class="pr-name">${esc(r.name)}</span>
                    <span class="pr-values">
                      <span class="pr-value"><b>${esc(compactNumber(r.maxWeight))}</b><i>${esc(units)}</i><u>heaviest</u></span>
                      <span class="pr-value"><b>${esc(r.maxReps)}</b><i>reps</i><u>most</u></span>
                      <span class="pr-value pr-value-accent"><b>${esc(compactNumber(r.maxOneRm))}</b><i>${esc(units)}</i><u>est. 1RM</u></span>
                    </span>
                  </li>`,
              )
              .join("")}</ul>`
      }
    </section>`;
}
