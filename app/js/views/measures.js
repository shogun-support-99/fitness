/**
 * IronLog — Measures screen.
 *
 * Bodyweight, because strength numbers mean very little without it and because
 * the profile's dashboard promises a Measures tile that has to lead somewhere.
 * It is the only screen in the app that writes data the log did not produce
 * during a workout, so it is intentionally small: one figure per day, a chart,
 * and a list you can correct.
 */

import { barChart, emptyState, esc, icon, statTile } from "../ui.js";
import { compactNumber } from "../stats.js";
import { longDate, mediumDate, profileBack, sectionTitle, shortDate } from "./profile-common.js";

const CHART_CAP = 12;

export function renderMeasures(store, params) {
  const range = params?.get?.("range") || "";
  const qs = range ? `range=${encodeURIComponent(range)}` : "";
  const entries = store.measurements();
  const units = store.settings.units;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const latest = entries[0] ?? null;
  const previous = entries[1] ?? null;
  const change = latest && previous ? latest.weight - previous.weight : 0;

  const chartPoints = [...entries].reverse().slice(-CHART_CAP);

  return `
    <section class="view view-measures">
      ${profileBack("Measures", qs)}

      ${
        entries.length === 0
          ? emptyState({
              icon: "user",
              title: "No measurements yet",
              body: "Record your bodyweight to see how it moves alongside your training.",
            })
          : `<div class="tile-grid tile-grid-3">
              ${statTile({ label: "Latest", value: esc(String(latest.weight)), unit: units, tone: "tone-data" })}
              ${statTile({
                label: "Change",
                value: `${change > 0 ? "+" : ""}${compactNumber(change)}`,
                unit: units,
                hint: previous ? `since ${shortDate(previous.date)}` : "",
              })}
              ${statTile({ label: "Entries", value: String(entries.length), countTo: entries.length })}
            </div>

            <section class="panel" data-reveal="rise">
              <div class="panel-head"><h2>Bodyweight</h2><span class="panel-note">last ${chartPoints.length} entries</span></div>
              ${barChart(
                chartPoints.map((entry) => ({
                  value: entry.weight,
                  label: `${longDate(entry.date)}: ${entry.weight} ${units}`,
                  display: `${entry.weight} ${units}`,
                  axis: shortDate(entry.date),
                })),
                { ariaLabel: "Bodyweight over time" },
              )}
            </section>`
      }

      <section class="panel" data-reveal="rise">
        <div class="panel-head"><h2>Add an entry</h2><span class="panel-note">one per day</span></div>
        <form class="measure-form" data-action="add-measurement">
          <label class="field">
            <span>Date</span>
            <input type="date" name="date" value="${esc(todayKey)}" max="${esc(todayKey)}" required data-focus-key="measure-date" />
          </label>
          <label class="field">
            <span>Weight (${esc(units)})</span>
            <input type="number" name="weight" step="0.1" min="1" max="1000" inputmode="decimal" placeholder="0.0" required />
          </label>
          <label class="field field-wide">
            <span>Note <em>optional</em></span>
            <input type="text" name="note" maxlength="120" placeholder="Morning, fasted" />
          </label>
          <div class="measure-form-actions">
            <button class="btn btn-primary" type="submit">${icon("plus")} Save entry</button>
          </div>
        </form>
        <p class="panel-hint">Saving twice on the same date replaces that day's entry rather than charting both.</p>
      </section>

      ${
        entries.length === 0
          ? ""
          : `${sectionTitle("History", `${entries.length} entries`)}
             <ul class="measure-list">
               ${entries.slice(0, 60).map((entry, i) => renderRow(entry, entries[i + 1], units)).join("")}
             </ul>`
      }
    </section>`;
}

function renderRow(entry, previous, units) {
  const delta = previous ? entry.weight - previous.weight : 0;
  const tone = delta === 0 ? "" : delta > 0 ? " is-up" : " is-down";
  return `<li class="measure-row">
      <span class="measure-date">${esc(mediumDate(entry.date))}</span>
      <span class="measure-weight"><b>${esc(entry.weight)}</b> ${esc(units)}</span>
      <span class="measure-delta${tone}">${previous ? `${delta > 0 ? "+" : ""}${compactNumber(delta)}` : "—"}</span>
      ${entry.note ? `<span class="measure-note">${esc(entry.note)}</span>` : ""}
      <button class="icon-btn measure-delete" type="button" data-action="delete-measurement" data-id="${esc(entry.id)}" aria-label="Delete entry for ${esc(mediumDate(entry.date))}">${icon("trash")}</button>
    </li>`;
}

