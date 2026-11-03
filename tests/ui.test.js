import test from "node:test";
import assert from "node:assert/strict";

import { esc, statTile } from "../app/js/ui.js";

test("statTile", async (t) => {
  await t.test("keeps the formatted value when no count is supplied", () => {
    const html = statTile({ label: "Volume", value: "12.4k", unit: "kg" });
    assert.match(html, />12\.4k</);
    assert.doesNotMatch(html, /data-count-to/);
    assert.match(html, /<em>kg<\/em>/);
  });

  await t.test("marks a real count for the odometer", () => {
    const html = statTile({ label: "Workouts", value: "7", countTo: 7 });
    assert.match(html, /data-count-to="7"/);
    assert.match(html, /class="odo"/);
  });

  await t.test("counts zero rather than treating it as absent", () => {
    const html = statTile({ label: "Streak", value: "0", countTo: 0 });
    assert.match(html, /data-count-to="0"/);
  });

  await t.test("escapes labels, hints and units", () => {
    const html = statTile({
      label: "<script>",
      value: "1",
      unit: "\"",
      hint: "&",
    });
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /&amp;/);
  });

  await t.test("opts into the shared reveal and hover treatment", () => {
    const html = statTile({ label: "Sets", value: "3" });
    assert.match(html, /data-reveal="rise"/);
    assert.match(html, /hover-lift/);
  });
});

test("esc", async (t) => {
  await t.test("neutralises a hostile exercise name", () => {
    assert.equal(
      esc('<img src=x onerror="alert(1)">'),
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });
});
