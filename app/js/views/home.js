/**
 * IronLog — Home view.
 *
 * Landing surface for the app: resume or start a session, today's headline
 * numbers, and the most recent workouts.
 */

import { compactNumber, personalRecords, relativeTime, streaks, workoutDurationMinutes, workoutSetCount, workoutVolume } from "../stats.js";
import { emptyState, esc, icon, statTile } from "../ui.js";
import { renderRoutineCards } from "./routines.js";

export function renderHome(store) {
  const active = store.activeWorkout();
  const completed = store.completedWorkouts();
  const streak = streaks(completed);
  const recent = completed.slice(0, 4);
  const index = store.exerciseIndex();

  const lastSevenDays = completed.filter((w) => {
    const days = (Date.now() - new Date(w.endedAt ?? w.startedAt).getTime()) / 86_400_000;
    return days <= 7;
  });
  const weekVolume = lastSevenDays.reduce((sum, w) => sum + workoutVolume(w), 0);

  return `
    <section class="view view-home">
      <header class="view-head">
        <div>
          <h1>Home</h1>
          <p class="view-subline">${esc(homeSubline(streak, completed))}</p>
        </div>
      </header>

      ${active ? renderActiveBanner(active, store.settings.units) : renderStartPanel(store, lastSevenDays.length)}

      <div class="tile-grid">
        ${statTile({ label: "This week", value: compactNumber(weekVolume), unit: esc(store.settings.units), hint: `${lastSevenDays.length} session${lastSevenDays.length === 1 ? "" : "s"}`, tone: "tone-sky" })}
        ${statTile({ label: "Workouts", value: String(completed.length), hint: "all time", tone: "tone-violet" })}
        ${statTile({ label: "Best streak", value: `${streak.best}`, unit: "d", hint: `${streak.activeDays} active days`, tone: "tone-orange" })}
      </div>

      <section class="panel">
        <div class="panel-head">
          <h2>Recent sessions</h2>
          ${completed.length > 0 ? `<a class="link" href="#/history">View all ${icon("chevron")}</a>` : ""}
        </div>
        ${
          recent.length === 0
            ? emptyState({
                icon: "dumbbell",
                title: "No sessions logged yet",
                body: "Start your first workout and IronLog will track every set, weight and personal record from here on.",
              })
            : `<ul class="session-list">${recent.map((w) => renderSessionRow(w, index, store.settings.units)).join("")}</ul>`
        }
      </section>
    </section>`;
}

/**
 * A moving strip along the top of Home.
 *
 * Honesty first: it shows the user's OWN records and sessions when they have
 * any, because a strip of someone else's numbers on a personal log is decoration
 * pretending to be data. Only when the log is genuinely empty does it fall back
 * to library content, and then it says so in the strip's own label.
 *
 * motion.js clones the track for a seamless loop, pauses it on hover, on focus
 * within and when the tab is hidden, and never starts it under reduced motion.
 */
function renderTicker(store, completed) {
  const items = [];

  // The user's real records, best estimated 1RM first.
  //
  // personalRecords() returns a Map and resolves names through the exercise
  // index; without that second argument every record's name would be a raw id
  // like "ds-0289" on the strip.
  const recordsMap = personalRecords(completed, store.exerciseIndex());
  const records = [...recordsMap.values()].sort(
    (a, b) => (b.maxOneRm ?? 0) - (a.maxOneRm ?? 0),
  );
  for (const r of records.slice(0, 6)) {
    items.push({
      label: r.name,
      value: `${compactNumber(r.maxWeight)} ${store.settings.units}`,
      note: `est. 1RM ${compactNumber(r.maxOneRm)}`,
    });
  }

  // Then the most recent sessions.
  for (const w of completed.slice(0, 4)) {
    const sets = workoutSetCount(w);
    const volume = workoutVolume(w);
    items.push({
      label: w.name ?? "Session",
      // The unit comes from settings rather than a hardcoded "kg", because the
      // rest of the app honours that preference and this strip must agree.
      value: `${compactNumber(volume)} ${store.settings.units}`,
      note: `${sets} set${sets === 1 ? "" : "s"}`,
    });
  }

  const fromLibrary = items.length === 0;
  if (fromLibrary) {
    // Nothing logged yet, so show what the library holds - labelled as such.
    for (const e of store.exercises().slice(0, 8)) {
      items.push({ label: e.name, value: e.muscle ?? "", note: e.equipment ?? "" });
    }
  }

  if (items.length === 0) return "";

  const track = items
    .map(
      (it) => `<span class="ticker-item">
        ${it.value ? `<b>${esc(it.value)}</b>` : ""}
        ${esc(it.label)}${it.note ? `<i>${esc(it.note)}</i>` : ""}
      </span>`,
    )
    .join("");

  return `
    <div class="ticker" data-ticker aria-label="${esc(fromLibrary ? "Exercises in the library" : "Your records and recent sessions")}">
      <span class="ticker-caption">${esc(fromLibrary ? "In the library" : "Your log")}</span>
      <div class="ticker-viewport">
        <div class="ticker-track" data-ticker-track>${track}</div>
      </div>
    </div>`;
}

