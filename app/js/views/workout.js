/**
 * IronLog — Workout logger view.
 *
 * The core screen: exercises, set rows with weight/reps, completion ticks,
 * rest-timer controls, and finish/discard actions.
 */

import { compactNumber, estimatedOneRepMax } from "../stats.js";
import { emptyState, esc, icon } from "../ui.js";
import { exerciseThumbnail } from "../diagrams.js";
import { renderRoutineCards } from "./routines.js";

/** Rows built in the add-exercise sheet before search takes over. */
export const PICKER_CAP = 80;

export function renderWorkout(store, { elapsed = "00:00", timer = null } = {}) {
  const workout = store.activeWorkout();
  const index = store.exerciseIndex();
  const units = store.settings.units;

  if (!workout) {
    return `
      <section class="view view-workout view-workout-hub">
        <header class="view-head">
          <div><h1>Workout</h1><p class="view-subline">Build a session or start from a routine.</p></div>
        </header>
        <section class="quick-start-panel workout-launch" data-tilt data-tilt-glare data-tilt-max="2.2" data-reveal="rise">
          <div class="quick-start-copy">
            <span class="energy-badge">${icon("bolt")} Build your session</span>
            <h2>What are we training today?</h2>
            <p>Start with a blank log or jump into a routine below. Your previous numbers will be waiting.</p>
          </div>
          <button class="btn btn-primary btn-lg" data-action="start-workout" data-magnetic>${icon("plus")} Start empty workout ${icon("chevron")}</button>
          <svg class="hero-plate" viewBox="0 0 64 64" aria-hidden="true">
            <path fill="currentColor" fill-rule="evenodd" d="M58.31 22.42A28 28 0 1 1 41.58 5.69L58.31 22.42ZM41 32a9 9 0 1 1-18 0 9 9 0 1 1 18 0Z" />
          </svg>
        </section>
        <section class="routine-section" aria-labelledby="workout-routines-title">
          <div class="section-title-row"><h2 id="workout-routines-title">Routines</h2><a class="link" href="#/library">Explore exercises ${icon("chevron")}</a></div>
          ${renderRoutineCards()}
        </section>
      </section>`;
  }

  const doneSets = workout.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const volume = workout.exercises.reduce(
    (sum, e) => sum + e.sets.filter((s) => s.done).reduce((v, s) => v + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0),
    0,
  );

  return `
    <section class="view view-workout">
      <header class="logger-head" data-reveal="rise">
        <div class="logger-title">
          <span class="logger-kicker">Log workout</span>
          <input class="logger-name" value="${esc(workout.name)}" data-action="rename-workout"
                 aria-label="Workout name" maxlength="60" />
        </div>
        <button class="btn btn-primary logger-finish" data-action="complete-workout" ${doneSets === 0 ? "disabled" : ""}>
          Finish
        </button>
        <div class="logger-metrics" aria-label="Current workout totals">
          <span><small>Duration</small><strong data-role="elapsed">${esc(elapsed)}</strong></span>
          <span><small>Volume</small><strong>${compactNumber(volume)} ${esc(units)}</strong></span>
          <span><small>Sets</small><strong>${doneSets}</strong></span>
        </div>
      </header>

      ${timer?.running ? renderTimerBar(timer) : ""}

      <div class="exercise-stack">
        ${workout.exercises.length === 0
          ? emptyState({
              icon: "plus",
              title: "Add your first exercise",
              body: "Pick from the built-in library or create your own.",
              action: `<button class="btn btn-primary" data-action="open-picker">${icon("plus")} Add exercise</button>`,
            })
          : workout.exercises.map((entry, exerciseIndex) => renderExerciseCard(entry, index, store, units, exerciseIndex)).join("")}
      </div>

      ${workout.exercises.length > 0
        ? `<button class="btn btn-outline btn-wide" data-action="open-picker">${icon("plus")} Add exercise</button>`
        : ""}

      <div class="logger-actions">
        <button class="btn btn-danger-ghost" data-action="discard-workout">${icon("trash")} Discard workout</button>
      </div>
    </section>

    ${renderPicker(store)}
    ${renderSummaryModal()}`;
}

