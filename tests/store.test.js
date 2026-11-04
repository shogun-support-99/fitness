/**
 * Tests for the persistence layer in app/js/store.js.
 * Runs against an in-memory Storage double, so nothing touches a browser.
 */

import assert from "node:assert/strict";
import { test, describe, beforeEach } from "node:test";

import { STORAGE_KEY, Store, defaultWorkoutName, memoryStorage } from "../app/js/store.js";

let storage;
let store;

beforeEach(() => {
  storage = memoryStorage();
  store = new Store(storage);
});

// ── Bootstrapping ────────────────────────────────────────────────────────

describe("construction", () => {
  test("starts with an empty, valid document", () => {
    assert.deepEqual(store.workouts(), []);
    assert.equal(store.activeWorkout(), null);
    assert.equal(store.settings.units, "kg");
    assert.equal(store.settings.restSeconds, 120);
    assert.equal(store.settings.lastBackupAt, null);
  });

  test("ships no demo workouts or custom exercises", () => {
    assert.equal(store.doc.workouts.length, 0);
    assert.equal(store.doc.customExercises.length, 0);
    assert.equal(store.completedWorkouts().length, 0);
    assert.equal(storage.getItem(STORAGE_KEY), null);
  });

  test("starts empty until the catalogue is loaded", () => {
    assert.equal(store.exercises().length, 0);
    assert.equal(store.getExercise("bench-press"), null);
  });

  test("recovers from a corrupt stored payload instead of throwing", () => {
    storage.setItem(STORAGE_KEY, "{not json");
    const recovered = new Store(storage);
    assert.deepEqual(recovered.workouts(), []);
    assert.equal(recovered.settings.units, "kg");
  });

  test("fills in missing settings keys from an older document", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, workouts: [], settings: { units: "lb" } }));
    const loaded = new Store(storage);
    assert.equal(loaded.settings.units, "lb");
    assert.equal(loaded.settings.restSeconds, 120);
    assert.equal(loaded.settings.lastBackupAt, null);
  });

  test("ignores a non-object payload", () => {
    storage.setItem(STORAGE_KEY, "42");
    assert.deepEqual(new Store(storage).workouts(), []);
  });
});

// ── Workout lifecycle ────────────────────────────────────────────────────

describe("startWorkout", () => {
  test("creates an active workout and persists it", () => {
    const result = store.startWorkout({ name: "Push Day" });
    assert.ok(result.ok);
    assert.equal(result.workout.status, "active");
    assert.equal(result.workout.name, "Push Day");
    assert.ok(storage.getItem(STORAGE_KEY).includes("Push Day"));
  });

  test("refuses to start a second concurrent workout", () => {
    store.startWorkout({ name: "First" });
    const second = store.startWorkout({ name: "Second" });
    assert.equal(second.ok, false);
    assert.match(second.error, /already in progress/);
    assert.equal(store.workouts().length, 1);
  });

  test("seeds requested exercises", () => {
    const result = store.startWorkout({ exerciseIds: ["bench-press", "deadlift"] });
    assert.equal(result.workout.exercises.length, 2);
    assert.equal(result.workout.exercises[0].exerciseId, "bench-press");
  });

  test("falls back to a weekday-derived name", () => {
    const result = store.startWorkout({ now: new Date(2026, 9, 14, 9) }); // Wednesday
    assert.equal(result.workout.name, "Wednesday Legs");
  });

  test("trims and replaces a blank name", () => {
    const result = store.startWorkout({ name: "   ", now: new Date(2026, 9, 12, 9) }); // Monday
    assert.equal(result.workout.name, "Monday Push");
  });
});

describe("activeWorkout", () => {
  test("returns null once the session is finished", () => {
    const { workout } = store.startWorkout();
    store.completeWorkout(workout.id);
    assert.equal(store.activeWorkout(), null);
  });
});

// ── Sets ─────────────────────────────────────────────────────────────────

