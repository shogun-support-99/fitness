/**
 * IronLog — Profile view.
 *
 * The overview screen: who the log belongs to, a time range, the headline
 * figures for that range, the four ways into the detail screens, and the
 * session feed underneath. Everything deeper than a headline lives on its own
 * screen now — see statistics.js, muscle-distribution.js and body-distribution.js.
 *
 * The counters are deliberately local. Hevy shows followers and following here;
 * IronLog has no server and no other users, so the three figures are things
 * this device can actually answer: sessions logged, records standing, and the
 * current training streak.
 */

import {
  DEFAULT_RANGE,
  compactNumber,
  formatMinutes,
  ordinal,
  rangeSummary,
  rangeStart,
  streaks,
  workoutDurationMinutes,
  workoutOrdinals,
  workoutSetCount,
  workoutVolume,
  workoutsInRange,
} from "../stats.js";
import { emptyState, esc, icon, statTile } from "../ui.js";
import {
  dashTile,
  hrefWith,
  initials,
  longDate,
  noDataInRange,
  rangeChips,
  sectionTitle,
} from "./profile-common.js";

const FEED_CAP = 20;

export function renderStats(store, params) {
  const range = params?.get?.("range") || DEFAULT_RANGE;
  const completed = store.completedWorkouts();
  const profile = store.profile();
  const records = store.personalRecords();
  const streak = streaks(completed);
  const inRange = workoutsInRange(completed, { start: rangeStart(range) });
  const summary = rangeSummary(inRange);
  const units = store.settings.units;
  const qs = `range=${encodeURIComponent(range)}`;

  const body =
    completed.length === 0
      ? emptyState({
          icon: "stats",
          title: "No training logged yet",
          body: "Finish your first session and this screen fills with your volume, records and consistency.",
          action: `<a class="btn btn-primary" href="#/workout">${icon("dumbbell")} Start a workout</a>`,
        })
      : `${summaryRow(summary, units, range)}
         ${sectionTitle("Dashboard")}
         <div class="dash-grid">
           ${dashTile({ href: hrefWith("statistics", qs), icon: "stats", label: "Statistics", detail: "Volume, balance and records" })}
           ${dashTile({ href: "#/library", icon: "library", label: "Exercises", detail: "Every movement you have logged" })}
           ${dashTile({ href: hrefWith("measures", qs), icon: "user", label: "Measures", detail: "Bodyweight over time" })}
           ${dashTile({ href: hrefWith("calendar", qs), icon: "history", label: "Calendar", detail: "Your training month" })}
         </div>
         ${renderFeed(inRange, store, units, workoutOrdinals(completed))}`;

  return `
    <section class="view view-stats">
      <header class="view-head profile-hero" data-reveal="rise">
        <div class="profile-identity">
          <span class="profile-avatar" aria-hidden="true">${esc(initials(profile.displayName))}</span>
          <div class="profile-identity-copy">
            <h1>${esc(profile.displayName || "Your profile")}</h1>
            <p class="view-subline">@${esc(profile.handle || "local")} · stored on this device</p>
          </div>
          <a class="icon-btn profile-settings" href="#/settings" aria-label="Open settings">${icon("settings")}</a>
        </div>

        <dl class="profile-counters">
          <div class="counter"><dt>Workouts</dt><dd>${esc(completed.length)}</dd></div>
          <div class="counter"><dt>Records</dt><dd>${esc(records.size)}</dd></div>
          <div class="counter"><dt>Day streak</dt><dd>${esc(streak.current)}</dd></div>
        </dl>

        <details class="profile-edit">
          <summary class="btn btn-small">Edit profile</summary>
          <form class="profile-edit-form" data-action="save-profile">
            <label class="field">
              <span>Display name</span>
              <input type="text" name="displayName" maxlength="48" value="${esc(profile.displayName)}" placeholder="Your name" data-focus-key="profile-name" />
            </label>
            <label class="field">
              <span>Handle</span>
              <input type="text" name="handle" maxlength="32" value="${esc(profile.handle)}" placeholder="yourname" aria-describedby="profile-handle-hint" />
            </label>
            <p class="panel-hint" id="profile-handle-hint">Letters, numbers, dots, dashes and underscores. Nothing leaves this browser.</p>
            <div class="profile-edit-actions">
              <button class="btn btn-primary btn-small" type="submit">Save</button>
            </div>
          </form>
        </details>
      </header>

      ${rangeChips("stats", range, qs)}
      ${body}
    </section>`;
}

function summaryRow(summary, units, range) {
  if (summary.workouts === 0) return noDataInRange(range);
  return `<div class="tile-grid tile-grid-3 tile-grid-headline">
      ${statTile({ label: "Duration", value: formatMinutes(summary.minutes), tone: "tone-data" })}
      ${statTile({ label: "Volume", value: compactNumber(summary.volume), unit: units })}
      ${statTile({ label: "Reps", value: compactNumber(summary.reps), countTo: summary.reps })}
    </div>`;
}

function renderFeed(workouts, store, units, ordinals) {
  if (workouts.length === 0) {
    return `<section class="panel"><div class="panel-head"><h2>Workouts</h2></div><p class="panel-empty">No sessions in this range.</p></section>`;
  }
  const index = store.exerciseIndex();
  const items = workouts.slice(0, FEED_CAP);
  return `
    <section class="panel" data-reveal="rise">
      <div class="panel-head">
        <h2>Workouts</h2>
        <span class="panel-note">${items.length} of ${workouts.length}</span>
      </div>
      <ol class="feed">
        ${items.map((w) => renderFeedItem(w, index, units, ordinals.get(w.id))).join("")}
      </ol>
    </section>`;
}

function renderFeedItem(workout, index, units, position) {
  const names = (workout.exercises ?? [])
    .map((entry) => index[entry.exerciseId]?.name ?? "Unknown exercise")
    .slice(0, 4);
  const extra = (workout.exercises?.length ?? 0) - names.length;
  const minutes = workoutDurationMinutes(workout);
  return `
    <li class="feed-item">
      <a class="feed-link" href="${esc(hrefWith("history", "", { id: workout.id }))}">
        <span class="feed-ordinal" aria-hidden="true">${esc(position ? ordinal(position) : "—")}</span>
        <span class="feed-copy">
          <span class="feed-title">${esc(workout.name || "Workout")}</span>
          <span class="feed-date">${esc(longDate(workout.endedAt ?? workout.startedAt))}</span>
          <span class="feed-stats">${esc(formatMinutes(minutes))} · ${esc(compactNumber(workoutVolume(workout)))} ${esc(units)} · ${esc(workoutSetCount(workout))} sets</span>
          <span class="feed-exercises">${esc(names.join(", "))}${extra > 0 ? ` +${extra} more` : ""}</span>
        </span>
      </a>
    </li>`;
}
