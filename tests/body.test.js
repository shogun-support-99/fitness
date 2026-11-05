/**
 * Muscle-map geometry tests.
 *
 * The figure is drawn by authoring the left half and mirroring it, so symmetry
 * is a property of the data rather than something a reviewer has to eyeball.
 * These tests assert that property directly: half-shapes stay on their side of
 * the centre line, and anything drawn once is centred on it. A shape that
 * breaks either rule renders as a visibly lopsided body, which is exactly the
 * kind of defect that survives a code review and not a screenshot.
 *
 * The second half guards against catalogue drift: the map is keyed by the
 * catalogue's own `muscle` and `target` vocabularies, so a regeneration that
 * introduces a new term would silently drop those muscles off the figure.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BODY_FRAME,
  BODY_PLATES,
  bodyMap,
  bodyPartThumb,
  groupSetCounts,
  platesForGroup,
  platesForMuscles,
  platesForTarget,
  platesFromMuscleCounts,
  platesFromTargetCounts,
  targetLabel,
} from "../app/js/body.js";
import { CATALOGUE_MUSCLES } from "../app/js/body.js";

const CENTRE = 110;

/**
 * Horizontal extent of an authored shape.
 *
 * The paths in body.js use only absolute M, L, C and Z with coordinates in
 * x,y pairs, so every even-indexed number is an x. That is a property of the
 * authored data, not of SVG in general — a relative command or an arc would
 * break it, and adding one here should break this test loudly.
 */
function extentOf(shape) {
  if (shape.el === "circle") {
    return { min: shape.cx - shape.r, max: shape.cx + shape.r, centre: shape.cx };
  }
  if (shape.el === "path") {
    const numbers = (shape.d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    const xs = numbers.filter((_, i) => i % 2 === 0);
    return { min: Math.min(...xs), max: Math.max(...xs), centre: (Math.min(...xs) + Math.max(...xs)) / 2 };
  }
  return { min: shape.x, max: shape.x + shape.w, centre: shape.x + shape.w / 2 };
}

test("every mirrored frame segment stays left of the centre line", () => {
  for (const shape of BODY_FRAME) {
    if (shape.mirror === false) continue;
    const { max } = extentOf(shape);
    assert.ok(
      max <= CENTRE + 0.01,
      `frame segment reaches x=${max}, past the centre line at ${CENTRE}: it would overlap its own mirror`,
    );
  }
});

test("every frame segment drawn once is centred on the centre line", () => {
  const singles = BODY_FRAME.filter((s) => s.mirror === false);
  assert.ok(singles.length > 0, "nothing is drawn unmirrored, so this test proves nothing");
  for (const shape of singles) {
    const { centre } = extentOf(shape);
    assert.ok(
      Math.abs(centre - CENTRE) < 0.01,
      `frame segment is centred at x=${centre}, not ${CENTRE}: the figure will lean`,
    );
  }
});

test("no frame segment falls off the left edge of the canvas", () => {
  for (const shape of BODY_FRAME) {
    const { min } = extentOf(shape);
    assert.ok(min >= 0, `frame segment starts at x=${min}, off the canvas`);
  }
});

test("every plate stays left of the centre line", () => {
  for (const plate of BODY_PLATES) {
    const shape = plate.d
      ? { el: "path", d: plate.d }
      : { el: "rect", x: plate.r.x, w: plate.r.w };
    const { max } = extentOf(shape);
    assert.ok(max <= CENTRE + 0.01, `plate "${plate.id}" reaches x=${max}, past ${CENTRE}`);
  }
});

test("rotated shapes rotate about their own centre, so mirroring stays exact", () => {
  // A rotation applied before the mirror becomes its opposite under
  // reflection, which only produces a symmetric pair if the rotation was
  // about the shape's own centre. Every rotated shape in body.js uses
  // `rotate`, which body.js applies about the rect's centre.
  for (const plate of BODY_PLATES) {
    if (!plate.r?.rotate) continue;
    const shape = { el: "rect", x: plate.r.x, w: plate.r.w };
    const { centre } = extentOf(shape);
    assert.ok(centre <= CENTRE, `rotated plate "${plate.id}" is centred at ${centre}`);
  }
});

test("the rendered figure mirrors each plate exactly once per side", () => {
  for (const view of ["front", "back"]) {
    const html = bodyMap({ view });
    // The lookahead keeps the `bodymap-regions` wrapper out of the count.
    const plates = (html.match(/class="bodymap-region(?=[ "])/g) ?? []).length;
    const mirrors = (html.match(/<g transform="matrix\(-1 0 0 1 220 0\)">/g) ?? []).length;
    // One mirror group per plate, plus one per mirrored frame segment.
    const mirroredFrame = BODY_FRAME.filter((s) => s.mirror !== false).length;
    assert.equal(mirrors, plates + mirroredFrame, `${view} view mirror count is wrong`);
    assert.equal(plates, BODY_PLATES.filter((p) => p.view === view).length);
  }
});

test("every catalogue muscle maps to at least one plate, except cardio", () => {
  for (const muscle of CATALOGUE_MUSCLES) {
    const plates = platesForMuscles([muscle]);
    if (muscle === "cardio") {
      assert.equal(plates.size, 0, "cardio has no muscle plate by design");
    } else {
      assert.ok(plates.size > 0, `muscle "${muscle}" lights nothing on the map`);
    }
  }
});