describe("set logging", () => {
  let workout;
  let entryId;

  beforeEach(() => {
    workout = store.startWorkout({ exerciseIds: ["bench-press"] }).workout;
    entryId = workout.exercises[0].id;
  });

  test("adds a set with explicit values", () => {
    const result = store.addSet(workout.id, entryId, { weight: 80, reps: 8 });
    assert.ok(result.ok);
    assert.equal(result.set.weight, 80);
    assert.equal(result.set.reps, 8);
    assert.equal(result.set.done, false);
  });

  test("coerces string input from number fields", () => {
    const result = store.addSet(workout.id, entryId, { weight: "82.5", reps: "6" });
    assert.equal(result.set.weight, 82.5);
    assert.equal(result.set.reps, 6);
  });

  test("treats invalid input as zero rather than NaN", () => {
    const result = store.addSet(workout.id, entryId, { weight: "abc", reps: null });
    assert.equal(result.set.weight, 0);
    assert.equal(result.set.reps, 0);
  });

  test("inherits previous values when fromPrevious is set", () => {
    store.addSet(workout.id, entryId, { weight: 90, reps: 5 });
    store.updateSet(workout.id, entryId, store.getWorkout(workout.id).exercises[0].sets[0].id, { done: true });
    store.completeWorkout(workout.id);

    const next = store.startWorkout({ exerciseIds: ["bench-press"] }).workout;
    const nextEntry = next.exercises[0].id;
    const result = store.addSet(next.id, nextEntry, { fromPrevious: true });
    assert.equal(result.set.weight, 90);
    assert.equal(result.set.reps, 5);
  });

  test("fails cleanly for an unknown entry", () => {
    const result = store.addSet(workout.id, "nope", { weight: 1, reps: 1 });
    assert.equal(result.ok, false);
  });

  test("marks a set done and stamps completion time", () => {
    const { set } = store.addSet(workout.id, entryId, { weight: 80, reps: 8 });
    const updated = store.updateSet(workout.id, entryId, set.id, { done: true });
    assert.equal(updated.set.done, true);
    assert.ok(updated.set.completedAt);
  });

  test("starts the rest timer automatically when the setting is on", () => {
    const { set } = store.addSet(workout.id, entryId, { weight: 80, reps: 8 });
    const updated = store.updateSet(workout.id, entryId, set.id, { done: true });
    assert.ok(updated.set.restStartedAt);
  });

  test("does not start the rest timer when auto-start is off", () => {
    store.updateSettings({ autoStartRestTimer: false });
    const { set } = store.addSet(workout.id, entryId, { weight: 80, reps: 8 });
    const updated = store.updateSet(workout.id, entryId, set.id, { done: true });
    assert.equal(updated.set.restStartedAt, null);
  });

  test("clears the rest marker when a set is unticked", () => {
    const { set } = store.addSet(workout.id, entryId, { weight: 80, reps: 8 });
    store.updateSet(workout.id, entryId, set.id, { done: true });
    const reverted = store.updateSet(workout.id, entryId, set.id, { done: false });
    assert.equal(reverted.set.restStartedAt, null);
    assert.equal(reverted.set.completedAt, undefined);
  });

  test("clamps negative weight and reps to zero", () => {
    const { set } = store.addSet(workout.id, entryId, { weight: 10, reps: 5 });
    const updated = store.updateSet(workout.id, entryId, set.id, { weight: -20, reps: -3 });
    assert.equal(updated.set.weight, 0);
    assert.equal(updated.set.reps, 0);
  });

  test("removes a set", () => {
    const { set } = store.addSet(workout.id, entryId, { weight: 80, reps: 8 });
    assert.equal(store.removeSet(workout.id, entryId, set.id), true);
    assert.equal(store.getWorkout(workout.id).exercises[0].sets.length, 0);
  });

  test("returns false when removing a set that does not exist", () => {
    assert.equal(store.removeSet(workout.id, entryId, "ghost"), false);
  });
});

