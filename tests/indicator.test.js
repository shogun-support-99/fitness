/**
 * Sliding-indicator tests.
 *
 * The indicator borrows the "limelight" navigation idea: one plate travels to
 * the active option instead of every option swapping its own background. Its
 * placement maths is the part that can be wrong in a way no one notices until a
 * pill lands two pixels off a label, so that maths is pure and tested here.
 *
 * The DOM half (observer setup, teardown) is intentionally not covered: this
 * repo has no DOM harness, and asserting on fake rects would test the test.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACTIVE_SELECTOR,
  centerOn,
  indicatorBox,
} from "../assets/js/sliding-indicator.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..");

test("indicatorBox places the plate at the target, in container coordinates", () => {
  const box = indicatorBox(
    { left: 100, top: 50, width: 300, height: 40 },
    { left: 120, top: 54, width: 80, height: 32 },
  );
  assert.deepEqual(box, { x: 20, y: 4, width: 80, height: 32 });
});

test("indicatorBox ignores container origin, so a repositioned row needs no maths", () => {
  const a = indicatorBox({ left: 0, top: 0 }, { left: 40, top: 0, width: 60, height: 20 });
  const b = indicatorBox({ left: 900, top: 400 }, { left: 940, top: 400, width: 60, height: 20 });
  assert.equal(a.x, b.x);
  assert.equal(a.y, b.y);
});

test("indicatorBox folds in scroll offset for a horizontally scrolling chip row", () => {
  // Rects are viewport-relative, but the plate lives inside the scrolled
  // content. Without the offset it would drift left as the row scrolls.
  const box = indicatorBox(
    { left: 0, top: 0, width: 200, height: 40 },
    { left: -60, top: 0, width: 70, height: 40 },
    120,
  );
  assert.equal(box.x, 60);
});

test("indicatorBox returns null when the row is hidden instead of pinning to 0,0", () => {
  // A nav behind a media query measures zero. A plate at 0,0 with zero width
  // is worse than no plate: it can flash in the corner on layout changes.
  assert.equal(
    indicatorBox({ left: 0, top: 0, width: 0, height: 0 }, { left: 0, top: 0, width: 0, height: 0 }),
    null,
  );
  assert.equal(indicatorBox(null, { left: 0, top: 0, width: 10, height: 10 }), null);
  assert.equal(indicatorBox({ left: 0, top: 0, width: 100, height: 40 }, null), null);
});

test("indicatorBox tolerates missing or non-numeric rect fields", () => {
  const box = indicatorBox({}, { width: 24, height: 12 });
  assert.deepEqual(box, { x: 0, y: 0, width: 24, height: 12 });
  assert.equal(indicatorBox({}, { width: "0", height: 12 }), null);
});

test("centerOn narrows a plate to a fixed width and centres it on the option", () => {
  // The landing nav's notch is a 16px tab under the word, not a full-width
  // rule. Converting it to the sliding plate must not quietly widen it.
  const box = { x: 100, y: 0, width: 64, height: 3 };
  assert.deepEqual(centerOn(box, 16), { x: 124, y: 0, width: 16, height: 3 });
});

test("centerOn leaves the box alone when no fixed width applies", () => {
  const box = { x: 10, y: 2, width: 40, height: 24 };
  for (const width of [null, undefined, 0, -1, NaN, "16"]) {
    assert.deepEqual(centerOn(box, width), box, `unchanged for ${String(width)}`);
  }
  assert.equal(centerOn(null, 16), null);
});

test("centerOn never overhangs an option narrower than the plate", () => {
  // Otherwise a short link's notch would spill into the previous one.
  const box = { x: 0, y: 0, width: 12, height: 3 };
  const placed = centerOn(box, 16);
  assert.equal(placed.x, 0);
  assert.equal(placed.width, 12);
});

test("ACTIVE_SELECTOR covers every state the app and landing page actually use", async () => {
  // Each of these is set somewhere in the codebase; if one were dropped here
  // the plate would simply never appear on that control, silently.
  const sources = [
    "index.html",
    "assets/js/landing.js",
    "app/js/views/settings.js",
    "app/js/views/profile-common.js",
    "app/js/main.js",
  ];

  const corpus = (
    await Promise.all(
      sources.map((rel) => readFile(path.join(repoRoot, rel), "utf8")),
    )
  ).join("\n");

  for (const state of [
    'aria-selected="true"',
    'aria-current="true"',
    'aria-checked="true"',
    "is-active",
    "is-on",
  ]) {
    assert.ok(ACTIVE_SELECTOR.includes(state.replace(/"/g, '"')), `selector covers ${state}`);
  }

  assert.ok(corpus.includes('aria-selected="true"'), "landing tabs use aria-selected");
  assert.ok(corpus.includes("is-on"), "site nav marks the active section with is-on");
});

test("the indicator stylesheet keeps the plate behind the labels", async () => {
  // If this inverts, the plate paints over the text and the control looks
  // broken rather than animated.
  for (const rel of ["app/css/app.css", "assets/css/landing.css"]) {
    const css = await readFile(path.join(repoRoot, rel), "utf8");
    const rule = css.match(/\.seg-indicator \{[^}]*\}/);
    assert.ok(rule, `${rel} styles .seg-indicator`);
    assert.match(rule[0], /z-index:\s*0;/, `${rel} puts the plate at z-index 0`);
    assert.match(
      css,
      /\[data-indicator\] > \*:not\(\.seg-indicator\) \{[^}]*z-index:\s*1;/,
      `${rel} lifts the options above the plate, and not the plate itself`,
    );
  }
});

test("the underline variant releases top so the notch sits on the bottom edge", async () => {
  // With top and height both set, bottom is ignored and the notch renders
  // along the top of the nav link. This is the bug, asserted against.
  for (const rel of ["app/css/app.css", "assets/css/landing.css"]) {
    const css = await readFile(path.join(repoRoot, rel), "utf8");
    const rule = css.match(/\.seg-indicator\.is-underline \{[^}]*\}/);
    assert.ok(rule, `${rel} styles the underline variant`);
    assert.match(rule[0], /top:\s*auto;/, `${rel} sets top: auto on the notch`);
    assert.match(rule[0], /bottom:/, `${rel} anchors the notch to the bottom`);
  }
});

test("active options inside an indicator row drop their own background", async () => {
  // Two plates show a seam as the indicator travels past, so the option
  // underneath has to go transparent.
  const css = await readFile(path.join(repoRoot, "app/css/app.css"), "utf8");
  assert.match(
    css,
    /\[data-indicator\] > \.segment\.is-active[\s\S]*?background:\s*none;/,
    "segmented options stop drawing their own active surface",
  );
  assert.match(
    css,
    /\[data-indicator\] > \.seg-btn\.is-active/,
    "front/back switch stops drawing its own active surface",
  );
});

test("segmented buttons reserve their border whether active or not", async () => {
  // The active state used to add a 1px border the others lacked, so switching
  // units shunted the whole row sideways by 2px.
  const css = await readFile(path.join(repoRoot, "app/css/app.css"), "utf8");
  const rule = css.match(/\.segmented button \{[^}]*\}/);
  assert.ok(rule, ".segmented button exists");
  assert.match(rule[0], /border:\s*1px solid transparent;/, "border is always reserved");
  assert.doesNotMatch(rule[0], /border:\s*0;/, "and not added only on the active state");
});
