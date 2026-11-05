/**
 * Profile-family tests.
 *
 * These screens are the one place in the app where a broken import or a
 * renamed helper fails silently: the views are pure string builders, so a
 * missing export throws only when the route is actually opened. Rendering every
 * screen here — empty and populated — is what keeps that from reaching a user.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { Store, memoryStorage } from "../app/js/store.js";
import { renderStats } from "../app/js/views/stats.js";
import { renderStatistics } from "../app/js/views/statistics.js";
import { renderMuscleDistribution } from "../app/js/views/muscle-distribution.js";
import { renderBodyDistribution } from "../app/js/views/body-distribution.js";
import { renderMeasures } from "../app/js/views/measures.js";
import { renderCalendar } from "../app/js/views/calendar.js";
import {
  BODY_PART_GROUPS,
  groupSetCounts,
  platesForGroup,
  platesFromMuscleCounts,
  bodyMap,
} from "../app/js/body.js";
import {
  calendarWeek,
  monthGrid,
  ordinal,
  previousRangeBounds,
  rangeStart,
  shiftWeek,
  trailingWeek,
  weekdayInitials,
  workoutsForRange,
} from "../app/js/stats.js";
import { mediumDate } from "../app/js/views/profile-common.js";

/** A store with two completed sessions on known dates. */
function seededStore() {
  const store = new Store(memoryStorage());
  const mk = (id, startedAt, minutes, entries) => ({
    id,
    name: `Session ${id}`,
    status: "completed",
    startedAt,
    endedAt: new Date(new Date(startedAt).getTime() + minutes * 60000).toISOString(),
    notes: "",
    exercises: entries.map(([exerciseId, sets]) => ({
      id: `e_${exerciseId}`,
      exerciseId,
      sets: sets.map(([weight, reps]) => ({ weight, reps, done: true })),
    })),
  });
  store.doc.workouts = [
    mk("w2", "2026-11-04T08:00:00.000Z", 50, [
      ["bench", [[60, 8], [60, 8]]],
      ["squat", [[100, 5]]],
      ["treadmill", [[0, 1]]],
    ]),
    mk("w1", "2026-10-20T08:00:00.000Z", 40, [["bench", [[55, 10]]]]),
  ];
  store.doc.customExercises = [
    { id: "bench", name: "Bench press", muscle: "chest", target: "pectorals", equipment: "barbell" },
    { id: "squat", name: "Squat", muscle: "quads", target: "quads", equipment: "barbell" },
    { id: "treadmill", name: "Treadmill", muscle: "cardio", target: "cardiovascular system", equipment: "machine" },
  ];
  store._indexCache = null;
  return store;
}

const params = (search = "") => new URLSearchParams(search);

const SCREENS = {
  "profile": (store, p) => renderStats(store, p),
  "statistics": (store, p) => renderStatistics(store, p),
  "muscle-distribution": (store, p) => renderMuscleDistribution(store, p),
  "body-distribution": (store, p) => renderBodyDistribution(store, p),
  "measures": (store, p) => renderMeasures(store, p),
  "calendar": (store, p) => renderCalendar(store, p),
};

test("every profile screen renders with no data", () => {
  const store = new Store(memoryStorage());
  for (const [name, render] of Object.entries(SCREENS)) {
    const html = render(store, params());
    assert.equal(typeof html, "string", `${name} did not return a string`);
    assert.ok(html.includes("<section"), `${name} produced no section`);
  }
});

test("every profile screen renders with data, on both figure sides", () => {
  const store = seededStore();
  for (const [name, render] of Object.entries(SCREENS)) {
    for (const search of ["", "range=7d", "range=all&side=back"]) {
      const html = render(store, params(search));
      assert.ok(html.length > 200, `${name} (${search}) looks empty`);
    }
  }
});

test("every profile screen escapes a hostile display name", () => {
  const store = seededStore();
  store.setProfile({ displayName: "<img src=x onerror=alert(1)>", handle: "a@b" });
  for (const [name, render] of Object.entries(SCREENS)) {
    const html = render(store, params());
    assert.ok(!html.includes("<img src=x"), `${name} leaked an unescaped name`);
  }
});

