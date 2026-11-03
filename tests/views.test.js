/**
 * Smoke tests for the view modules: every view is a pure function of store
 * state, so rendering each one against a seeded store catches crashes (for
 * example a workout record missing the arrays the markup maps over) without a
 * browser. Run with: node --test "tests/*.test.js"
 */

import assert from "node:assert/strict";
import { test, describe, beforeEach } from "node:test";

import { Store, memoryStorage } from "../app/js/store.js";
import { renderHome } from "../app/js/views/home.js";
import { renderWorkout } from "../app/js/views/workout.js";
import { renderHistory } from "../app/js/views/history.js";
import { renderStats } from "../app/js/views/stats.js";
import { renderLibrary, renderExerciseDetail } from "../app/js/views/library.js";
import { renderSettings } from "../app/js/views/settings.js";
import { renderRoutineCards, routineExerciseIds } from "../app/js/views/routines.js";

let store;

beforeEach(() => {
  store = new Store(memoryStorage());
  store.addCustomExercise({ name: "Landmine Press", muscle: "shoulders", equipment: "barbell" });
  const started = store.startWorkout({ name: "Push Day" });
  const entry = store.addExerciseToWorkout(started.workout.id, "custom-landmine-press").entry;
  const set = store.addSet(started.workout.id, entry.id, { weight: 60, reps: 8 }).set;
  store.updateSet(started.workout.id, entry.id, set.id, { done: true });
  store.completeWorkout(started.workout.id);
});

describe("views render from a seeded store", () => {
  test("home", () => {
    const html = renderHome(store);
    assert.match(html, /Push Day/);
    assert.match(html, /Home/);
  });

  test("workout hub (no active workout) renders the launch panel", () => {
    const html = renderWorkout(store, {});
    assert.match(html, /Start empty workout/);
    assert.match(html, /Routines/);
  });

  test("workout logger (active workout) shows notes, plate button for barbell, sets", () => {
    const started = store.startWorkout({ name: "Legs" });
    const entry = store.addExerciseToWorkout(started.workout.id, "custom-landmine-press").entry;
    store.addSet(started.workout.id, entry.id, { weight: 40, reps: 10 });
    const html = renderWorkout(store, {});
    assert.match(html, /data-action="set-workout-notes"/);
    assert.match(html, /data-action="open-plates"/, "barbell equipment gets the plate button");
    assert.match(html, /id="plate-sheet"/, "plate sheet shell is mounted in the logger");
    assert.match(html, /Legs/);
  });

  test("history", () => {
    const html = renderHistory(store, {});
    assert.match(html, /Push Day/);
    assert.match(html, /personal record/i);
  });

  test("stats", () => {
    const html = renderStats(store);
    assert.match(html, /Personal records/);
    assert.match(html, /Weekly volume/);
  });

  test("library with muscle and equipment filters", () => {
    const html = renderLibrary(store, { query: "", muscle: "all", equipment: "barbell" });
    assert.match(html, /id="library-equipment"/);
    assert.match(html, /Landmine Press/);
    const none = renderLibrary(store, { query: "zzz-no-match", muscle: "all", equipment: "all" });
    assert.match(none, /No matches/);
  });

  test("exercise detail includes the progress chart once history exists", () => {
    const exercise = store.exerciseIndex()["custom-landmine-press"];
    const html = renderExerciseDetail(exercise, { store });
    assert.match(html, /Your progress/);
    assert.match(html, /chart-line/);
  });

  test("settings", () => {
    const html = renderSettings(store);
    assert.match(html, /Export JSON/);
    assert.match(html, /Rest timer/);
  });

  test("routine cards and id resolution", () => {
    assert.match(renderRoutineCards(), /Push/);
    const picks = routineExerciseIds(store.exercises(), ["shoulders"]);
    assert.deepEqual(picks, ["custom-landmine-press"]);
  });
});

describe("views survive a workout record with missing fields", () => {
  test("imported-shaped workout does not crash home/history/stats", () => {
    // Simulates a foreign/hand-edited import after sanitisation, plus a raw
    // minimal record to prove the views never assume more than the store does.
    store.doc.workouts.push({
      id: "w_min",
      name: "Minimal",
      status: "completed",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      notes: "",
      exercises: [],
    });
    assert.doesNotThrow(() => renderHome(store));
    assert.doesNotThrow(() => renderHistory(store, {}));
    assert.doesNotThrow(() => renderStats(store));
  });
});