// ── Exercise entries ─────────────────────────────────────────────────────

describe("exercise entries", () => {
  test("adds and removes an exercise from an active workout", () => {
    const { workout } = store.startWorkout();
    const added = store.addExerciseToWorkout(workout.id, "deadlift");
    assert.ok(added.ok);
    assert.equal(store.getWorkout(workout.id).exercises.length, 1);

    assert.equal(store.removeExerciseFromWorkout(workout.id, added.entry.id), true);
    assert.equal(store.getWorkout(workout.id).exercises.length, 0);
  });

  test("rejects operations against a missing workout", () => {
    assert.equal(store.addExerciseToWorkout("ghost", "deadlift").ok, false);
    assert.equal(store.removeExerciseFromWorkout("ghost", "x"), false);
  });
});

// ── Completing and discarding ────────────────────────────────────────────

describe("completeWorkout", () => {
  test("writes a summary with volume, sets, minutes and exercise count", () => {
    const { workout } = store.startWorkout({ exerciseIds: ["bench-press"], now: new Date(2026, 9, 15, 9) });
    const entryId = workout.exercises[0].id;
    const { set } = store.addSet(workout.id, entryId, { weight: 100, reps: 5 });
    store.updateSet(workout.id, entryId, set.id, { done: true });

    const result = store.completeWorkout(workout.id, { endedAt: new Date(2026, 9, 15, 10, 30) });
    assert.ok(result.ok);
    assert.equal(result.workout.status, "completed");
    assert.equal(result.summary.volume, 500);
    assert.equal(result.summary.sets, 1);
    assert.equal(result.summary.minutes, 90);
    assert.equal(result.summary.exercises, 1);
  });

  test("drops exercises that were never used", () => {
    const { workout } = store.startWorkout({ exerciseIds: ["bench-press", "deadlift"] });
    const benchId = workout.exercises[0].id;
    const { set } = store.addSet(workout.id, benchId, { weight: 80, reps: 8 });
    store.updateSet(workout.id, benchId, set.id, { done: true });

    const result = store.completeWorkout(workout.id);
    assert.equal(result.workout.exercises.length, 1);
    assert.equal(result.workout.exercises[0].exerciseId, "bench-press");
  });

  test("records which personal records were broken", () => {
    const first = store.startWorkout({ exerciseIds: ["bench-press"], now: new Date(2026, 9, 10, 9) }).workout;
    const firstEntry = first.exercises[0].id;
    const firstSet = store.addSet(first.id, firstEntry, { weight: 80, reps: 8 }).set;
    store.updateSet(first.id, firstEntry, firstSet.id, { done: true });
    store.completeWorkout(first.id, { endedAt: new Date(2026, 9, 10, 10) });

    const second = store.startWorkout({ exerciseIds: ["bench-press"], now: new Date(2026, 9, 14, 9) }).workout;
    const secondEntry = second.exercises[0].id;
    const secondSet = store.addSet(second.id, secondEntry, { weight: 90, reps: 8 }).set;
    store.updateSet(second.id, secondEntry, secondSet.id, { done: true });

    const result = store.completeWorkout(second.id, { endedAt: new Date(2026, 9, 14, 10) });
    assert.equal(result.summary.records.length, 1);
    assert.ok(result.summary.records[0].kinds.includes("heaviest"));
  });

  test("fails for an unknown workout id", () => {
    assert.equal(store.completeWorkout("ghost").ok, false);
  });
});

describe("discardWorkout", () => {
  test("removes an in-progress workout entirely", () => {
    const { workout } = store.startWorkout();
    assert.equal(store.discardWorkout(workout.id), true);
    assert.equal(store.workouts().length, 0);
  });

  test("will not discard an already completed workout", () => {
    const { workout } = store.startWorkout();
    store.completeWorkout(workout.id);
    assert.equal(store.discardWorkout(workout.id), false);
    assert.equal(store.workouts().length, 1);
  });
});

