/**
 * IronLog — Stats view.
 *
 * The profile surface: a seven-day consistency strip, lifetime numbers, a
 * front/back muscle heatmap that can be switched between 7 days, 30 days and
 * all time, sets per group, a six-axis balance radar, a volume chart that
 * reads by week, month or year, the award board and the personal-record
 * board. Everything is derived from the pure functions in stats.js and the
 * logged sets themselves.
 */

import {
  compactNumber,
  dailyTraining,
  lifetimeStats,
  localDateKey,
  monthlyVolume,
  relativeTime,
  streaks,
  weeklyVolume,
  yearlyVolume,
} from "../stats.js";
import { barChart, distributionBars, emptyState, esc, icon, statTile } from "../ui.js";
import { BODY_MUSCLES, normalizeMuscle, renderBodyMap } from "./body-map.js";

const DAY_MS = 86_400_000;

/** Muscle-map windows, mirroring Hevy's "Last 7 days" default plus wider cuts. */
export const MUSCLE_PERIODS = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "all", label: "All time", days: null },
];

/** Granularity of the volume chart, matching Hevy's Week / Month / Year tabs. */
export const VOLUME_PERIODS = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

/** Personal-record filters. The record kinds come from stats.js. */
export const PR_FILTERS = [
  { key: "all", label: "All", kind: null },
  { key: "weight", label: "Heaviest", kind: "weight" },
  { key: "reps", label: "Reps", kind: "reps" },
  { key: "oneRm", label: "1RM", kind: "oneRm" },
];

/** Awards are pure functions of the lifetime numbers, so they need no storage. */
const AWARDS = [
  { key: "first", icon: "bolt", title: "First session", detail: "Complete your first workout", earned: (life) => life.workouts >= 1 },
  { key: "ten", icon: "dumbbell", title: "Ten workouts", detail: "10 logged workouts", earned: (life) => life.workouts >= 10 },
  { key: "fifty", icon: "trophy", title: "Fifty workouts", detail: "50 logged workouts", earned: (life) => life.workouts >= 50 },
  { key: "century", icon: "flame", title: "Century club", detail: "100 logged workouts", earned: (life) => life.workouts >= 100 },
  { key: "streak7", icon: "flame", title: "Week streak", detail: "7 days in a row", earned: (life, streak) => streak.best >= 7 },
  { key: "streak30", icon: "flame", title: "Month streak", detail: "30 days in a row", earned: (life, streak) => streak.best >= 30 },
  { key: "volume100k", icon: "stats", title: "100k lifted", detail: "100,000 kg total volume", earned: (life) => life.volume >= 100_000 },
  { key: "volume1m", icon: "stats", title: "Million club", detail: "1,000,000 kg total volume", earned: (life) => life.volume >= 1_000_000 },
];

function renderProfileHead(workoutCount) {
  return `
    <header class="view-head profile-view-head">
      <div class="profile-identity">
        <span class="profile-avatar" aria-hidden="true">IL</span>
        <div><h1>Your profile</h1><p class="view-subline">${workoutCount} workout${workoutCount === 1 ? "" : "s"} · stored on this device</p></div>
      </div>
      <a class="icon-btn profile-settings" href="#/settings" aria-label="Open settings">${icon("settings")}</a>
    </header>
    <nav class="profile-shortcuts" aria-label="Profile sections">
      <a class="is-active" href="#/stats">${icon("stats")} Statistics</a>
      <a href="#/library">${icon("library")} Exercises</a>
    </nav>`;
}

/** A radiogroup of segmented buttons; every button is a 44px touch target. */
function renderSegmented(options, active, { kind, label }) {
  return `
    <div class="segmented" role="radiogroup" aria-label="${esc(label)}">
      ${options
        .map(
          (option) => `
        <button role="radio" aria-checked="${option.key === active}"
                class="segment ${option.key === active ? "is-active" : ""}"
                data-action="set-stats-period" data-kind="${esc(kind)}" data-period="${esc(option.key)}">${esc(option.label)}</button>`,
        )
        .join("")}
    </div>`;
}

/** Last seven local days, one column each, with a tick on trained days. */
function renderWeekStrip(completed, today = new Date()) {
  const days = dailyTraining(completed);
  const cells = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - offset));
    const key = localDateKey(date);
    const row = days.get(key);
    return {
      key,
      weekday: date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2),
      date: date.getDate(),
      sessions: row?.sessions ?? 0,
      sets: row?.sets ?? 0,
      isToday: offset === 6,
    };
  });
  const active = cells.filter((cell) => cell.sessions > 0).length;

  return `
    <section class="week-strip" aria-labelledby="week-strip-title">
      <div class="week-strip-head">
        <h2 id="week-strip-title">Weekly consistency</h2>
        <span>${icon("flame")} ${active}/7 days active</span>
      </div>
      <div class="week-days">
        ${cells
          .map(
            (cell) => `
          <div class="week-day ${cell.sessions > 0 ? "is-trained" : ""} ${cell.isToday ? "is-today" : ""}"
               title="${esc(cell.key)}${cell.sessions ? ` · ${cell.sets} sets` : " · rest day"}">
            <span class="week-day-name">${esc(cell.isToday ? "Today" : cell.weekday)}</span>
            <span class="week-day-date">${cell.date}</span>
            <span class="week-day-mark">${cell.sessions > 0 ? icon("check") : icon(cell.isToday ? "dumbbell" : "info")}</span>
          </div>`,
          )
          .join("")}
      </div>
    </section>`;
}

