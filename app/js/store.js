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
      // Set when the user exports a backup; surfaced in Settings so a local-only
      // log never drifts for months without one.
      lastBackupAt: null,
      // Profile identity. Both are cosmetic: nothing in this app leaves the
      // browser, so there is no account to back them.
      displayName: "",
      handle: "",
    },
    // Bodyweight and measurement entries, newest first. Kept beside workouts
    // rather than inside settings because they are data the user enters, not a
    // preference, and they are exported with the rest of the log.
    measurements: [],
    createdAt: new Date().toISOString(),
  };
}

export class Store {
  /**
   * @param {Storage} [storage] defaults to window.localStorage when available
   */
  constructor(storage) {
    /** True when the log lives only in memory and will vanish on close. */
    this.volatile = false;
    if (storage) {
      this.storage = storage;
    } else {
      try {
        // Access can itself throw in locked-down or private contexts, so the
        // fallback has to wrap the property read, not just the write.
        if (globalThis.localStorage) {
          this.storage = globalThis.localStorage;
        } else {
          this.storage = memoryStorage();
          this.volatile = true;
        }
      } catch {
        this.storage = memoryStorage();
        this.volatile = true;
      }
    }
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
        measurements: Array.isArray(parsed.measurements) ? parsed.measurements : [],
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
   * Rebuilding a 1,316-entry index on every call is wasteful when the logger
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

  // ── Profile and measurements ──────────────────────────────────────────────

  /**
   * Cosmetic identity shown at the top of the profile.
   *
   * Falls back to "Athlete" and an empty handle, because a heading that reads
   * "undefined" is worse than a placeholder. Nothing here is validated as a
   * username: there is no server to claim one against.
   */
  profile() {
    const settings = this.doc.settings ?? {};
    return {
      displayName: String(settings.displayName ?? "").trim(),
      handle: String(settings.handle ?? "").trim().replace(/^@/, ""),
    };
  }

  setProfile(patch = {}) {
    const next = { ...this.profile(), ...patch };
    this.doc.settings.displayName = String(next.displayName ?? "").trim().slice(0, 48);
    this.doc.settings.handle = String(next.handle ?? "")
      .trim()
      .replace(/^@/, "")
      .replace(/[^a-zA-Z0-9_.-]/g, "")
      .slice(0, 32);
    this.#commit("profile:update");
    return this.profile();
  }

  /** Bodyweight entries, newest date first. */
  measurements() {
    return [...(this.doc.measurements ?? [])].sort((a, b) =>
      String(b.date).localeCompare(String(a.date)),
    );
  }

  latestMeasurement() {
    return this.measurements()[0] ?? null;
  }

  /**
   * Record a bodyweight entry.
   *
   * One entry per date: weighing in twice in a day is a correction, not a data
   * point, so the second write replaces the first rather than charting a
   * two-kilo swing that never happened.
   */
  addMeasurement({ date, weight, note = "", now = new Date() } = {}) {
    const day = localDateKey(date ?? now);
    const value = Number(weight);
    if (!day) return { ok: false, error: "Pick a date." };
    if (!Number.isFinite(value) || value <= 0) return { ok: false, error: "Enter a bodyweight." };
    if (value > 1000) return { ok: false, error: "That weight looks wrong." };

    const list = this.doc.measurements ?? (this.doc.measurements = []);
    const existing = list.find((m) => m.date === day);
    if (existing) {
      existing.weight = value;
      existing.note = String(note).trim().slice(0, 120);
    } else {
      list.push({
        id: `m_${day}_${Math.random().toString(36).slice(2, 8)}`,
        date: day,
        weight: value,
        note: String(note).trim().slice(0, 120),
      });
    }
    this.#commit("measurement:add");
    return { ok: true, replaced: Boolean(existing) };
  }

  deleteMeasurement(id) {
    const before = this.doc.measurements?.length ?? 0;
    this.doc.measurements = (this.doc.measurements ?? []).filter((m) => m.id !== id);
    if (this.doc.measurements.length === before) return { ok: false, error: "Entry not found." };
    this.#commit("measurement:delete");
    return { ok: true };
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
        measurements: Array.isArray(parsed.measurements) ? parsed.measurements : [],
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

  /**
   * Re-read the persisted document after another tab wrote to the same key.
   *
   * localStorage is last-write-wins across tabs; without this, two open tabs
   * silently diverge and the next write from the stale tab discards the other
   * tab's workout. Main wires this to the window `storage` event.
   */
  reloadFromStorage() {
    this.doc = this.#read();
    this._indexCache = null;
    this._indexCacheKey = null;
    this.#emit({ type: "data:reload", persisted: true });
    return this.doc;
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