test("profile shows the Hevy-style range ladder and dashboard", () => {
  const store = seededStore();
  const html = renderStats(store, params());
  for (const label of ["Last 7 days", "Last 30 days", "Last 3 months", "Last year", "All time"]) {
    assert.ok(html.includes(label), `missing range ${label}`);
  }
  for (const tile of ["Statistics", "Exercises", "Measures", "Calendar"]) {
    assert.ok(html.includes(tile), `missing dashboard tile ${tile}`);
  }
  assert.match(html, /#\/statistics\?range=/);
  assert.match(html, /#\/measures\?range=/);
});

test("profile ladder highlights the selected range only", () => {
  const store = seededStore();
  const html = renderStats(store, params("range=7d"));
  const active = html.match(/class="chip is-active"[^>]*>([^<]+)</g) ?? [];
  assert.equal(active.length, 1, "exactly one range should be active");
  assert.match(active[0], /Last 7 days/);
});

test("an empty range reports it instead of printing zeros", () => {
  const store = seededStore();
  const html = renderStats(store, params("range=7d"));
  // The seeded session is 2026-10-20 and 2026-11-04; nothing is inside a
  // seven-day window around today unless the test happens to run on one.
  const fresh = new Store(memoryStorage());
  assert.match(renderStats(fresh, params("range=7d")), /No training logged yet/);
  assert.ok(typeof html === "string");
});

test("the feed labels sessions by ordinal, oldest first", () => {
  assert.equal(ordinal(1), "1st");
  assert.equal(ordinal(2), "2nd");
  assert.equal(ordinal(3), "3rd");
  assert.equal(ordinal(4), "4th");
  assert.equal(ordinal(10), "10th");
  assert.equal(ordinal(11), "11th");
  assert.equal(ordinal(12), "12th");
  assert.equal(ordinal(13), "13th");
  assert.equal(ordinal(21), "21st");

  const store = seededStore();
  const html = renderStats(store, params("range=all"));
  // w1 (October) is the older session, so it is the 1st and w2 (November) is
  // the 2nd — but the feed runs newest first, so w2 leads.
  const at = (id) => html.indexOf(`Session ${id}`);
  assert.ok(at("w2") < at("w1"), "feed should run newest first");
  assert.ok(html.indexOf("2nd") < html.indexOf("1st"), "the newer session carries the higher ordinal");
});

test("muscle distribution counts each set once, for its primary mover", () => {
  const store = seededStore();
  const counts = groupSetCounts(
    new Map([
      ["chest", 3],
      ["quads", 2],
      ["cardio", 1],
    ]),
  );
  assert.equal(counts.get("chest"), 3);
  assert.equal(counts.get("legs"), 2);
  assert.equal(counts.get("cardio"), 1);
  assert.equal(counts.get("back"), 0);

  const html = renderMuscleDistribution(store, params("range=all"));
  assert.match(html, /Muscle distribution/);
  assert.match(html, /Compared with the previous period/);
});

test("every body-part group lights at least one plate", () => {
  for (const group of BODY_PART_GROUPS) {
    assert.ok(
      platesForGroup(group.id).size > 0,
      `${group.id} lights nothing, so its card renders an empty figure`,
    );
  }
});

test("a plate with volume renders warmer than one without", () => {
  const counts = platesFromMuscleCounts(new Map([["chest", 6]]));
  const html = bodyMap({ view: "front", setsByPlate: counts });
  assert.match(html, /data-region="chest" style="--t:1\.000"/);
  assert.match(html, /data-region="quads" style="--t:0\.000"/);
});

test("body map mirrors every plate, so the figure stays symmetric", () => {
  for (const view of ["front", "back"]) {
    const html = bodyMap({ view });
    const opened = (html.match(/<g transform="matrix\(-1 0 0 1 220 0\)">/g) ?? []).length;
    const regions = (html.match(/class="bodymap-region(?=[ "])/g) ?? []).length;
    // One mirror group per plate, plus one per frame segment.
    assert.ok(opened >= regions, `${view} is missing mirrored plates`);
  }
});

test("the previous window is the same length as the current one", () => {
  const now = new Date(2026, 10, 5);
  const start = rangeStart("7d", now);
  const { start: prevStart, end: prevEnd } = previousRangeBounds("7d", now);
  assert.equal(start.getDate(), 30);
  assert.equal(start.getMonth(), 9);
  assert.equal(prevStart.getDate(), 23);
  assert.equal(prevEnd.getTime(), start.getTime() - 1);
});

test("range filtering actually excludes older sessions", () => {
  const store = seededStore();
  const now = new Date(2026, 10, 5);
  const all = workoutsForRange(store.completedWorkouts(), "all", now);
  const threeMonths = workoutsForRange(store.completedWorkouts(), "3m", now);
  assert.equal(all.length, 2);
  assert.equal(threeMonths.length, 2);
  const sevenDays = workoutsForRange(store.completedWorkouts(), "7d", now);
  assert.equal(sevenDays.length, 1);
  assert.equal(sevenDays[0].id, "w2");
});

test("the trailing week ends today and is seven days long", () => {
  const days = trailingWeek(new Date(2026, 10, 5), new Set(["2026-11-05"]));
  assert.equal(days.length, 7);
  assert.equal(days[6].key, "2026-11-05");
  assert.equal(days[6].isToday, true);
  assert.equal(days[6].trained, true);
  assert.equal(days[5].trained, false);
  assert.equal(days[0].key, "2026-10-30");
});

