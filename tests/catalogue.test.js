/**
 * Tests for the external exercise catalogue: taxonomy mapping, merge
 * precedence, per-language instruction loading, and — most importantly — the
 * assertion that no unlicensed third-party media is redistributed.
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  availableLanguages,
  clearStepsCache,
  hasInstructions,
  loadCatalogue,
  normaliseName,
  rawDatasetId,
  stepsFor,
  stepsKey,
} from "../app/js/catalogue.js";
import { mapMuscle } from "../scripts/build-exercise-data.mjs";
import { allExercises, searchExercises } from "../app/js/exercises.js";
import { Store } from "../app/js/store.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = join(ROOT, "app/data");

// A fetch stub so the loaders can be exercised without a network.
function stubFetch(payloads) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    const body = payloads[url];
    if (body === undefined) return { ok: false, status: 404, json: async () => null };
    if (body instanceof Error) throw body;
    return { ok: true, status: 200, json: async () => body };
  };
  return calls;
}

const read = (name) => readFile(join(DATA, name), "utf8");

describe("normaliseName", () => {
  test("lowercases and collapses separators", () => {
    assert.equal(normaliseName("Barbell Bench Press"), "barbell bench press");
    assert.equal(normaliseName("Push-Up!"), "push up");
    assert.equal(normaliseName("  Dumbbell   Fly "), "dumbbell fly");
  });

  test("handles nullish input", () => {
    assert.equal(normaliseName(undefined), "");
    assert.equal(normaliseName(null), "");
  });
});

describe("mapMuscle", () => {
  test("prefers the specific target over body part", () => {
    // body_part says "upper legs" but target pinpoints hamstrings.
    assert.equal(mapMuscle({ target: "hamstrings", body_part: "upper legs" }), "hamstrings");
    assert.equal(mapMuscle({ target: "pectorals", body_part: "chest" }), "chest");
    assert.equal(mapMuscle({ target: "delts", body_part: "shoulders" }), "shoulders");
  });

  test("groups the back's several targets together", () => {
    for (const target of ["lats", "upper back", "traps", "spine", "levator scapulae", "serratus anterior"]) {
      assert.equal(mapMuscle({ target, body_part: "back" }), "back", target);
    }
  });

  test("routes hip musculature to glutes", () => {
    for (const target of ["glutes", "abductors", "adductors"]) {
      assert.equal(mapMuscle({ target, body_part: "upper legs" }), "glutes", target);
    }
  });

  test("maps abs to core and cardio to cardio", () => {
    assert.equal(mapMuscle({ target: "abs", body_part: "waist" }), "core");
    assert.equal(mapMuscle({ target: "cardiovascular system", body_part: "cardio" }), "cardio");
  });

  test("falls back to body part when target is unknown or absent", () => {
    assert.equal(mapMuscle({ target: null, body_part: "lower arms" }), "forearms");
    assert.equal(mapMuscle({ body_part: "lower legs" }), "calves");
    assert.equal(mapMuscle({ body_part: "neck" }), "neck");
  });

  test("degrades to other for unrecognised taxonomy", () => {
    assert.equal(mapMuscle({ target: "something new", body_part: "also new" }), "other");
    assert.equal(mapMuscle({}), "other");
  });
});

describe("rawDatasetId", () => {
  test("strips the ds- prefix used to key step packs", () => {
    assert.equal(rawDatasetId("ds-0001"), "0001");
    assert.equal(rawDatasetId("ds-1326"), "1326");
  });

  test("leaves non-dataset ids alone", () => {
    assert.equal(rawDatasetId("bench-press"), "bench-press");
    assert.equal(rawDatasetId("custom-abc123"), "custom-abc123");
  });
});

describe("allExercises over a dataset-shaped fixture", () => {
  const dataset = [
    { id: "ds-0001", name: "Push-Up", muscle: "chest", source: "dataset" },
    { id: "ds-0002", name: "Leverage Deadlift", muscle: "back", source: "dataset" },
  ];

  test("custom exercises stay addressable under their own id", () => {
    const custom = [{ id: "custom-1", name: "My Own Move", muscle: "back", equipment: "other", custom: true }];
    const merged = allExercises(custom, dataset);
    const index = Object.fromEntries(merged.map((e) => [e.id, e]));
    assert.ok(index["custom-1"], "the custom entry survives the merge");
    assert.ok(index["ds-0002"], "catalogue entries survive alongside it");
  });

  test("a custom entry with a dataset id overrides it", () => {
    const custom = [{ id: "ds-0001", name: "My Push", muscle: "chest", equipment: "other", custom: true }];
    const merged = allExercises(custom, dataset);
    const index = Object.fromEntries(merged.map((e) => [e.id, e]));
    assert.equal(index["ds-0001"].name, "My Push");
    assert.equal(merged.length, 2);
  });

  test("skips malformed custom entries", () => {
    const merged = allExercises([null, undefined, { name: "no id" }, { id: "" }], dataset);
    assert.equal(merged.length, 2);
  });
});

describe("searchExercises over a catalogue-shaped fixture", () => {
  // A bare fixture rather than allExercises(), which would also pull in the 90
  // curated starter entries and change every expected count.
  const merged = [
    { id: "ds-a", name: "Barbell Bench Press", muscle: "chest", equipment: "barbell", target: "pectorals", source: "dataset" },
    { id: "ds-b", name: "Incline Dumbbell Press", muscle: "chest", equipment: "dumbbell", target: "pectorals", source: "dataset" },
    { id: "ds-c", name: "Leverage Shrug", muscle: "back", equipment: "leverage machine", target: "traps", source: "dataset" },
  ];

  test("exact name match ranks first", () => {
    const results = searchExercises(merged, "Leverage Shrug");
    assert.equal(results[0].id, "ds-c");
  });

  test("prefix beats substring", () => {
    const results = searchExercises(merged, "barbell");
    assert.equal(results[0].id, "ds-a");
  });

  test("matches on target as well as name", () => {
    const ids = searchExercises(merged, "pectorals").map((e) => e.id);
    assert.ok(ids.includes("ds-a") && ids.includes("ds-b"));
  });

  test("respects the muscle filter alongside ranking", () => {
    const results = searchExercises(merged, "press", "back");
    assert.equal(results.length, 0);
    assert.equal(searchExercises(merged, "press", "chest").length, 2);
  });

  test("empty query returns everything for the filter", () => {
    assert.equal(searchExercises(merged, "", "chest").length, 2);
  });
});

describe("loadCatalogue", () => {
  test("returns the index and metadata on success", async () => {
    clearStepsCache();
    stubFetch({
      "data/exercises-index.json": [{ id: "ds-0001", name: "X" }],
      "data/catalogue-meta.json": { counts: { exercises: 1 } },
    });
    const result = await loadCatalogue("");
    assert.equal(result.available, true);
    assert.equal(result.exercises.length, 1);
    assert.equal(result.meta.counts.exercises, 1);
  });

  test("degrades to unavailable rather than throwing on a 404", async () => {
    clearStepsCache();
    stubFetch({});
    const result = await loadCatalogue("");
    assert.deepEqual(result, { exercises: [], meta: null, available: false });
  });

  test("degrades to unavailable on a network failure", async () => {
    clearStepsCache();
    stubFetch({
      "data/exercises-index.json": new Error("offline"),
      "data/catalogue-meta.json": new Error("offline"),
    });
    const result = await loadCatalogue("");
    assert.equal(result.available, false);
  });

  test("treats a non-array payload as unavailable", async () => {
    clearStepsCache();
    stubFetch({ "data/exercises-index.json": { nope: true }, "data/catalogue-meta.json": null });
    assert.equal((await loadCatalogue("")).available, false);
  });

  test("honours a base path prefix without doubling the slash", async () => {
    clearStepsCache();
    const calls = stubFetch({ "app/data/exercises-index.json": [{ id: "ds-1", name: "Y" }] });
    await loadCatalogue("app/");
    assert.ok(calls.includes("app/data/exercises-index.json"));
  });
});

describe("hasInstructions / stepsKey", () => {
  test("catalogue entries resolve through their own id", () => {
    const e = { id: "ds-0007", name: "X", source: "dataset" };
    assert.equal(hasInstructions(e), true);
    assert.equal(stepsKey(e), "ds-0007");
  });

  test("linked curated entries resolve through stepsId", () => {
    const e = { id: "push-up", name: "Push-Up", stepsId: "ds-0662" };
    assert.equal(hasInstructions(e), true);
    assert.equal(stepsKey(e), "ds-0662");
  });

  test("unlinked curated and custom entries have no instructions", () => {
    assert.equal(hasInstructions({ id: "bench-press", name: "Bench Press" }), false);
    assert.equal(stepsKey({ id: "bench-press", name: "Bench Press" }), null);
    assert.equal(hasInstructions({ id: "custom-1", custom: true }), false);
  });

  test("tolerates nullish input", () => {
    assert.equal(hasInstructions(null), false);
    assert.equal(hasInstructions(undefined), false);
    assert.equal(stepsKey(null), null);
  });
});

describe("stepsFor", () => {
  test("returns the requested language when present", async () => {
    clearStepsCache();
    stubFetch({
      "data/steps.fr.json": { "0001": ["Étape une", "Étape deux"] },
      "data/steps.en.json": { "0001": ["Step one"] },
    });
    const result = await stepsFor("ds-0001", "fr", "");
    assert.equal(result.language, "fr");
    assert.equal(result.fellBack, false);
    assert.equal(result.steps.length, 2);
  });

  test("falls back to English when the pack lacks that exercise", async () => {
    clearStepsCache();
    stubFetch({
      "data/steps.fr.json": { "9999": ["Autre"] },
      "data/steps.en.json": { "0001": ["Step one", "Step two"] },
    });
    const result = await stepsFor("ds-0001", "fr", "");
    assert.equal(result.language, "en");
    assert.equal(result.fellBack, true);
    assert.equal(result.steps.length, 2);
  });

  test("returns empty rather than throwing when nothing is available", async () => {
    clearStepsCache();
    stubFetch({});
    const result = await stepsFor("ds-0001", "fr", "");
    assert.deepEqual(result.steps, []);
  });

  test("accepts an exercise object and follows its stepsId", async () => {
    clearStepsCache();
    stubFetch({ "data/steps.en.json": { "0662": ["Step one", "Step two"] } });
    const linked = { id: "push-up", name: "Push-Up", stepsId: "ds-0662" };
    const result = await stepsFor(linked, "en", "");
    assert.equal(result.steps.length, 2);
    assert.equal(result.fellBack, false);
  });

  test("an exercise with no catalogue link yields no steps without fetching", async () => {
    clearStepsCache();
    const calls = stubFetch({ "data/steps.en.json": { "0662": ["Step one"] } });
    const result = await stepsFor({ id: "bench-press", name: "Bench Press" }, "en", "");
    assert.deepEqual(result.steps, []);
    assert.equal(calls.length, 1, "still resolves via the en pack, but finds no entry");
  });

  test("memoises a language pack across calls", async () => {
    clearStepsCache();
    const calls = stubFetch({
      "data/steps.en.json": { "0001": ["Step one"] },
    });
    await stepsFor("ds-0001", "en", "");
    await stepsFor("ds-0001", "en", "");
    assert.equal(calls.filter((c) => c === "data/steps.en.json").length, 1);
  });
});

describe("availableLanguages", () => {
  test("names each language in English and in its own words", () => {
    const langs = availableLanguages({ languages: [{ code: "en" }, { code: "hi" }] });
    assert.equal(langs.length, 2);
    assert.deepEqual(langs[1], { code: "hi", label: "Hindi", native: "\u0939\u093f\u0928\u094d\u0926\u0940" });
  });

  test("defaults to English when metadata is absent", () => {
    assert.deepEqual(availableLanguages(null), [{ code: "en", label: "English", native: "English" }]);
    assert.equal(availableLanguages({ languages: [] }).length, 1);
  });

  test("survives an unknown language code without inventing a name", () => {
    const langs = availableLanguages({ languages: [{ code: "xx", label: "Unknown" }] });
    assert.deepEqual(langs[0], { code: "xx", label: "Unknown", native: "Unknown" });
  });

  test("no language entry relies on an emoji flag", () => {
    // Emoji standing in for an icon system is off the craft floor, and a flag
    // is not a language anyway.
    const langs = availableLanguages({ languages: [{ code: "en" }, { code: "es" }, { code: "zh" }] });
    for (const l of langs) {
      assert.equal(l.flag, undefined);
      assert.ok(l.native.length > 0);
      assert.doesNotMatch(l.native, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    }
  });
});

describe("Store catalogue integration", () => {
  test("exercises() is empty before the catalogue loads", () => {
    const store = new Store();
    assert.equal(store.catalogueState, "idle");
    assert.equal(store.catalogueReady, false);
    assert.equal(store.exercises().length, 0);
    assert.equal(store.exerciseIndex()["bench-press"], undefined);
  });

  test("merges the catalogue and announces readiness", async () => {
    const store = new Store();
    const events = [];
    store.subscribe((e) => events.push(e.type));
    stubFetch({
      "data/exercises-index.json": [{ id: "ds-0002", name: "Leverage Deadlift", muscle: "back", equipment: "leverage machine", source: "dataset" }],
      "data/catalogue-meta.json": { counts: { exercises: 1 }, languages: [{ code: "en", label: "English" }] },
    });

    const ok = await store.loadCatalogue("");
    assert.equal(ok, true);
    assert.equal(store.catalogueReady, true);
    assert.equal(store.catalogue.length, 1);
    assert.ok(events.includes("catalogue:loading"));
    assert.ok(events.includes("catalogue:ready"));
    assert.ok(store.exerciseIndex()["ds-0002"], "catalogue ids are resolvable");
  });

  test("stays empty when the fetch fails", async () => {
    const store = new Store();
    stubFetch({});
    const ok = await store.loadCatalogue("");
    assert.equal(ok, false);
    assert.equal(store.catalogueState, "unavailable");
    assert.equal(store.catalogueReady, false);
    assert.equal(store.exercises().length, 0);
  });

  test("does not start a second concurrent load", async () => {
    const store = new Store();
    stubFetch({ "data/exercises-index.json": [{ id: "ds-0003", name: "Z", muscle: "back" }] });
    const first = store.loadCatalogue("");
    const second = await store.loadCatalogue("");
    assert.equal(second, false);
    await first;
  });

  test("instruction language defaults to English and is persisted", () => {
    const store = new Store();
    assert.equal(store.settings.instructionLanguage, "en");
    store.updateSettings({ instructionLanguage: "hi" });
    assert.equal(new Store(store.storage).settings.instructionLanguage, "hi");
  });

  test("exerciseIndex cache invalidates when a custom exercise is added", async () => {
    const store = new Store();
    stubFetch({ "data/exercises-index.json": [{ id: "ds-0004", name: "Catalogue Thing", muscle: "back" }] });
    await store.loadCatalogue("");
    const before = store.exerciseIndex();
    store.addCustomExercise({ name: "My Move", muscle: "core", equipment: "barbell" });
    const after = store.exerciseIndex();
    assert.notEqual(before, after);
    assert.ok(Object.keys(after).some((k) => k.startsWith("custom-")));
    assert.ok(after["ds-0004"], "catalogue entries survive the rebuild");
  });
});

// ── Licensing guard ────────────────────────────────────────────────────────
//
// The upstream repository's MIT grant covers its data and instruction text.
// Its images/ and videos/ are © Gym Visual and are redistributed with the
// rights holder's permission at 180x180 with attribution; IronLog's operator
// holds that media licence. These tests assert against the committed artefacts
// so a regenerated or hand-edited data file cannot quietly introduce remote,
// raw-upstream or otherwise unlicensed media references.

describe("committed catalogue media licensing", () => {
  // The attribution string legitimately contains the Gym Visual URL, so only
  // raw upstream field names are banned at file scope; media-path safety is
  // enforced per record (local gymvisual paths, no scheme) above.
  const REMOTE_MARKERS = ["gif_url", "media_id", "/images/", "/videos/"];

  test("every index record carries local licensed gymvisual media", async () => {
    const index = JSON.parse(await read("exercises-index.json"));
    for (const entry of index) {
      const media = entry.media;
      assert.ok(media, `${entry.id} must carry a media field`);
      assert.equal(media.provider, "gymvisual");
      assert.match(media.gif, /^media\/gymvisual\/[^/]+\.gif$/);
      assert.match(media.image, /^media\/gymvisual\/[^/]+\.jpg$/);
      assert.match(media.credit, /Gym visual/i, `${entry.id} must retain Gym Visual attribution`);
      assert.ok(!/^https?:\/\//.test(media.gif));
      assert.ok(!/^https?:\/\//.test(media.image));
    }
  });

  test("index contains no remote or raw-upstream media fields", async () => {
    const raw = await read("exercises-index.json");
    const lower = raw.toLowerCase();
    for (const marker of REMOTE_MARKERS) {
      assert.ok(!lower.includes(marker), `exercises-index.json must not contain "${marker}"`);
    }
  });

  test("every language pack contains no remote media reference", async () => {
    const meta = JSON.parse(await read("catalogue-meta.json"));
    assert.ok(meta.languages.length > 0, "expected generated language metadata");
    for (const lang of meta.languages) {
      const lower = (await read(`steps.${lang.code}.json`)).toLowerCase();
      for (const marker of REMOTE_MARKERS) {
        assert.ok(!lower.includes(marker), `steps.${lang.code}.json must not contain "${marker}"`);
      }
    }
  });

  test("metadata records the included licensed media", async () => {
    const meta = JSON.parse(await read("catalogue-meta.json"));
    assert.equal(meta.licensing.media.included, true);
    assert.equal(meta.licensing.media.provider, "gymvisual");
    assert.ok(meta.licensing.media.copyright.includes("Gym Visual"));
    assert.ok(meta.licensing.media.mediaCopied > 0, "expected media files to have been copied");
    assert.equal(meta.licensing.upstreamLicenseContainsMediaException, true);
  });

  test("metadata retains the upstream MIT copyright notice", async () => {
    const meta = JSON.parse(await read("catalogue-meta.json"));
    assert.equal(meta.licensing.data.license, "MIT");
    assert.match(meta.licensing.data.copyright, /Hasan Emir/i);
    assert.match(meta.source.repository, /hasaneyldrm\/exercises-dataset/);
  });

  test("index and step packs agree on ids", async () => {
    const index = JSON.parse(await read("exercises-index.json"));
    const steps = JSON.parse(await read("steps.en.json"));
    const datasetIds = index.filter((e) => e.source === "dataset").map((e) => rawDatasetId(e.id));
    assert.ok(datasetIds.length > 1000, `expected a large catalogue, got ${datasetIds.length}`);
    const missing = datasetIds.filter((id) => !steps[id]);
    assert.deepEqual(missing.slice(0, 5), [], `${missing.length} exercises have no English steps`);
  });

  test("every catalogue record maps to a known muscle group", async () => {
    const index = JSON.parse(await read("exercises-index.json"));
    const { MUSCLE_GROUPS } = await import("../app/js/exercises.js");
    const known = new Set(MUSCLE_GROUPS);
    const unknown = index.filter((e) => !known.has(e.muscle));
    assert.deepEqual(unknown.map((e) => `${e.id}:${e.muscle}`).slice(0, 5), []);
  });

  test("every dataset exercise resolves its own instructions", async () => {
    const index = JSON.parse(await read("exercises-index.json"));
    const steps = JSON.parse(await read("steps.en.json"));

    const withSteps = index.filter((e) => Array.isArray(steps[rawDatasetId(e.id)]));
    assert.ok(withSteps.length > 1200, `expected most catalogue entries to have English steps, got ${withSteps.length}`);
    assert.ok(withSteps.every((e) => hasInstructions(e)));
  });

  test("no exercise is duplicated by name in the merged library", async () => {
    const index = JSON.parse(await read("exercises-index.json"));
    const merged = allExercises([], index);
    const seen = new Map();
    const dupes = [];
    for (const e of merged) {
      const key = normaliseName(e.name);
      if (seen.has(key) && !e.custom) dupes.push(`${seen.get(key)}/${e.id}: ${e.name}`);
      else seen.set(key, e.id);
    }
    assert.deepEqual(dupes.slice(0, 5), [], `${dupes.length} duplicate names in the merged library`);
  });

  test("NOTICE file documents both the MIT data and the excluded media", async () => {
    const notice = await readFile(join(ROOT, "NOTICE"), "utf8");
    assert.match(notice, /hasaneyldrm\/exercises-dataset/);
    assert.match(notice, /MIT/);
    assert.match(notice, /Hasan Emir/i);
    assert.match(notice, /Gym Visual/);
    assert.match(notice, /operator holds that media licence/i);
  });
});
