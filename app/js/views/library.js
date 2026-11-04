/**
 * IronLog — Exercise library view.
 *
 * With the dataset catalogue merged in the library holds 1,316 entries, so
 * results are relevance-ranked and capped; rendering every row on an empty
 * search would cost more than the interaction is worth. A detail sheet shows
 * the taxonomy plus step-by-step instructions, which are fetched per language
 * on demand rather than shipped inline.
 */

import { EQUIPMENT, MUSCLE_GROUPS, searchExercises } from "../exercises.js";
import { availableLanguages, hasInstructions } from "../catalogue.js";
import { emptyState, esc, icon, muscleBadge } from "../ui.js";
import { exerciseMedia, exerciseThumbnail, muscleDiagram, movementClass } from "../diagrams.js";

/** Rows rendered before asking the user to narrow the search. */
export const RESULT_CAP = 120;

export function renderLibrary(store, { query = "", muscle = "all" } = {}) {
  const all = store.exercises();
  const results = searchExercises(all, query, muscle);
  const shown = results.slice(0, RESULT_CAP);
  const customCount = store.doc.customExercises.length;
  const catalogueReady = store.catalogueReady;

  return `
    <section class="view view-library">
      <header class="view-head">
        <div>
          <h1>Exercises</h1>
          <p class="view-subline">
            ${all.length} exercise${all.length === 1 ? "" : "s"}${customCount ? ` · ${customCount} custom` : ""}
            ${catalogueReady ? "" : " · loading catalogue…"}
          </p>
        </div>
        <button class="btn btn-primary" data-action="open-custom-exercise">${icon("plus")} New</button>
      </header>

      <div class="search-bar">
        ${icon("search")}
        <input type="search" id="library-search" placeholder="Search ${all.length} exercises…"
               value="${esc(query)}" autocomplete="off" data-action="library-search"
               data-focus-key="library-search" />
        ${query ? `<button class="icon-btn" data-action="clear-search" aria-label="Clear search">${icon("back")}</button>` : ""}
      </div>

      <div class="chip-row chip-scroll" id="library-muscles">
        <button class="chip ${muscle === "all" ? "is-active" : ""}" data-action="filter-muscle" data-muscle="all">All</button>
        ${MUSCLE_GROUPS.filter((m) => all.some((e) => e.muscle === m))
          .map(
            (m) =>
              `<button class="chip ${muscle === m ? "is-active" : ""}" data-action="filter-muscle" data-muscle="${esc(m)}">${esc(m)}</button>`,
          )
          .join("")}
      </div>

      ${results.length === 0
        ? emptyState({
            icon: "search",
            title: "No matches",
            body: `Nothing in the library matches "${query}". Try a different term, or create it as a custom exercise.`,
            action: `<button class="btn btn-outline" data-action="open-custom-exercise">${icon("plus")} Create "${esc(query)}"</button>`,
          })
        : `
        ${
          results.length > shown.length
            ? `<p class="result-note">Showing ${shown.length} of ${results.length} matches — refine your search to see the rest.</p>`
            : ""
        }
        <ul class="library-list">${shown.map((e) => renderLibraryRow(e)).join("")}</ul>`}
    </section>

    ${renderDetailSheet()}
  `;
}

export function renderLibraryRow(exercise) {
  const secondary = exercise.secondaryMuscles?.length
    ? exercise.secondaryMuscles.slice(0, 3).join(", ")
    : "";
  return `
    <li class="library-row" data-muscle="${esc(exercise.muscle)}">
      <button class="library-open transition-colors duration-200 hover:bg-[var(--sunken)]" data-action="open-exercise" data-id="${esc(exercise.id)}">
        ${exerciseThumbnail(exercise)}
        <span class="library-main">
          <span class="library-name">
            ${esc(exercise.name)}
            ${exercise.custom ? `<em class="pill pill-custom">custom</em>` : ""}
          </span>
          <span class="library-meta">
            ${muscleBadge(exercise.muscle)}
            <span class="equip">${esc(exercise.equipment)}</span>
            ${exercise.target ? `<span class="target">target: ${esc(exercise.target)}</span>` : ""}
            ${secondary ? `<span class="secondary">+ ${esc(secondary)}</span>` : ""}
            ${exercise.note ? `<span class="note">${icon("info")} ${esc(exercise.note)}</span>` : ""}
          </span>
        </span>
        <span class="library-go">${icon("chevron")}</span>
      </button>
      ${exercise.custom
        ? `<button class="icon-btn" data-action="delete-custom" data-id="${esc(exercise.id)}" aria-label="Delete ${esc(exercise.name)}">${icon("trash")}</button>`
        : ""}
    </li>`;
}

