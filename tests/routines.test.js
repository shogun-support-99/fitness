import test from "node:test";
import assert from "node:assert/strict";

import { renderRoutineCards, routineExerciseIds } from "../app/js/views/routines.js";

const catalogue = [
  { id: "ds-0001", name: "archer push up", muscle: "chest", equipment: "body weight" },
  { id: "ds-0002", name: "barbell bench press", muscle: "chest", equipment: "barbell" },
  { id: "ds-0003", name: "band front lateral raise", muscle: "shoulders", equipment: "band" },
  { id: "ds-0004", name: "barbell seated overhead press", muscle: "shoulders", equipment: "barbell" },
  { id: "ds-0005", name: "cable pushdown", muscle: "triceps", equipment: "cable" },
  { id: "ds-0006", name: "assisted standing triceps extension", muscle: "triceps", equipment: "assisted" },
  { id: "ds-0007", name: "barbell bent over row", muscle: "back", equipment: "barbell" },
  { id: "ds-0008", name: "barbell curl", muscle: "biceps", equipment: "barbell" },
  { id: "ds-0009", name: "barbell full squat", muscle: "quads", equipment: "barbell" },
  { id: "ds-0010", name: "barbell straight leg deadlift", muscle: "hamstrings", equipment: "barbell" },
  { id: "ds-0011", name: "barbell deadlift", muscle: "glutes", equipment: "barbell" },
  { id: "ds-0012", name: "standing calf raise", muscle: "calves", equipment: "body weight" },
];

test("routineExerciseIds", async (t) => {
  await t.test("prefers familiar compounds over alphabetical firsts", () => {
    assert.deepEqual(routineExerciseIds(catalogue, ["chest", "shoulders", "triceps"]), [
      "ds-0002",
      "ds-0004",
      "ds-0005",
    ]);
  });

  await t.test("resolves a full-body split without duplicate ids", () => {
    const ids = routineExerciseIds(catalogue, ["chest", "back", "quads", "shoulders"]);
    assert.deepEqual(ids, ["ds-0002", "ds-0007", "ds-0009", "ds-0004"]);
    assert.equal(new Set(ids).size, ids.length);
  });

  await t.test("falls back to any exercise for an unknown or unmatched muscle", () => {
    assert.deepEqual(routineExerciseIds(catalogue, ["calves", "chest"]), ["ds-0012", "ds-0002"]);
    assert.deepEqual(routineExerciseIds(catalogue, ["neck"]), []);
  });

  await t.test("returns an empty list when the catalogue has not loaded", () => {
    assert.deepEqual(routineExerciseIds([], ["chest"]), []);
  });

  await t.test("does not mutate the input list", () => {
    const copy = catalogue.map((e) => e.id);
    routineExerciseIds(catalogue, ["chest", "back"]);
    assert.deepEqual(catalogue.map((e) => e.id), copy);
  });
});

test("renderRoutineCards", async (t) => {
  await t.test("emits the four real routine actions as buttons", () => {
    const html = renderRoutineCards();
    assert.equal((html.match(/data-action="start-split"/g) ?? []).length, 4);
    assert.match(html, /data-split="Push"/);
    assert.match(html, /data-split="Pull"/);
    assert.match(html, /data-split="Legs"/);
    assert.match(html, /data-split="Full body"/);
  });

  await t.test("keeps the entrance motion but no sheen or hover-lift tells", () => {
    const html = renderRoutineCards();
    assert.match(html, /motion-safe:animate-scale-in/);
    assert.doesNotMatch(html, /routine-shine/);
    assert.doesNotMatch(html, /hover-lift/);
  });
});
