/**
 * IronLog — persistence layer.
 *
 * Writes to a single versioned localStorage document. The storage object is
 * injected so the whole module runs in Node against a fake store (see tests/).
 * Nothing here touches the DOM.
 */

import { EXERCISE_INDEX, allExercises, makeExerciseId } from "./exercises.js";
import { loadCatalogue } from "./catalogue.js";
import {
  estimatedOneRepMax,
  localDateKey,
  personalRecords,
  recordsBrokenBy,
  workoutDurationMinutes,
  workoutSetCount,
  workoutVolume,
} from "./stats.js";

export const STORAGE_KEY = "ironlog.v1";
export const SCHEMA_VERSION = 1;

/** Minimal in-memory storage, used for tests and as a private-mode fallback. */
export function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _dump: () => Object.fromEntries(map),
  };
}

function emptyDocument() {
  return {
    version: SCHEMA_VERSION,
    workouts: [],
    customExercises: [],
    settings: {
      units: "kg",
      restSeconds: 120,
      autoStartRestTimer: true,
      // Bright neutral surfaces are the default; dark and system appearances
      // are equally supported and the choice is persisted per browser.
      theme: "light",
      instructionLanguage: "en",
    },
    createdAt: new Date().toISOString(),
  };
}

export class Store {
  /**
   * @param {Storage} [storage] defaults to window.localStorage when available
   */
  constructor(storage) {
    this.storage =
      storage ??
      (typeof globalThis !== "undefined" && globalThis.localStorage
        ? globalThis.localStorage
        : memoryStorage());
    this.doc = this.#read();
    this.listeners = new Set();

    /**
     * External catalogue state. Empty until loadCatalogue() resolves, so every
     * code path that reads exercises() works before the catalogue loads.
     */
    this.catalogue = [];
    this.catalogueMeta = null;
    this.catalogueState = "idle";
    this.catalogueBase = "";
  }