function renderActiveBanner(workout, units) {
  const sets = workoutSetCount(workout);
  const volume = workoutVolume(workout);
  const elapsed = Date.now() - new Date(workout.startedAt).getTime();
  return `
    <div class="active-banner" role="status" data-tilt data-reveal="rise">
      <div class="active-banner-text">
        <span class="pill pill-live"><span class="dot"></span>In progress</span>
        <h2>${esc(workout.name)}</h2>
        <p>${workout.exercises.length} exercise${workout.exercises.length === 1 ? "" : "s"} · ${sets} set${sets === 1 ? "" : "s"} · ${compactNumber(volume)} ${esc(units)} · ${Math.max(1, Math.round(elapsed / 60000))} min</p>
      </div>
      <a class="btn btn-primary btn-lg" href="#/workout" data-action="resume-workout">
        ${icon("play")} Resume
      </a>
    </div>`;
}

function renderStartPanel(store, weekCount) {
  const template = store.lastWorkoutTemplate();
  const goalProgress = Math.min(100, Math.round((weekCount / 3) * 100));
  return `
    <div class="home-training-grid">
      <section class="start-panel training-hero" data-tilt data-reveal="rise">
        <div class="start-panel-copy">
          <span class="energy-badge">${icon("bolt")} Training mode</span>
          <h2>Small sets. <span>Big momentum.</span></h2>
          <p>Pick a routine, beat your previous numbers, and let every completed set move you forward.</p>
          <div class="hero-actions">
            <button class="btn btn-primary btn-lg" data-action="start-workout">
              ${icon("play")} Start empty workout ${icon("chevron")}
            </button>
            ${template ? `<button class="btn btn-sub" data-action="repeat-last">${icon("history")} Repeat last <span class="btn-sub">${esc(template.exercises.length)} ${template.exercises.length === 1 ? "exercise" : "exercises"}</span></button>` : ""}
          </div>
        </div>
        <div class="hero-goal" style="--goal-offset:${100 - goalProgress}">
          <div class="goal-ring" role="img" aria-label="${weekCount} of 3 weekly momentum sessions completed">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle class="goal-ring-track" cx="60" cy="60" r="50" pathLength="100" />
              <circle class="goal-ring-value" cx="60" cy="60" r="50" pathLength="100" />
            </svg>
            <span class="goal-value"><strong>${weekCount}<small>/3</small></strong><span>this week</span></span>
          </div>
          <div class="goal-dots" aria-hidden="true">
            ${[1, 2, 3].map((n) => `<span class="${weekCount >= n ? "is-reached" : ""}">${weekCount >= n ? icon("check") : n}</span>`).join("")}
          </div>
          <span class="goal-caption">${weekCount >= 3 ? "Goal complete — nice work" : "3-session momentum goal"}</span>
        </div>
        <span class="hero-spark hero-spark-one" aria-hidden="true">${icon("bolt")}</span>
      </section>
      <section class="routine-section" aria-labelledby="home-routines-title">
        <div class="section-title-row"><div><span class="section-label">Jump straight in</span><h2 id="home-routines-title">Choose your routine</h2></div><a class="link" href="#/workout">View all ${icon("chevron")}</a></div>
        ${renderRoutineCards()}
      </section>
    </div>`;
}

function renderSessionRow(workout, index, units) {
  const when = relativeTime(workout.endedAt ?? workout.startedAt);
  const summary = workout.summary ?? {
    volume: Math.round(workoutVolume(workout)),
    sets: workoutSetCount(workout),
    minutes: workoutDurationMinutes(workout),
  };
  const prCount = summary.records?.length ?? 0;
  const exercises = workout.exercises.slice(0, 3);

  return `
    <li>
      <a class="session-row" href="#/history?id=${esc(workout.id)}">
        <span class="session-avatar">${icon("dumbbell")}</span>
        <span class="session-body">
          <span class="session-byline"><strong>Your workout</strong><span>${esc(when)}</span></span>
          <span class="session-name">${esc(workout.name)}</span>
          <span class="session-kpis">
            <span><small>Time</small><b>${summary.minutes} min</b></span>
            <span><small>Volume</small><b>${compactNumber(summary.volume)} ${esc(units)}</b></span>
            <span><small>Records</small><b>${prCount || "—"}</b></span>
          </span>
          <span class="session-exercise-list">
            ${exercises.map((entry) => {
              const count = entry.sets.filter((set) => set.done).length;
              return `<span><b>${count} set${count === 1 ? "" : "s"}</b> ${esc(index[entry.exerciseId]?.name ?? entry.exerciseId)}</span>`;
            }).join("")}
            ${workout.exercises.length > exercises.length ? `<small>See ${workout.exercises.length - exercises.length} more in history</small>` : ""}
          </span>
        </span>
        <span class="session-go">${icon("chevron")}</span>
      </a>
    </li>`;
}

/**
 * The line under the title: the day, then where the training stands, in the
 * words a lifter would use. streaks() returns only current/best/activeDays, so
 * the gap since the last session is computed here from the log itself.
 */
function homeSubline(streak, completed, date = new Date()) {
  const day = date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  if (streak.current > 0) return `${day} · ${streak.current}-day streak`;
  if (completed.length === 0) return `${day} · nothing logged yet`;

  const last = new Date(completed[0].endedAt ?? completed[0].startedAt);
  const days = Math.max(0, Math.round((startOfDay(date) - startOfDay(last)) / 86_400_000));
  const gap = days === 0 ? "trained today" : days === 1 ? "trained yesterday" : `last session ${days} days ago`;
  return `${day} · ${gap}`;
}

function startOfDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}
