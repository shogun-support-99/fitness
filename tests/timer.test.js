/**
 * Tests for the rest timer (app/js/timer.js) and the exercise library helpers
 * (app/js/exercises.js). The clock is injected so nothing waits in real time.
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { RestTimer, formatElapsed, formatSeconds } from "../app/js/timer.js";
import {
  EQUIPMENT,
  MUSCLE_GROUPS,
  allExercises,
  makeExerciseId,
  searchExercises,
} from "../app/js/exercises.js";
import { parseHash, ROUTES } from "../app/js/router.js";
import { esc } from "../app/js/ui.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// ── Fake clock ───────────────────────────────────────────────────────────

function fakeClock(startMs = 0) {
  let now = startMs;
  const intervals = new Map();
  let nextId = 1;
  return {
    now: () => now,
    advance(ms) {
      now += ms;
      // Fire every interval the number of times the elapsed window covers.
      for (const [, entry] of intervals) {
        const times = Math.floor(ms / entry.period);
        for (let i = 0; i < times; i += 1) entry.callback();
      }
    },
    setInterval(callback, period) {
      const id = nextId++;
      intervals.set(id, { callback, period });
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    activeIntervals: () => intervals.size,
  };
}

function makeTimer(clock, onFinish) {
  return new RestTimer({
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    onFinish,
  });
}

// ── RestTimer ────────────────────────────────────────────────────────────

describe("RestTimer", () => {
  test("counts down and reports seconds remaining", () => {
    const clock = fakeClock();
    const timer = makeTimer(clock);
    timer.start(120);
    assert.equal(timer.secondsLeft(), 120);
    clock.advance(30_000);
    assert.equal(timer.secondsLeft(), 90);
  });

  test("reaches zero and stops itself", () => {
    const clock = fakeClock();
    let finished = null;
    const timer = makeTimer(clock, (total) => {
      finished = total;
    });
    timer.start(60);
    clock.advance(61_000);
    assert.equal(timer.secondsLeft(), 0);
    assert.equal(timer.running, false);
    assert.equal(finished, 60);
    assert.equal(clock.activeIntervals(), 0);
  });

  test("calls onFinish exactly once", () => {
    const clock = fakeClock();
    let calls = 0;
    const timer = makeTimer(clock, () => {
      calls += 1;
    });
    timer.start(30);
    clock.advance(120_000);
    assert.equal(calls, 1);
  });

  test("restarting replaces the previous countdown", () => {
    const clock = fakeClock();
    const timer = makeTimer(clock);
    timer.start(120);
    clock.advance(60_000);
    timer.start(90);
    assert.equal(timer.secondsLeft(), 90);
    assert.equal(clock.activeIntervals(), 1);
  });

  test("addSeconds extends the countdown", () => {
    const clock = fakeClock();
    const timer = makeTimer(clock);
    timer.start(60);
    clock.advance(50_000);
    assert.equal(timer.secondsLeft(), 10);
    timer.addSeconds(15);
    assert.equal(timer.secondsLeft(), 25);
  });

  test("addSeconds is a no-op when idle", () => {
    const clock = fakeClock();
    const timer = makeTimer(clock);
    timer.addSeconds(15);
    assert.equal(timer.running, false);
    assert.equal(timer.secondsLeft(), 0);
  });

  test("stop clears the interval and the state", () => {
    const clock = fakeClock();
    const timer = makeTimer(clock);
    timer.start(120);
    timer.stop();
    assert.equal(timer.running, false);
    assert.equal(timer.endsAt, null);
    assert.equal(clock.activeIntervals(), 0);
  });

  test("starting with zero seconds never runs", () => {
    const clock = fakeClock();
    const timer = makeTimer(clock);
    timer.start(0);
    assert.equal(timer.running, false);
    assert.equal(clock.activeIntervals(), 0);
  });

  test("rejects non-numeric durations", () => {
    const clock = fakeClock();
    const timer = makeTimer(clock);
    timer.start("abc");
    assert.equal(timer.running, false);
  });

  test("reports progress from 0 to 1", () => {
    const clock = fakeClock();
    const timer = makeTimer(clock);
    timer.start(100);
    assert.equal(timer.progress(), 0);
    clock.advance(50_000);
    assert.equal(timer.progress(), 0.5);
    clock.advance(50_000);
    assert.equal(timer.progress(), 1);
  });

  test("resumeFrom restores a countdown that survived a reload", () => {
    const clock = fakeClock(1_000_000);
    const timer = makeTimer(clock);
    timer.resumeFrom(clock.now() + 45_000, 120);
    assert.equal(timer.running, true);
    assert.equal(timer.secondsLeft(), 45);
  });

  test("resumeFrom ignores an already-expired timestamp", () => {
    const clock = fakeClock(1_000_000);
    const timer = makeTimer(clock);
    timer.resumeFrom(clock.now() - 5_000, 120);
    assert.equal(timer.running, false);
    assert.equal(timer.secondsLeft(), 0);
  });

  test("resumeFrom ignores an invalid timestamp", () => {
    const clock = fakeClock();
    const timer = makeTimer(clock);
    timer.resumeFrom("nonsense", 120);
    assert.equal(timer.running, false);
  });

  test("notifies subscribers on start, tick and stop", () => {
    const clock = fakeClock();
    const timer = makeTimer(clock);
    const seen = [];
    timer.subscribe((snapshot) => seen.push(snapshot.secondsLeft));
    timer.start(60);
    clock.advance(30_000);
    timer.stop();
    assert.ok(seen.includes(60));
    assert.ok(seen.includes(30));
    assert.ok(seen.includes(0));
  });

  test("unsubscribe stops notifications", () => {
    const clock = fakeClock();
    const timer = makeTimer(clock);
    let calls = 0;
    const off = timer.subscribe(() => {
      calls += 1;
    });
    off();
    timer.start(60);
    assert.equal(calls, 0);
  });

  test("a throwing subscriber does not break the timer", () => {
    const clock = fakeClock();
    const timer = makeTimer(clock);
    timer.subscribe(() => {
      throw new Error("bad subscriber");
    });
    timer.start(60);
    assert.equal(timer.secondsLeft(), 60);
  });

  test("an onFinish that throws does not leave the timer running", () => {
    const clock = fakeClock();
    const timer = makeTimer(clock, () => {
      throw new Error("notification failed");
    });
    timer.start(10);
    clock.advance(20_000);
    assert.equal(timer.running, false);
  });

  test("snapshot is a plain serialisable object", () => {
    const clock = fakeClock();
    const timer = makeTimer(clock);
    timer.start(90);
    const snapshot = timer.snapshot();
    assert.deepEqual(Object.keys(snapshot).sort(), [
      "endsAt",
      "progress",
      "running",
      "secondsLeft",
      "totalSeconds",
    ]);
    assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  });
});

describe("formatSeconds", () => {
  test("pads to mm:ss", () => {
    assert.equal(formatSeconds(0), "0:00");
    assert.equal(formatSeconds(9), "0:09");
    assert.equal(formatSeconds(75), "1:15");
    assert.equal(formatSeconds(600), "10:00");
  });

  test("clamps negative and non-numeric input", () => {
    assert.equal(formatSeconds(-5), "0:00");
    assert.equal(formatSeconds("abc"), "0:00");
  });
});

describe("formatElapsed", () => {
  test("shows mm:ss under an hour", () => {
    assert.equal(formatElapsed(0), "00:00");
    assert.equal(formatElapsed(65_000), "01:05");
  });

  test("switches to h:mm:ss past an hour", () => {
    assert.equal(formatElapsed(3_725_000), "1:02:05");
  });

  test("clamps negative input", () => {
    assert.equal(formatElapsed(-1000), "00:00");
  });
});

// ── Exercise library ─────────────────────────────────────────────────────

describe("dataset exercise library", () => {
  test("every exercise has a unique id", async () => {
    const index = JSON.parse(await readFile(join(ROOT, "app/data/exercises-index.json"), "utf8"));
    const ids = index.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("every exercise declares a known muscle group and equipment", async () => {
    const index = JSON.parse(await readFile(join(ROOT, "app/data/exercises-index.json"), "utf8"));
    for (const e of index) {
      assert.ok(MUSCLE_GROUPS.includes(e.muscle), `${e.id}: unknown muscle "${e.muscle}"`);
      assert.ok(EQUIPMENT.includes(e.equipment), `${e.id}: unknown equipment "${e.equipment}"`);
    }
  });

  test("every exercise has a non-empty name", async () => {
    const index = JSON.parse(await readFile(join(ROOT, "app/data/exercises-index.json"), "utf8"));
    for (const e of index) {
      assert.ok(e.name.trim().length > 0, `${e.id} has no name`);
    }
  });

  test("the catalogue is the sole built-in source", async () => {
    const index = JSON.parse(await readFile(join(ROOT, "app/data/exercises-index.json"), "utf8"));
    assert.ok(index.length >= 1300, `expected a large catalogue, got ${index.length}`);
    assert.ok(index.every((e) => e.source === "dataset"));
  });
});

describe("allExercises", () => {
  const dataset = [
    { id: "ds-0001", name: "Push-Up", muscle: "chest", equipment: "bodyweight", source: "dataset" },
    { id: "ds-0002", name: "Leverage Deadlift", muscle: "back", equipment: "leverage machine", source: "dataset" },
  ];

  test("returns only the catalogue when there are no customs", () => {
    assert.equal(allExercises([], dataset).length, 2);
    assert.equal(allExercises([]).length, 0);
  });

  test("appends custom exercises", () => {
    const merged = allExercises([{ id: "custom-x", name: "X", muscle: "core", equipment: "other", custom: true }], dataset);
    assert.equal(merged.length, 3);
  });

  test("lets a custom entry override a catalogue entry with the same id", () => {
    const merged = allExercises([{ id: "ds-0001", name: "My Push", muscle: "chest", equipment: "bodyweight", custom: true }], dataset);
    assert.equal(merged.length, 2);
    assert.equal(merged.find((e) => e.id === "ds-0001").name, "My Push");
  });

  test("ignores malformed custom entries", () => {
    const merged = allExercises([null, undefined, { name: "no id" }, { id: "" }], dataset);
    assert.equal(merged.length, 2);
  });
});

describe("searchExercises", () => {
  const merged = [
    { id: "ds-a", name: "Barbell Bench Press", muscle: "chest", equipment: "barbell", target: "pectorals", source: "dataset" },
    { id: "ds-b", name: "Incline Dumbbell Press", muscle: "chest", equipment: "dumbbell", target: "pectorals", source: "dataset" },
    { id: "ds-c", name: "Leverage Shrug", muscle: "back", equipment: "leverage machine", target: "traps", source: "dataset" },
  ];

  test("returns everything for an empty query", () => {
    assert.equal(searchExercises(merged, "").length, 3);
    assert.equal(searchExercises(merged, "   ").length, 3);
    assert.equal(searchExercises(merged, null).length, 3);
  });

  test("matches case-insensitively on name", () => {
    const results = searchExercises(merged, "BENCH");
    assert.ok(results.some((e) => e.id === "ds-a"));
  });

  test("matches on muscle group", () => {
    const results = searchExercises(merged, "back");
    assert.ok(results.some((e) => e.id === "ds-c"));
    assert.ok(results.every((e) => e.muscle === "back" || e.name.toLowerCase().includes("back")));
  });

  test("matches on equipment", () => {
    const results = searchExercises(merged, "dumbbell");
    assert.ok(results.some((e) => e.id === "ds-b"));
  });

  test("filters by muscle group", () => {
    const results = searchExercises(merged, "", "chest");
    assert.equal(results.length, 2);
    assert.ok(results.every((e) => e.muscle === "chest"));
  });

  test("combines a query with a muscle filter", () => {
    const results = searchExercises(merged, "press", "chest");
    assert.ok(results.every((e) => e.muscle === "chest"));
    assert.ok(results.every((e) => e.name.toLowerCase().includes("press")));
  });

  test("returns nothing for an unmatched query", () => {
    assert.deepEqual(searchExercises(merged, "zzzznotreal"), []);
  });

  test("does not mutate the input list", () => {
    const before = merged.length;
    searchExercises(merged, "press");
    assert.equal(merged.length, before);
  });
});

describe("makeExerciseId", () => {
  test("slugifies a name", () => {
    assert.equal(makeExerciseId("Zercher Squat"), "custom-zercher-squat");
  });

  test("collapses punctuation and repeats", () => {
    assert.equal(makeExerciseId("  Landmine  Press!! "), "custom-landmine-press");
  });

  test("falls back for a name with no usable characters", () => {
    assert.equal(makeExerciseId("!!!"), "custom-exercise");
    assert.equal(makeExerciseId(""), "custom-exercise");
  });
});

// ── Router ───────────────────────────────────────────────────────────────

describe("parseHash", () => {
  test("reads a plain route", () => {
    assert.equal(parseHash("#/history").route, "history");
    assert.equal(parseHash("#history").route, "history");
  });

  test("reads query parameters", () => {
    const { route, params } = parseHash("#/history?id=w_abc");
    assert.equal(route, "history");
    assert.equal(params.get("id"), "w_abc");
  });

  test("falls back to home for an unknown route", () => {
    assert.equal(parseHash("#/nonsense").route, "home");
  });

  test("falls back to home for empty and malformed input", () => {
    assert.equal(parseHash("").route, "home");
    assert.equal(parseHash(null).route, "home");
    assert.equal(parseHash("#").route, "home");
  });

  test("strips a trailing slash", () => {
    assert.equal(parseHash("#/stats/").route, "stats");
  });

  test("knows every declared route", () => {
    for (const route of ROUTES) {
      assert.equal(parseHash(`#/${route}`).route, route);
    }
  });
});

// ── UI escaping ──────────────────────────────────────────────────────────

describe("esc", () => {
  test("escapes every HTML-significant character", () => {
    assert.equal(esc(`<img src=x onerror="alert('1')">`), "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;");
  });

  test("escapes ampersands first so entities are not double-escaped", () => {
    assert.equal(esc("&lt;"), "&amp;lt;");
  });

  test("handles null, undefined and numbers", () => {
    assert.equal(esc(null), "");
    assert.equal(esc(undefined), "");
    assert.equal(esc(80), "80");
  });

  test("neutralises a stored-XSS payload from an exercise name", () => {
    const hostile = `</span><script>alert(1)</script>`;
    const html = `<span class="name">${esc(hostile)}</span>`;
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
  });
});
