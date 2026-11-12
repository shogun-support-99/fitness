/**
 * Profile (statistics) view tests for the Hevy-parity charts: the muscle-heat
 * map period toggle, the three volume granularities, the personal-record
 * category filter and the award board. All of these are derived from the pure
 * functions in stats.js, so they are exercised here without a browser.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { renderStats } from "../app/js/views/stats.js";
import { compactNumber, exerciseProgression } from "../app/js/stats.js";
import { renderExerciseDetail } from "../app/js/views/library.js";

const DAY = 86_400_000;
const now = Date.now();

function set(weight, reps, done = true) {
  return { weight, reps, done };
}

/** A store shape that covers everything renderStats/renderExerciseDetail read. */
function makeStore({ workouts = [], index = {} } = {}) {
  return {
    activeWorkout: () => null,
    completedWorkouts: () => workouts.filter((w) => w.status === "completed"),
    exerciseIndex: () => index,
    personalRecords: () => new Map(),
    settings: { units: "kg", instructionLanguage: "en" },
    catalogueMeta: null,
    exercises: () => [],
  };
}

const BENCH = {
  id: "ds-bench",
  name: "Barbell Bench Press",
  muscle: "chest",
  equipment: "barbell",
};

function logWorkout(daysAgo, sets = [set(80, 8)]) {
  const end = now - daysAgo * DAY;
  return {
    id: `w-${daysAgo}`,
    name: "Session",
    status: "completed",
    startedAt: new Date(end - 3_600_000).toISOString(),
    endedAt: new Date(end).toISOString(),
    exercises: [{ id: `e-${daysAgo}`, exerciseId: BENCH.id, sets }],
  };
}

const store = makeStore({
  workouts: [logWorkout(1), logWorkout(5), logWorkout(40)],
  index: { [BENCH.id]: BENCH },
});

