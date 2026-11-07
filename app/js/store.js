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
    },
    createdAt: new Date().toISOString(),
  };
}

// ── Import sanitisation ─────────────────────────────────────────────────────
//
// A backup is a file a user can be sent, not a trusted in-memory object. Every
// imported value is coerced to the type the views and maths expect, so a
// hostile JSON file cannot smuggle markup into a numeric cell, point the
// language loader at another path, or hand the timer a non-numeric default.

const IMPORT_LIMITS = {
  workouts: 10_000,
  exercises: 100,
  sets: 200,
  records: 500,
  text: 4_000,
};
const SETTING_UNITS = new Set(["kg", "lb"]);
const SETTING_THEMES = new Set(["light", "dark", "auto"]);
const SETTING_LANGUAGES = new Set(["en", "es", "de", "fr", "it", "pl", "ru", "tr", "zh", "hi", "ko"]);

function importString(value, max = 200) {
  if (value === null || value === undefined) return "";
  return String(value).slice(0, max);
}

function importNumber(value, { min = 0, max = 1_000_000, integer = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const clamped = Math.min(max, Math.max(min, n));
  return integer ? Math.round(clamped) : clamped;
}

function importDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function importId(value, prefix, index, seen) {
  const base = importString(value, 120).trim() || `${prefix}_${index}`;
  let id = base;
  let suffix = 1;
  while (seen.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  seen.add(id);
  return id;
}

function importSet(raw, index, seen) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return {
    id: importId(raw.id, "s_import", index, seen),
    weight: importNumber(raw.weight, { max: 100_000 }),
    reps: importNumber(raw.reps, { max: 100_000, integer: true }),
    done: raw.done === true || raw.done === 1,
    restStartedAt: importDate(raw.restStartedAt),
    completedAt: importDate(raw.completedAt),
    createdAt: importDate(raw.createdAt) ?? new Date().toISOString(),
  };
}

function importEntry(raw, index, seenEntries) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const seenSets = new Set();
  const sets = (Array.isArray(raw.sets) ? raw.sets.slice(0, IMPORT_LIMITS.sets) : [])
    .map((set, i) => importSet(set, i, seenSets))
    .filter(Boolean);
  return {
    id: importId(raw.id, "e_import", index, seenEntries),
    exerciseId: importString(raw.exerciseId, 160),
    sets,
  };
}

function importSummary(raw, exerciseCount) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const records = (Array.isArray(raw.records) ? raw.records.slice(0, IMPORT_LIMITS.records) : [])
    .map((record) => {
      if (!record || typeof record !== "object" || Array.isArray(record)) return null;
      return {
        exerciseId: importString(record.exerciseId, 160),
        name: importString(record.name, 160),
        kinds: (Array.isArray(record.kinds) ? record.kinds.slice(0, 10) : [])
          .map((kind) => importString(kind, 40))
          .filter(Boolean),
      };
    })
    .filter(Boolean);
  return {
    volume: importNumber(raw.volume, { max: 1_000_000_000 }),
    sets: importNumber(raw.sets, { max: 100_000, integer: true }),
    minutes: importNumber(raw.minutes, { max: 100_000, integer: true }),
    exercises:
      raw.exercises === undefined
        ? Math.min(exerciseCount, IMPORT_LIMITS.exercises)
        : importNumber(raw.exercises, { max: 100_000, integer: true }),
    records,
  };
}

function importWorkout(raw, index, seenWorkouts) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const seenEntries = new Set();
  const exercises = (Array.isArray(raw.exercises) ? raw.exercises.slice(0, IMPORT_LIMITS.exercises) : [])
    .map((entry, i) => importEntry(entry, i, seenEntries))
    .filter(Boolean);
  const startedAt =
    importDate(raw.startedAt) ?? importDate(raw.endedAt) ?? new Date().toISOString();
  const status = raw.status === "active" ? "active" : "completed";
  const workout = {
    id: importId(raw.id, "w_import", index, seenWorkouts),
    name: importString(raw.name, 80).trim() || "Imported workout",
    status,
    startedAt,
    endedAt:
      status === "active" ? importDate(raw.endedAt) : (importDate(raw.endedAt) ?? startedAt),
    notes: importString(raw.notes, IMPORT_LIMITS.text),
    exercises,
  };
  const summary = importSummary(raw.summary, exercises.length);
  if (summary) workout.summary = summary;
  return workout;
}

