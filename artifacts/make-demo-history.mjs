/**
 * Generate a demo IronLog export, so the profile screens can be looked at
 * before a real training history exists.
 *
 * This is an ad-hoc fixture, not shipped app code: run it, import the JSON from
 * Settings → Import data, delete it again from Settings → Erase when done. It
 * writes nothing into app/ and is never referenced by the app.
 *
 *   node artifacts/make-demo-history.mjs [outfile]
 *
 * The sessions use real catalogue exercise IDs, so names, muscles and media
 * all resolve once the catalogue loads.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

/** Which exercises to fake, by the muscle the catalogue reports. */
const WANTED = [
  { muscle: "chest", count: 2, start: 60, perWeek: 1.2, sets: 3, reps: 8 },
  { muscle: "back", count: 2, start: 70, perWeek: 1.4, sets: 3, reps: 8 },
  { muscle: "shoulders", count: 2, start: 30, perWeek: 0.6, sets: 3, reps: 10 },
  { muscle: "biceps", count: 1, start: 25, perWeek: 0.4, sets: 3, reps: 10 },
  { muscle: "triceps", count: 1, start: 25, perWeek: 0.4, sets: 3, reps: 10 },
  { muscle: "quads", count: 2, start: 90, perWeek: 2, sets: 4, reps: 6 },
  { muscle: "hamstrings", count: 1, start: 60, perWeek: 1.2, sets: 3, reps: 8 },
  { muscle: "glutes", count: 1, start: 80, perWeek: 1.6, sets: 3, reps: 8 },
  { muscle: "calves", count: 1, start: 50, perWeek: 0.8, sets: 3, reps: 12 },
  { muscle: "core", count: 2, start: 0, perWeek: 0, sets: 3, reps: 15 },
];

const SPLITS = {
  Push: ["chest", "shoulders", "triceps"],
  Pull: ["back", "biceps"],
  Legs: ["quads", "hamstrings", "glutes", "calves"],
};

const WEEKS = 10;
const SESSIONS_PER_WEEK = 3;

const index = JSON.parse(await readFile(path.join(root, "app/data/exercises-index.json"), "utf8"));

/** Deterministic pick: the same muscle always selects the same exercises. */
function pickExercises() {
  const chosen = [];
  for (const want of WANTED) {
    const pool = index.filter((e) => e.muscle === want.muscle);
    for (let i = 0; i < want.count && i < pool.length; i += 1) {
      chosen.push({ exercise: pool[i], spec: want });
    }
  }
  return chosen;
}

const chosen = pickExercises();
const byMuscle = new Map();
for (const entry of chosen) {
  if (!byMuscle.has(entry.spec.muscle)) byMuscle.set(entry.spec.muscle, []);
  byMuscle.get(entry.spec.muscle).push(entry);
}

function round(value, step = 2.5) {
  return Math.round(value / step) * step;
}

const today = new Date();
const workouts = [];
const measurements = [];
let seed = 20261105;

/** Small deterministic PRNG so repeated runs produce the same fixture. */
function random() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}

const splitNames = ["Push", "Pull", "Legs"];

for (let week = WEEKS - 1; week >= 0; week -= 1) {
  for (let session = 0; session < SESSIONS_PER_WEEK; session += 1) {
    const split = splitNames[(week * SESSIONS_PER_WEEK + session) % 3];
    const dayOffset = week * 7 + session * 2 + 1;
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dayOffset);
    date.setHours(18, 0, 0, 0);

    const muscles = SPLITS[split];
    const exercises = [];
    for (const muscle of muscles) {
      for (const entry of byMuscle.get(muscle) ?? []) {
        const { spec, exercise } = entry;
        const sets = [];
        for (let s = 0; s < spec.sets; s += 1) {
          // Overload across the block, with a small per-set taper and the odd
          // missed rep, so the records board has something to show.
          const progression = spec.start + (WEEKS - 1 - week) * spec.perWeek;
          const taper = 1 - s * 0.04;
          const jitter = 0.97 + random() * 0.06;
          const weight = spec.start > 0 ? round(progression * taper * jitter) : 0;
          const missed = random() < 0.12 ? 1 : 0;
          sets.push({
            weight,
            reps: Math.max(1, spec.reps - missed - Math.floor(s * 0.5)),
            done: true,
          });
        }
        exercises.push({
          id: `e_${workouts.length}_${exercise.id}`,
          exerciseId: exercise.id,
          sets,
        });
      }
    }

    // A core finisher on every session, so Core is never the empty card.
    for (const entry of (byMuscle.get("core") ?? []).slice(0, 1)) {
      exercises.push({
        id: `e_${workouts.length}_${entry.exercise.id}`,
        exerciseId: entry.exercise.id,
        sets: [
          { weight: 0, reps: 15, done: true },
          { weight: 0, reps: 12, done: true },
        ],
      });
    }

    const minutes = 42 + Math.round(random() * 22);
    const started = new Date(date);
    const ended = new Date(started.getTime() + minutes * 60000);
    workouts.push({
      id: `w_demo_${week}_${session}`,
      name: `${split} day`,
      status: "completed",
      startedAt: started.toISOString(),
      endedAt: ended.toISOString(),
      notes: "",
      exercises,
    });
  }

  // One weigh-in a week, drifting gently downwards.
  const weighDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() - week * 7);
  const key = `${weighDay.getFullYear()}-${String(weighDay.getMonth() + 1).padStart(2, "0")}-${String(weighDay.getDate()).padStart(2, "0")}`;
  measurements.push({
    id: `m_demo_${key}`,
    date: key,
    weight: Math.round((82.4 - (WEEKS - 1 - week) * 0.28 + (random() - 0.5) * 0.6) * 10) / 10,
    note: week % 3 === 0 ? "Morning, fasted" : "",
  });
}

const doc = {
  app: "IronLog",
  version: 1,
  exportedAt: new Date().toISOString(),
  workouts,
  customExercises: [],
  measurements,
  settings: { units: "kg" },
  createdAt: new Date().toISOString(),
};

const out = process.argv[2] ?? path.join(root, "artifacts/demo-history.ironlog.json");
await writeFile(out, `${JSON.stringify(doc, null, 2)}\n`);

console.log(`Wrote ${out}`);
console.log(`  ${workouts.length} sessions over ${WEEKS} weeks`);
console.log(`  ${measurements.length} bodyweight entries`);
console.log(`  ${new Set(workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId))).size} distinct exercises`);
