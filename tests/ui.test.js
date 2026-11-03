import test from "node:test";
import assert from "node:assert/strict";

import { esc, lineChart, statTile } from "../app/js/ui.js";

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

  await t.test("opts into the shared reveal, without the hover-lift tell", () => {
    const html = statTile({ label: "Sets", value: "3" });
    assert.match(html, /data-reveal="rise"/);
    assert.doesNotMatch(html, /hover-lift/);
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

test("lineChart", async (t) => {
  await t.test("renders a path and a dot per point with tooltips", () => {
    const html = lineChart(
      [
        { value: 90, label: "Oct 1: 90 kg", display: "90 kg", axis: "10-01" },
        { value: 95, label: "Oct 8: 95 kg", display: "95 kg", axis: "10-08" },
        { value: 102.5, label: "Oct 15: 102.5 kg", display: "102.5 kg", axis: "10-15" },
      ],
      { ariaLabel: "1RM progression" },
    );
    assert.match(html, /chart-line/);
    assert.match(html, /<path class="chart-line"/);
    assert.equal((html.match(/chart-dot/g) || []).length, 3);
    assert.match(html, /Oct 15: 102\.5 kg/);
    assert.match(html, /aria-label="1RM progression"/);
  });

  await t.test("escapes hostile labels", () => {
    const html = lineChart([{ value: 1, label: "<b>x</b>", display: "<i>" }]);
    assert.ok(!html.includes("<b>x</b>"));
    assert.match(html, /&lt;b&gt;/);
  });

  await t.test("empty series renders the empty state", () => {
    assert.match(lineChart([]), /chart-empty/);
    assert.match(lineChart(null), /chart-empty/);
  });

  await t.test("a single point still renders, centred", () => {
    const html = lineChart([{ value: 50, label: "only", display: "50", axis: "10-01" }]);
    assert.match(html, /chart-axis-single/);
    assert.equal((html.match(/chart-dot/g) || []).length, 1);
  });
});
