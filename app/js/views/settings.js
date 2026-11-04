/**
 * IronLog — Settings view.
 *
 * Units, rest-timer defaults, theme, and local data management
 * (export / import / reset). Everything stays in the browser.
 */

import { EQUIPMENT } from "../exercises.js";
import { availableLanguages } from "../catalogue.js";
import { relativeTime } from "../stats.js";
import { esc, icon } from "../ui.js";
import { BUILT_AT, VERSION } from "../version.js";

const REST_PRESETS = [45, 60, 90, 120, 180, 240, 300];

export function renderSettings(store) {
  const s = store.settings;
  const workoutCount = store.doc.workouts.length;
  const customCount = store.doc.customExercises.length;
  const bytes = new Blob([JSON.stringify(store.doc)]).size;
  const backupAgeDays = s.lastBackupAt
    ? (Date.now() - new Date(s.lastBackupAt).getTime()) / 86_400_000
    : Infinity;
  const backupStale = workoutCount > 0 && backupAgeDays > 30;
  const versionLabel = BUILT_AT ? `${VERSION} · ${BUILT_AT.slice(0, 10)}` : VERSION;

  return `
    <section class="view view-settings">
      <header class="view-head">
        <div><h1>Settings</h1><p class="view-subline">Workout preferences, appearance and your local data.</p></div>
        <a class="link" href="#/stats">${icon("user")} Profile</a>
      </header>

      <div class="settings-grid">
        <div class="settings-col">
          <section class="panel" data-reveal="rise">
            <div class="panel-head"><h2>Units</h2></div>
            <div class="segmented" role="radiogroup" aria-label="Weight units">
              ${["kg", "lb"]
                .map(
                  (u) => `
                <button role="radio" aria-checked="${s.units === u}"
                        class="segment ${s.units === u ? "is-active" : ""}"
                        data-action="set-units" data-units="${u}">${u}</button>`,
                )
                .join("")}
            </div>
            <p class="panel-hint">Applies to labels and new entries. Existing numbers are left as you typed them.</p>
          </section>

          <section class="panel" data-reveal="rise">
            <div class="panel-head"><h2>${icon("timer")} Rest timer</h2></div>
            <div class="chip-row">
              ${REST_PRESETS.map(
                (secs) => `
                <button class="chip ${s.restSeconds === secs ? "is-active" : ""}"
                        data-action="set-rest" data-seconds="${secs}">${formatPreset(secs)}</button>`,
              ).join("")}
            </div>
            <label class="toggle-row">
              <input type="checkbox" ${s.autoStartRestTimer ? "checked" : ""} data-action="toggle-autorest" />
              <span>
                <strong>Start automatically</strong>
                <em>Begin the countdown as soon as you tick a set done.</em>
              </span>
            </label>
          </section>

          <section class="panel" data-reveal="rise">
            <div class="panel-head"><h2>Appearance</h2></div>
            <div class="segmented" role="radiogroup" aria-label="Appearance">
              ${[
                ["light", "Light"],
                ["dark", "Dark"],
                ["auto", "Match system"],
              ]
                .map(
                  ([value, label]) => `
                <button role="radio" aria-checked="${(s.theme ?? "light") === value}"
                        class="segment ${(s.theme ?? "light") === value ? "is-active" : ""}"
                        data-action="set-theme" data-theme="${value}">${label}</button>`,
                )
                .join("")}
            </div>
            <p class="panel-hint">
              Light is the crafted reference. Every theme uses the same bottle-ink actions and
              green completed-set feedback.
            </p>
          </section>

          ${renderLanguagePanel(store)}
        </div>

        <div class="settings-col">
          <section class="panel" data-reveal="rise">
            <div class="panel-head"><h2>Your data</h2></div>
            <dl class="fact-list">
              <div><dt>Workouts stored</dt><dd>${workoutCount}</dd></div>
              <div><dt>Custom exercises</dt><dd>${customCount}</dd></div>
              <div><dt>Storage used</dt><dd>${formatBytes(bytes)}</dd></div>
              <div><dt>Where it lives</dt><dd>this browser only</dd></div>
              <div><dt>Last backup</dt><dd>${s.lastBackupAt ? esc(relativeTime(s.lastBackupAt)) : "never"}</dd></div>
              <div><dt>Storage protection</dt><dd data-role="storage-protection">Checking…</dd></div>
            </dl>
            ${
              backupStale
                ? `<p class="panel-warning" role="status">
                    ${workoutCount === 1 ? "Your workout has" : `Your ${workoutCount} workouts have`} no recent backup.
                    Export a JSON file and keep it somewhere safe — clearing site data removes the log for good.
                  </p>`
                : ""
            }
            <p class="panel-hint">
              IronLog has no account system and no server. Everything you log stays in this
              browser's local storage, so it is private by default — and it disappears if you
              clear site data. Export a backup if your training log matters to you.
            </p>
            <div class="settings-actions">
              <button class="btn btn-outline" data-action="export-data">${icon("download")} Export JSON</button>
              <label class="btn btn-outline">
                ${icon("upload")} Import JSON
                <input type="file" accept="application/json,.json" data-action="import-file" hidden />
              </label>
              <button class="btn btn-sub" data-action="protect-storage">${icon("save")} Protect storage</button>
              <button class="btn btn-danger-ghost" data-action="reset-data">${icon("trash")} Erase all data</button>
            </div>
          </section>

          ${renderCataloguePanel(store)}

          <section class="panel" data-reveal="rise">
            <div class="panel-head"><h2>About</h2></div>
            <dl class="fact-list">
              <div><dt>App version</dt><dd title="${esc(BUILT_AT || "local development build")}">${esc(versionLabel)}</dd></div>
            </dl>
            <p class="panel-hint">
              IronLog is an offline-first strength training log: a 1,316-exercise library,
              set-by-set logging, rest timing, volume and personal records. Built as a static
              app with no build step and no tracking.
            </p>
            <p class="panel-hint">
              Training carries risk. IronLog records what you do; it is not medical, coaching or
              safety advice. Work within your limits and get professional guidance when you need it.
            </p>
            <div class="settings-actions">
              <a class="link" href="../privacy.html">Privacy &amp; data ${icon("chevron")}</a>
              <a class="link" href="../" data-action="to-landing">Project landing page ${icon("chevron")}</a>
            </div>
          </section>
        </div>
      </div>
    </section>`;
}