describe("deleteWorkout", () => {
  test("removes a completed workout from history", () => {
    const { workout } = store.startWorkout();
    store.completeWorkout(workout.id);
    assert.equal(store.deleteWorkout(workout.id), true);
    assert.equal(store.completedWorkouts().length, 0);
  });
});

// ── Ordering and templates ───────────────────────────────────────────────

describe("ordering", () => {
  test("returns workouts newest first", () => {
    const older = store.startWorkout({ name: "Older", now: new Date(2026, 9, 1, 9) }).workout;
    store.completeWorkout(older.id, { endedAt: new Date(2026, 9, 1, 10) });
    const newer = store.startWorkout({ name: "Newer", now: new Date(2026, 9, 10, 9) }).workout;
    store.completeWorkout(newer.id, { endedAt: new Date(2026, 9, 10, 10) });

    const list = store.completedWorkouts();
    assert.equal(list[0].name, "Newer");
    assert.equal(list[1].name, "Older");
  });

  test("does not mutate the stored array when sorting", () => {
    const { workout } = store.startWorkout();
    store.completeWorkout(workout.id);
    const before = store.doc.workouts[0].id;
    store.workouts();
    assert.equal(store.doc.workouts[0].id, before);
  });
});

describe("lastWorkoutTemplate", () => {
  test("returns null with no completed sessions", () => {
    assert.equal(store.lastWorkoutTemplate(), null);
  });

  test("captures the exercises and their logged values", () => {
    const { workout } = store.startWorkout({ name: "Pull", exerciseIds: ["deadlift"] });
    const entryId = workout.exercises[0].id;
    const s1 = store.addSet(workout.id, entryId, { weight: 120, reps: 5 }).set;
    store.updateSet(workout.id, entryId, s1.id, { done: true });
    const s2 = store.addSet(workout.id, entryId, { weight: 120, reps: 4 }).set;
    store.updateSet(workout.id, entryId, s2.id, { done: true });
    store.completeWorkout(workout.id);

    const template = store.lastWorkoutTemplate();
    assert.equal(template.name, "Pull");
    assert.equal(template.exercises.length, 1);
    assert.equal(template.exercises[0].sets.length, 2);
    assert.equal(template.exercises[0].sets[1].reps, 4);
  });

  test("excludes sets that were never ticked", () => {
    const { workout } = store.startWorkout({ exerciseIds: ["deadlift"] });
    const entryId = workout.exercises[0].id;
    const done = store.addSet(workout.id, entryId, { weight: 100, reps: 5 }).set;
    store.updateSet(workout.id, entryId, done.id, { done: true });
    store.addSet(workout.id, entryId, { weight: 100, reps: 5 });
    store.completeWorkout(workout.id);

    assert.equal(store.lastWorkoutTemplate().exercises[0].sets.length, 1);
  });
});

describe("previousPerformance", () => {
  test("returns null for an exercise never trained", () => {
    assert.equal(store.previousPerformance("bench-press"), null);
  });

  test("returns the last completed set across sessions", () => {
    const { workout } = store.startWorkout({ exerciseIds: ["bench-press"] });
    const entryId = workout.exercises[0].id;
    store.addSet(workout.id, entryId, { weight: 70, reps: 10 });
    const last = store.addSet(workout.id, entryId, { weight: 80, reps: 6 }).set;
    store.updateSet(workout.id, entryId, last.id, { done: true });

    assert.deepEqual(store.previousPerformance("bench-press"), { weight: 80, reps: 6 });
  });
});

// ── Custom exercises ─────────────────────────────────────────────────────