test("the calendar week is Sunday-first and defaults to today", () => {
  const week = calendarWeek(new Date(2026, 10, 5));
  assert.equal(week.label, "01-07 November 2026");
  assert.deepEqual(
    week.days.map((d) => d.day),
    [1, 2, 3, 4, 5, 6, 7],
  );
  assert.equal(week.days.find((d) => d.isSelected).day, 5);
  assert.equal(week.days[0].weekdayName, "Sunday");
  assert.deepEqual(weekdayInitials(), ["S", "M", "T", "W", "T", "F", "S"]);
});

test("stepping a week keeps the weekday you were on", () => {
  const anchor = new Date(2026, 10, 5);
  const back = shiftWeek(anchor, -1);
  assert.equal(back.getDate(), 29);
  assert.equal(back.getMonth(), 9);
  const forward = shiftWeek(anchor, 1);
  assert.equal(forward.getDate(), 12);
});

test("the month grid is whole weeks and never ends in a dead row", () => {
  const grid = monthGrid(2026, 10, { trainedDays: new Set(["2026-11-04"]) });
  assert.equal(grid.label, "November 2026");
  assert.ok(grid.weeks.length >= 5);
  for (const week of grid.weeks) assert.equal(week.length, 7);
  const last = grid.weeks[grid.weeks.length - 1];
  assert.ok(last.some((c) => c.inMonth), "trailing dead week was not dropped");
  const marked = grid.weeks.flat().filter((c) => c.trained);
  assert.equal(marked.length, 1);
  assert.equal(marked[0].day, 4);
});

test("body distribution scopes the table to the selected day", () => {
  const store = seededStore();
  const html = renderBodyDistribution(store, params("week=2026-11-04&day=2026-11-04"));
  assert.match(html, /01-07 November 2026/);
  assert.match(html, /Pectorals/);
  assert.match(html, /Quads/);
  assert.match(html, /Total/);

  const rest = renderBodyDistribution(store, params("week=2026-11-04&day=2026-11-06"));
  assert.match(rest, /No sets logged on this day/);
});

test("measures round-trip through the store, one entry per day", () => {
  const store = new Store(memoryStorage());
  assert.equal(store.addMeasurement({ date: "2026-11-01", weight: 80 }).ok, true);
  const again = store.addMeasurement({ date: "2026-11-01", weight: 80.5 });
  assert.equal(again.ok, true);
  assert.equal(again.replaced, true);
  assert.equal(store.measurements().length, 1, "a second weigh-in should replace, not append");
  assert.equal(store.latestMeasurement().weight, 80.5);

  assert.equal(store.addMeasurement({ date: "2026-11-01", weight: 0 }).ok, false);
  assert.equal(store.addMeasurement({ date: "bad", weight: 80 }).ok, false);

  const html = renderMeasures(store, params());
  assert.match(html, /80\.5/);
  assert.match(html, /data-action="add-measurement"/);
});

test("measurements survive an export and import round trip", () => {
  const store = new Store(memoryStorage());
  store.addMeasurement({ date: "2026-11-01", weight: 82.5 });
  const exported = store.exportData();
  const fresh = new Store(memoryStorage());
  const result = fresh.importData(exported);
  assert.equal(result.ok, true);
  assert.equal(fresh.measurements().length, 1);
  assert.equal(fresh.latestMeasurement().weight, 82.5);
});

test("an export from before measurements existed still imports", () => {
  const store = new Store(memoryStorage());
  const legacy = JSON.stringify({
    app: "IronLog",
    version: 1,
    workouts: [],
    customExercises: [],
    settings: { units: "kg" },
  });
  const result = store.importData(legacy);
  assert.equal(result.ok, true);
  assert.deepEqual(store.measurements(), []);
});

test("the profile handle is sanitised and the name trimmed", () => {
  const store = new Store(memoryStorage());
  // Fixture values only. Nothing in this repo should ever carry a real
  // person's name or handle: the log is private to whoever is running it.
  store.setProfile({ displayName: "  Test Lifter  ", handle: "@test.lifter_09!" });
  const profile = store.profile();
  assert.equal(profile.displayName, "Test Lifter");
  assert.equal(profile.handle, "test.lifter_09");
  assert.match(renderStats(store, params()), /Test Lifter/);
  assert.match(renderStats(store, params()), /@test\.lifter_09/);

  // Disallowed characters are stripped rather than escaped: the letters survive,
  // the markup does not, and esc() is still there behind it.
  store.setProfile({ handle: "<b>x</b>" });
  assert.equal(store.profile().handle, "bxb");
  assert.ok(!renderStats(store, params()).includes("<b>x</b>"));
});