/**
 * Detail sheet shell. The instruction body is filled in asynchronously by
 * main.js once the language pack resolves, so the taxonomy shows immediately.
 */
function renderDetailSheet() {
  return `
    <div class="sheet" id="exercise-detail-sheet" hidden>
      <div class="sheet-backdrop" data-action="close-exercise-detail"></div>
      <div class="sheet-panel detail-sheet-panel" role="dialog" aria-modal="true" aria-label="Exercise detail">
        <div id="exercise-detail-content"></div>
      </div>
    </div>`;
}

/**
 * Render one exercise's detail panel.
 *
 * @param {object} exercise
 * @param {object} [options]
 * @param {object} [options.store] used for the language list and to add to a workout
 * @param {{steps: string[], language: string, fellBack: boolean}|null} [options.stepsResult]
 * @param {"idle"|"loading"|"ready"|"empty"} [options.stepsState]
 */
export function renderExerciseDetail(exercise, { store = null, stepsResult = null, stepsState = "idle" } = {}) {
  if (!exercise) return "";
  const languages = store ? availableLanguages(store.catalogueMeta) : [];
  const currentLang = store?.settings.instructionLanguage ?? "en";
  const hasSteps = hasInstructions(exercise);
  const isCustom = Boolean(exercise.custom);
  const active = Boolean(store?.activeWorkout());
  const primary = String(exercise.target || exercise.muscle || "").trim();
  const secondary = (exercise.secondaryMuscles ?? []).filter(Boolean);
  const diagram = muscleDiagram(exercise) || "";

  // The hero states what the lift is; the fact grid holds the rest of the
  // taxonomy that used to sit in one long row of tags.
  const facts = [];
  if (exercise.target) facts.push({ label: "Target", value: exercise.target });
  if (exercise.equipment) facts.push({ label: "Equipment", value: exercise.equipment });
  if (exercise.category && exercise.category !== exercise.bodyPart) {
    facts.push({ label: "Category", value: exercise.category });
  }
  if (exercise.difficulty) facts.push({ label: "Level", value: exercise.difficulty });
  if (exercise.trainingCategory) facts.push({ label: "Type", value: exercise.trainingCategory });

  const mediaLabel =
    exercise.media?.provider === "gymvisual"
      ? "Gym Visual demo"
      : isCustom
        ? "Custom exercise"
        : "Movement diagram";

  return `
    <header class="sheet-head detail-sheet-head">
      <div class="detail-heading">
        <span class="detail-kicker">${isCustom ? "Custom exercise" : "Exercise library"}</span>
        <h2>${esc(exercise.name)}</h2>
      </div>
      <button class="icon-btn" data-action="close-exercise-detail" aria-label="Close">${icon("back")}</button>
    </header>

    <div class="detail-body">
      <section class="detail-hero">
        <div class="detail-media-card ${exercise.media?.provider ? "has-media" : ""}" data-reveal="draw">
          <span class="detail-media-tag">${mediaLabel}</span>
          ${/*
            Licensed media: Gym Visual 180x180 GIFs (operator-held licence) render
            here with their attribution. Entries without licensed media keep the
            original data-drawn movement diagram.
          */ ""}
          ${exerciseMedia(exercise)}
        </div>

        <div class="detail-intro">
          <div class="detail-taxonomy">
            ${muscleBadge(exercise.muscle)}
            ${exercise.bodyPart && exercise.bodyPart !== exercise.muscle
              ? `<span class="tag">${esc(exercise.bodyPart)}</span>`
              : ""}
          </div>

          <p class="detail-movement">
            <span class="movement-label">Movement</span>
            <span class="movement-value">${esc(movementClass(exercise))}</span>
          </p>

          <dl class="detail-facts">
            ${facts
              .map(
                (fact) => `<div>
                  <dt>${esc(fact.label)}</dt>
                  <dd>${esc(fact.value)}</dd>
                </div>`,
              )
              .join("")}
          </dl>
        </div>
      </section>

      ${exercise.note ? `<p class="detail-note">${icon("info")} ${esc(exercise.note)}</p>` : ""}

      <section class="detail-panel detail-muscles">
        <header class="detail-panel-head">
          <div>
            <span class="detail-panel-kicker">Anatomy</span>
            <h3>Muscles worked</h3>
          </div>
          <span class="detail-panel-count">${secondary.length ? `${secondary.length + 1} muscles` : "1 muscle"}</span>
        </header>

        <div class="detail-muscle-grid ${diagram ? "has-diagram" : ""}">
          <div class="detail-muscle-copy">
            <div class="detail-muscle-primary">
              <span class="detail-muscle-role">Primary</span>
              <strong>${esc(primary || exercise.muscle || "Not specified")}</strong>
              ${exercise.bodyPart ? `<span class="detail-muscle-part">${esc(exercise.bodyPart)}</span>` : ""}
            </div>

            ${secondary.length
              ? `<div class="detail-muscle-secondary">
                   <span class="detail-muscle-role">Supporting</span>
                   <div class="chip-row">${secondary.map((m) => `<span class="chip chip-static">${esc(m)}</span>`).join("")}</div>
                 </div>`
              : ""}
          </div>

          
        </div>
      </section>

      ${hasSteps ? renderInstructions(exercise, { languages, currentLang, stepsResult, stepsState }) : ""}

      ${isCustom
        ? `<p class="detail-note">${icon("info")} You created this exercise. It is stored in this browser only.</p>`
        : ""}

      
    </div>

    <footer class="detail-foot">
      <span class="detail-foot-hint">${active ? "A session is already running" : "Your log stays in this browser"}</span>
      ${active
        ? `<button class="btn btn-primary detail-cta" data-action="add-current-to-workout" data-id="${esc(exercise.id)}">
             ${icon("plus")} Add to current workout
           </button>`
        : `<button class="btn btn-primary detail-cta" data-action="start-with-exercise" data-id="${esc(exercise.id)}">
             ${icon("bolt")} Start a workout with this
           </button>`}
    </footer>`;
}

