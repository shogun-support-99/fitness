/**
 * IronLog — Stats view.
 *
 * Lifetime numbers, weekly volume chart, muscle-group distribution and the
 * personal-record board. All derived from the pure functions in stats.js.
 */

import {
  compactNumber,
  lifetimeStats,
  relativeTime,
  streaks,
  weeklyVolume,
} from "../stats.js";
import { barChart, distributionBars, emptyState, esc, icon, statTile } from "../ui.js";

function renderProfileHead(workoutCount) {
  return `
    <header class="view-head profile-view-head">
      <div class="profile-identity">
        <span class="profile-avatar">${icon("user")}</span>
        <div><h1>Your profile</h1><p class="view-subline">${workoutCount} workout${workoutCount === 1 ? "" : "s"} · stored on this device</p></div>
      </div>
      <a class="icon-btn profile-settings" href="#/settings" aria-label="Open settings">${icon("settings")}</a>
    </header>
    <nav class="profile-shortcuts" aria-label="Profile sections">
      <a class="is-active" href="#/stats">${icon("stats")} Statistics</a>
      <a href="#/library">${icon("library")} Exercises</a>
      <a href="#/history">${icon("history")} History</a>
    </nav>`;
}

export function renderStats(store) {
  const completed = store.completedWorkouts();

  if (completed.length === 0) {
    return `
      <section class="view view-stats">
        ${renderProfileHead(0)}
        ${emptyState({
          icon: "stats",
          title: "No data to chart yet",
          body: "Log a few sessions and your volume, personal records and muscle balance will build up here.",
        })}
      </section>`;
  }

  const index = store.exerciseIndex();
  const units = store.settings.units;
  const life = lifetimeStats(completed);
  const streak = streaks(completed);
  const weeks = weeklyVolume(completed).slice(-12);
  const records = store.personalRecords();

  return `
    <section class="view view-stats">
      ${renderProfileHead(life.workouts)}

      <div class="section-title-row"><h2>Statistics</h2><span class="panel-note">All time</span></div>
      <div class="tile-grid tile-grid-4">
        ${statTile({ label: "Total volume", value: compactNumber(life.volume), unit: units, tone: "tone-sky" })}
        ${statTile({ label: "Total sets", value: compactNumber(life.sets), countTo: life.sets, tone: "tone-violet" })}
        ${statTile({ label: "Time training", value: String(life.hours), countTo: life.hours, unit: "h", tone: "tone-mint" })}
        ${statTile({ label: "Current streak", value: String(streak.current), countTo: streak.current, unit: "d", hint: `best ${streak.best}d`, tone: "tone-orange" })}
      </div>

      <section class="panel" data-reveal="rise">
        <div class="panel-head"><h2>Weekly volume</h2><span class="panel-note">last ${weeks.length} ${weeks.length === 1 ? "week" : "weeks"}</span></div>
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
        <div class="panel-head"><h2>Muscle balance</h2><span class="panel-note">sets per group</span></div>
        ${distributionBars(muscleDistribution(completed, index))}
      </section>

      <section class="panel" data-reveal="rise">
        <div class="panel-head">
          <h2>${icon("trophy")} Personal records</h2>
          <span class="panel-note">${records.size} tracked</span>
        </div>
        ${records.size === 0
          ? `<p class="panel-empty">Complete a set with weight to start recording personal bests.</p>`
          : `<ul class="pr-list">
               ${[...records.values()]
                 .sort((a, b) => b.maxOneRm - a.maxOneRm)
                 .slice(0, 25)
                 .map((r) => renderPrRow(r, units)).join("")}
             </ul>`}
      </section>
    </section>`;
}

function renderPrRow(record, units) {
  const latest = record.history[record.history.length - 1];
  return `
    <li class="pr-row">
      <span class="pr-name">
        ${esc(record.name)}
        ${latest?.date ? `<em>${esc(relativeTime(latest.date))}</em>` : ""}
      </span>
      <span class="pr-values">
        <span class="pr-value"><b>${record.maxWeight}</b><i>${esc(units)}</i><u>heaviest</u></span>
        <span class="pr-value"><b>${record.maxReps}</b><i>reps</i><u>most</u></span>
        <span class="pr-value pr-value-accent"><b>${compactNumber(record.maxOneRm)}</b><i>${esc(units)}</i><u>est. 1RM</u></span>
      </span>
    </li>`;
}

function muscleDistribution(workouts, index) {
  const counts = new Map();
  for (const w of workouts) {
    for (const entry of w.exercises ?? []) {
      const muscle = index[entry.exerciseId]?.muscle ?? "other";
      const done = (entry.sets ?? []).filter((s) => s.done).length;
      counts.set(muscle, (counts.get(muscle) ?? 0) + done);
    }
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value, display: `${value} ${value === 1 ? "set" : "sets"}` }))
    .sort((a, b) => b.value - a.value);
}
