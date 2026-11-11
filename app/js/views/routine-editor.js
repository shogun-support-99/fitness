/**
 * IronLog — Routine editor.
 *
 * Compose a named routine from muscle groups. The store keeps only the intent
 * (name, target muscles, rest interval); the exercises are resolved from the
 * live catalogue by routines.js, the same resolver the built-in splits use, so
 * an edited routine starts exactly like a preset one.
 */

import { exerciseThumbnail } from "../diagrams.js";
import { esc, icon } from "../ui.js";
import { routineExerciseIds } from "./routines.js";

/** The muscle groups the body map and the catalogue both understand. */
export const EDITOR_MUSCLES = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "core",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "forearms",
];

const REST_OPTIONS = [45, 60, 90, 120, 180];

export function blankRoutineDraft(restSeconds = 90) {
  return { id: "", name: "", muscles: [], restSeconds };
}

export function routineDraft(routine, fallbackRest = 90) {
  if (!routine) return blankRoutineDraft(fallbackRest);
  return {
    id: routine.id,
    name: routine.name,
    muscles: [...routine.muscles],
    restSeconds: routine.restSeconds ?? fallbackRest,
  };
}

function muscleButtons(draft) {
  return EDITOR_MUSCLES.map((muscle) => {
    const active = draft.muscles.includes(muscle);
    return `
      <button class="editor-muscle ${active ? "is-active" : ""}" type="button"
              data-action="toggle-routine-muscle" data-muscle="${esc(muscle)}"
              data-focus-key="muscle-${esc(muscle)}"
              aria-pressed="${active}">${esc(muscle)}</button>`;
  }).join("");
}

function exercisePreview(exercises, restSeconds) {
  if (exercises.length === 0) {
    return `<p class="editor-empty">${icon("dumbbell")} Choose a muscle group above and your first exercise slot appears here.</p>`;
  }
  const rows = exercises
    .map((exercise) => {
      return `
        <li class="editor-exercise">
          ${exerciseThumbnail(exercise)}
          <span class="editor-exercise-copy">
            <strong>${esc(exercise.name)}</strong>
            <small>${esc(exercise.muscle)} · ${esc(exercise.equipment)}</small>
          </span>
          <span class="editor-exercise-rest">${icon("timer")} ${esc(restSeconds)}s</span>
        </li>`;
    })
    .join("");
  return `<ul class="editor-preview">${rows}</ul>`;
}

function restButtons(draft) {
  return REST_OPTIONS.map((seconds) => {
    const active = draft.restSeconds === seconds;
    return `
      <button type="button" class="${active ? "is-active" : ""}"
              data-action="set-editor-rest" data-seconds="${seconds}"
              data-focus-key="rest-${seconds}"
              aria-pressed="${active}">${seconds}s</button>`;
  }).join("");
}

export function renderRoutineEditor(store, draft) {
  const editing = Boolean(draft.id);
  const exercises = routineExerciseIds(store.exercises(), draft.muscles)
    .map((id) => store.getExercise(id))
    .filter(Boolean);
  const totalSets = exercises.length * 3;
  const muscleCount = draft.muscles.length;
  const selectionLabel = muscleCount ? `${muscleCount} selected` : "Pick one or more";
  const summary = `${muscleCount} muscle groups · ${exercises.length} exercise${exercises.length === 1 ? "" : "s"}`;
  const setNote = totalSets ? ` · about ${totalSets} sets` : "";

  return `
    <section class="view routine-editor">
      <header class="editor-bar">
        <a class="icon-btn editor-back" href="#/workout" aria-label="Back to routines">${icon("back")}</a>
        <h1>${editing ? "Edit Routine" : "New Routine"}</h1>
        <button class="editor-save" type="button" data-action="save-routine">Save</button>
      </header>

      <section class="editor-card">
        <label class="editor-label" for="routine-name">Routine name</label>
        <input class="editor-name" id="routine-name" type="text" value="${esc(draft.name)}"
               placeholder="e.g. Upper Body Power" maxlength="40"
               data-action="routine-name" data-focus-key="routine-name" autocomplete="off" />
        <p class="editor-hint">${summary}${setNote}</p>
      </section>

      <section class="editor-card">
        <div class="editor-card-head">
          <h2>Muscle focus</h2>
          <span>${selectionLabel}</span>
        </div>
        <div class="editor-muscles" role="group" aria-label="Target muscle groups">
          ${muscleButtons(draft)}
        </div>
      </section>

      <section class="editor-card">
        <div class="editor-card-head">
          <h2>Exercise preview</h2>
          <span>${exercises.length} exercise${exercises.length === 1 ? "" : "s"}</span>
        </div>
        ${exercisePreview(exercises, draft.restSeconds)}
      </section>

      <section class="editor-card">
        <div class="editor-card-head">
          <h2>${icon("timer")} Rest interval</h2>
          <span>Applies to new sets</span>
        </div>
        <div class="editor-rest" role="group" aria-label="Default rest interval">
          ${restButtons(draft)}
        </div>
      </section>

      <div class="editor-actions">
        <button class="btn btn-primary btn-lg btn-wide" type="button" data-action="start-editor-routine">
          ${icon("play")} Start Routine
        </button>
        <button class="btn btn-outline btn-wide" type="button" data-action="save-routine">
          ${icon("save")} ${editing ? "Save changes" : "Save routine"}
        </button>
        ${
          editing
            ? `<button class="btn btn-danger-ghost btn-wide" type="button" data-action="delete-routine" data-routine-id="${esc(draft.id)}">
                 ${icon("trash")} Delete Routine
               </button>`
            : ""
        }
      </div>
    </section>`;
}
