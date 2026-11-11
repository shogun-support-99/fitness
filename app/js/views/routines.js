/**
 * Reusable routine shortcuts shared by Home and the Workout tab.
 *
 * Each split has a recognisable colour and icon while using the existing
 * existing start-split action. These are real editable sessions, not demo cards.
 */

import { esc, icon } from "../ui.js";

const ROUTINES = [
  { label: "Push", slug: "push", detail: "Chest · Shoulders · Triceps", muscles: ["chest", "shoulders", "triceps"], icon: "dumbbell" },
  { label: "Pull", slug: "pull", detail: "Back · Biceps", muscles: ["back", "biceps"], icon: "bolt" },
  { label: "Legs", slug: "legs", detail: "Quads · Hamstrings · Glutes", muscles: ["quads", "hamstrings", "glutes"], icon: "flame" },
  { label: "Full body", slug: "full-body", detail: "Four foundational movements", muscles: ["chest", "back", "quads", "shoulders"], icon: "user" },
  { label: "Custom workout", slug: "custom", detail: "Start empty, add any exercises", muscles: [], icon: "plus" },
];

/* The presets cover the common splits; the fifth card starts an empty session
   so any exercise can be added by hand. */
export const CUSTOM_SPLIT = { label: "Custom workout", slug: "custom", detail: "Start empty, add any exercises", muscles: [], icon: "plus" };

export function renderRoutineCards(routines = []) {
  const saved = routines
    .filter((routine) => routine && routine.name && Array.isArray(routine.muscles))
    .map((routine) => ({
      label: routine.name,
      slug: "saved",
      detail: routine.muscles.length
        ? `${routine.muscles.length} ${routine.muscles.length === 1 ? "exercise" : "exercises"} · ${routine.muscles.join(" · ")}`
        : "No exercises yet — edit to add some",
      muscles: routine.muscles,
      icon: "dumbbell",
      id: routine.id,
      saved: true,
      restSeconds: routine.restSeconds,
    }));

  return `<div class="routine-grid" data-reveal="rise">${[...saved, ...ROUTINES.map((routine) => ({ ...routine, saved: false }))]
    .map(
      (routine, index) => `
    <article class="routine-card routine-${routine.slug} hover-lift animate-scale-in${routine.saved ? " routine-saved" : ""}" style="--routine-order:${index};animation-delay:calc(var(--routine-order) * 55ms)" data-spotlight data-tilt data-tilt-glare data-tilt-max="3.2" data-tilt-parallax="14">
      <div class="routine-head">
        <span class="routine-icon">${icon(routine.icon)}</span>
        <span class="routine-copy">
          <strong>${esc(routine.label)}</strong>
          <small>${esc(routine.detail)}</small>
          <span class="routine-count">${routine.muscles.length ? `${routine.muscles.length} exercise${routine.muscles.length === 1 ? "" : "s"}` : "Start empty"}</span>
        </span>
        ${routine.saved ? `<button class="icon-btn routine-edit" type="button" data-action="edit-routine" data-routine-id="${esc(routine.id)}" aria-label="Edit ${esc(routine.label)} routine">${icon("settings")}</button>` : ""}
      </div>
      ${
        routine.muscles.length
          ? `<div class="routine-chips">${routine.muscles
              .map((muscle) => `<span class="routine-chip">${esc(muscle)}</span>`)
              .join("")}</div>`
          : ""
      }
      <button class="routine-start" data-action="start-split" data-split="${esc(routine.label)}" data-muscles="${esc(routine.muscles.join(","))}"${routine.saved && routine.restSeconds ? ` data-rest="${esc(routine.restSeconds)}"` : ""} aria-label="${routine.muscles.length ? `Start ${esc(routine.label)} routine, ${routine.muscles.length} exercises` : `Start a custom workout and choose exercises`}">
        ${icon("play")} ${routine.slug === "custom" ? "Start Empty Workout" : "Start Routine"}
      </button>
    </article>`,
    )
    .join("")}</div>`;
}

/**
 * The lift a routine should start from, per muscle.
 *
 * Picking the first catalogue entry alphabetically produced splits led by
 * "archer push up" and "band front lateral raise" — technically chest and
 * shoulder exercises, but not what anyone means by Push day. These patterns
 * select a familiar compound first; if the catalogue changes, the caller falls
 * back to any exercise for that muscle rather than dropping the slot.
 */
const PREFERRED = {
  chest: [/^barbell bench press$/i, /bench press/i, /push[- ]?up/i],
  back: [/^barbell bent over row$/i, /^pull[- ]?up$/i, /barbell.*row/i, /lat pulldown/i],
  shoulders: [/^barbell seated overhead press$/i, /overhead press/i, /shoulder press/i],
  biceps: [/^barbell curl$/i, /barbell.*curl/i, /dumbbell.*curl/i],
  triceps: [/^cable pushdown$/i, /triceps pushdown/i, /pushdown/i],
  quads: [/^dumbbell goblet squat$/i, /leg press/i, /^barbell bench squat$/i, /barbell.*squat/i, /squat/i],
  hamstrings: [/romanian deadlift/i, /^barbell straight leg deadlift$/i, /leg curl/i],
  glutes: [/^barbell deadlift$/i, /hip thrust/i, /deadlift/i],
};

/**
 * Resolve one exercise id per requested muscle for a split.
 *
 * @param {Array<object>} exercises merged library (catalogue + custom)
 * @param {string[]} muscles muscle names in routine order
 * @returns {string[]} exercise ids, in the same order, omitting unsolved slots
 */
export function routineExerciseIds(exercises, muscles) {
  const used = new Set();
  const picks = [];
  for (const muscle of muscles) {
    const candidates = exercises.filter((e) => e.muscle === muscle && !used.has(e.id));
    if (candidates.length === 0) continue;
    const patterns = PREFERRED[muscle] ?? [];
    let chosen = null;
    for (const pattern of patterns) {
      chosen = candidates.find((e) => pattern.test(e.name));
      if (chosen) break;
    }
    chosen ??= candidates[0];
    used.add(chosen.id);
    picks.push(chosen.id);
  }
  return picks;
}
