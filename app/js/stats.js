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

  const ONE_DAY = 24 * 3600 * 1000;
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // A streak is still "current" if the user trained today or yesterday.
  if (!days.has(localDateKey(cursor))) cursor.setTime(cursor.getTime() - ONE_DAY);

  let current = 0;
  while (days.has(localDateKey(cursor))) {
    current += 1;
    cursor.setTime(cursor.getTime() - ONE_DAY);
  }

  const sorted = [...days].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00`);
    const cur = new Date(`${sorted[i]}T00:00:00`);
    if (cur.getTime() - prev.getTime() === ONE_DAY) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }

  return { current, best: Math.max(best, current), activeDays: days.size };
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

/* ── Training ranges ───────────────────────────────────────────────────────
 *
 * The profile answers "how did the last N days go?", which every screen needs
 * and which must stay answerable from a stored history with gaps in it. These
 * helpers are pure and take `now` by injection so tests can pin the clock.
 * ------------------------------------------------------------------------- */

/**
 * Selectable ranges, ordered narrowest first. Hevy's picker offers the same
 * ladder; "All time" has no window at all.
 */
export const RANGES = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "3m", label: "Last 3 months", months: 3 },
  { id: "1y", label: "Last year", years: 1 },
  { id: "all", label: "All time" },
];

export const DEFAULT_RANGE = "30d";

export function rangeLabel(rangeId) {
  return RANGES.find((r) => r.id === rangeId)?.label ?? RANGES[0].label;
}

/** Start of a range as a local-midnight Date, or null for "all time". */
export function rangeStart(rangeId, now = new Date()) {
  const range = RANGES.find((r) => r.id === rangeId);
  if (!range || !range.days && !range.months && !range.years) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range.days) {
    // Overlapping windows, not calendar buckets: "last 7 days" is seven
    // including today, so it reaches back six whole days.
    start.setDate(start.getDate() - (range.days - 1));
  }
  if (range.months) start.setMonth(start.getMonth() - range.months);
  if (range.years) start.setFullYear(start.getFullYear() - range.years);
  return start;
}

/**
 * The window immediately before a range, used for the current-vs-previous
 * comparison. It is the same length, so the two are genuinely comparable.
 */
export function previousRangeBounds(rangeId, now = new Date()) {
  const start = rangeStart(rangeId, now);
  if (!start) return { start: null, end: null };
  const end = new Date(start.getTime() - 1);
  const range = RANGES.find((r) => r.id === rangeId);
  const prevStart = new Date(start);
  if (range?.days) prevStart.setDate(prevStart.getDate() - range.days);
  if (range?.months) prevStart.setMonth(prevStart.getMonth() - range.months);
  if (range?.years) prevStart.setFullYear(prevStart.getFullYear() - range.years);
  return { start: prevStart, end };
}

/** Timestamp of a workout: completion time, falling back to its start. */
function workoutStamp(workout) {
  return new Date(workout?.endedAt ?? workout?.startedAt).getTime();
}

/** Completed workouts inside a range. `end` is exclusive. */
export function workoutsInRange(workouts, { start = null, end = null } = {}) {
  return (workouts ?? []).filter((w) => {
    if (w?.status !== "completed") return false;
    const t = workoutStamp(w);
    if (!Number.isFinite(t)) return false;
    if (start && t < start.getTime()) return false;
    if (end && t > end.getTime()) return false;
    return true;
  });
}

/** The whole set of completed workouts inside one named range. */
export function workoutsForRange(workouts, rangeId, now = new Date()) {
  return workoutsInRange(workouts, { start: rangeStart(rangeId, now) });
}

/** Headline totals for a set of workouts. */
export function rangeSummary(workouts) {
  const list = (workouts ?? []).filter((w) => w?.status === "completed");
  let volume = 0;
  let sets = 0;
  let reps = 0;
  let minutes = 0;
  for (const w of list) {
    volume += workoutVolume(w);
    sets += workoutSetCount(w);
    minutes += workoutDurationMinutes(w);
    for (const entry of w.exercises ?? []) {
      for (const s of entry.sets ?? []) {
        if (s?.done) reps += Number(s.reps) || 0;
      }
    }
  }
  return {
    workouts: list.length,
    volume: Math.round(volume),
    sets,
    reps,
    minutes,
    hours: round(minutes / 60, 1),
  };
}

/**
 * Completed sets per catalogue `muscle`, from a set of workouts.
 *
 * Secondary muscles are deliberately not counted. Hevy's muscle screens count a
 * set once for its primary mover, and double-counting secondaries would inflate
 * every group that happens to be listed second.
 */
export function muscleSetCounts(workouts, index = {}) {
  const counts = new Map();
  for (const w of workouts ?? []) {
    if (w?.status !== "completed") continue;
    for (const entry of w.exercises ?? []) {
      const muscle = index[entry.exerciseId]?.muscle ?? "other";
      const done = (entry.sets ?? []).filter((s) => s.done).length;
      if (done > 0) counts.set(muscle, (counts.get(muscle) ?? 0) + done);
    }
  }
  return counts;
}

/** Completed sets per catalogue `target`, for the body-distribution table. */
export function targetSetCounts(workouts, index = {}) {
  const counts = new Map();
  for (const w of workouts ?? []) {
    if (w?.status !== "completed") continue;
    for (const entry of w.exercises ?? []) {
      const target = index[entry.exerciseId]?.target ?? "other";
      const done = (entry.sets ?? []).filter((s) => s.done).length;
      if (done > 0) counts.set(target, (counts.get(target) ?? 0) + done);
    }
  }
  return counts;
}

/** English ordinal for the workout feed: 1 -> "1st", 10 -> "10th". */
export function ordinal(n) {
  const value = Math.trunc(Number(n) || 0);
  const abs = Math.abs(value);
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  const suffix = abs % 10 === 1 ? "st" : abs % 10 === 2 ? "nd" : abs % 10 === 3 ? "rd" : "th";
  return `${value}${suffix}`;
}

/**
 * Ordinal of a workout within the full history, oldest first. Hevy labels a
 * session "10th workout", which is far more legible in a feed than a date and
 * quietly rewards consistency.
 */
export function workoutOrdinals(workouts) {
  const completed = (workouts ?? [])
    .filter((w) => w?.status === "completed")
    .sort((a, b) => workoutStamp(a) - workoutStamp(b));
  const out = new Map();
  completed.forEach((w, i) => out.set(w.id, i + 1));
  return out;
}

/* ── Calendar maths ───────────────────────────────────────────────────── */

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const WEEKDAY_LABELS = WEEKDAY_INITIALS;
export const WEEKDAY_FULL = WEEKDAY_NAMES;
export const MONTH_LABELS = MONTH_NAMES;

/** Single-letter weekday initials in calendar order, Sunday first. */
export function weekdayInitials() {
  return [...WEEKDAY_INITIALS];
}

/** `2026-11-05` style key for any Date, in local time. */
export function dateKey(date) {
  return localDateKey(date);
}

/**
 * The seven days ending on `anchor`, oldest first — the consistency strip on
 * the Statistics screen.
 */
export function trailingWeek(anchor = new Date(), trainedDays = new Set()) {
  const end = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    days.push({
      date: d,
      key,
      day: d.getDate(),
      weekday: WEEKDAY_INITIALS[d.getDay()],
      weekdayName: WEEKDAY_NAMES[d.getDay()],
      isToday: key === dateKey(end),
      trained: trainedDays.has(key),
    });
  }
  return days;
}

/**
 * The Sunday-first calendar week containing `anchor`, with `selected` marking
 * the day whose sets the screen is showing.
 */
export function calendarWeek(anchor = new Date(), { selected = null, trainedDays = new Set() } = {}) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  start.setDate(start.getDate() - start.getDay());
  const selectedKey = selected ? dateKey(selected) : dateKey(anchor);
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = dateKey(d);
    days.push({
      date: d,
      key,
      day: d.getDate(),
      weekday: WEEKDAY_INITIALS[d.getDay()],
      weekdayName: WEEKDAY_NAMES[d.getDay()],
      isToday: key === dateKey(anchor),
      isSelected: key === selectedKey,
      trained: trainedDays.has(key),
    });
  }
  const last = days[days.length - 1].date;
  // A week that straddles two months cannot be labelled with one month name:
  // "28-03 November" would describe an October week. Name both ends instead.
  const label =
    start.getMonth() === last.getMonth()
      ? `${pad2(start.getDate())}-${pad2(last.getDate())} ${MONTH_NAMES[last.getMonth()]} ${last.getFullYear()}`
      : `${pad2(start.getDate())} ${MONTH_SHORT[start.getMonth()]} - ${pad2(last.getDate())} ${MONTH_SHORT[last.getMonth()]} ${last.getFullYear()}`;
  return { days, start, end: last, label };
}

/** Shift a date by whole weeks. */
export function shiftWeek(anchor, weeks) {
  const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

/** Shift a year/month pair by whole months, normalised. */
export function shiftMonth(year, month, months) {
  const d = new Date(year, month + months, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/**
 * A Sunday-first month grid. Leading and trailing cells are filled from the
 * neighbouring months so the grid is always a whole number of weeks, and every
 * cell knows whether it is inside the month being shown.
 */
export function monthGrid(year, month, { trainedDays = new Set(), today = new Date() } = {}) {
  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - first.getDay());
  const todayKey = dateKey(today);
  const weeks = [];
  for (let w = 0; w < 6; w += 1) {
    const row = [];
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + w * 7 + d);
      const key = dateKey(date);
      row.push({
        date,
        key,
        day: date.getDate(),
        inMonth: date.getMonth() === month && date.getFullYear() === year,
        isToday: key === todayKey,
        trained: trainedDays.has(key),
      });
    }
    weeks.push(row);
  }
  // A six-row grid always covers the month, but the last row is often entirely
  // next month. Dropping it keeps the panel from ending in dead space.
  if (weeks.length === 6 && weeks[5].every((c) => !c.inMonth)) weeks.pop();
  return { weeks, year, month, label: `${MONTH_NAMES[month]} ${year}` };
}

/** Days with at least one completed workout, as a Set of `YYYY-MM-DD`. */
export function trainedDays(workouts) {
  const days = new Set();
  for (const w of workouts ?? []) {
    if (w?.status !== "completed") continue;
    const key = localDateKey(w.endedAt ?? w.startedAt);
    if (key) days.add(key);
  }
  return days;
}

/** `92` -> "1h 32m", for duration figures that would otherwise be opaque. */
export function formatMinutes(totalMinutes) {
  const mins = Math.max(0, Math.round(Number(totalMinutes) || 0));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