  /**
   * Fetch and merge the external exercise catalogue.
   *
   * Resolves to true when the catalogue became available. Never throws: a
   * missing or malformed payload leaves the library empty and sets
   * catalogueState to "unavailable" so the UI can say so honestly.
   *
   * @param {string} [base] directory holding app/data, relative to the page
   */
  async loadCatalogue(base = "") {
    if (this.catalogueState === "loading") return false;
    this.catalogueState = "loading";
    this.catalogueBase = base;
    this.#emit({ type: "catalogue:loading", persisted: true });

    const result = await loadCatalogue(base);
    if (!result.available) {
      this.catalogueState = "unavailable";
      this.#emit({ type: "catalogue:unavailable", persisted: true });
      return false;
    }

    this.catalogue = result.exercises;
    this.catalogueMeta = result.meta;
    this.catalogueState = "ready";
    this.#emit({
      type: "catalogue:ready",
      persisted: true,
      count: result.exercises.length,
      collisions: this.catalogueCollisions,
    });
    return true;
  }

  /** True once the full catalogue is merged in. */
  get catalogueReady() {
    return this.catalogueState === "ready";
  }

  #read() {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return emptyDocument();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return emptyDocument();
      const base = emptyDocument();
      return {
        ...base,
        ...parsed,
        version: SCHEMA_VERSION,
        workouts: Array.isArray(parsed.workouts) ? parsed.workouts : [],
        customExercises: Array.isArray(parsed.customExercises) ? parsed.customExercises : [],
        settings: { ...base.settings, ...(parsed.settings ?? {}) },
      };
    } catch {
      // Corrupt or unreadable payload: start clean rather than crash the app.
      return emptyDocument();
    }
  }

  #write() {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.doc));
    } catch (error) {
      // Quota exceeded or storage disabled — surface it, keep running in memory.
      this.lastError = error instanceof Error ? error.message : String(error);
      return false;
    }
    this.lastError = null;
    return true;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  #emit(event) {
    for (const listener of this.listeners) {
      try {
        listener(event, this);
      } catch {
        /* a broken listener must not break the store */
      }
    }
  }

  #commit(event) {
    const ok = this.#write();
    this.#emit({ type: event, persisted: ok });
    return ok;
  }

  // ── Exercises ─────────────────────────────────────────────────────────────

  exercises() {
    return allExercises(this.doc.customExercises, this.catalogue);
  }

  exerciseIndex() {
    if (this._indexCache && this._indexCacheKey === this.#indexKey()) return this._indexCache;
    const index = Object.fromEntries(this.exercises().map((e) => [e.id, e]));
    this._indexCache = index;
    this._indexCacheKey = this.#indexKey();
    return index;
  }

  /**
   * Rebuilding a ~1,900-entry index on every call is wasteful when the logger
   * asks for it per render, so it is memoised against the inputs that can
   * change it: catalogue state plus the custom-exercise count.
   */
  #indexKey() {
    return `${this.catalogueState}:${this.catalogue.length}:${this.doc.customExercises.length}`;
  }

  getExercise(id) {
    return this.exerciseIndex()[id] ?? EXERCISE_INDEX[id] ?? null;
  }

  addCustomExercise({ name, muscle, equipment, note }) {
    const trimmed = String(name ?? "").trim();
    if (trimmed.length === 0) return { ok: false, error: "Name is required." };
    let id = makeExerciseId(trimmed);
    const existing = this.exerciseIndex();
    if (existing[id] && !existing[id].custom) {
      id = `${id}-${Date.now().toString(36)}`;
    }
    const exercise = {
      id,
      name: trimmed,
      muscle: muscle ?? "other",
      equipment: equipment ?? "other",
      note: note ?? "",
      custom: true,
      createdAt: new Date().toISOString(),
    };
    this.doc.customExercises.push(exercise);
    this.#commit("exercise:add");
    return { ok: true, exercise };
  }

  removeCustomExercise(id) {
    const before = this.doc.customExercises.length;
    this.doc.customExercises = this.doc.customExercises.filter((e) => e.id !== id);
    const removed = this.doc.customExercises.length !== before;
    if (removed) this.#commit("exercise:remove");
    return removed;
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  get settings() {
    return this.doc.settings;
  }

  updateSettings(patch) {
    this.doc.settings = { ...this.doc.settings, ...patch };
    this.#commit("settings:update");
    return this.doc.settings;
  }

  // ── Workouts ──────────────────────────────────────────────────────────────

  /** Every workout, newest first. */
  workouts() {
    return [...this.doc.workouts].sort(
      (a, b) => new Date(b.startedAt) - new Date(a.startedAt),
    );
  }

  /** The single in-progress workout, if any. */
  activeWorkout() {
    return this.doc.workouts.find((w) => w.status === "active") ?? null;
  }

  completedWorkouts() {
    return this.workouts().filter((w) => w.status === "completed");
  }

  getWorkout(id) {
    return this.doc.workouts.find((w) => w.id === id) ?? null;
  }

  /** Start a new workout. Only one can be active at a time. */
  startWorkout({ name = "", exerciseIds = [], now = new Date() } = {}) {
    const existing = this.activeWorkout();
    if (existing) return { ok: false, error: "A workout is already in progress.", workout: existing };

    const workout = {
      id: `w_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name: String(name).trim() || defaultWorkoutName(now),
      status: "active",
      startedAt: now.toISOString(),
      endedAt: null,
      notes: "",
      exercises: exerciseIds.map((exerciseId, index) => makeExerciseEntry(exerciseId, index)),
    };
    this.doc.workouts.push(workout);
    this.#commit("workout:start");
    return { ok: true, workout };
  }

  updateWorkout(id, patch) {
    const workout = this.getWorkout(id);
    if (!workout) return { ok: false, error: "Workout not found." };
    Object.assign(workout, patch);
    this.#commit("workout:update");
    return { ok: true, workout };
  }

  addExerciseToWorkout(workoutId, exerciseId) {
    const workout = this.getWorkout(workoutId);
    if (!workout) return { ok: false, error: "Workout not found." };
    const entry = makeExerciseEntry(exerciseId, workout.exercises.length);
    workout.exercises.push(entry);
    this.#commit("workout:exercise:add");
    return { ok: true, entry };
  }

  removeExerciseFromWorkout(workoutId, entryId) {
    const workout = this.getWorkout(workoutId);
    if (!workout) return false;
    const before = workout.exercises.length;
    workout.exercises = workout.exercises.filter((e) => e.id !== entryId);
    const removed = workout.exercises.length !== before;
    if (removed) this.#commit("workout:exercise:remove");
    return removed;
  }

  /**
   * Add a set to an exercise entry. When `fromPrevious` is true and no explicit
   * weight/reps are given, the set inherits the last logged values for that
   * exercise so repeat sets are one tap.
   */
  addSet(workoutId, entryId, { weight, reps, fromPrevious = false } = {}) {
    const workout = this.getWorkout(workoutId);
    const entry = workout?.exercises.find((e) => e.id === entryId);
    if (!entry) return { ok: false, error: "Set target not found." };

    let w = weight;
    let r = reps;
    if (fromPrevious && (w === undefined || r === undefined)) {
      const previous = this.#lastLoggedSet(entry.exerciseId, workout.id);
      w = w ?? previous?.weight ?? 0;
      r = r ?? previous?.reps ?? 0;
    }

    const set = {
      id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      weight: Number(w) || 0,
      reps: Number(r) || 0,
      done: false,
      restStartedAt: null,
      createdAt: new Date().toISOString(),
    };
    entry.sets.push(set);
    this.#commit("set:add");
    return { ok: true, set };
  }

  updateSet(workoutId, entryId, setId, patch) {
    const entry = this.getWorkout(workoutId)?.exercises.find((e) => e.id === entryId);
    const set = entry?.sets.find((s) => s.id === setId);
    if (!set) return { ok: false, error: "Set not found." };

    if (patch.weight !== undefined) set.weight = Math.max(0, Number(patch.weight) || 0);
    if (patch.reps !== undefined) set.reps = Math.max(0, Number(patch.reps) || 0);
    if (patch.done !== undefined) {
      set.done = Boolean(patch.done);
      if (set.done) {
        set.completedAt = new Date().toISOString();
        if (this.doc.settings.autoStartRestTimer) set.restStartedAt = set.completedAt;
      } else {
        delete set.completedAt;
        set.restStartedAt = null;
      }
    }
    this.#commit("set:update");
    return { ok: true, set };
  }

  removeSet(workoutId, entryId, setId) {
    const entry = this.getWorkout(workoutId)?.exercises.find((e) => e.id === entryId);
    if (!entry) return false;
    const before = entry.sets.length;
    entry.sets = entry.sets.filter((s) => s.id !== setId);
    const removed = entry.sets.length !== before;
    if (removed) this.#commit("set:remove");
    return removed;
  }

  /** Most recent completed set for an exercise, from this or earlier workouts. */
  #lastLoggedSet(exerciseId, excludeWorkoutId = null) {
    const ordered = this.workouts();
    for (const w of ordered) {
      for (const entry of w.exercises ?? []) {
        if (entry.exerciseId !== exerciseId) continue;
        const done = (entry.sets ?? []).filter((s) => s.done);
        if (done.length > 0) return done[done.length - 1];
      }
    }
    return null;
  }

  /** Values shown as placeholder hints when adding a new set. */
  previousPerformance(exerciseId) {
    const set = this.#lastLoggedSet(exerciseId);
    return set ? { weight: set.weight, reps: set.reps } : null;
  }

  /**
   * Finish a workout: stamps endedAt, computes derived totals, records which
   * personal records it broke, and marks it completed.
   */
  completeWorkout(workoutId, { endedAt = new Date() } = {}) {
    const workout = this.getWorkout(workoutId);
    if (!workout) return { ok: false, error: "Workout not found." };

    const completedBefore = this.completedWorkouts();
    const index = this.exerciseIndex();

    workout.endedAt = endedAt.toISOString();
    workout.status = "completed";
    // Drop empty exercises so history stays meaningful.
    workout.exercises = workout.exercises.filter(
      (e) => (e.sets ?? []).some((s) => s.done || s.weight > 0 || s.reps > 0),
    );

    const summary = {
      volume: Math.round(workoutVolume(workout)),
      sets: workoutSetCount(workout),
      minutes: workoutDurationMinutes(workout),
      exercises: workout.exercises.length,
      records: recordsBrokenBy(workout, completedBefore, index),
    };
    workout.summary = summary;

    this.#commit("workout:complete");
    return { ok: true, workout, summary };
  }

  /** Abandon an in-progress workout without saving it. */
  discardWorkout(workoutId) {
    const before = this.doc.workouts.length;
    this.doc.workouts = this.doc.workouts.filter(
      (w) => !(w.id === workoutId && w.status === "active"),
    );
    const removed = this.doc.workouts.length !== before;
    if (removed) this.#commit("workout:discard");
    return removed;
  }

  deleteWorkout(workoutId) {
    const before = this.doc.workouts.length;
    this.doc.workouts = this.doc.workouts.filter((w) => w.id !== workoutId);
    const removed = this.doc.workouts.length !== before;
    if (removed) this.#commit("workout:delete");
    return removed;
  }

  // ── Derived read models ───────────────────────────────────────────────────

  personalRecords() {
    return personalRecords(this.completedWorkouts(), this.exerciseIndex());
  }

  /**
   * Everything needed to prefill a new workout from the last session:
   * the same exercises with the same set count and previous values.
   */
  lastWorkoutTemplate() {
    const last = this.completedWorkouts()[0];
    if (!last) return null;
    return {
      name: last.name,
      exercises: last.exercises
        // Only sets the user actually completed form a meaningful template;
        // unticked rows were abandoned, not trained.
        .map((e) => ({
          exerciseId: e.exerciseId,
          sets: (e.sets ?? []).filter((s) => s.done).map((s) => ({ weight: s.weight, reps: s.reps })),
        }))
        .filter((e) => e.sets.length > 0),
    };
  }

  exportData() {
    return JSON.stringify(
      { app: "IronLog", version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), ...this.doc },
      null,
      2,
    );
  }

  importData(json) {
    try {
      const parsed = typeof json === "string" ? JSON.parse(json) : json;
      if (!parsed || typeof parsed !== "object") return { ok: false, error: "Not a valid IronLog export." };
      if (!Array.isArray(parsed.workouts)) return { ok: false, error: "Export has no workouts array." };
      const base = emptyDocument();
      this.doc = {
        ...base,
        ...parsed,
        version: SCHEMA_VERSION,
        workouts: parsed.workouts,
        customExercises: Array.isArray(parsed.customExercises) ? parsed.customExercises : [],
        // Layer the import over the current settings, then the shipped
        // defaults, so a partial export never silently resets preferences.
        settings: { ...base.settings, ...this.doc.settings, ...(parsed.settings ?? {}) },
      };
      this.#commit("data:import");
      return { ok: true, workouts: this.doc.workouts.length };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  reset() {
    this.doc = emptyDocument();
    try {
      this.storage.removeItem(STORAGE_KEY);
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
    // Deliberately emits without writing: committing here would persist a
    // fresh document and undo the removal the user just asked for.
    this.#emit({ type: "data:reset", persisted: this.lastError === null });
  }
}

/** A fresh exercise entry inside a workout, seeded with one empty set. */
export function makeExerciseEntry(exerciseId, index) {
  return {
    id: `e_${Date.now().toString(36)}_${index}_${Math.random().toString(36).slice(2, 6)}`,
    exerciseId,
    sets: [],
  };
}

/** "Push Day", "Legs", etc. from the weekday, as a sensible default title. */
export function defaultWorkoutName(date = new Date()) {
  const key = localDateKey(date);
  if (!key) return "Workout";
  const weekday = date.getDay();
  const names = [
    "Sunday Session",
    "Monday Push",
    "Tuesday Pull",
    "Wednesday Legs",
    "Thursday Upper",
    "Friday Lower",
    "Saturday Full Body",
  ];
  return names[weekday] ?? "Workout";
}