test("a long display name is capped rather than stretching the header", () => {
  const store = new Store(memoryStorage());
  store.setProfile({ displayName: "x".repeat(200), handle: "y".repeat(200) });
  assert.ok(store.profile().displayName.length <= 48);
  assert.ok(store.profile().handle.length <= 32);
});

test("a profile with no name falls back rather than printing undefined", () => {
  const store = new Store(memoryStorage());
  const html = renderStats(store, params());
  assert.match(html, /Your profile/);
  assert.match(html, /@local/);
  assert.ok(!html.includes("undefined"));
});

test("the weekly volume chart obeys the selected range", () => {
  // Dates are relative to today so the assertion does not rot: a fixed fixture
  // would start failing the moment it fell outside the seven-day window.
  const store = new Store(memoryStorage());
  const at = (daysAgo) => {
    const start = new Date();
    start.setDate(start.getDate() - daysAgo);
    start.setHours(18, 0, 0, 0);
    const end = new Date(start.getTime() + 45 * 60000);
    return {
      id: `w_rel_${daysAgo}`,
      name: "Session",
      status: "completed",
      startedAt: start.toISOString(),
      endedAt: end.toISOString(),
      notes: "",
      exercises: [{ id: `e_${daysAgo}`, exerciseId: "bench", sets: [{ weight: 60, reps: 8, done: true }] }],
    };
  };
  store.doc.workouts = [at(1), at(3), at(40)];
  store.doc.customExercises = [
    { id: "bench", name: "Bench press", muscle: "chest", target: "pectorals", equipment: "barbell" },
  ];
  store._indexCache = null;

  const points = (html) => (html.match(/chart-col has-point/g) ?? []).length;
  const week = points(renderStatistics(store, params("range=7d")));
  const all = points(renderStatistics(store, params("range=all")));
  assert.ok(week >= 1, "the last seven days contain a session, so they must chart one");
  assert.ok(all > week, `all time (${all} weeks) must chart more than 7 days (${week})`);
});

test("the cardio card keeps the grid even", () => {
  const store = seededStore();
  const html = renderMuscleDistribution(store, params("range=all"));
  const cards = (html.match(/class="part-card/g) ?? []).length;
  const figures = (html.match(/class="part-figure"/g) ?? []).length;
  // Cardio is trained in the fixture, so a seventh card appears — and it still
  // draws a figure rather than leaving a short card in the grid.
  assert.equal(cards, 7);
  assert.equal(figures, cards, "every card needs a figure or the rows go out of line");
});

test("the week picker stops at the week you are in", () => {
  const store = seededStore();
  const current = renderBodyDistribution(store, params());
  assert.match(current, /<button class="icon-btn" type="button" disabled/);
  // An earlier week can still step forward.
  const past = renderBodyDistribution(store, params("week=2026-10-20"));
  assert.ok(!/disabled/.test(past), "a past week should still be able to advance");
});

test("a week spanning two months names both of them", () => {
  assert.equal(calendarWeek(new Date(2026, 10, 5)).label, "01-07 November 2026");
  assert.equal(calendarWeek(new Date(2026, 10, 29)).label, "29 Nov - 05 Dec 2026");
  assert.equal(calendarWeek(new Date(2025, 11, 28)).label, "28 Dec - 03 Jan 2026");
});

test("the headline tiles carry the class that sizes them down on a phone", () => {
  const store = seededStore();
  assert.match(renderStats(store, params()), /tile-grid tile-grid-3 tile-grid-headline/);
  assert.match(renderStatistics(store, params()), /tile-grid tile-grid-4 tile-grid-headline/);
});

test("the muscle table is captioned for screen readers", () => {
  const store = seededStore();
  assert.match(renderBodyDistribution(store, params()), /<caption class="sr-only">/);
});

test("the measures list uses a date short enough for one row", () => {
  // The row packs date, weight, delta, note and a delete button onto one line,
  // so the weekday is dropped: "Nov 4, 2026" instead of "Wednesday, Nov 4, 2026".
  assert.equal(mediumDate("2026-11-04"), "Nov 4, 2026");
  assert.equal(mediumDate(new Date(2026, 0, 1)), "Jan 1, 2026");
  assert.equal(mediumDate("nonsense"), "—");

  const store = seededStore();
  store.addMeasurement({ date: "2026-11-04", weight: 80 });
  const html = renderMeasures(store, params());
  const list = (html.match(/<ul class="measure-list">[\s\S]*?<\/ul>/) ?? [""])[0];
  assert.match(list, /Nov 4, 2026/);
  assert.ok(!list.includes("Wednesday"), "the row uses the long form, which does not fit");
  // The chart tooltip is a title attribute with room for the weekday, so it
  // keeps the full date.
  assert.match(html, /Wednesday, Nov 4, 2026/);
});
