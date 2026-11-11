/**
 * IronLog — Stats view.
 *
 * The profile surface: a seven-day consistency strip, lifetime numbers, a
 * front/back muscle heatmap, sets per group, a six-axis balance radar and the
 * personal-record board. Everything is derived from the pure functions in
 * stats.js and the logged sets themselves.
 */

import {
  compactNumber,
  dailyTraining,
  lifetimeStats,
  localDateKey,
  relativeTime,
  streaks,
  weeklyVolume,
} from "../stats.js";
import { barChart, distributionBars, emptyState, esc, icon, statTile } from "../ui.js";

const DAY_MS = 86_400_000;

/** The muscles the body map knows how to paint. */
const BODY_MUSCLES = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
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

export function renderStats(store) {
  const completed = store.completedWorkouts();

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
  const weeks = weeklyVolume(completed).slice(-12);
  const records = store.personalRecords();
  const distribution = muscleDistribution(completed, index);
  const recentDistribution = muscleDistribution(
    completed.filter((workout) => {
      const ended = new Date(workout.endedAt ?? workout.startedAt).getTime();
      return Number.isFinite(ended) && Date.now() - ended <= 7 * DAY_MS;
    }),
    index,
  );
  const counts = Object.fromEntries(distribution.map((row) => [row.label, row.value]));

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

      ${renderMuscleCard(recentDistribution, counts)}

      <section class="panel" data-reveal="rise">
        <div class="panel-head"><h2>Sets per muscle group</h2><span class="panel-note">${life.sets} sets total</span></div>
        ${distributionBars(distribution)}
      </section>

      ${renderRadar(counts)}

      <section class="panel" data-reveal="rise" data-tilt data-tilt-glare data-tilt-max="1.2">
        <div class="panel-head"><h2>Weekly volume</h2><span class="panel-note">last ${weeks.length} ${weeks.length === 1 ? "week" : "weeks"}</span></div>
        ${barChart(
          weeks.map((w) => ({
            value: w.volume,
            label: `${w.week}: ${compactNumber(w.volume)} ${units} across ${w.workouts} ${w.workouts === 1 ? "session" : "sessions"}`,
            display: `${compactNumber(w.volume)} ${units}`,
            axis: w.week.replace(/^\d{4}-/, ""),
          })),
          { ariaLabel: "Weekly training volume" },
        )}
      </section>

      <section class="panel" data-reveal="rise">
        <div class="panel-head">
          <h2>${icon("trophy")} Personal records</h2>
          <span class="panel-note">${records.size} tracked</span>
        </div>
        ${records.size === 0
          ? `<p class="panel-empty">Complete a set with weight to start recording personal bests.</p>`
          : `<ul class="pr-list">
               ${[...records.values()]
                 .sort((a, b) => b.maxOneRm - a.maxOneRm)
                 .slice(0, 25)
                 .map((r) => renderPrRow(r, units)).join("")}
             </ul>`}
      </section>
    </section>`;
}

function levelFor(sets, max) {
  if (!sets || !max) return 0;
  const ratio = sets / max;
  if (ratio >= 0.85) return 4;
  if (ratio >= 0.6) return 3;
  if (ratio >= 0.35) return 2;
  return 1;
}

function renderMuscleCard(recentDistribution, counts) {
  const recent = Object.fromEntries(recentDistribution.map((row) => [row.label, row.value]));
  const max = Math.max(...BODY_MUSCLES.map((muscle) => recent[muscle] ?? 0), 1);
  const mostTrained = recentDistribution[0];
  const summary = mostTrained
    ? `${mostTrained.label} leads the last 7 days with ${mostTrained.value} sets.`
    : "No sets logged in the last 7 days. The map fills as you train.";

  return `
    <section class="muscle-card" data-reveal="rise" aria-labelledby="muscle-card-title">
      <div class="muscle-card-head">
        <h2 id="muscle-card-title">Muscle impact</h2>
        <span>Last 7 days</span>
      </div>
      <div class="muscle-body-wrap">
        <div class="muscle-body" role="img" aria-label="Front and back muscle heatmap. ${esc(summary)}">
          <div class="muscle-side">
            <span class="muscle-side-label">Front</span>
            ${renderBodyMap("front", recent, max)}
          </div>
          <span class="muscle-divider" aria-hidden="true"></span>
          <div class="muscle-side">
            <span class="muscle-side-label">Back</span>
            ${renderBodyMap("back", recent, max)}
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

function musclePath(muscle, recent, max, shape) {
  const sets = recent[muscle] ?? 0;
  return `<path class="mm-muscle" data-level="${levelFor(sets, max)}" d="${shape}"><title>${esc(muscle)}: ${sets} set${sets === 1 ? "" : "s"} in the last 7 days</title></path>`;
}

function renderBodyMap(view, recent, max) {
  const label = view === "front" ? "Front body map" : "Back body map";

  // A deliberately simple figure: rounded volumes, no medical detail. Each
  // coloured region is a real muscle group the log counts.
  const outline = `
    <circle class="mm-outline" cx="60" cy="15" r="9"></circle>
    <rect class="mm-outline" x="56" y="23" width="8" height="6" rx="2"></rect>
    <path class="mm-outline" d="M42 31c5-3 11-4 18-4s13 1 18 4l6 13-2 30c-1 10-4 18-7 23H45c-3-5-6-13-7-23l-2-30z"></path>
    <rect class="mm-muscle" data-level="${levelFor(recent.forearms ?? 0, max)}" x="24" y="88" width="10" height="30" rx="5" transform="rotate(6 29 103)"></rect>
    <rect class="mm-muscle" data-level="${levelFor(recent.forearms ?? 0, max)}" x="86" y="88" width="10" height="30" rx="5" transform="rotate(-6 91 103)"></rect>
    <rect class="mm-outline" x="20" y="39" width="11" height="34" rx="5.5" transform="rotate(8 25.5 56)"></rect>
    <rect class="mm-outline" x="89" y="39" width="11" height="34" rx="5.5" transform="rotate(-8 94.5 56)"></rect>
    <rect class="mm-outline" x="46" y="104" width="12" height="46" rx="6"></rect>
    <rect class="mm-outline" x="62" y="104" width="12" height="46" rx="6"></rect>
    <rect class="mm-outline" x="47" y="152" width="9" height="30" rx="4.5"></rect>
    <rect class="mm-outline" x="64" y="152" width="9" height="30" rx="4.5"></rect>
    <ellipse class="mm-outline" cx="51" cy="188" rx="7" ry="4"></ellipse>
    <ellipse class="mm-outline" cx="69" cy="188" rx="7" ry="4"></ellipse>`;

  const front = `
    ${musclePath("shoulders", recent, max, "M38 35c3-2 7-2 9 0l-1 8c-3 1-6 0-8-1z M82 35c-3-2-7-2-9 0l1 8c3 1 6 0 8-1z")}
    ${musclePath("chest", recent, max, "M47 44c3-2 8-1 11 2l-1 11c-4 2-8 1-10-2z M73 44c-3-2-8-1-11 2l1 11c4 2 8 1 10-2z")}
    ${musclePath("biceps", recent, max, "M27 47c3-1 6 0 7 2l-2 19c-2 1-4 0-5-2z M93 47c-3-1-6 0-7 2l2 19c2 1 4 0 5-2z")}
    ${musclePath("core", recent, max, "M52 61h16l-1 27c-4 2-10 2-14 0z")}
    ${musclePath("quads", recent, max, "M47 108h10l-1 38c-2 1-5 1-7 0z M63 108h10l-2 38c-2 1-5 1-7 0z")}
    ${musclePath("calves", recent, max, "M48 155h7l-1 23c-1 1-3 1-4 0z M65 155h7l-2 23c-1 1-3 1-4 0z")}`;

  const back = `
    ${musclePath("back", recent, max, "M45 40c4-3 10-4 15-4s11 1 15 4l-2 23c-4 4-9 6-13 6s-9-2-13-6z M48 66c4 3 8 4 12 4s8-1 12-4l-2 16c-3 2-6 3-10 3s-7-1-10-3z")}
    ${musclePath("shoulders", recent, max, "M38 35c3-2 7-2 9 0l-1 8c-3 1-6 0-8-1z M82 35c-3-2-7-2-9 0l1 8c3 1 6 0 8-1z")}
    ${musclePath("triceps", recent, max, "M27 47c3-1 6 0 7 2l-2 19c-2 1-4 0-5-2z M93 47c-3-1-6 0-7 2l2 19c2 1 4 0 5-2z")}
    ${musclePath("glutes", recent, max, "M47 93c3-3 8-3 11 0l-1 10c-3 2-7 2-9 0z M73 93c-3-3-8-3-11 0l1 10c3 2 7 2 9 0z")}
    ${musclePath("hamstrings", recent, max, "M47 108h10l-1 38c-2 1-5 1-7 0z M63 108h10l-2 38c-2 1-5 1-7 0z")}
    ${musclePath("calves", recent, max, "M48 155h7l-1 23c-1 1-3 1-4 0z M65 155h7l-2 23c-1 1-3 1-4 0z")}`;

  return `<svg class="muscle-map" viewBox="0 0 120 200" role="img" aria-label="${esc(label)}">
    ${outline}
    ${view === "front" ? front : back}
  </svg>`;
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
      const muscle = index[entry.exerciseId]?.muscle ?? "other";
      const done = (entry.sets ?? []).filter((s) => s.done).length;
      counts.set(muscle, (counts.get(muscle) ?? 0) + done);
    }
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value, display: `${value} ${value === 1 ? "set" : "sets"}` }))
    .sort((a, b) => b.value - a.value);
}
