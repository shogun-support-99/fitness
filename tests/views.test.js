/**
 * Focused view-markup tests for behaviour that is easy to regress without a
 * browser: the weekly momentum goal and the attribution that must survive the
 * Settings tidy-up.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { renderHome } from "../app/js/views/home.js";
import { renderSettings } from "../app/js/views/settings.js";

/** The smallest store shape renderHome/renderSettings actually read. */
function makeStore(workoutCount = 0) {
  const now = Date.now();
  const workouts = Array.from({ length: workoutCount }, (_, i) => ({
    id: `w-${i}`,
    name: `Session ${i + 1}`,
    status: "completed",
    startedAt: new Date(now - i * 3_600_000).toISOString(),
    endedAt: new Date(now - i * 3_600_000 + 1_800_000).toISOString(),
    exercises: [
      {
        exerciseId: "ds-bench",
        sets: [{ weight: 80, reps: 8, done: true }],
      },
    ],
  }));

  return {
    activeWorkout: () => null,
    completedWorkouts: () => workouts,
    lastWorkoutTemplate: () => null,
    exerciseIndex: () => ({ "ds-bench": { name: "Barbell Bench Press" } }),
    exercises: () => [{ id: "ds-bench", name: "Barbell Bench Press", muscle: "chest", equipment: "barbell" }],
    doc: { workouts, customExercises: [] },
    settings: {
      units: "kg",
      restSeconds: 90,
      autoStartRestTimer: true,
      theme: "light",
      instructionLanguage: "en",
      lastBackupAt: null,
    },
    catalogue: [],
    catalogueMeta: null,
    catalogueState: "ready",
  };
}

test("home momentum goal", async (t) => {
  await t.test("shows progress against five sessions", () => {
    const html = renderHome(makeStore(2));
    assert.match(html, /<strong>2<small>\/5<\/small><\/strong>/);
    assert.match(html, /2 of 5 weekly momentum sessions completed/);
    assert.match(html, /5-session momentum goal/);
    assert.doesNotMatch(html, /\/3<\/small>/);
  });

  await t.test("caps the displayed count once the goal is beaten", () => {
    const html = renderHome(makeStore(7));
    assert.match(html, /<strong>5<small>\/5<\/small><\/strong>/);
    assert.match(html, /5 of 5 weekly momentum sessions completed/);
    assert.match(html, /Goal complete/);
    const dots = html.match(/<div class="goal-dots"[\s\S]*?<\/div>/)?.[0] ?? "";
    assert.equal((dots.match(/is-reached/g) ?? []).length, 5);
  });
});

test("settings keeps the licence attribution without the catalogue panel", () => {
  const html = renderSettings(makeStore(1));
  assert.doesNotMatch(html, /Exercise catalogue/);
  assert.match(html, /hasaneyldrm\/exercises-dataset/);
  assert.match(html, /MIT licence/);
  assert.match(html, /Gym Visual/);
  assert.match(html, /Third-party notices/);
});
