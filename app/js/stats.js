/**
 * IronLog — pure training-maths module.
 *
 * Every function here is side-effect free and DOM free so it can run in Node
 * (see tests/) as well as in the browser.
 */

/**
 * Round to a fixed number of decimals without binary-float drift.
 *
 * Scaling by multiplication is not enough: 1.005 * 100 is 100.49999999999999,
 * so a naive Math.round returns 1 instead of 1.01. Shifting through the
 * exponential string form parses from the decimal representation instead.
 */
export function round(value, decimals = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const places = Math.max(0, Math.trunc(Number(decimals) || 0));
  if (n === 0) return 0;
  const [mantissa, exponent] = n.toExponential().split("e");
  const shifted = Number(`${mantissa}e${Number(exponent) + places}`);
  const rounded = Math.round(shifted);
  const [, roundedExponent] = rounded.toExponential().split("e");
  return Number(`${rounded.toExponential().split("e")[0]}e${Number(roundedExponent) - places}`);
}

/**
 * Epley estimated one-rep max.
 *   1RM = weight x (1 + reps / 30)
 * Returns 0 for non-positive weight; returns the weight itself at 1 rep.
 */
export function estimatedOneRepMax(weight, reps) {
  const w = Number(weight);
  const r = Number(reps);
  if (!Number.isFinite(w) || w <= 0) return 0;
  if (!Number.isFinite(r) || r <= 0) return 0;
  if (r === 1) return round(w, 2);
  return round(w * (1 + r / 30), 2);
}

/** Total volume of one set: weight x reps. Bodyweight/zero-weight sets add 0. */
export function setVolume(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  return w * r;
}

/** Total volume of an exercise entry across all its sets. */
export function exerciseVolume(exerciseEntry) {
  if (!exerciseEntry || !Array.isArray(exerciseEntry.sets)) return 0;
  return exerciseEntry.sets.reduce((sum, s) => sum + setVolume(s.weight, s.reps), 0);
}

/** Total volume of a whole workout. */
export function workoutVolume(workout) {
  if (!workout || !Array.isArray(workout.exercises)) return 0;
  return workout.exercises.reduce((sum, e) => sum + exerciseVolume(e), 0);
}

/**
 * Volume banked by a workout's completed sets only.
 *
 * A finished session reports every set it logged (see workoutVolume), but an
 * in-progress one must agree with the logger's own Volume readout and with the
 * set count beside it — counting unticked sets shows the trainer volume they
 * have not actually lifted yet.
 */
export function completedWorkoutVolume(workout) {
  if (!workout || !Array.isArray(workout.exercises)) return 0;
  return workout.exercises.reduce(
    (sum, e) =>
      sum +
      (e.sets ?? []).filter((s) => s.done).reduce((v, s) => v + setVolume(s.weight, s.reps), 0),
    0,
  );
}

/** Count of completed sets in a workout (only sets flagged done). */
export function workoutSetCount(workout) {
  if (!workout || !Array.isArray(workout.exercises)) return 0;
  return workout.exercises.reduce(
    (sum, e) => sum + (e.sets ?? []).filter((s) => s.done).length,
    0,
  );
}

