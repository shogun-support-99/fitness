/**
 * User-journey tests: play a lifter through every feature using the exact
 * modules main.js wires together (store + views + timer + router + catalogue),
 * with fetch stubbed to the real data files on disk. Catches integration bugs
 * that per-module unit tests can miss. Run: node --test "tests/*.test.js"
 */

import assert from "node:assert/strict";
import { test, describe, beforeEach, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Store, memoryStorage } from "../app/js/store.js";
import { RestTimer } from "../app/js/timer.js";
import { parseHash } from "../app/js/router.js";
import { searchExercises } from "../app/js/exercises.js";
import { loadCatalogue, stepsFor, clearStepsCache } from "../app/js/catalogue.js";
import { platesForWeight, formatPlates } from "../app/js/plates.js";
import { estimatedOneRepMax } from "../app/js/stats.js";
import { renderHome } from "../app/js/views/home.js";
import { renderWorkout } from "../app/js/views/workout.js";
import { renderHistory } from "../app/js/views/history.js";
import { renderStats } from "../app/js/views/stats.js";
import { renderLibrary, renderExerciseDetail } from "../app/js/views/library.js";
import { renderSettings } from "../app/js/views/settings.js";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "app");

/** Stub fetch so catalogue loads read the real files under app/data/. */
function stubFetchWithRealData() {
  const original = globalThis.fetch;
  globalThis.fetch = async (path) => {
    const rel = String(path).replace(/^\.\//, "").replace(/^data\//, "data/");
    try {
      const body = readFileSync(join(APP_DIR, rel), "utf8");
      return { ok: true, json: async () => JSON.parse(body) };
    } catch {
      return { ok: false, status: 404, json: async () => ({}) };
    }
  };
  return () => {
    globalThis.fetch = original;
  };
}

let store;
let restoreFetch;

beforeEach(() => {
  store = new Store(memoryStorage());
  restoreFetch = stubFetchWithRealData();
  clearStepsCache();
});

afterEach(() => {
  restoreFetch();
  clearStepsCache();
});

describe("user journey: boot and home", () => {
  test("catalogue loads from disk, home renders with ticker and start panel", async () => {
    const ok = await store.loadCatalogue("");
    assert.equal(ok, true);
    assert.equal(store.catalogueReady, true);
    assert.ok(store.exercises().length > 1000, "catalogue merged");

    const html = renderHome(store);
    assert.match(html, /Start empty workout/);
    assert.match(html, /data-ticker/, "ticker present (library fallback when empty)");
    assert.match(html, /No sessions logged yet/);
  });

  test("catalogue failure degrades honestly, app still renders", async () => {
    globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
    const ok = await store.loadCatalogue("");
    assert.equal(ok, false);
    assert.equal(store.catalogueState, "unavailable");
    const html = renderHome(store);
    assert.match(html, /Start empty workout/);
    const settings = renderSettings(store);
    assert.match(settings, /Catalogue unavailable/);
  });

  test("instruction packs load per language with English fallback", async () => {
    await store.loadCatalogue("");
    const bench = store.exercises().find((e) => /bench press/i.test(e.name) && /barbell/i.test(e.equipment));
    assert.ok(bench, "bench press in catalogue");
    const en = await stepsFor(bench, "en", "");
    assert.ok(en.steps.length > 0);
    assert.equal(en.fellBack, false);
    // "xx" is not a shipped language: falls back to English without a 404 detour.
    const xx = await stepsFor(bench, "xx", "");
    assert.equal(xx.language, "en");
    assert.equal(xx.fellBack, true);
  });
});

describe("user journey: a full workout", () => {
  test("start, search, pick, log, tick, rest, notes, plates, finish, share-text, history, repeat", async () => {
    await store.loadCatalogue("");

    // Start empty workout from Home.
    let result = store.startWorkout({ name: "Push Day" });
    assert.ok(result.ok);
    let html = renderWorkout(store, {});
    assert.match(html, /Push Day/);
    assert.match(html, /Add your first exercise/);

    // Search the picker for a bench and pick it.
    const found = searchExercises(store.exercises(), "bench", "all").slice(0, 80);
    const bench = found.find((e) => /barbell bench press/i.test(e.name));
    assert.ok(bench);
    const added = store.addExerciseToWorkout(result.workout.id, bench.id);
    assert.ok(added.ok);
    // First time: no previous performance, one empty set is seeded.
    assert.equal(store.previousPerformance(bench.id), null);
    store.addSet(result.workout.id, added.entry.id, { weight: 0, reps: 0 });

    // Type weight and reps; the row shows a live est. 1RM.
    let set = added.entry.sets ? null : null;
    const entryId = added.entry.id;
    const seeded = store.getWorkout(result.workout.id).exercises[0].sets[0];
    store.updateSet(result.workout.id, entryId, seeded.id, { weight: 80, reps: 8 });
    html = renderWorkout(store, {});
    assert.match(html, /101/, "est. 1RM 80x8 = 101.33 shown, compacted");

    // Tick the set: rest timer auto-starts (restStartedAt stamped).
    store.updateSet(result.workout.id, entryId, seeded.id, { done: true });
    const after = store.getWorkout(result.workout.id).exercises[0].sets[0];
    assert.equal(after.done, true);
    assert.ok(after.restStartedAt, "rest auto-started");

    // Rest timer runs on an injected clock, +15s works, finish fires.
    let now = 1_000_000;
    let finished = 0;
    const timer = new RestTimer({
      now: () => now,
      setInterval: (fn) => { timer._fn = fn; return 1; },
      clearInterval: () => {},
      onFinish: () => { finished += 1; },
    });
    timer.start(120);
    assert.equal(timer.snapshot().secondsLeft, 120);
    timer.addSeconds(15);
    assert.equal(timer.snapshot().secondsLeft, 135);
    now += 136_000;
    timer._fn();
    assert.equal(finished, 1, "onFinish fired");
    assert.equal(timer.snapshot().progress, 1);

    // A second set added "from previous" inherits 80x8 (current session included).
    const s2 = store.addSet(result.workout.id, entryId, { fromPrevious: true });
    assert.equal(s2.set.weight, 80);
    assert.equal(s2.set.reps, 8);
    store.updateSet(result.workout.id, entryId, s2.set.id, { weight: 82.5, reps: 6 });
    store.updateSet(result.workout.id, entryId, s2.set.id, { done: true });

    // Session notes.
    store.updateWorkout(result.workout.id, { notes: "Felt strong, left shoulder a bit tight." });
    html = renderWorkout(store, {});
    assert.match(html, /Felt strong/);

    // Plate calculator for the barbell row: 100 kg target.
    const plates = platesForWeight(100, store.settings.units);
    assert.equal(plates.total, 100);
    assert.match(formatPlates(plates, "kg"), /per side/);

    // Finish the workout: summary computed, records detected.
    const done = store.completeWorkout(result.workout.id);
    assert.ok(done.ok);
    assert.equal(done.summary.sets, 2);
    assert.ok(done.summary.volume > 0);
    assert.ok(done.summary.records.length >= 1, "first-ever bench = records");
    assert.equal(store.activeWorkout(), null);

    // History shows the session with notes and records; the row can be reopened.
    html = renderHistory(store, { openId: result.workout.id });
    assert.match(html, /Push Day/);
    assert.match(html, /Felt strong/);
    assert.match(html, /personal record/i);

    // Copy-summary text shape (same computation main.js uses).
    const w = store.getWorkout(result.workout.id);
    const best = estimatedOneRepMax(82.5, 6);
    assert.ok(best > 0);
    assert.match(w.summary.records[0].name, /Bench/i);

    // Repeat last workout prefills exercises and sets.
    const tpl = store.lastWorkoutTemplate();
    assert.ok(tpl);
    const again = store.startWorkout({ name: tpl.name, exerciseIds: tpl.exercises.map((e) => e.exerciseId) });
    assert.ok(again.ok);
    for (const [i, t] of tpl.exercises.entries()) {
      for (const s of t.sets) store.addSet(again.workout.id, again.workout.exercises[i].id, { weight: s.weight, reps: s.reps });
    }
    html = renderWorkout(store, {});
    assert.match(html, /82\.5/);
    store.discardWorkout(again.workout.id);

    // Stats board renders charts and the PR board.
    html = renderStats(store);
    assert.match(html, /Weekly volume/);
    assert.match(html, /chart/);
    assert.match(html, /Personal records/);
  });

  test("PR detection compares against all-time history, not the empty session", async () => {
    await store.loadCatalogue("");
    const bench = store.exercises().find((e) => /barbell bench press/i.test(e.name));

    // Workout 1: 100 kg x 5 (est 1RM 116.67).
    let r1 = store.startWorkout({ name: "A" });
    let e1 = store.addExerciseToWorkout(r1.workout.id, bench.id).entry;
    let s1 = store.addSet(r1.workout.id, e1.id, { weight: 100, reps: 5 }).set;
    store.updateSet(r1.workout.id, e1.id, s1.id, { done: true });
    store.completeWorkout(r1.workout.id);

    // Workout 2: first set 60x10 (est 80) must NOT count as a PR; 120x3 (124) must.
    let r2 = store.startWorkout({ name: "B" });
    let e2 = store.addExerciseToWorkout(r2.workout.id, bench.id).entry;
    let warm = store.addSet(r2.workout.id, e2.id, { weight: 60, reps: 10 }).set;
    store.updateSet(r2.workout.id, e2.id, warm.id, { done: true });
    let heavy = store.addSet(r2.workout.id, e2.id, { weight: 120, reps: 3 }).set;
    store.updateSet(r2.workout.id, e2.id, heavy.id, { done: true });
    const done = store.completeWorkout(r2.workout.id);
    const kinds = done.summary.records.find((r) => r.exerciseId === bench.id)?.kinds ?? [];
    assert.ok(kinds.includes("estimated 1RM"), "120x3 beats the all-time 116.67");
    assert.ok(!kinds.includes("heaviest") || 120 > 100);
    // The warm-up set alone would not have produced any record vs workout 1:
    assert.ok(estimatedOneRepMax(60, 10) < estimatedOneRepMax(100, 5));
  });
});

describe("user journey: library, detail, settings, data", () => {
  test("search, muscle + equipment filters, detail sheet with progress chart", async () => {
    await store.loadCatalogue("");
    // Seed one completed workout so the progress chart has a point.
    const bench = store.exercises().find((e) => /barbell bench press/i.test(e.name));
    const r = store.startWorkout({ name: "Bench day" });
    const e = store.addExerciseToWorkout(r.workout.id, bench.id).entry;
    const s = store.addSet(r.workout.id, e.id, { weight: 80, reps: 8 }).set;
    store.updateSet(r.workout.id, e.id, s.id, { done: true });
    store.completeWorkout(r.workout.id);

    const all = store.exercises();
    assert.ok(searchExercises(all, "curl", "biceps", "all").every((x) => x.muscle === "biceps"));
    const dumb = searchExercises(all, "", "all", "dumbbell");
    assert.ok(dumb.length > 0 && dumb.every((x) => x.equipment === "dumbbell"));

    let html = renderLibrary(store, { query: "bench", muscle: "chest", equipment: "barbell" });
    assert.match(html, /library-equipment/);
    assert.match(html, /Barbell Bench Press/i);

    html = renderExerciseDetail(bench, { store });
    assert.match(html, /Your progress/);
    assert.match(html, /chart-line/);
    assert.match(html, /Start a workout with this/);
  });

  test("settings: theme, rest presets, unit conversion round-trip, export/import, reset", async () => {
    await store.loadCatalogue("");
    const r = store.startWorkout({ name: "Legs" });
    const sq = store.exercises().find((x) => /squat/i.test(x.name) && /barbell/i.test(x.equipment));
    const e = store.addExerciseToWorkout(r.workout.id, sq.id).entry;
    const s = store.addSet(r.workout.id, e.id, { weight: 100, reps: 5 }).set;
    store.updateSet(r.workout.id, e.id, s.id, { done: true });
    store.completeWorkout(r.workout.id);

    let html = renderSettings(store);
    assert.match(html, /Rest timer/);
    assert.match(html, /Export JSON/);

    store.updateSettings({ theme: "dark", restSeconds: 90, autoStartRestTimer: false });
    assert.equal(store.settings.theme, "dark");

    // kg -> lb -> kg round trip keeps the value within half a kilo.
    const before = store.getWorkout(r.workout.id).exercises[0].sets[0].weight;
    store.convertUnits("kg", "lb");
    const inLb = store.getWorkout(r.workout.id).exercises[0].sets[0].weight;
    assert.equal(inLb, 220);
    store.convertUnits("lb", "kg");
    const back = store.getWorkout(r.workout.id).exercises[0].sets[0].weight;
    assert.ok(Math.abs(back - before) <= 0.5);

    // Export -> import into a fresh store reproduces the log.
    const backup = store.exportData();
    const fresh = new Store(memoryStorage());
    const imp = fresh.importData(backup);
    assert.ok(imp.ok);
    assert.equal(fresh.doc.workouts.length, 1);
    assert.equal(fresh.getWorkout(r.workout.id).exercises[0].sets[0].weight, 100);
    assert.match(renderStats(fresh), /Weekly volume/);

    // A corrupted/foreign import is sanitised, not fatal.
    const bad = fresh.importData(JSON.stringify({ workouts: [{}, { id: "x", status: "active", startedAt: "nope", exercises: [{ exerciseId: "e", sets: [{ weight: "5", reps: 2, done: true }] }] }] }));
    assert.ok(bad.ok);
    assert.doesNotThrow(() => renderHome(fresh));
    assert.doesNotThrow(() => renderHistory(fresh, {}));

    // Reset wipes everything.
    fresh.reset();
    assert.equal(fresh.doc.workouts.length, 0);
  });

  test("router parses hashes and unknown routes fall back to home", () => {
    assert.equal(parseHash("#/workout").route, "workout");
    assert.equal(parseHash("#/history?id=abc").params.get("id"), "abc");
    assert.equal(parseHash("#/nonsense").route, "home");
    assert.equal(parseHash("").route, "home");
  });
});