/** Completed workouts whose end date falls inside the muscle-map window. */
function workoutsWithin(workouts, period) {
  const option = MUSCLE_PERIODS.find((p) => p.key === period) ?? MUSCLE_PERIODS[0];
  if (!option.days) return workouts;
  const cutoff = Date.now() - option.days * DAY_MS;
  return workouts.filter((workout) => {
    const ended = new Date(workout.endedAt ?? workout.startedAt).getTime();
    return Number.isFinite(ended) && ended >= cutoff;
  });
}

export function renderStats(store, view = {}) {
  const completed = store.completedWorkouts();
  const musclePeriod = view.musclePeriod ?? "7d";
  const volumePeriod = view.volumePeriod ?? "week";
  const prKind = view.prKind ?? "all";

  if (completed.length === 0) {
    return `
      <section class="view view-stats">
        ${renderProfileHead(0)}
        ${emptyState({
          icon: "stats",
          title: "No data to chart yet",
          body: "Log a few sessions and your volume, personal records and muscle balance will build up here.",
        })}
      </section>`;
  }

  const index = store.exerciseIndex();
  const units = store.settings.units;
  const life = lifetimeStats(completed);
  const streak = streaks(completed);
  const periodLabel = MUSCLE_PERIODS.find((p) => p.key === musclePeriod)?.label ?? "Last 7 days";
  const windowed = workoutsWithin(completed, musclePeriod);
  const distribution = muscleDistribution(completed, index);
  const counts = Object.fromEntries(distribution.map((row) => [row.label, row.value]));
  const windowedDistribution = muscleDistribution(windowed, index);
  const windowedCounts = Object.fromEntries(windowedDistribution.map((row) => [row.label, row.value]));
  const records = store.personalRecords();
  const prFilter = PR_FILTERS.find((f) => f.key === prKind) ?? PR_FILTERS[0];
  const visibleRecords = [...records.values()]
    .filter((record) => !prFilter.kind || record.history.some((entry) => entry.kinds.includes(prFilter.kind)))
    .sort((a, b) => b.maxOneRm - a.maxOneRm)
    .slice(0, 25);

  return `
    <section class="view view-stats">
      ${renderProfileHead(life.workouts)}

      ${renderWeekStrip(completed)}

      <div class="section-title-row"><h2>All time</h2><span class="panel-note">${life.sets} sets · ${life.hours} h training</span></div>
      <div class="tile-grid">
        ${statTile({ label: "Workouts", value: String(life.workouts), countTo: life.workouts, hint: `${life.sets} sets total`, tone: "tone-data" })}
        ${statTile({ label: "Volume", value: compactNumber(life.volume), unit: units, hint: "cumulative" })}
        ${statTile({ label: "Streak", value: String(streak.current), unit: "days", hint: `Best ${streak.best} days` })}
      </div>

      ${renderMuscleCard(windowedCounts, windowedDistribution, {
        periodKey: musclePeriod,
        periodLabel,
      })}

      ${renderAwards(life, streak)}

      <section class="panel" data-reveal="rise">
        <div class="panel-head"><h2>Sets per muscle group</h2><span class="panel-note">${life.sets} sets total</span></div>
        ${distributionBars(distribution)}
      </section>

      ${renderRadar(counts)}

      <section class="panel" data-reveal="rise" data-tilt data-tilt-glare data-tilt-max="1.2">
        <div class="panel-head">
          <h2>Volume</h2>
          ${renderSegmented(VOLUME_PERIODS, volumePeriod, { kind: "volume", label: "Volume chart period" })}
        </div>
        ${renderVolumeChart(completed, volumePeriod, units)}
      </section>

      <section class="panel" data-reveal="rise">
        <div class="panel-head">
          <h2>${icon("trophy")} Personal records</h2>
          ${renderSegmented(PR_FILTERS, prKind, { kind: "pr", label: "Personal record category" })}
        </div>
        ${records.size === 0
          ? `<p class="panel-empty">Complete a set with weight to start recording personal bests.</p>`
          : visibleRecords.length === 0
            ? `<p class="panel-empty">No ${esc(prFilter.label.toLowerCase())} records yet — keep training.</p>`
            : `<ul class="pr-list">
                 ${visibleRecords.map((r) => renderPrRow(r, units)).join("")}
               </ul>`}
      </section>
    </section>`;
}

