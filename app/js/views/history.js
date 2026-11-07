/**
 * IronLog — History view.
 *
 * Chronological log of completed sessions with an expandable per-workout
 * breakdown, grouped by month.
 */

import { compactNumber, relativeTime, workoutDurationMinutes, workoutSetCount, workoutVolume } from "../stats.js";
import { emptyState, esc, icon, muscleBadge } from "../ui.js";

export function renderHistory(store, { openId = null } = {}) {
  const completed = store.completedWorkouts();
  const index = store.exerciseIndex();
  const units = store.settings.units;

  if (completed.length === 0) {
    return `
      <section class="view view-history">
        <header class="view-head">
          <div><h1>History</h1><p class="view-subline">Completed sessions, with every set on record.</p></div>
        </header>
        ${emptyState({
          icon: "history",
          title: "Nothing logged yet",
          body: "Completed workouts appear here with full set-by-set detail.",
        })}
      </section>`;
  }

  const groups = groupByMonth(completed);

  return `
    <section class="view view-history">
      <header class="view-head">
        <div>
          <h1>History</h1>
          <p class="view-subline">${completed.length} session${completed.length === 1 ? "" : "s"}</p>
        </div>
      </header>

      ${groups
        .map(
          ([month, workouts]) => `
        <section class="month-group" data-reveal="rise">
          <h2 class="month-title">${esc(month)}</h2>
          <ul class="history-list">
            ${workouts.map((w) => renderHistoryCard(w, index, units, w.id === openId)).join("")}
          </ul>
        </section>`,
        )
        .join("")}
    </section>`;
}

function groupByMonth(workouts) {
  const map = new Map();
  for (const w of workouts) {
    const d = new Date(w.endedAt ?? w.startedAt);
    const key = Number.isNaN(d.getTime())
      ? "Undated"
      : d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(w);
  }
  return [...map.entries()];
}

function renderHistoryCard(workout, index, units, open) {
  const summary = workout.summary ?? {
    volume: Math.round(workoutVolume(workout)),
    sets: workoutSetCount(workout),
    minutes: workoutDurationMinutes(workout),
    records: [],
  };
  const started = new Date(workout.startedAt);
  const prCount = summary.records?.length ?? 0;

  return `
    <li class="history-item ${open ? "is-open" : ""}">
      <button class="history-head transition-colors duration-200" data-action="toggle-history" data-id="${esc(workout.id)}" aria-expanded="${open}">
        <span class="history-date">
          <strong>${Number.isNaN(started.getTime()) ? "—" : started.getDate()}</strong>
          <span>${Number.isNaN(started.getTime()) ? "" : started.toLocaleDateString("en-GB", { month: "short" })}</span>
        </span>
        <span class="history-main">
          <span class="history-name">${esc(workout.name)}</span>
          <span class="history-meta">
            ${esc(summary.sets)} ${summary.sets === 1 ? "set" : "sets"} · ${compactNumber(summary.volume)} ${esc(units)} · ${esc(summary.minutes)} min
            · ${esc(relativeTime(workout.endedAt ?? workout.startedAt))}
          </span>
          ${prCount > 0 ? `<span class="pr-flag">${icon("trophy")} ${prCount} personal record${prCount === 1 ? "" : "s"}</span>` : ""}
        </span>
        <span class="history-chev">${icon("chevron")}</span>
      </button>

      ${open ? renderHistoryDetail(workout, index, units, summary) : ""}
    </li>`;
}

function renderHistoryDetail(workout, index, units, summary) {
  return `
    <div class="history-detail">
      ${workout.exercises
        .map((entry) => {
          const exercise = index[entry.exerciseId];
          const done = entry.sets.filter((s) => s.done);
          return `
          <div class="detail-exercise">
            <div class="detail-head">
              <h4>${esc(exercise?.name ?? entry.exerciseId)}</h4>
              ${exercise ? muscleBadge(exercise.muscle) : ""}
            </div>
            ${done.length === 0
              ? `<p class="detail-empty">No completed sets.</p>`
              : `<ul class="detail-sets">
                   ${done
                     .map(
                       (s, i) => `
                     <li>
                       <span class="detail-set-n">${i + 1}</span>
                       <span class="detail-set-v">${esc(s.weight)} ${esc(units)} × ${esc(s.reps)}</span>
                       <span class="detail-set-vol">${compactNumber((Number(s.weight) || 0) * (Number(s.reps) || 0))} ${esc(units)}</span>
                     </li>`,
                     )
                     .join("")}
                 </ul>`}
          </div>`;
        })
        .join("")}

      ${summary.records?.length
        ? `<div class="detail-records">
             <h4>${icon("trophy")} Personal records</h4>
             <ul>${summary.records.map((r) => `<li>${esc(r.name)} — ${esc(Array.isArray(r.kinds) ? r.kinds.join(", ") : "")}</li>`).join("")}</ul>
           </div>`
        : ""}

      ${workout.notes?.trim() ? `<div class="detail-notes"><h4>Notes</h4><p>${esc(workout.notes)}</p></div>` : ""}

      <div class="detail-actions">
        <button class="btn btn-small btn-outline" data-action="repeat-workout" data-id="${esc(workout.id)}">
          ${icon("history")} Repeat this session
        </button>
        <button class="btn btn-small btn-danger-ghost" data-action="delete-workout" data-id="${esc(workout.id)}">
          ${icon("trash")} Delete
        </button>
      </div>
    </div>`;
}
