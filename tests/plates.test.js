/**
 * Tests for the plate calculator in app/js/plates.js.
 * Pure maths, so everything runs in Node.
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";

import { BAR_WEIGHT, PLATES, formatPlates, platesForWeight, roundToStep } from "../app/js/plates.js";

describe("roundToStep", () => {
  test("rounds to the nearest step", () => {
    assert.equal(roundToStep(45.4, 0.5), 45.5);
    assert.equal(roundToStep(45.2, 0.5), 45);
    assert.equal(roundToStep(100.4, 1), 100);
    assert.equal(roundToStep(NaN, 0.5), 0);
  });
});

describe("platesForWeight (kg)", () => {
  test("bar only", () => {
    const r = platesForWeight(20, "kg");
    assert.equal(r.bar, 20);
    assert.equal(r.perSide.length, 0);
    assert.equal(r.total, 20);
    assert.equal(r.exact, true);
  });

  test("100 kg bench: 40 kg per side -> 1x25 + 1x15", () => {
    const r = platesForWeight(100, "kg");
    assert.deepEqual(r.perSide, [
      { weight: 25, count: 1 },
      { weight: 15, count: 1 },
    ]);
    assert.equal(r.total, 100);
    assert.equal(r.exact, true);
  });

  test("140 kg squat: 60 kg per side -> 2x25 + 1x10", () => {
    const r = platesForWeight(140, "kg");
    // (140 - 20) / 2 = 60 per side -> 25+25+10
    assert.deepEqual(r.perSide, [
      { weight: 25, count: 2 },
      { weight: 10, count: 1 },
    ]);
    assert.equal(r.total, 140);
    assert.equal(r.exact, true);
  });

  test("snaps an unloadable request to the nearest loadable total", () => {
    const r = platesForWeight(103, "kg");
    assert.equal(r.exact, false);
    assert.equal(r.total % 2.5, 0, "total must be loadable in 2.5 kg steps (bar + pairs of 1.25s)");
    assert.ok(Math.abs(r.total - 103) <= 1.25);
  });

  test("below the bar weight clamps to the bar", () => {
    const r = platesForWeight(10, "kg");
    assert.equal(r.total, BAR_WEIGHT.kg);
    assert.equal(r.exact, false);
  });

  test("garbage input is safe", () => {
    const r = platesForWeight("abc", "kg");
    assert.equal(r.total, BAR_WEIGHT.kg);
    assert.equal(r.exact, false);
  });
});

describe("platesForWeight (lb)", () => {
  test("225 lb: 2x45 + 1x25 + 1x10 per side", () => {
    const r = platesForWeight(225, "lb");
    assert.equal(r.bar, 45);
    // (225 - 45) / 2 = 90 per side -> 45+45
    assert.deepEqual(r.perSide, [{ weight: 45, count: 2 }]);
    assert.equal(r.total, 225);
    assert.equal(r.exact, true);
  });

  test("uses the lb inventory and 45 lb bar", () => {
    const r = platesForWeight(315, "lb");
    assert.equal(r.bar, 45);
    assert.ok(r.perSide.every((p) => PLATES.lb.includes(p.weight)));
    assert.equal(r.total, 315);
  });

  test("unknown units fall back to kg", () => {
    const r = platesForWeight(100, "stone");
    assert.equal(r.bar, 20);
    assert.equal(r.total, 100);
  });
});

describe("formatPlates", () => {
  test("renders a readable per-side line", () => {
    const r = platesForWeight(100, "kg");
    assert.equal(formatPlates(r, "kg"), "1×25 + 1×15 kg per side");
  });

  test("bar-only result says so", () => {
    const r = platesForWeight(20, "kg");
    assert.match(formatPlates(r, "kg"), /bar/i);
  });
});