/** Instruction language for catalogue exercises. */
function renderLanguagePanel(store) {
  const languages = availableLanguages(store.catalogueMeta);
  const current = store.settings.instructionLanguage ?? "en";
  if (languages.length <= 1) return "";

  return `
    <section class="panel" data-reveal="rise">
      <div class="panel-head"><h2>Instruction language</h2></div>
      <div class="chip-row">
        ${languages
          .map(
            (l) => `
          <button class="chip ${current === l.code ? "is-active" : ""}"
                  data-action="set-instruction-language" data-lang="${esc(l.code)}">
            ${esc(l.label)}
          </button>`,
          )
          .join("")}
      </div>
      <p class="panel-hint">
        Applies to the step-by-step instructions shown on catalogue exercises. Each
        language pack is downloaded the first time you open an exercise in it, and
        falls back to English when a translation is missing.
      </p>
    </section>`;
}

/** Provenance and licensing for the external catalogue. */
function renderCataloguePanel(store) {
  const meta = store.catalogueMeta;
  const state = store.catalogueState;
  const counts = meta?.counts ?? {};
  const source = meta?.sources?.dataset ?? meta?.source ?? {};
  const commit = source.commit ? String(source.commit).slice(0, 7) : null;

  const stateLine =
    state === "ready"
      ? `${store.catalogue.length} source records loaded · ${store.exercises().length} unique in the library`
      : state === "loading"
        ? "Catalogue is loading…"
        : state === "unavailable"
          ? "Catalogue unavailable — the built-in library could not load. Check the connection and reload."
          : "Catalogue not loaded yet.";

  return `
    <section class="panel" data-reveal="rise">
      <div class="panel-head"><h2>Exercise catalogue</h2></div>
      <dl class="fact-list">
        <div><dt>Status</dt><dd>${esc(stateLine)}</dd></div>
        <div><dt>Languages</dt><dd>${counts.languages ?? availableLanguages(meta).length}</dd></div>
        ${commit ? `<div><dt>Data commit</dt><dd>${esc(commit)}</dd></div>` : ""}
      </dl>
      <p class="panel-hint attribution">
        Exercise names, taxonomy and step-by-step instruction text come from
        <a href="https://github.com/hasaneyldrm/exercises-dataset" rel="noopener noreferrer" target="_blank">hasaneyldrm/exercises-dataset</a>,
        used under the MIT licence — © 2026 Hasan Emir Yıldırım. Its Gym Visual GIFs
        are used under a licence held by the app operator (© Gym Visual).
      </p>
    </section>`;
}

function formatPreset(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = seconds / 60;
  return Number.isInteger(m) ? `${m} min` : `${m.toFixed(1)} min`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
