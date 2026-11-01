/** RepDB free-tier integration, media licensing and merged-catalogue guards. */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  humanise,
  mapRepDBMuscle,
  normaliseName as normaliseRepDBName,
  toAppRecord,
} from "../scripts/build-repdb-data.mjs";
import {
  clearStepsCache,
  loadCatalogue,
  mergeCatalogues,
  normaliseName,
  stepsFor,
} from "../app/js/catalogue.js";
import { allExercises, MUSCLE_GROUPS } from "../app/js/exercises.js";
import { renderExerciseDetail } from "../app/js/views/library.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = join(ROOT, "app/data");
const MEDIA = join(ROOT, "app/media/repdb");
const readJson = async (name) => JSON.parse(await readFile(join(DATA, name), "utf8"));

function stubFetch(payloads) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    const body = payloads[url];
    if (body === undefined) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => body };
  };
  return calls;
}

function fixture(overrides = {}) {
  return {
    id: "test-press",
    name_en: "Test Press",
    category: "strength",
    difficulty: "beginner",
    body_part: "chest",
    primary_muscles: ["pectoralis_major"],
    secondary_muscles: ["triceps_brachii"],
    equipment: "dumbbell",
    met: 4,
    images: {
      flat: {
        start: "images/flat/test-press-start.webp",
        peak: "images/flat/test-press-peak.webp",
      },
    },
    ...overrides,
  };
}

describe("RepDB generator mapping", () => {
  test("humanises anatomical slugs without losing meaning", () => {
    assert.equal(humanise("pectoralis_major"), "pectoralis major");
    assert.equal(humanise("upper_legs"), "upper legs");
    assert.equal(normaliseRepDBName("90/90 Hold"), "90 90 hold");
  });

  test("maps primary muscles and cardio into existing filter groups", () => {
    assert.equal(mapRepDBMuscle(fixture()), "chest");
    assert.equal(mapRepDBMuscle(fixture({ primary_muscles: ["triceps_brachii"] })), "triceps");
    assert.equal(mapRepDBMuscle(fixture({ primary_muscles: ["gluteus_medius"] })), "glutes");
    assert.equal(mapRepDBMuscle(fixture({ category: "cardio", primary_muscles: ["quadriceps"] })), "cardio");
    assert.equal(mapRepDBMuscle(fixture({ primary_muscles: [], body_part: "lower_arms" })), "forearms");
  });

  test("emits stable ids, local media paths and factual taxonomy", () => {
    const { entry, upstreamPaths } = toAppRecord(fixture());
    assert.equal(entry.id, "repdb-test-press");
    assert.equal(entry.source, "repdb");
    assert.equal(entry.muscle, "chest");
    assert.equal(entry.target, "pectoralis major");
    assert.equal(entry.equipment, "dumbbell");
    assert.equal(entry.trainingCategory, "strength");
    assert.deepEqual(entry.media.poses, {
      start: "media/repdb/test-press-start.webp",
      peak: "media/repdb/test-press-peak.webp",
    });
    assert.deepEqual(upstreamPaths, {
      start: "images/flat/test-press-start.webp",
      peak: "images/flat/test-press-peak.webp",
    });
  });

  test("fails closed on premium, remote or unsafe media paths", () => {
    for (const path of [
      "premium-samples/test.webp",
      "images/classic/test.webp",
      "https://example.com/test.webp",
      "../test.webp",
      "images/flat/test.gif",
    ]) {
      assert.throws(
        () => toAppRecord(fixture({ images: { flat: { main: path } } })),
        /refusing non-free or unsafe media path/,
        path,
      );
    }
  });
});