test("no plate is orphaned: every one can be lit by some muscle", () => {
  const reachable = platesForMuscles(CATALOGUE_MUSCLES);
  for (const plate of BODY_PLATES) {
    assert.ok(reachable.has(plate.id), `plate "${plate.id}" can never be lit — it is dead geometry`);
  }
});

test("the map keys off the catalogue's real vocabularies", async () => {
  // app/data is generated, so a regeneration could introduce a term the map
  // does not know. That would not throw — the muscles would just quietly stop
  // appearing on the figure — so it is asserted here instead.
  const root = fileURLToPath(new URL("../", import.meta.url));
  const index = JSON.parse(await readFile(path.join(root, "app/data/exercises-index.json"), "utf8"));

  const muscles = new Set(index.map((e) => e.muscle));
  for (const muscle of muscles) {
    if (muscle === "cardio") continue;
    assert.ok(platesForMuscles([muscle]).size > 0, `catalogue muscle "${muscle}" is missing from the map`);
  }

  const targets = new Set(index.map((e) => e.target));
  for (const target of targets) {
    if (target === "cardiovascular system") continue;
    assert.ok(platesForTarget(target).size > 0, `catalogue target "${target}" is missing from the map`);
    assert.notEqual(targetLabel(target), "", `target "${target}" has no display label`);
  }

  // The vocabularies themselves have not shifted out from under the module.
  assert.deepEqual([...muscles].sort(), [...CATALOGUE_MUSCLES].sort());
});

test("heat is normalised against the busiest plate and clamped to 1", () => {
  const html = bodyMap({
    view: "front",
    setsByPlate: platesFromMuscleCounts(new Map([["chest", 4], ["quads", 8]])),
  });
  assert.match(html, /data-region="quads" style="--t:1\.000"/);
  assert.match(html, /data-region="chest" style="--t:0\.500"/);
  assert.match(html, /data-region="abs" style="--t:0\.000"/);
  assert.ok(!/style="--t:1\.500"/.test(html), "heat must clamp at 1");
});

test("a plate with no volume is still drawn, so the figure keeps its shape", () => {
  const html = bodyMap({ view: "front" });
  const plates = BODY_PLATES.filter((p) => p.view === "front");
  for (const plate of plates) {
    assert.ok(html.includes(`data-region="${plate.id}"`), `plate ${plate.id} missing at zero volume`);
  }
});

test("a body-part card lights that part and no other", () => {
  // The class attribute is emitted before data-region, so read the opening tag
  // rather than assuming an order.
  const tag = (html, id) => (html.match(new RegExp(`<g class="[^"]*" data-region="${id}"`)) ?? [""])[0];
  const chest = bodyPartThumb("chest", { view: "front" });
  assert.ok(tag(chest, "chest").includes("is-lit"), "chest card did not light the chest");
  assert.ok(!tag(chest, "quads").includes("is-lit"), "chest card lit the quads");
  assert.ok(!tag(chest, "abs").includes("is-lit"), "chest card lit the abs");

  // Cardio has no plates, but the card still draws the mannequin so the grid
  // keeps a uniform card height.
  const cardio = bodyPartThumb("cardio", { view: "front" });
  assert.match(cardio, /class="bodymap-frame"/);
  assert.ok(!/is-lit/.test(cardio), "cardio should light nothing");
  // Same height as the others: the plates are still drawn, just unlit.
  assert.equal(
    (cardio.match(/class="bodymap-region(?=[ "])/g) ?? []).length,
    (chest.match(/class="bodymap-region(?=[ "])/g) ?? []).length,
    "the cardio card must draw the same figure so the grid stays even",
  );
});

test("target counts spread onto plates without double counting a set", () => {
  const plates = platesFromTargetCounts(new Map([["pectorals", 3], ["abs", 2]]));
  assert.equal(plates.get("chest"), 3);
  assert.equal(plates.get("abs"), 2);
  // Unrelated plates stay at zero rather than inheriting a shared total.
  assert.equal(plates.get("quads"), undefined);
});

test("groups partition the muscles without overlap", () => {
  const counts = groupSetCounts(
    new Map([
      ["chest", 3],
      ["back", 2],
      ["biceps", 1],
      ["triceps", 1],
      ["quads", 4],
      ["cardio", 5],
    ]),
  );
  assert.equal(counts.get("chest"), 3);
  assert.equal(counts.get("back"), 2);
  assert.equal(counts.get("arms"), 2, "biceps and triceps both belong to Arms");
  assert.equal(counts.get("legs"), 4);
  // Cardio is only surfaced when it was actually trained.
  assert.equal(counts.get("cardio"), 5);
  assert.equal(groupSetCounts(new Map([["chest", 1]])).has("cardio"), false);
});

test("every group's plates are the union of its muscles' plates", () => {
  for (const group of ["back", "chest", "legs", "core", "arms", "shoulders"]) {
    const union = platesForGroup(group);
    assert.ok(union.size > 0, `group "${group}" lights nothing`);
  }
  // Legs spans four muscles, so it must light more plates than a single-muscle
  // group — a sign the union is real and not just the first muscle's plates.
  assert.ok(platesForGroup("legs").size > platesForGroup("chest").size);
});