function renderTimerBar(timer) {
  const left = timer.secondsLeft;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const pct = Math.round((timer.progress ?? 0) * 100);
  // "Urgent" is the last fifth of the rest. Deriving it here keeps the view the
  // only place that knows what the numbers mean; CSS just responds to the flag.
  // pct is progress through the countdown, so urgency is the HIGH end: the
  // inverted test painted every fresh rest timer amber from the first second.
  const urgent = pct >= 80 ? "1" : "0";

  return `
    <div class="timer-bar" role="timer" aria-live="polite" data-urgent="${urgent}" style="--timer-pct:${pct}">
      <span class="timer-icon">${icon("timer")}</span>
      <span class="timer-track"><span class="timer-fill" style="width:${pct}%"></span></span>
      <span class="timer-read" data-role="timer-read">${mm}:${ss}</span>
      <button class="timer-btn" data-action="timer-add" data-seconds="15" aria-label="Add 15 seconds">+15s</button>
      <button class="timer-btn" data-action="timer-stop" aria-label="Stop rest timer">${icon("stop")}</button>
    </div>`;
}

function renderExerciseCard(entry, index, store, units, exerciseIndex = 0) {
  const exercise = index[entry.exerciseId];
  const name = exercise?.name ?? entry.exerciseId;
  const previous = store.previousPerformance(entry.exerciseId);

  return `
    <article class="exercise-card motion-safe:animate-fade-up" data-entry="${esc(entry.id)}" data-muscle="${esc(exercise?.muscle ?? "other")}" style="--exercise-order:${exerciseIndex};animation-delay:calc(var(--exercise-order) * 60ms)">
      <header class="exercise-head">
        ${exercise ? exerciseThumbnail(exercise) : ""}
        <div>
          <span class="exercise-label">Exercise ${String(exerciseIndex + 1).padStart(2, "0")}</span>
          <h3>${esc(name)}</h3>
          <p class="exercise-sub">
            ${exercise ? `${esc(exercise.muscle)} · ${esc(exercise.equipment)}` : "Unknown exercise"}
            ${previous ? `<span class="last-perf">Last: ${previous.weight} ${esc(units)} × ${previous.reps}</span>` : ""}
          </p>
        </div>
        <button class="icon-btn" data-action="remove-exercise" data-entry="${esc(entry.id)}" aria-label="Remove ${esc(name)}">
          ${icon("trash")}
        </button>
      </header>

      <button class="exercise-rest" data-action="rest-now" aria-label="Start rest timer for ${esc(name)}">
        ${icon("timer")} Rest timer: ${store.settings.restSeconds}s
      </button>

      <div class="set-table" role="table" aria-label="${esc(name)} sets">
        <div class="set-row set-head" role="row">
          <span role="columnheader">Set</span>
          <span role="columnheader">Previous</span>
          <span role="columnheader">${esc(units)}</span>
          <span role="columnheader">Reps</span>
          <span role="columnheader">1RM</span>
          <span role="columnheader"><span class="sr-only">Done</span></span>
        </div>

        ${entry.sets.map((set, i) => renderSetRow(entry, set, i, previous, units)).join("")}
      </div>

      <div class="exercise-foot">
        <button class="btn btn-small btn-sub btn-wide add-set-button" data-action="add-set" data-entry="${esc(entry.id)}" data-previous="true">
          ${icon("plus")} Add set
        </button>
      </div>
    </article>`;
}