describe("RepDB loader and instruction routing", () => {
  test("loads both sources and combines language/provenance metadata", async () => {
    clearStepsCache();
    const calls = stubFetch({
      "data/exercises-index.json": [{ id: "ds-1", name: "One", source: "dataset" }],
      "data/catalogue-meta.json": {
        source: { repository: "hasan", commit: "abc" },
        counts: { exercises: 1, languages: 1 },
        languages: [{ code: "en", label: "English" }],
      },
      "data/repdb-index.json": [{ id: "repdb-two", name: "Two", source: "repdb" }],
      "data/repdb-meta.json": {
        source: { repository: "repdb", commit: "def" },
        counts: { exercises: 1, images: 2 },
        languages: [{ code: "en" }, { code: "de", label: "German" }],
      },
    });
    const result = await loadCatalogue("");
    assert.equal(result.available, true);
    assert.equal(result.exercises.length, 2);
    assert.equal(result.meta.counts.exercises, 2);
    assert.equal(result.meta.counts.repdbImages, 2);
    assert.deepEqual(result.meta.languages.map((lang) => lang.code).sort(), ["de", "en"]);
    assert.equal(result.meta.sources.repdb.commit, "def");
    assert.ok(calls.includes("data/repdb-index.json"));
    assert.ok(calls.includes("data/repdb-meta.json"));
  });

  test("uses RepDB's own German pack instead of the original dataset pack", async () => {
    clearStepsCache();
    const calls = stubFetch({
      "data/repdb-steps.de.json": { "repdb-test": ["Schritt eins", "Schritt zwei"] },
    });
    const result = await stepsFor({ id: "repdb-test", source: "repdb" }, "de", "");
    assert.equal(result.language, "de");
    assert.equal(result.fellBack, false);
    assert.equal(result.steps.length, 2);
    assert.deepEqual(calls, ["data/repdb-steps.de.json"]);
  });

  test("falls back to RepDB English for a missing RepDB translation", async () => {
    clearStepsCache();
    stubFetch({
      "data/repdb-steps.de.json": {},
      "data/repdb-steps.en.json": { "repdb-test": ["Step one"] },
    });
    const result = await stepsFor("repdb-test", "de", "");
    assert.equal(result.language, "en");
    assert.equal(result.fellBack, true);
    assert.deepEqual(result.steps, ["Step one"]);
  });

  test("unsupported source languages fall back without a known-404 request", async () => {
    clearStepsCache();
    const calls = stubFetch({ "data/steps.en.json": { "0001": ["English step"] } });
    const result = await stepsFor("ds-0001", "de", "");
    assert.equal(result.language, "en");
    assert.equal(result.fellBack, true);
    assert.deepEqual(result.steps, ["English step"]);
    assert.deepEqual(calls, ["data/steps.en.json"]);
  });

  test("collision enrichment preserves the existing id and instruction link", () => {
    const curated = [{ id: "push-up", name: "Push-Up", muscle: "chest" }];
    const media = { provider: "repdb", poses: { main: "media/repdb/push-up-main.webp" } };
    const { exercises, collisions, linked } = mergeCatalogues(curated, [
      { id: "ds-1", name: "Push-Up", source: "dataset" },
      { id: "repdb-push-up", name: "Push-Up", source: "repdb", media },
    ]);
    assert.equal(collisions, 2);
    assert.equal(linked, 1);
    assert.equal(exercises.length, 1);
    assert.equal(exercises[0].id, "push-up");
    assert.equal(exercises[0].stepsId, "ds-1");
    assert.deepEqual(exercises[0].media, media);
  });
});