function renderInstructions(exercise, { languages, currentLang, stepsResult, stepsState }) {
  const steps = stepsResult?.steps ?? [];
  const showing = stepsResult?.language ?? currentLang;
  const fellBack = stepsResult?.fellBack;

  let body;
  if (stepsState === "loading") {
    body = `<p class="steps-loading"><span class="spinner"></span>Loading instructions…</p>`;
  } else if (steps.length === 0) {
    body = `<p class="steps-empty">No step-by-step instructions are available for this exercise.</p>`;
  } else {
    body = `<ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`;
  }

  return `
    <section class="detail-panel detail-instructions">
      <header class="detail-panel-head detail-instructions-head">
        <div>
          <span class="detail-panel-kicker">Technique</span>
          <h3>How to perform it</h3>
        </div>
        <div class="detail-instructions-tools">
          ${steps.length ? `<span class="detail-step-count">${steps.length} steps</span>` : ""}
          ${languages.length > 1
            ? `<label class="lang-select">
                 <span class="sr-only">Instruction language</span>
                 <select data-action="set-instruction-language">
                   ${languages
                     .map(
                       (l) =>
                         `<option value="${esc(l.code)}" ${l.code === showing ? "selected" : ""}>${esc(l.native === l.label ? l.label : `${l.label} — ${l.native}`)}</option>`,
                     )
                     .join("")}
                 </select>
               </label>`
            : ""}
        </div>
      </header>
      ${fellBack ? `<p class="steps-fallback">Not available in that language — showing English.</p>` : ""}
      ${body}
    </section>`;
}

/**
 * The custom-exercise form is app-wide: the library header, the settings page
 * and the logger's picker footer all offer it, so main.js mounts this once on
 * the body rather than baking it into a single view's markup.
 */
export function renderCustomSheet() {
  return `
    <div class="sheet" id="custom-exercise-sheet" hidden>
      <div class="sheet-backdrop" data-action="close-custom-exercise"></div>
      <div class="sheet-panel sheet-panel-sm" role="dialog" aria-modal="true" aria-label="Create custom exercise">
        <header class="sheet-head">
          <h2>Custom exercise</h2>
          <button class="icon-btn" data-action="close-custom-exercise" aria-label="Close">${icon("back")}</button>
        </header>
        <form class="sheet-form" data-action="submit-custom-exercise">
          <label class="field">
            <span>Name</span>
            <input name="name" required maxlength="60" placeholder="e.g. Landmine Press" autocomplete="off" />
          </label>
          <label class="field">
            <span>Muscle group</span>
            <select name="muscle">
              ${MUSCLE_GROUPS.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Equipment</span>
            <select name="equipment">
              ${EQUIPMENT.map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Note <em>(optional)</em></span>
            <input name="note" maxlength="80" placeholder="e.g. Log minutes as reps" autocomplete="off" />
          </label>
          <p class="form-error" data-role="custom-error" hidden></p>
          <button class="btn btn-primary btn-wide" type="submit">${icon("save")} Save exercise</button>
        </form>
      </div>
    </div>`;
}