/**
 * The volume chart's three granularities all reduce to a bar series, so one
 * renderer takes whichever buckets the selected period produces.
 */
function renderVolumeChart(completed, period, units) {
  const toPoints = (rows, axisOf, noteOf) =>
    rows.map((row) => ({
      value: row.volume,
      label: `${row.label ?? row.key}: ${compactNumber(row.volume)} ${units} across ${row.workouts} ${row.workouts === 1 ? "session" : "sessions"}`,
      display: `${compactNumber(row.volume)} ${units}`,
      axis: axisOf(row),
      note: noteOf(row),
    }));

  let points;
  let note;
  if (period === "month") {
    const rows = monthlyVolume(completed).slice(-12);
    points = toPoints(rows, (r) => r.key.split("-")[1], (r) => `${r.sets} sets · ${r.label ?? r.key}`);
    note = `last ${rows.length} month${rows.length === 1 ? "" : "s"}`;
  } else if (period === "year") {
    const rows = yearlyVolume(completed);
    points = toPoints(rows, (r) => r.key, (r) => `${r.sets} sets · ${r.workouts} sessions`);
    note = `${rows.length} year${rows.length === 1 ? "" : "s"}`;
  } else {
    const rows = weeklyVolume(completed).slice(-12);
    points = toPoints(
      rows,
      (r) => r.week.replace(/^\d{4}-/, ""),
      (r) => `${r.sets} sets · week ${r.week}`,
    );
    note = `last ${rows.length} ${rows.length === 1 ? "week" : "weeks"}`;
  }

  return `
    <div class="volume-chart">
      ${barChart(points, { ariaLabel: `Training volume by ${period}` })}
      <p class="chart-note">${esc(note)} · ${points.reduce((sum, p) => sum + p.value, 0) ? compactNumber(points.reduce((sum, p) => sum + p.value, 0)) : "0"} ${esc(units)} total</p>
    </div>`;
}

function renderMuscleCard(counts, distribution, { periodKey, periodLabel }) {
  const max = Math.max(...BODY_MUSCLES.map((muscle) => counts[muscle] ?? 0), 1);
  const mostTrained = distribution[0];
  const caption = periodKey === "all" ? "%m%s all time" : `%m%s in the last ${periodKey === "7d" ? "7" : "30"} days`;
  const summary = mostTrained
    ? `${mostTrained.label} leads ${periodLabel === "All time" ? "all time" : `the last ${periodKey === "7d" ? "7" : "30"} days`} with ${mostTrained.value} sets.`
    : `No sets logged ${periodKey === "all" ? "yet" : `in the last ${periodKey === "7d" ? "7" : "30"} days`}. The map fills as you train.`;

  return `
    <section class="muscle-card" data-reveal="rise" aria-labelledby="muscle-card-title">
      <div class="muscle-card-head">
        <h2 id="muscle-card-title">Muscle impact</h2>
        ${renderSegmented(MUSCLE_PERIODS, periodKey, { kind: "muscle", label: "Muscle heatmap period" })}
      </div>
      <div class="muscle-body-wrap">
        <div class="muscle-body" role="img" aria-label="Front and back muscle heatmap. ${esc(summary)}">
          <div class="muscle-side">
            <span class="muscle-side-label">Front</span>
            ${renderBodyMap("front", counts, max, caption)}
          </div>
          <span class="muscle-divider" aria-hidden="true"></span>
          <div class="muscle-side">
            <span class="muscle-side-label">Back</span>
            ${renderBodyMap("back", counts, max, caption)}
          </div>
        </div>
        <div class="muscle-legend" aria-hidden="true">
          <span><i style="background:#232327"></i>0</span>
          <span><i style="background:#15446c"></i>Low</span>
          <span><i style="background:#1a6cb4"></i>Moderate</span>
          <span><i style="background:#2196f3"></i>High</span>
        </div>
      </div>
    </section>`;
}

/**
 * The award board. Earned tiles carry the accent hue, locked ones stay muted,
 * so the grid reads as progress rather than as a second set of stats.
 */
function renderAwards(life, streak) {
  return `
    <section class="award-card" data-reveal="rise" aria-labelledby="award-title">
      <div class="award-card-head">
        <h2 id="award-title">Awards</h2>
        <span>${AWARDS.filter((award) => award.earned(life, streak)).length}/${AWARDS.length} earned</span>
      </div>
      <ul class="award-grid">
        ${AWARDS.map((award) => {
          const unlocked = award.earned(life, streak);
          return `
            <li class="award ${unlocked ? "is-earned" : "is-locked"}" title="${esc(award.detail)}">
              <span class="award-mark">${icon(unlocked ? award.icon : "info")}</span>
              <span class="award-name">${esc(award.title)}</span>
              <span class="award-state">${unlocked ? "Earned" : "Locked"}</span>
            </li>`;
        }).join("")}
      </ul>
    </section>`;
}