function renderSetRow(entry, set, index, previous, units) {
  const oneRm = set.weight > 0 && set.reps > 0 ? estimatedOneRepMax(set.weight, set.reps) : 0;
  const eid = esc(entry.id);
  const sid = esc(set.id);
  return `
    <div class="set-row ${set.done ? "is-done" : ""}" role="row" data-set="${sid}">
      <span class="set-number" role="cell">${index + 1}</span>
      <span class="set-previous" role="cell">${previous ? `${previous.weight}×${previous.reps}` : "—"}</span>
      <span role="cell">
        <input class="set-input" type="number" inputmode="decimal" min="0" step="0.5"
               value="${set.weight}" placeholder="0"
               data-action="set-weight" data-entry="${eid}" data-set="${sid}"
               aria-label="Set ${index + 1} weight" />
      </span>
      <span role="cell">
        <input class="set-input" type="number" inputmode="numeric" min="0" step="1"
               value="${set.reps}" placeholder="0"
               data-action="set-reps" data-entry="${eid}" data-set="${sid}"
               aria-label="Set ${index + 1} reps" />
      </span>
      <span class="set-onerm" role="cell">${oneRm > 0 ? compactNumber(oneRm) : "—"}</span>
      <span role="cell">
        <button class="tick ${set.done ? "is-on" : ""}" role="checkbox" aria-checked="${set.done}"
                data-action="toggle-set" data-entry="${eid}" data-set="${sid}" data-focus-key="tick-${sid}"
                aria-label="Mark set ${index + 1} ${set.done ? "not done" : "done"}">
          ${icon("check")}
        </button>
      </span>
      <button class="set-delete" data-action="remove-set" data-entry="${eid}" data-set="${sid}" aria-label="Delete set ${index + 1}">
        ${icon("trash")}
      </button>
    </div>`;
}

function renderPicker(store) {
  const exercises = store.exercises();
  const muscles = [...new Set(exercises.map((e) => e.muscle))].sort();
  // The catalogue holds 1,316 entries; render a capped, ranked slice and let
  // search narrow it rather than building every row up front.
  const shown = exercises.slice(0, PICKER_CAP);
  return `
    <div class="sheet" id="exercise-picker" hidden>
      <div class="sheet-backdrop" data-action="close-picker"></div>
      <div class="sheet-panel" role="dialog" aria-modal="true" aria-label="Choose an exercise">
        <header class="sheet-head">
          <h2>Add exercise</h2>
          <button class="icon-btn" data-action="close-picker" aria-label="Close">${icon("back")}</button>
        </header>
        <div class="sheet-search">
          ${icon("search")}
          <input type="search" id="picker-search" placeholder="Search ${exercises.length} exercises…" autocomplete="off" />
        </div>
        <div class="chip-row chip-scroll" id="picker-muscles">
          <button class="chip is-active" data-muscle="all">All</button>
          ${muscles.map((m) => `<button class="chip" data-muscle="${esc(m)}">${esc(m)}</button>`).join("")}
        </div>
        <ul class="picker-list" id="picker-list">
          ${shown.map((e) => renderPickerRow(e)).join("")}
        </ul>
        <p class="picker-note" id="picker-note">${pickerNote(exercises.length, shown.length)}</p>
        <footer class="sheet-foot">
          <button class="btn btn-outline btn-wide" data-action="open-custom-exercise">${icon("plus")} Create custom exercise</button>
        </footer>
      </div>
    </div>`;
}

function pickerNote(total, shown) {
  if (shown >= total) return "";
  return `Showing ${shown} of ${total} — search to find a specific exercise.`;
}

export function renderPickerRow(exercise) {
  const secondary = exercise.secondaryMuscles?.length ? exercise.secondaryMuscles.slice(0, 2).join(", ") : "";
  return `
    <li class="picker-row" data-name="${esc(exercise.name.toLowerCase())}" data-muscle="${esc(exercise.muscle)}" data-equipment="${esc(exercise.equipment)}" data-target="${esc(exercise.target ?? "")}">
      <button data-action="pick-exercise" data-exercise="${esc(exercise.id)}">
        ${exerciseThumbnail(exercise)}
        <span class="picker-copy">
        <span class="picker-name">
          ${esc(exercise.name)}
          ${exercise.custom ? `<em class="pill pill-custom">custom</em>` : ""}
        </span>
        <span class="picker-meta">${esc(exercise.muscle)} · ${esc(exercise.equipment)}${secondary ? ` · +${esc(secondary)}` : ""}</span>
        </span>
      </button>
    </li>`;
}

function renderSummaryModal() {
  return `
    <div class="sheet" id="summary-modal" hidden>
      <div class="sheet-backdrop" data-action="dismiss-summary"></div>
      <div class="sheet-panel sheet-panel-sm" role="dialog" aria-modal="true" aria-label="Workout summary">
        <div id="summary-content"></div>
      </div>
    </div>`;
}
