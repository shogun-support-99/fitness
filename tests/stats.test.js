/**
 * Tests for the pure training maths in app/js/stats.js.
 * Run with: node --test tests/
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";

import {
  bestSet,
  compactNumber,
  convertWeight,
  estimatedOneRepMax,
  exerciseProgression,
  exerciseVolume,
  lifetimeStats,
  localDateKey,
  personalRecords,
  recordsBrokenBy,
  relativeTime,
  round,
  setVolume,
  streaks,
  weekKey,
  weeklyVolume,
  workoutDurationMinutes,
  workoutSetCount,
  workoutVolume,
} from "../app/js/stats.js";

// ── Helpers ──────────────────────────────────────────────────────────────

function set(weight, reps, done = true) {
  return { weight, reps, done };
}

function entry(exerciseId, sets) {
  return { id: `e_${exerciseId}`, exerciseId, sets };
}

function workout({ id, exercises, startedAt, endedAt, status = "completed" }) {
  return { id, name: "Test", status, startedAt, endedAt, exercises };
}

const DAY = 86_400_000;
const iso = (offsetMs) => new Date(Date.UTC(2026, 9, 15) + offsetMs).toISOString();

// ── estimatedOneRepMax (Epley) ───────────────────────────────────────────

describe("estimatedOneRepMax", () => {
  test("returns the weight itself at one rep", () => {
    assert.equal(estimatedOneRepMax(100, 1), 100);
  });

  test("applies the Epley formula", () => {
    // 80kg x 8 -> 80 * (1 + 8/30) = 101.33
    assert.equal(estimatedOneRepMax(80, 8), 101.33);
    // 85kg x 6 -> 85 * 1.2 = 102
    assert.equal(estimatedOneRepMax(85, 6), 102);
  });

  test("ranks a heavier single above a lighter high-rep set correctly", () => {
    assert.ok(estimatedOneRepMax(100, 1) > estimatedOneRepMax(80, 5));
  });

  test("rejects zero, negative and non-numeric input", () => {
    assert.equal(estimatedOneRepMax(0, 5), 0);
    assert.equal(estimatedOneRepMax(100, 0), 0);
    assert.equal(estimatedOneRepMax(-50, 5), 0);
    assert.equal(estimatedOneRepMax(NaN, 5), 0);
    assert.equal(estimatedOneRepMax("abc", 5), 0);
  });

  test("accepts numeric strings as browsers deliver from inputs", () => {
    assert.equal(estimatedOneRepMax("80", "8"), 101.33);
  });
});

// ── Volume ───────────────────────────────────────────────────────────────

describe("volume", () => {
  test("setVolume multiplies weight by reps", () => {
    assert.equal(setVolume(80, 8), 640);
    assert.equal(setVolume(0, 10), 0);
  });

  test("exerciseVolume sums every set, including incomplete ones", () => {
    const e = entry("bench", [set(80, 8), set(85, 6), set(85, 5, false)]);
    assert.equal(exerciseVolume(e), 80 * 8 + 85 * 6 + 85 * 5);
  });

  test("workoutVolume sums every exercise", () => {
    const w = workout({
      id: "w1",
      startedAt: iso(0),
      endedAt: iso(3_600_000),
      exercises: [entry("bench", [set(100, 5)]), entry("squat", [set(120, 3)])],
    });
    assert.equal(workoutVolume(w), 500 + 360);
  });

  test("handles missing or malformed structures", () => {
    assert.equal(exerciseVolume(null), 0);
    assert.equal(exerciseVolume({}), 0);
    assert.equal(workoutVolume(undefined), 0);
    assert.equal(workoutVolume({ exercises: "nope" }), 0);
  });
});

describe("workoutSetCount", () => {
  test("counts only completed sets", () => {
    const w = workout({
      id: "w1",
      startedAt: iso(0),
      endedAt: iso(0),
      exercises: [entry("bench", [set(80, 8), set(80, 8, false)]), entry("row", [set(60, 10)])],
    });
    assert.equal(workoutSetCount(w), 2);
  });
});

describe("workoutDurationMinutes", () => {
  test("rounds elapsed time to whole minutes", () => {
    const w = workout({ id: "w1", startedAt: iso(0), endedAt: iso(54 * 60_000), exercises: [] });
    assert.equal(workoutDurationMinutes(w), 54);
  });

  test("never returns a negative duration for reversed timestamps", () => {
    const w = workout({ id: "w1", startedAt: iso(DAY), endedAt: iso(0), exercises: [] });
    assert.equal(workoutDurationMinutes(w), 0);
  });

  test("returns 0 while a workout is still open", () => {
    assert.equal(workoutDurationMinutes({ startedAt: iso(0), endedAt: null }), 0);
  });
});

// ── bestSet ──────────────────────────────────────────────────────────────

describe("bestSet", () => {
  test("picks the highest estimated one-rep max, not the heaviest", () => {
    const e = entry("bench", [set(100, 1), set(80, 10)]);
    // 80x10 -> 106.67 beats 100x1
    assert.deepEqual(bestSet(e), set(80, 10));
  });

  test("ignores zero-weight and zero-rep sets", () => {
    const e = entry("plank", [set(0, 60), set(0, 0)]);
    assert.equal(bestSet(e), null);
  });

  test("returns null for an empty entry", () => {
    assert.equal(bestSet(entry("bench", [])), null);
    assert.equal(bestSet(null), null);
  });
});

// ── Personal records ─────────────────────────────────────────────────────

describe("personalRecords", () => {
  const workouts = [
    workout({
      id: "w1",
      startedAt: iso(0),
      endedAt: iso(3_600_000),
      exercises: [entry("bench", [set(80, 8), set(85, 6)])],
    }),
    workout({
      id: "w2",
      startedAt: iso(DAY * 3),
      endedAt: iso(DAY * 3 + 3_600_000),
      exercises: [entry("bench", [set(90, 3), set(70, 15)])],
    }),
  ];

  test("tracks heaviest weight independently of rep count", () => {
    const records = personalRecords(workouts);
    assert.equal(records.get("bench").maxWeight, 90);
  });

  test("tracks the highest rep count at any weight", () => {
    const records = personalRecords(workouts);
    assert.equal(records.get("bench").maxReps, 15);
  });

  test("tracks the highest estimated one-rep max", () => {
    const records = personalRecords(workouts);
    // 70 x 15 -> 105, the best of the four sets
    assert.equal(records.get("bench").maxOneRm, 105);
  });

  test("ignores workouts that were not completed", () => {
    const withActive = [
      ...workouts,
      workout({
        id: "w3",
        status: "active",
        startedAt: iso(DAY * 5),
        endedAt: null,
        exercises: [entry("bench", [set(200, 20)])],
      }),
    ];
    assert.equal(personalRecords(withActive).get("bench").maxWeight, 90);
  });

  test("ignores unticked sets inside a completed workout", () => {
    const only = [
      workout({
        id: "w1",
        startedAt: iso(0),
        endedAt: iso(0),
        exercises: [entry("squat", [set(140, 5, false)])],
      }),
    ];
    assert.equal(personalRecords(only).has("squat"), false);
  });

  test("uses the supplied index for exercise names", () => {
    const records = personalRecords(workouts, { bench: { name: "Bench Press" } });
    assert.equal(records.get("bench").name, "Bench Press");
  });

  test("falls back to the raw id when the exercise is unknown", () => {
    assert.equal(personalRecords(workouts).get("bench").name, "bench");
  });

  test("returns an empty map with no input", () => {
    assert.equal(personalRecords([]).size, 0);
    assert.equal(personalRecords(null).size, 0);
  });
});

describe("recordsBrokenBy", () => {
  const earlier = [
    workout({
      id: "w1",
      startedAt: iso(0),
      endedAt: iso(0),
      exercises: [entry("bench", [set(80, 8)])],
    }),
  ];

  test("reports a heavier lift as a new record", () => {
    const next = workout({
      id: "w2",
      startedAt: iso(DAY),
      endedAt: iso(DAY),
      exercises: [entry("bench", [set(85, 8)])],
    });
    const broken = recordsBrokenBy(next, earlier);
    assert.equal(broken.length, 1);
    assert.ok(broken[0].kinds.includes("heaviest"));
    assert.ok(broken[0].kinds.includes("estimated 1RM"));
  });

  test("reports nothing when the workout matches but does not beat history", () => {
    const same = workout({
      id: "w2",
      startedAt: iso(DAY),
      endedAt: iso(DAY),
      exercises: [entry("bench", [set(80, 8)])],
    });
    assert.deepEqual(recordsBrokenBy(same, earlier), []);
  });

  test("reports a first-ever exercise as a record", () => {
    const first = workout({
      id: "w2",
      startedAt: iso(DAY),
      endedAt: iso(DAY),
      exercises: [entry("deadlift", [set(120, 5)])],
    });
    const broken = recordsBrokenBy(first, earlier);
    assert.equal(broken.length, 1);
    assert.equal(broken[0].exerciseId, "deadlift");
  });

  test("detects a rep-count record without a weight record", () => {
    const moreReps = workout({
      id: "w2",
      startedAt: iso(DAY),
      endedAt: iso(DAY),
      exercises: [entry("bench", [set(60, 20)])],
    });
    const broken = recordsBrokenBy(moreReps, earlier);
    assert.ok(broken[0].kinds.includes("most reps"));
    assert.ok(!broken[0].kinds.includes("heaviest"));
  });
});

// ── Dates, weeks and streaks ─────────────────────────────────────────────

describe("localDateKey", () => {
  test("formats a date as YYYY-MM-DD", () => {
    assert.equal(localDateKey(new Date(2026, 9, 5)), "2026-10-05");
  });

  test("pads single-digit months and days", () => {
    assert.equal(localDateKey(new Date(2026, 0, 9)), "2026-01-09");
  });

  test("returns null for an invalid date", () => {
    assert.equal(localDateKey("not a date"), null);
  });
});

describe("weekKey", () => {
  test("produces a stable Monday-based ISO week", () => {
    // Monday 2026-10-12 and Sunday 2026-10-18 are the same ISO week.
    assert.equal(weekKey(new Date(2026, 9, 12)), weekKey(new Date(2026, 9, 18)));
  });

  test("separates consecutive weeks", () => {
    assert.notEqual(weekKey(new Date(2026, 9, 18)), weekKey(new Date(2026, 9, 19)));
  });

  test("matches the expected ISO week number", () => {
    assert.equal(weekKey(new Date(2026, 9, 15)), "2026-W42");
  });
});

describe("streaks", () => {
  const onDay = (dayOffset) =>
    workout({
      id: `w${dayOffset}`,
      startedAt: new Date(2026, 9, 15 - dayOffset, 9).toISOString(),
      endedAt: new Date(2026, 9, 15 - dayOffset, 10).toISOString(),
      exercises: [entry("bench", [set(80, 5)])],
    });

  test("counts consecutive days including today", () => {
    const s = streaks([onDay(0), onDay(1), onDay(2)], new Date(2026, 9, 15, 18));
    assert.equal(s.current, 3);
    assert.equal(s.best, 3);
    assert.equal(s.activeDays, 3);
  });

  test("keeps the streak alive if the user has not trained today yet", () => {
    const s = streaks([onDay(1), onDay(2)], new Date(2026, 9, 15, 7));
    assert.equal(s.current, 2);
  });

  test("breaks when a day is missed", () => {
    const s = streaks([onDay(0), onDay(2), onDay(3)], new Date(2026, 9, 15, 18));
    assert.equal(s.current, 1);
    assert.equal(s.best, 2);
  });

  test("counts two sessions on one day as a single active day", () => {
    const s = streaks([onDay(0), onDay(0)], new Date(2026, 9, 15, 18));
    assert.equal(s.activeDays, 1);
    assert.equal(s.current, 1);
  });

  test("reports zero with no completed workouts", () => {
    assert.deepEqual(streaks([], new Date(2026, 9, 15)), { current: 0, best: 0, activeDays: 0 });
  });

  test("ignores workouts still in progress", () => {
    const active = { ...onDay(0), status: "active" };
    assert.equal(streaks([active], new Date(2026, 9, 15, 18)).current, 0);
  });
});

describe("weeklyVolume", () => {
  test("aggregates volume, sets and session count per week", () => {
    const workouts = [
      workout({
        id: "w1",
        startedAt: new Date(2026, 9, 13, 9).toISOString(),
        endedAt: new Date(2026, 9, 13, 10).toISOString(),
        exercises: [entry("bench", [set(100, 5)])],
      }),
      workout({
        id: "w2",
        startedAt: new Date(2026, 9, 14, 9).toISOString(),
        endedAt: new Date(2026, 9, 14, 10).toISOString(),
        exercises: [entry("squat", [set(120, 3)])],
      }),
    ];
    const weeks = weeklyVolume(workouts);
    assert.equal(weeks.length, 1);
    assert.equal(weeks[0].workouts, 2);
    assert.equal(weeks[0].volume, 500 + 360);
    assert.equal(weeks[0].sets, 2);
  });

  test("sorts weeks oldest first", () => {
    const workouts = [
      workout({ id: "b", startedAt: new Date(2026, 9, 20).toISOString(), endedAt: new Date(2026, 9, 20).toISOString(), exercises: [] }),
      workout({ id: "a", startedAt: new Date(2026, 9, 6).toISOString(), endedAt: new Date(2026, 9, 6).toISOString(), exercises: [] }),
    ];
    const weeks = weeklyVolume(workouts);
    assert.ok(weeks[0].week < weeks[1].week);
  });
});

describe("exerciseProgression", () => {
  test("returns one point per session that included the exercise, oldest first", () => {
    const workouts = [
      workout({
        id: "w2",
        startedAt: iso(DAY * 5),
        endedAt: iso(DAY * 5),
        exercises: [entry("bench", [set(90, 5)])],
      }),
      workout({
        id: "w1",
        startedAt: iso(0),
        endedAt: iso(0),
        exercises: [entry("bench", [set(80, 8)]), entry("squat", [set(120, 3)])],
      }),
    ];
    const points = exerciseProgression(workouts, "bench");
    assert.equal(points.length, 2);
    assert.equal(points[0].bestWeight, 80);
    assert.equal(points[1].bestWeight, 90);
    assert.equal(points[0].volume, 640);
  });

  test("returns nothing for an exercise never trained", () => {
    assert.deepEqual(exerciseProgression([], "bench"), []);
  });
});

describe("lifetimeStats", () => {
  test("sums workouts, volume, sets and hours", () => {
    const workouts = [
      workout({
        id: "w1",
        startedAt: iso(0),
        endedAt: iso(90 * 60_000),
        exercises: [entry("bench", [set(100, 5), set(100, 5)])],
      }),
    ];
    const life = lifetimeStats(workouts);
    assert.equal(life.workouts, 1);
    assert.equal(life.volume, 1000);
    assert.equal(life.sets, 2);
    assert.equal(life.minutes, 90);
    assert.equal(life.hours, 1.5);
  });

  test("excludes workouts that were never completed", () => {
    const workouts = [
      workout({ id: "w1", status: "active", startedAt: iso(0), endedAt: null, exercises: [entry("bench", [set(100, 5)])] }),
    ];
    assert.equal(lifetimeStats(workouts).workouts, 0);
  });
});

// ── Formatting ───────────────────────────────────────────────────────────

describe("relativeTime", () => {
  const now = new Date(2026, 9, 15, 12);

  test("describes recent moments", () => {
    assert.equal(relativeTime(new Date(now.getTime() - 10_000), now), "just now");
    assert.equal(relativeTime(new Date(now.getTime() - 5 * 60_000), now), "5 mins ago");
    assert.equal(relativeTime(new Date(now.getTime() - 60 * 60_000), now), "1 hour ago");
    assert.equal(relativeTime(new Date(now.getTime() - 3 * DAY), now), "3 days ago");
  });

  test("uses singular forms", () => {
    assert.equal(relativeTime(new Date(now.getTime() - 60_000), now), "1 min ago");
    assert.equal(relativeTime(new Date(now.getTime() - DAY), now), "1 day ago");
  });

  test("returns an em dash for an invalid date", () => {
    assert.equal(relativeTime("garbage", now), "—");
  });
});

describe("compactNumber", () => {
  test("abbreviates large totals", () => {
    assert.equal(compactNumber(12_500), "12.5k");
    assert.equal(compactNumber(1_400_000), "1.4M");
    assert.equal(compactNumber(2_000_000_000), "2B");
  });

  test("leaves small numbers readable", () => {
    assert.equal(compactNumber(950), "950");
    assert.equal(compactNumber(0), "0");
  });

  test("survives non-numeric input", () => {
    assert.equal(compactNumber(undefined), "0");
    assert.equal(compactNumber("abc"), "0");
  });
});

describe("round", () => {
  test("rounds to the requested precision without float drift", () => {
    assert.equal(round(1.005, 2), 1.01);
    assert.equal(round(2.3456, 1), 2.3);
    assert.equal(round(7), 7);
  });

  test("returns 0 for non-finite input", () => {
    assert.equal(round(NaN), 0);
    assert.equal(round(Infinity), 0);
  });
});

describe("convertWeight", () => {
  test("kg to lb rounds to the nearest pound", () => {
    assert.equal(convertWeight(100, "kg", "lb"), 220);
    assert.equal(convertWeight(20, "kg", "lb"), 44); // 44.09 lb
  });

  test("lb to kg rounds to the nearest half kilo", () => {
    assert.equal(convertWeight(225, "lb", "kg"), 102); // 102.06 kg
    assert.equal(convertWeight(45, "lb", "kg"), 20.5); // 20.41 kg
  });

  test("same unit and junk input are safe", () => {
    assert.equal(convertWeight(80, "kg", "kg"), 80);
    assert.equal(convertWeight(0, "kg", "lb"), 0);
    assert.equal(convertWeight(-5, "kg", "lb"), 0);
    assert.equal(convertWeight(NaN, "kg", "lb"), 0);
    assert.equal(convertWeight(50, "kg", "stone"), 50, "unknown target unit passes through");
  });
});