describe("custom exercises", () => {
  test("adds a custom exercise that joins the library", () => {
    const result = store.addCustomExercise({ name: "Landmine Press", muscle: "shoulders", equipment: "barbell" });
    assert.ok(result.ok);
    assert.equal(result.exercise.custom, true);
    assert.equal(store.exercises().length, 1);
  });

  test("rejects an empty name", () => {
    const result = store.addCustomExercise({ name: "   " });
    assert.equal(result.ok, false);
    assert.match(result.error, /required/i);
  });

  test("generates a stable slug id", () => {
    const result = store.addCustomExercise({ name: "Zercher Squat!" });
    assert.equal(result.exercise.id, "custom-zercher-squat");
  });

  test("gets its own id rather than colliding with a catalogue name", () => {
    const result = store.addCustomExercise({ name: "Deadlift" });
    assert.ok(result.ok);
    assert.ok(result.exercise.id.startsWith("custom-"));
  });

  test("a custom entry with a given id is resolvable by that id", () => {
    store.doc.customExercises.push({ id: "bench-press", name: "My Bench", muscle: "chest", equipment: "barbell", custom: true });
    assert.equal(store.getExercise("bench-press").name, "My Bench");
    assert.equal(store.exercises().length, 1);
  });

  test("removes a custom exercise", () => {
    const { exercise } = store.addCustomExercise({ name: "Tempo Row" });
    assert.equal(store.removeCustomExercise(exercise.id), true);
    assert.equal(store.getExercise(exercise.id), null);
  });

  test("reports false when removing an unknown exercise", () => {
    assert.equal(store.removeCustomExercise("ghost"), false);
  });

  test("keeps logging history readable after a custom exercise is removed", () => {
    const { exercise } = store.addCustomExercise({ name: "Odd Lift" });
    const { workout } = store.startWorkout({ exerciseIds: [exercise.id] });
    const s = store.addSet(workout.id, workout.exercises[0].id, { weight: 50, reps: 5 }).set;
    store.updateSet(workout.id, workout.exercises[0].id, s.id, { done: true });
    store.completeWorkout(workout.id);

    store.removeCustomExercise(exercise.id);
    assert.equal(store.getExercise(exercise.id), null);
    // The stored workout still carries its recorded numbers.
    assert.equal(store.completedWorkouts()[0].summary.volume, 250);
  });
});

// ── Settings ─────────────────────────────────────────────────────────────

describe("settings", () => {
  test("persists updates", () => {
    store.updateSettings({ units: "lb", restSeconds: 180 });
    assert.equal(new Store(storage).settings.units, "lb");
    assert.equal(new Store(storage).settings.restSeconds, 180);
  });

  test("merges partial patches without dropping other keys", () => {
    store.updateSettings({ units: "lb" });
    assert.equal(store.settings.restSeconds, 120);
    assert.equal(store.settings.autoStartRestTimer, true);
  });

  test("records the last export time for the backup reminder", () => {
    const before = Date.now();
    store.updateSettings({ lastBackupAt: new Date().toISOString() });
    assert.ok(new Date(store.settings.lastBackupAt).getTime() >= before);
    assert.equal(new Store(storage).settings.lastBackupAt, store.settings.lastBackupAt);
  });

  test("reloadFromStorage picks up a write from another tab", () => {
    const other = new Store(storage);
    const { workout } = other.startWorkout({ name: "Other tab" });
    other.completeWorkout(workout.id);

    assert.equal(store.workouts().length, 0);
    store.reloadFromStorage();

    assert.equal(store.workouts().length, 1);
    assert.equal(store.completedWorkouts()[0].name, "Other tab");
  });
});

// ── Export / import / reset ──────────────────────────────────────────────