function importCustomExercise(raw, index, seen) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const name = importString(raw.name, 120).trim();
  if (!name) return null;
  return {
    id: importId(raw.id ?? makeExerciseId(name), "custom_import", index, seen),
    name,
    muscle: importString(raw.muscle, 40).trim() || "other",
    equipment: importString(raw.equipment, 60).trim() || "other",
    note: importString(raw.note, 600),
    custom: true,
    createdAt: importDate(raw.createdAt) ?? new Date().toISOString(),
  };
}

function importSettings(patch, fallback) {
  const merged = {
    ...fallback,
    ...(patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {}),
  };
  return {
    units: SETTING_UNITS.has(merged.units) ? merged.units : fallback.units,
    restSeconds:
      importNumber(merged.restSeconds, { min: 0, max: 3600, integer: true }) ||
      fallback.restSeconds,
    autoStartRestTimer:
      typeof merged.autoStartRestTimer === "boolean"
        ? merged.autoStartRestTimer
        : fallback.autoStartRestTimer,
    theme: SETTING_THEMES.has(merged.theme) ? merged.theme : fallback.theme,
    instructionLanguage: SETTING_LANGUAGES.has(merged.instructionLanguage)
      ? merged.instructionLanguage
      : fallback.instructionLanguage,
    lastBackupAt:
      merged.lastBackupAt === null
        ? null
        : (importDate(merged.lastBackupAt) ?? fallback.lastBackupAt ?? null),
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
    this._indexCache = null;
    this._indexCacheKey = null;
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
        // Even a same-origin document can be old or hand-edited. Normalise the
        // preference values before any view or loader reads them.
        settings: importSettings(parsed.settings ?? {}, base.settings),
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
    // A duplicate slug must get a fresh id even when the collision is with
    // another custom entry; otherwise two rows share an id and updating one
    // silently edits the other.
    if (existing[id]) {
      const suffix = Date.now().toString(36);
      id = `${id}-${suffix}`;
      let n = 2;
      while (existing[id]) {
        id = `${makeExerciseId(trimmed)}-${suffix}-${n}`;
        n += 1;
      }
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
    this._indexCache = null;
    this._indexCacheKey = null;
    this.#commit("exercise:add");
    return { ok: true, exercise };
  }

  removeCustomExercise(id) {
    const before = this.doc.customExercises.length;
    this.doc.customExercises = this.doc.customExercises.filter((e) => e.id !== id);
    const removed = this.doc.customExercises.length !== before;
    if (removed) {
      this._indexCache = null;
      this._indexCacheKey = null;
      this.#commit("exercise:remove");
    }
    return removed;
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  get settings() {
    return this.doc.settings;
  }

  updateSettings(patch) {
    this.doc.settings = importSettings(patch, this.doc.settings);
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
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, error: "Not a valid IronLog export." };
      }
      if (!Array.isArray(parsed.workouts)) {
        return { ok: false, error: "Export has no workouts array." };
      }
      const base = emptyDocument();
      const seenWorkouts = new Set();
      const seenCustom = new Set();
      const workouts = parsed.workouts
        .slice(0, IMPORT_LIMITS.workouts)
        .map((workout, index) => importWorkout(workout, index, seenWorkouts))
        .filter(Boolean);
      const customExercises = (Array.isArray(parsed.customExercises) ? parsed.customExercises : [])
        .slice(0, IMPORT_LIMITS.workouts)
        .map((exercise, index) => importCustomExercise(exercise, index, seenCustom))
        .filter(Boolean);
      // Layer the import over the current settings, then the shipped
      // defaults, so a partial export never silently resets preferences.
      const currentSettings = importSettings(this.doc.settings, base.settings);
      this.doc = {
        version: SCHEMA_VERSION,
        workouts,
        customExercises,
        settings: importSettings(parsed.settings, currentSettings),
        createdAt: importDate(parsed.createdAt) ?? base.createdAt,
      };
      this._indexCache = null;
      this._indexCacheKey = null;
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