function renderRadar(counts) {
  const groups = [
    { label: "Chest", value: counts.chest ?? 0 },
    { label: "Back", value: counts.back ?? 0 },
    { label: "Legs", value: (counts.quads ?? 0) + (counts.hamstrings ?? 0) + (counts.glutes ?? 0) + (counts.calves ?? 0) },
    { label: "Shoulders", value: counts.shoulders ?? 0 },
    { label: "Arms", value: (counts.biceps ?? 0) + (counts.triceps ?? 0) + (counts.forearms ?? 0) },
    { label: "Core", value: counts.core ?? 0 },
  ];
  const max = Math.max(...groups.map((group) => group.value), 1);
  const cx = 110;
  const cy = 100;
  const radius = 60;
  const point = (index, scale) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / groups.length;
    return [cx + Math.cos(angle) * radius * scale, cy + Math.sin(angle) * radius * scale];
  };
  const rings = [0.25, 0.5, 0.75, 1]
    .map((scale) => {
      const points = groups.map((_, i) => point(i, scale).join(",")).join(" ");
      return `<polygon class="radar-ring" points="${points}"></polygon>`;
    })
    .join("");
  const axes = groups
    .map((_, i) => {
      const [x, y] = point(i, 1);
      return `<line class="radar-axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line>`;
    })
    .join("");
  const dataPoints = groups
    .map((group, i) => point(i, Math.max(group.value / max, 0.06)))
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const dots = groups
    .map((group, i) => {
      const [x, y] = point(i, Math.max(group.value / max, 0.06));
      return `<circle class="radar-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.4"></circle>`;
    })
    .join("");
  const labels = groups
    .map((group, i) => {
      const [x, y] = point(i, 1.4);
      const anchor = Math.abs(x - cx) < 6 ? "middle" : x < cx ? "end" : "start";
      return `<text class="radar-label" x="${x.toFixed(1)}" y="${(y - 2).toFixed(1)}" text-anchor="${anchor}">${esc(group.label)}</text>
        <text class="radar-value" x="${x.toFixed(1)}" y="${(y + 7).toFixed(1)}" text-anchor="${anchor}">${group.value}</text>`;
    })
    .join("");
  const lead = [...groups].sort((a, b) => b.value - a.value)[0];

  return `
    <section class="radar-card" data-reveal="rise" aria-labelledby="radar-title">
      <div class="radar-card-head">
        <h2 id="radar-title">Volume distribution</h2>
        <span>${lead.value > 0 ? `${esc(lead.label)} leads` : "No sets yet"}</span>
      </div>
      <p>Balance across the six major training groups, all time.</p>
      <div class="radar-wrap">
        <svg class="radar-chart" viewBox="0 0 220 205" role="img" aria-label="Radar chart of all-time sets: ${groups.map((group) => `${esc(group.label)} ${group.value}`).join(", ")}.">
          ${rings}
          ${axes}
          <polygon class="radar-area" points="${dataPoints}"></polygon>
          ${dots}
          ${labels}
        </svg>
      </div>
    </section>`;
}

function renderPrRow(record, units) {
  const latest = record.history[record.history.length - 1];
  return `
    <li class="pr-row">
      <span class="pr-name">
        ${esc(record.name)}
        ${latest?.date ? `<em>${esc(relativeTime(latest.date))}</em>` : ""}
      </span>
      <span class="pr-values">
        <span class="pr-value"><b>${record.maxWeight}</b><i>${esc(units)}</i><u>heaviest</u></span>
        <span class="pr-value"><b>${record.maxReps}</b><i>reps</i><u>most</u></span>
        <span class="pr-value pr-value-accent"><b>${compactNumber(record.maxOneRm)}</b><i>${esc(units)}</i><u>est. 1RM</u></span>
      </span>
    </li>`;
}

function muscleDistribution(workouts, index) {
  const counts = new Map();
  for (const w of workouts) {
    for (const entry of w.exercises ?? []) {
      // Collapse the dataset's finer vocabulary ("lats", "quadriceps") onto the
      // eleven silhouette groups so the map, the bars and the radar agree.
      const raw = index[entry.exerciseId]?.muscle ?? "other";
      const muscle = normalizeMuscle(raw) ?? raw;
      const done = (entry.sets ?? []).filter((s) => s.done).length;
      counts.set(muscle, (counts.get(muscle) ?? 0) + done);
    }
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value, display: `${value} ${value === 1 ? "set" : "sets"}` }))
    .sort((a, b) => b.value - a.value);
}