describe("committed RepDB artefacts", () => {
  test("all 583 records have unique ids/names and valid muscle groups", async () => {
    const index = await readJson("repdb-index.json");
    const meta = await readJson("repdb-meta.json");
    assert.equal(index.length, 583);
    assert.equal(meta.counts.exercises, 583);
    assert.equal(meta.counts.skippedAsDuplicate, 67, "duplicates of dataset exercises are removed");
    assert.equal(new Set(index.map((entry) => entry.id)).size, index.length);
    assert.equal(new Set(index.map((entry) => normaliseName(entry.name))).size, index.length);
    const known = new Set(MUSCLE_GROUPS);
    assert.deepEqual(index.filter((entry) => !known.has(entry.muscle)).map((entry) => entry.id), []);
    assert.ok(index.every((entry) => entry.source === "repdb" && entry.id.startsWith("repdb-")));
  });

  test("English, German and Spanish steps cover every RepDB record", async () => {
    const index = await readJson("repdb-index.json");
    for (const lang of ["en", "de", "es"]) {
      const pack = await readJson(`repdb-steps.${lang}.json`);
      const missing = index.filter((entry) => !Array.isArray(pack[entry.id]) || pack[entry.id].length === 0);
      assert.deepEqual(missing.map((entry) => entry.id).slice(0, 5), [], `${lang} pack has missing steps`);
    }
  });

  test("every referenced still exists, is WebP, and has no unreferenced siblings", async () => {
    const index = await readJson("repdb-index.json");
    const meta = await readJson("repdb-meta.json");
    const references = new Set();
    let bytes = 0;

    for (const entry of index) {
      assert.equal(entry.media.provider, "repdb");
      for (const path of Object.values(entry.media.poses)) {
        assert.match(path, /^media\/repdb\/[a-z0-9-]+\.webp$/);
        assert.doesNotMatch(path, /premium|gif|videos|images\/flat/i);
        references.add(path);
      }
    }

    for (const path of references) {
      const file = join(ROOT, "app", path);
      const raw = await readFile(file);
      assert.equal(raw.toString("ascii", 0, 4), "RIFF", `${path} is not RIFF`);
      assert.equal(raw.toString("ascii", 8, 12), "WEBP", `${path} is not WebP`);
      bytes += raw.length;
    }

    const onDisk = (await readdir(MEDIA)).filter((name) => name.endsWith(".webp"));
    assert.equal(references.size, 1021);
    assert.equal(onDisk.length, references.size);
    assert.deepEqual(
      onDisk.filter((name) => !references.has(`media/repdb/${name}`)),
      [],
    );
    assert.equal(meta.counts.images, references.size);
    assert.equal(meta.counts.imageBytes, bytes);
    assert.equal(meta.media.premiumSamplesIncluded, undefined);
    assert.equal(meta.licensing.premiumSamplesIncluded, false);
    assert.equal(meta.licensing.mediaModified, false);
  });

  test("the merged library includes every RepDB record or its illustration", async () => {
    const original = await readJson("exercises-index.json");
    const repdb = await readJson("repdb-index.json");
    const merged = allExercises([], [...original, ...repdb]);
    assert.equal(merged.length, 1930);
    assert.equal(merged.filter((entry) => entry.media?.provider === "repdb").length, 583);
    assert.equal(merged.filter((entry) => entry.media?.provider === "gymvisual").length, 1316);

    const names = new Set();
    const duplicates = [];
    for (const entry of merged) {
      const key = normaliseName(entry.name);
      if (names.has(key)) duplicates.push(entry.name);
      names.add(key);
    }
    assert.deepEqual(duplicates.slice(0, 5), []);
  });

  test("detail sheets attribute both sources when a collision combines them", async () => {
    const html = renderExerciseDetail({
      id: "push-up",
      name: "Push-Up",
      muscle: "chest",
      equipment: "bodyweight",
      stepsId: "ds-0001",
      media: { provider: "repdb", poses: { main: "media/repdb/push-up-main.webp" } },
    });
    assert.match(html, /hasaneyldrm\/exercises-dataset/);
    assert.match(html, /Exercise data by <a href="https:\/\/repdb\.co"/);
    assert.match(html, /Premium evaluation animations are not included/);
  });

  test("license, provenance and visible app attribution travel with the app", async () => {
    const meta = await readJson("repdb-meta.json");
    const license = await readFile(join(ROOT, "LICENSE-REPDB.md"), "utf8");
    const notice = await readFile(join(ROOT, "NOTICE"), "utf8");
    const settings = await readFile(join(ROOT, "app/js/views/settings.js"), "utf8");
    assert.match(meta.source.commit, /^[0-9a-f]{40}$/);
    assert.match(license, /Free Tier License/);
    assert.match(license, /Attribution required/);
    assert.match(license, /No redistribution as a dataset/);
    assert.match(notice, /Exercise data by RepDB \(repdb\.co\)/);
    assert.match(settings, /Exercise data by <a href="https:\/\/repdb\.co"/);
    assert.equal(existsSync(join(ROOT, "app/data/exercises.json")), false);
    assert.equal(existsSync(join(ROOT, "app/premium-samples")), false);
  });
});