describe("data portability", () => {
  test("exports a document that identifies the app and schema", () => {
    const parsed = JSON.parse(store.exportData());
    assert.equal(parsed.app, "IronLog");
    assert.equal(parsed.version, 1);
    assert.ok(Array.isArray(parsed.workouts));
    assert.ok(parsed.exportedAt);
  });

  test("round-trips workouts through export and import", () => {
    const { workout } = store.startWorkout({ name: "Round Trip", exerciseIds: ["bench-press"] });
    const entryId = workout.exercises[0].id;
    const s = store.addSet(workout.id, entryId, { weight: 85, reps: 6 }).set;
    store.updateSet(workout.id, entryId, s.id, { done: true });
    store.completeWorkout(workout.id);

    const payload = store.exportData();
    const fresh = new Store(memoryStorage());
    const result = fresh.importData(payload);

    assert.ok(result.ok);
    assert.equal(result.workouts, 1);
    assert.equal(fresh.completedWorkouts()[0].name, "Round Trip");
    assert.equal(fresh.completedWorkouts()[0].summary.volume, 510);
  });

  test("accepts an already-parsed object", () => {
    const result = store.importData({ workouts: [], customExercises: [] });
    assert.ok(result.ok);
  });

  test("rejects invalid JSON with a readable error", () => {
    const result = store.importData("{ broken");
    assert.equal(result.ok, false);
    assert.ok(result.error.length > 0);
  });

  test("rejects a payload with no workouts array", () => {
    const result = store.importData({ app: "IronLog" });
    assert.equal(result.ok, false);
    assert.match(result.error, /no workouts/i);
  });

  test("rejects a non-object payload", () => {
    assert.equal(store.importData(null).ok, false);
    assert.equal(store.importData(7).ok, false);
  });

  test("preserves existing settings when an export omits them", () => {
    store.updateSettings({ units: "lb" });
    store.importData({ workouts: [] });
    assert.equal(store.settings.units, "lb");
  });

  test("reset clears storage and the in-memory document", () => {
    const { workout } = store.startWorkout();
    store.completeWorkout(workout.id);
    store.addCustomExercise({ name: "Tempo Row" });

    store.reset();
    assert.equal(store.workouts().length, 0);
    assert.equal(store.doc.customExercises.length, 0);
    assert.equal(storage.getItem(STORAGE_KEY), null);
  });
});

// ── Persistence failure handling ─────────────────────────────────────────

describe("storage failure handling", () => {
  test("reports a write failure without crashing the session", () => {
    const failing = memoryStorage();
    failing.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    const broken = new Store(failing);
    const result = broken.startWorkout({ name: "Still Works" });

    assert.ok(result.ok);
    assert.equal(broken.lastError, "QuotaExceededError");
    assert.equal(broken.workouts().length, 1);
  });
});

// ── Subscriptions ────────────────────────────────────────────────────────

describe("subscribe", () => {
  test("notifies listeners on commit", () => {
    const events = [];
    store.subscribe((event) => events.push(event.type));
    store.startWorkout({ name: "Observed" });
    assert.ok(events.includes("workout:start"));
  });

  test("stops notifying after unsubscribe", () => {
    const events = [];
    const off = store.subscribe((event) => events.push(event.type));
    off();
    store.startWorkout();
    assert.equal(events.length, 0);
  });

  test("isolates a throwing listener from the store", () => {
    store.subscribe(() => {
      throw new Error("listener bug");
    });
    const result = store.startWorkout({ name: "Resilient" });
    assert.ok(result.ok);
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────

describe("defaultWorkoutName", () => {
  test("names each weekday", () => {
    // 2026-10-11 is a Sunday, 10-12 a Monday, 10-16 a Friday, 10-17 a Saturday.
    assert.equal(defaultWorkoutName(new Date(2026, 9, 11)), "Sunday Session");
    assert.equal(defaultWorkoutName(new Date(2026, 9, 12)), "Monday Push");
    assert.equal(defaultWorkoutName(new Date(2026, 9, 16)), "Friday Lower");
    assert.equal(defaultWorkoutName(new Date(2026, 9, 17)), "Saturday Full Body");
  });
});

describe("memoryStorage", () => {
  test("behaves like the subset of Storage the app uses", () => {
    const mem = memoryStorage({ a: "1" });
    assert.equal(mem.getItem("a"), "1");
    assert.equal(mem.getItem("missing"), null);
    mem.setItem("b", 2);
    assert.equal(mem.getItem("b"), "2");
    mem.removeItem("a");
    assert.equal(mem.getItem("a"), null);
  });
});
