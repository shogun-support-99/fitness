/**
 * IronLog — Muscle distribution screen.
 *
 * Answers one question the profile cannot: is the work spread evenly? Six body
 * parts, each with the number of sets that landed on it, each paired with the
 * same figure for the period immediately before.
 *
 * The previous period is the same length as the current one, so the two are
 * genuinely comparable — a seven-day window is compared with the seven days
 * before it, not with "everything else". That is the whole reason the range
 * maths exposes previousRangeBounds().
 */

import { BODY_PART_GROUPS, bodyPartThumb, groupLabel, groupSetCounts } from "../body.js";
import {
  DEFAULT_RANGE,
  compactNumber,
  formatMinutes,
  muscleSetCounts,
  previousRangeBounds,
  rangeLabel,
  rangeSummary,
  rangeStart,
  workoutsInRange,
} from "../stats.js";
import { esc } from "../ui.js";
import {
  deltaCell,
  noDataInRange,
  profileBack,
  rangeChips,
  sectionTitle,
} from "./profile-common.js";

export function renderMuscleDistribution(store, params) {
  const range = params?.get?.("range") || DEFAULT_RANGE;
  const qs = `range=${encodeURIComponent(range)}`;

  const completed = store.completedWorkouts();
  const index = store.exerciseIndex();
  const units = store.settings.units;

  const current = workoutsInRange(completed, { start: rangeStart(range) });
  const bounds = previousRangeBounds(range);
  const previous = workoutsInRange(completed, { start: bounds.start, end: bounds.end });

  const currentSummary = rangeSummary(current);
  const previousSummary = rangeSummary(previous);
  const currentCounts = groupSetCounts(muscleSetCounts(current, index));
  const previousCounts = groupSetCounts(muscleSetCounts(previous, index));

  // Cardio is a real group when it has been trained, but it has no muscle plate
  // to light up, so it is appended rather than baked into the six.
  const groupIds = [
    ...BODY_PART_GROUPS.map((g) => g.id),
    ...(currentCounts.get("cardio") ? ["cardio"] : []),
  ];

  const cards = groupIds
    .map((id) => {
      const sets = currentCounts.get(id) ?? 0;
      const before = previousCounts.get(id) ?? 0;
      const change = sets - before;
      return `<li class="part-card hover-lift">
          <div class="part-figure" aria-hidden="true">${id === "cardio" ? "" : bodyPartThumb(id)}</div>
          <div class="part-meta">
            <span class="part-name">${esc(groupLabel(id))}</span>
            <span class="part-sets">${esc(sets)} ${sets === 1 ? "set" : "sets"}</span>
            <span class="part-change${change === 0 ? "" : change > 0 ? " is-up" : " is-down"}">${
              change === 0 ? "no change" : `${change > 0 ? "+" : ""}${change} vs previous`
            }</span>
          </div>
        </li>`;
    })
    .join("");

  const hasData = currentSummary.sets > 0 || previousSummary.sets > 0;

  return `
    <section class="view view-muscle-distribution">
      ${profileBack("Muscle distribution", qs)}
      ${rangeChips("muscle-distribution", range, qs)}

      ${
        hasData
          ? `${sectionTitle("Distribution", rangeLabel(range))}
             <ul class="part-grid">${cards}</ul>

             ${sectionTitle("Compared with the previous period")}
             <p class="compare-note">${esc(rangeLabel(range))} against the ${esc(rangeLabel(range).toLowerCase())} before it.</p>
             <div class="delta-grid">
               ${deltaCell({ label: "Workouts", previous: previousSummary.workouts, current: currentSummary.workouts })}
               ${deltaCell({ label: "Duration", previous: previousSummary.minutes, current: currentSummary.minutes, format: formatMinutes })}
               ${deltaCell({
                 label: "Volume",
                 previous: previousSummary.volume,
                 current: currentSummary.volume,
                 format: (v) => `${compactNumber(v)} ${units}`,
               })}
               ${deltaCell({ label: "Sets", previous: previousSummary.sets, current: currentSummary.sets })}
             </div>`
          : noDataInRange(range)
      }
    </section>`;
}