/** Elapsed duration in whole minutes from a workout's timestamps. */
export function workoutDurationMinutes(workout) {
  if (!workout || !workout.startedAt || !workout.endedAt) return 0;
  const ms = new Date(workout.endedAt).getTime() - new Date(workout.startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.max(0, Math.round(ms / 60000));
}

/** Best single set for an exercise within one workout, ranked by estimated 1RM. */
export function bestSet(exerciseEntry) {
  const sets = (exerciseEntry?.sets ?? []).filter((s) => Number(s.weight) > 0 && Number(s.reps) > 0);
  if (sets.length === 0) return null;
  return sets.reduce((best, s) =>
    estimatedOneRepMax(s.weight, s.reps) > estimatedOneRepMax(best.weight, best.reps) ? s : best,
  );
}

/**
 * Personal records across a list of completed workouts, per exercise.
 *
 * Tracks three independent records: heaviest weight, most reps at any weight,
 * and highest estimated 1RM. Only sets from saved (completed) workouts count.
 *
 * @param {object} exerciseById id -> exercise definition
 * @returns {Map<string, {name, maxWeight, maxReps, maxOneRm, records}>}
 */
export function personalRecords(workouts, exerciseById = {}) {
  /** @type {Map<string, any>} */
  const out = new Map();

  for (const w of workouts ?? []) {
    if (!w || w.status !== "completed") continue;
    for (const entry of w.exercises ?? []) {
      const id = entry.exerciseId;
      if (typeof id !== "string") continue;

      // Only sets that were actually completed can set a record, so the record
      // entry is created lazily: an exercise logged but never ticked must not
      // appear on the board with zeros.
      for (const s of entry.sets ?? []) {
        if (!s.done) continue;
        const weight = Number(s.weight) || 0;
        const reps = Number(s.reps) || 0;
        if (weight <= 0 || reps <= 0) continue;

        let rec = out.get(id);
        if (!rec) {
          rec = {
            exerciseId: id,
            name: exerciseById[id]?.name ?? id,
            maxWeight: 0,
            maxReps: 0,
            maxOneRm: 0,
            history: [],
          };
          out.set(id, rec);
        }

        const oneRm = estimatedOneRepMax(weight, reps);
        const kinds = [];
        if (weight > rec.maxWeight) {
          rec.maxWeight = weight;
          kinds.push("weight");
        }
        if (reps > rec.maxReps) {
          rec.maxReps = reps;
          kinds.push("reps");
        }
        if (oneRm > rec.maxOneRm) {
          rec.maxOneRm = oneRm;
          kinds.push("oneRm");
        }
        if (kinds.length > 0) {
          rec.history.push({
            date: w.endedAt ?? w.startedAt,
            weight,
            reps,
            oneRm,
            kinds,
          });
        }
      }
    }
  }

  return out;
}

/**
 * Detect which records a workout just broke, compared with all earlier
 * completed workouts. Used to show a "new PR" badge when saving.
 */
export function recordsBrokenBy(newWorkout, previousWorkouts, exerciseById = {}) {
  const before = personalRecords(previousWorkouts, exerciseById);
  const after = personalRecords([...previousWorkouts, newWorkout], exerciseById);
  const broken = [];

  for (const [id, rec] of after) {
    const prev = before.get(id);
    const kinds = [];
    if (!prev || rec.maxWeight > prev.maxWeight) kinds.push("heaviest");
    if (!prev || rec.maxOneRm > prev.maxOneRm) kinds.push("estimated 1RM");
    if (!prev || rec.maxReps > prev.maxReps) kinds.push("most reps");
    if (kinds.length > 0) broken.push({ exerciseId: id, name: rec.name, kinds });
  }
  return broken;
}

/** ISO date (YYYY-MM-DD) in local time, used for streaks and weekly buckets. */
export function localDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday-based ISO week key, e.g. "2026-W43". */
export function weekKey(date) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7; // Monday = 0
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target - firstThursday;
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Current consecutive-day streak of completed workouts, plus the best ever.
 * Days count if at least one workout was completed on them.
 */
export function streaks(workouts, today = new Date()) {
  const days = new Set();
  for (const w of workouts ?? []) {
    if (w?.status !== "completed") continue;
    const key = localDateKey(w.endedAt ?? w.startedAt);
    if (key) days.add(key);
  }
  if (days.size === 0) return { current: 0, best: 0, activeDays: 0 };

  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // A streak is still "current" if the user trained today or yesterday.
  if (!days.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);

  let current = 0;
  while (days.has(localDateKey(cursor))) {
    current += 1;
    // Step by calendar day, not 24-hour blocks: a DST change makes one local
    // day 23 or 25 hours, which used to skip a day and break the streak.
    cursor.setDate(cursor.getDate() - 1);
  }

  const sorted = [...days].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00`);
    const cur = new Date(`${sorted[i]}T00:00:00`);
    if (shiftLocalDate(prev, 1).getTime() === cur.getTime()) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }

  return { current, best: Math.max(best, current), activeDays: days.size };
}

/**
 * Completed training bucketed by local calendar day.
 *
 * The training-year heatmap needs one row per day, including the empty ones,
 * so this returns a Map keyed by `YYYY-MM-DD` rather than a sorted list.
 * Multiple sessions on the same day are summed, not replaced.
 *
 * @param {object[]} workouts
 * @returns {Map<string, {date: string, sessions: number, sets: number, volume: number}>}
 */
export function dailyTraining(workouts) {
  const days = new Map();
  for (const w of workouts ?? []) {
    if (w?.status !== "completed") continue;
    const date = localDateKey(w.endedAt ?? w.startedAt);
    if (!date) continue;

    const row = days.get(date) ?? { date, sessions: 0, sets: 0, volume: 0 };
    row.sessions += 1;
    row.sets += workoutSetCount(w);
    row.volume += workoutVolume(w);
    days.set(date, row);
  }
  return days;
}

/** Shift a local date by whole days without crossing a DST boundary by hours. */
function shiftLocalDate(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Short month name for a local ISO date, fixed to the app's English UI. */
function monthLabel(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
  });
}

/**
 * Build a Monday-aligned training year ending today.
 *
 * Returns `weeks` as columns of seven cells: Monday to Sunday. Days still in
 * the future (the tail of the current week) are `null`, so the grid keeps its
 * shape without inventing rest days. Totals count only days up to today.
 *
 * @param {object[]} workouts
 * @param {{today?: Date, weeks?: number}} [options]
 */
export function trainingYear(workouts, { today = new Date(), weeks = 53 } = {}) {
  const span = Math.max(1, Math.trunc(Number(weeks) || 0) || 53);
  const end = today instanceof Date ? new Date(today) : new Date(today);
  if (Number.isNaN(end.getTime())) end.setTime(Date.now());
  end.setHours(0, 0, 0, 0);

  const mondayOffset = (end.getDay() + 6) % 7;
  const start = shiftLocalDate(end, -mondayOffset - (span - 1) * 7);
  const days = dailyTraining(workouts);
  const grid = [];
  const totals = { sessions: 0, activeDays: 0, sets: 0, volume: 0 };
  const cursor = new Date(start);

  for (let col = 0; col < span; col += 1) {
    const week = [];
    for (let row = 0; row < 7; row += 1) {
      if (cursor > end) {
        week.push(null);
      } else {
        const date = localDateKey(cursor);
        const found = days.get(date);
        const day = found
          ? { ...found }
          : { date, sessions: 0, sets: 0, volume: 0 };
        week.push(day);
        totals.sessions += day.sessions;
        totals.sets += day.sets;
        totals.volume += day.volume;
        if (day.sessions > 0) totals.activeDays += 1;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    grid.push(week);
  }

  // One label per month, anchored to the week containing the 1st. A partial
  // first month keeps its label only when there is room before the next one.
  const months = [];
  for (let col = 0; col < grid.length; col += 1) {
    const firstOfMonth = grid[col].find(
      (day) => day && day.date.endsWith("-01"),
    );
    if (firstOfMonth) months.push({ col, label: monthLabel(firstOfMonth.date) });
  }
  const firstDay = grid[0].find(Boolean);
  if (firstDay && (months.length === 0 || months[0].col > 0)) {
    months.unshift({ col: 0, label: monthLabel(firstDay.date) });
  }
  if (months.length > 1 && months[1].col - months[0].col < 3) months.shift();

  totals.volume = Math.round(totals.volume);
  return {
    start: localDateKey(start),
    end: localDateKey(end),
    weeks: grid,
    months,
    totals,
  };
}

/**
 * Map each active day to one of four intensity levels, 0-4.
 *
 * Volume is the fairest single measure of a strength session, so the four
 * levels are quartiles of the active days themselves rather than fractions of
 * the single heaviest day. Splitting by rank keeps the calendar readable when
 * every session is broadly similar: a normal week still shows light, medium
 * and heavy squares instead of one dark day and a year of pale ones.
 *
 * A bodyweight-only log has no volume to divide; in that case the number of
 * sessions becomes the level.
 *
 * @param {ReturnType<typeof trainingYear>} year
 * @returns {Map<string, number>} date -> level (1-4; absent means level 0)
 */
export function activityLevels(year) {
  const levels = new Map();
  const active = [];
  for (const week of year?.weeks ?? []) {
    for (const day of week) {
      if (day && Number(day.sessions) > 0) active.push(day);
    }
  }

  const volumes = active
    .map((day) => Number(day.volume) || 0)
    .sort((a, b) => a - b);
  const maxVolume = volumes[volumes.length - 1] ?? 0;
  const at = (share) =>
    volumes[Math.min(volumes.length - 1, Math.floor(volumes.length * share))];
  const bounds = maxVolume > 0 ? [at(0.25), at(0.5), at(0.75)] : null;

  for (const day of active) {
    let level;
    if (bounds) {
      const volume = Number(day.volume) || 0;
      level = volume < bounds[0] ? 1 : volume < bounds[1] ? 2 : volume < bounds[2] ? 3 : 4;
    } else {
      level = Math.min(4, Math.max(1, Number(day.sessions) || 1));
    }
    levels.set(day.date, level);
  }
  return levels;
}

/** Bucket key for a calendar month, e.g. "2026-03". */
function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Human label for a "YYYY-MM" key, e.g. "Mar '26". */
function monthKeyLabel(key) {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" }).replace(" ", " '");
}

/**
 * Aggregate a list of workouts into `{key, label, workouts, volume, sets}`
 * buckets. Sorted oldest first so charts read left-to-right in time.
 *
 * @param {object[]} workouts
 * @param {(date: Date) => string} keyFn bucket key
 * @param {(key: string) => string} labelFn bucket label
 */
function bucketVolume(workouts, keyFn, labelFn) {
  const buckets = new Map();
  for (const w of workouts ?? []) {
    if (w?.status !== "completed") continue;
    const date = new Date(w.endedAt ?? w.startedAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = keyFn(date);
    const b = buckets.get(key) ?? { key, label: labelFn(key), workouts: 0, volume: 0, sets: 0 };
    b.workouts += 1;
    b.volume += workoutVolume(w);
    b.sets += workoutSetCount(w);
    buckets.set(key, b);
  }
  return [...buckets.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** Weekly aggregate: workouts, total volume and total sets per ISO week. */
export function weeklyVolume(workouts) {
  const buckets = new Map();
  for (const w of workouts ?? []) {
    if (w?.status !== "completed") continue;
    const key = weekKey(w.endedAt ?? w.startedAt);
    if (!key) continue;
    const b = buckets.get(key) ?? { week: key, workouts: 0, volume: 0, sets: 0 };
    b.workouts += 1;
    b.volume += workoutVolume(w);
    b.sets += workoutSetCount(w);
    buckets.set(key, b);
  }
  return [...buckets.values()].sort((a, b) => (a.week < b.week ? -1 : 1));
}

/** Monthly aggregate: workouts, volume and sets per calendar month. */
export function monthlyVolume(workouts) {
  return bucketVolume(workouts, (d) => monthKey(d), monthKeyLabel);
}

/** Yearly aggregate: one bucket per calendar year that has completed work. */
export function yearlyVolume(workouts) {
  return bucketVolume(
    workouts,
    (d) => String(d.getFullYear()),
    (key) => key,
  );
}

/** Per-exercise volume progression across completed workouts, oldest first. */
export function exerciseProgression(workouts, exerciseId) {
  const points = [];
  for (const w of workouts ?? []) {
    if (w?.status !== "completed") continue;
    for (const entry of w.exercises ?? []) {
      if (entry.exerciseId !== exerciseId) continue;
      const best = bestSet(entry);
      points.push({
        date: w.endedAt ?? w.startedAt,
        volume: exerciseVolume(entry),
        bestWeight: best ? Number(best.weight) : 0,
        bestReps: best ? Number(best.reps) : 0,
        bestOneRm: best ? estimatedOneRepMax(best.weight, best.reps) : 0,
      });
    }
  }
  return points.sort((a, b) => new Date(a.date) - new Date(b.date));
}

/** Lifetime headline numbers. */
export function lifetimeStats(workouts) {
  const completed = (workouts ?? []).filter((w) => w?.status === "completed");
  let volume = 0;
  let sets = 0;
  let minutes = 0;
  const perMuscle = new Map();

  for (const w of completed) {
    volume += workoutVolume(w);
    sets += workoutSetCount(w);
    minutes += workoutDurationMinutes(w);
  }

  return {
    workouts: completed.length,
    volume: Math.round(volume),
    sets,
    minutes,
    hours: round(minutes / 60, 1),
    perMuscle,
  };
}

/** Human-friendly relative time, e.g. "3 days ago". */
export function relativeTime(date, now = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  const seconds = Math.round((now.getTime() - d.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30.44);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(days / 365.25);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/** Compact number formatting: 12500 -> "12.5k". */
export function compactNumber(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${round(n / 1_000_000_000, 1)}B`;
  if (abs >= 1_000_000) return `${round(n / 1_000_000, 1)}M`;
  if (abs >= 10_000) return `${round(n / 1000, 1)}k`;
  if (abs >= 1000) return n.toLocaleString("en-US");
  return String(round(n, abs < 10 && abs % 1 !== 0 ? 1 : 0));
}