test("renderStats", async (t) => {
  await t.test("defaults the muscle heatmap to the last 7 days", () => {
    const html = renderStats(store);
    const button = html.match(/<button[^>]*data-kind="muscle" data-period="7d"[^>]*>/)?.[0] ?? "";
    assert.match(button, /aria-checked="true"/);
    assert.match(button, /is-active/);
    // The button's own label sits after the opening tag.
    assert.match(html, /<button[^>]*data-period="7d"[^>]*>7 days<\/button>/);
    // The wider windows are offered but start unchecked.
    const thirtyButton = html.match(/<button[^>]*data-kind="muscle" data-period="30d"[^>]*>/)?.[0] ?? "";
    const allButton = html.match(/<button[^>]*data-kind="muscle" data-period="all"[^>]*>/)?.[0] ?? "";
    assert.match(thirtyButton, /aria-checked="false"/);
    assert.match(allButton, /aria-checked="false"/);
  });

  await t.test("offers 30-day and all-time windows", () => {
    const html = renderStats(store);
    assert.match(html, /data-period="30d"/);
    assert.match(html, /data-period="all"/);
  });

  await t.test("switches the heatmap caption and summary to the selected window", () => {
    // The caption template is interpolated into each muscle's <title>, so the
    // rendered text is what the assertion must match.
    const seven = renderStats(store, { musclePeriod: "7d" });
    assert.match(seven, /in the last 7 days<\/title>/);
    assert.match(seven, /chest leads the last 7 days/);

    const thirty = renderStats(store, { musclePeriod: "30d" });
    assert.match(thirty, /in the last 30 days<\/title>/);
    assert.match(thirty, /chest leads the last 30 days/);

    const all = renderStats(store, { musclePeriod: "all" });
    assert.match(all, /sets all time<\/title>/);
    assert.match(all, /chest leads all time/);
  });

  await t.test("keeps the front and back silhouettes behind one accessible label", () => {
    const html = renderStats(store);
    assert.match(html, /role="img"[^>]*aria-label="Front and back muscle heatmap\./);
    assert.match(html, /muscle-side-label">Front</);
    assert.match(html, /muscle-side-label">Back</);
  });

  await t.test("renders the volume chart with Week / Month / Year tabs", () => {
    const html = renderStats(store);
    assert.match(html, /data-action="set-stats-period" data-kind="volume" data-period="week"/);
    assert.match(html, /data-period="month"/);
    assert.match(html, /data-period="year"/);
    assert.match(html, /Weekly training volume|aria-label="Training volume by week"/);
  });

  await t.test("aggregates monthly and yearly charts instead of staying weekly", () => {
    const html = renderStats(store, { volumePeriod: "year" });
    assert.match(html, /<h2>Volume<\/h2>/);
    // Yearly buckets use the bare year as the axis label.
    assert.match(html, /Training volume by year/);
    const monthly = renderStats(store, { volumePeriod: "month" });
    assert.match(monthly, /Training volume by month/);
  });

  await t.test("filters the personal-record board by category", () => {
    const html = renderStats(store);
    assert.match(html, /data-action="set-stats-period" data-kind="pr" data-period="all"/);
    assert.match(html, /data-period="weight"/);
    assert.match(html, /data-period="reps"/);
    assert.match(html, /data-period="oneRm"/);
    // Exactly one category is checked, and switching the state moves the check.
    const checkedTag = (markup) =>
      markup.match(/aria-checked="true"[\s\S]{0,200}?data-kind="pr"/g) ?? [];
    assert.equal(checkedTag(html).length, 1);
    const oneRmButton =
      renderStats(store, { prKind: "oneRm" }).match(
        /<button[^>]*data-kind="pr" data-period="oneRm"[^>]*>/,
      )?.[0] ?? "";
    assert.match(oneRmButton, /aria-checked="true"/);
    assert.match(oneRmButton, /is-active/);
  });

  await t.test("renders the award board with earned and locked tiles", () => {
    const html = renderStats(store);
    assert.match(html, /class="award-card"/);
    assert.match(html, /class="award is-earned"/);
    assert.match(html, /class="award is-locked"/);
    assert.match(html, /\/8 earned/);
  });

  await t.test("keeps the week strip, radar and distribution bars", () => {
    const html = renderStats(store);
    assert.match(html, /Weekly consistency/);
    assert.match(html, /class="radar-chart"/);
    assert.match(html, /class="dist"/);
    assert.match(html, /class="dist-row/);
  });

  await t.test("still shows the empty state before anything is logged", () => {
    const html = renderStats(makeStore());
    assert.match(html, /No data to chart yet/);
  });
});

test("exercise detail progress panel", async (t) => {
  await t.test("stays hidden before the exercise is ever logged", () => {
    // A store that has trained, but never this exercise.
    const squat = { id: "ds-squat", name: "Squat", muscle: "quads", equipment: "barbell" };
    const other = makeStore({
      workouts: [
        {
          id: "s1",
          name: "Session",
          status: "completed",
          startedAt: new Date(now - DAY).toISOString(),
          endedAt: new Date(now - DAY + 3_600_000).toISOString(),
          exercises: [{ id: "sx1", exerciseId: squat.id, sets: [set(100, 5)] }],
        },
      ],
      index: { [squat.id]: squat },
    });
    const html = renderExerciseDetail(BENCH, { store: other });
    assert.doesNotMatch(html, /Progress over time/);
  });

  await t.test("charts the trend once there are two or more sessions", () => {
    const logged = makeStore({
      workouts: [
        { id: "p1", name: "Session", status: "completed", startedAt: new Date(now - 10 * DAY).toISOString(), endedAt: new Date(now - 10 * DAY + 3_600_000).toISOString(), exercises: [{ id: "x1", exerciseId: BENCH.id, sets: [set(70, 8), set(70, 8)] }] },
        { id: "p2", name: "Session", status: "completed", startedAt: new Date(now - 3 * DAY).toISOString(), endedAt: new Date(now - 3 * DAY + 3_600_000).toISOString(), exercises: [{ id: "x2", exerciseId: BENCH.id, sets: [set(85, 8), set(85, 8)] }] },
      ],
      index: { [BENCH.id]: BENCH },
    });
    const html = renderExerciseDetail(BENCH, { store: logged });
    assert.match(html, /Progress over time/);
    assert.match(html, /class="progress-line"/);
    assert.match(html, /Sessions/);
    assert.match(html, /Est\. 1RM/);
    assert.match(html, /is-up|is-down/);
  });

  await t.test("uses the shared exerciseProgression helper for its numbers", () => {
    const points = exerciseProgression([logWorkout(2), logWorkout(4)], BENCH.id);
    assert.equal(points.length, 2);
    assert.ok(points[1].bestOneRm >= points[0].bestOneRm);
    assert.ok(Number.isFinite(points[0].volume));
  });

  await t.test("compresses the display without inventing precision", () => {
    assert.equal(compactNumber(1_250_000), "1.3M");
    assert.equal(compactNumber(12_500), "12.5k");
  });
});
