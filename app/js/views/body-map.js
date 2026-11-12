/**
 * IronLog — anatomical front/back muscle body maps.
 *
 * Shared by the Profile statistics card (7-day heat impact) and the active
 * workout logger (live session highlight). The shapes are Hevy's convention:
 * two side-by-side silhouettes, one coloured region per real muscle group the
 * log counts, four fills from zero to the trainer's own maximum.
 *
 * This is presentation only — no store access, no DOM access — so it stays
 * safe to import from any view and to render under Node in the test suite.
 */

import { esc } from "../ui.js";

/** The muscles the body map knows how to paint. */
export const BODY_MUSCLES = [
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

/** Four fills, scaled against the strongest group in this dataset. */
export function levelFor(sets, max) {
  if (!sets || !max) return 0;
  const ratio = sets / max;
  if (ratio >= 0.85) return 4;
  if (ratio >= 0.6) return 3;
  if (ratio >= 0.35) return 2;
  return 1;
}

/**
 * The dataset's muscle vocabulary is finer than the silhouette's eleven
 * regions, and Hevy itself collapses them: a "quadriceps" secondary on a
 * bench press lights Quads, "rhomboids" and "latissimus dorsi" both light
 * Back. Everything outside these keys (neck, cardio, "other") simply has no
 * region to paint.
 */
const MUSCLE_ALIASES = {
  "lower back": "back",
  "upper back": "back",
  rhomboids: "back",
  lats: "back",
  "latissimus dorsi": "back",
  traps: "back",
  trapezius: "back",
  obliques: "core",
  abdominals: "core",
  "lower abs": "core",
  quadriceps: "quads",
  "hip flexors": "quads",
  "inner thighs": "quads",
  "rear deltoids": "shoulders",
  deltoids: "shoulders",
  "rotator cuff": "shoulders",
  brachialis: "biceps",
  soleus: "calves",
  shins: "calves",
  ankles: "calves",
  "ankle stabilizers": "calves",
  "wrist flexors": "forearms",
  "wrist extensors": "forearms",
  wrists: "forearms",
  "grip muscles": "forearms",
  "upper chest": "chest",
};

/** Collapse any primary or secondary muscle name onto a silhouette region. */
export function normalizeMuscle(name) {
  const key = String(name ?? "").trim().toLowerCase();
  return MUSCLE_ALIASES[key] ?? (BODY_MUSCLES.includes(key) ? key : null);
}

/** Expand a caption template for one muscle: `%m` is the name, `%s` is "N sets". */
function captionText(caption, muscle, sets) {
  return caption
    .replace(/%m/g, muscle)
    .replace(/%s/g, `: ${sets} set${sets === 1 ? "" : "s"}`);
}

function musclePath(muscle, counts, max, shape, caption) {
  const sets = counts[muscle] ?? 0;
  return `<path class="mm-muscle" data-level="${levelFor(sets, max)}" d="${shape}"><title>${esc(captionText(caption, muscle, sets))}</title></path>`;
}

/**
 * @param {"front"|"back"} view which silhouette to draw
 * @param {Record<string, number>} counts sets per muscle key
 * @param {number} max the largest count, used to scale the fills
 * @param {string} [caption] per-muscle tooltip template. `%m` becomes the
 *   muscle name and `%s` becomes "N sets", so callers can phrase the caption
 *   for their own context without re-implementing the shapes.
 */
export function renderBodyMap(view, counts, max, caption) {
  const label = view === "front" ? "Front body map" : "Back body map";
  const done = caption ?? "%m%s";

  // A deliberately simple figure: rounded volumes, no medical detail. Each
  // coloured region is a real muscle group the log counts.
  const outline = `
    <circle class="mm-outline" cx="60" cy="15" r="9"></circle>
    <rect class="mm-outline" x="56" y="23" width="8" height="6" rx="2"></rect>
    <path class="mm-outline" d="M42 31c5-3 11-4 18-4s13 1 18 4l6 13-2 30c-1 10-4 18-7 23H45c-3-5-6-13-7-23l-2-30z"></path>
    <rect class="mm-muscle" data-level="${levelFor(counts.forearms ?? 0, max)}" x="24" y="88" width="10" height="30" rx="5" transform="rotate(6 29 103)"><title>${esc(captionText(done, "forearms", counts.forearms ?? 0))}</title></rect>
    <rect class="mm-muscle" data-level="${levelFor(counts.forearms ?? 0, max)}" x="86" y="88" width="10" height="30" rx="5" transform="rotate(-6 91 103)"><title>${esc(captionText(done, "forearms", counts.forearms ?? 0))}</title></rect>
    <rect class="mm-outline" x="20" y="39" width="11" height="34" rx="5.5" transform="rotate(8 25.5 56)"></rect>
    <rect class="mm-outline" x="89" y="39" width="11" height="34" rx="5.5" transform="rotate(-8 94.5 56)"></rect>
    <rect class="mm-outline" x="46" y="104" width="12" height="46" rx="6"></rect>
    <rect class="mm-outline" x="62" y="104" width="12" height="46" rx="6"></rect>
    <rect class="mm-outline" x="47" y="152" width="9" height="30" rx="4.5"></rect>
    <rect class="mm-outline" x="64" y="152" width="9" height="30" rx="4.5"></rect>
    <ellipse class="mm-outline" cx="51" cy="188" rx="7" ry="4"></ellipse>
    <ellipse class="mm-outline" cx="69" cy="188" rx="7" ry="4"></ellipse>`;

  const front = `
    ${musclePath("shoulders", counts, max, "M38 35c3-2 7-2 9 0l-1 8c-3 1-6 0-8-1z M82 35c-3-2-7-2-9 0l1 8c3 1 6 0 8-1z", done)}
    ${musclePath("chest", counts, max, "M47 44c3-2 8-1 11 2l-1 11c-4 2-8 1-10-2z M73 44c-3-2-8-1-11 2l1 11c4 2 8 1 10-2z", done)}
    ${musclePath("biceps", counts, max, "M27 47c3-1 6 0 7 2l-2 19c-2 1-4 0-5-2z M93 47c-3-1-6 0-7 2l2 19c2 1 4 0 5-2z", done)}
    ${musclePath("core", counts, max, "M52 61h16l-1 27c-4 2-10 2-14 0z", done)}
    ${musclePath("quads", counts, max, "M47 108h10l-1 38c-2 1-5 1-7 0z M63 108h10l-2 38c-2 1-5 1-7 0z", done)}
    ${musclePath("calves", counts, max, "M48 155h7l-1 23c-1 1-3 1-4 0z M65 155h7l-2 23c-1 1-3 1-4 0z", done)}`;

  const back = `
    ${musclePath("back", counts, max, "M45 40c4-3 10-4 15-4s11 1 15 4l-2 23c-4 4-9 6-13 6s-9-2-13-6z M48 66c4 3 8 4 12 4s8-1 12-4l-2 16c-3 2-6 3-10 3s-7-1-10-3z", done)}
    ${musclePath("shoulders", counts, max, "M38 35c3-2 7-2 9 0l-1 8c-3 1-6 0-8-1z M82 35c-3-2-7-2-9 0l1 8c3 1 6 0 8-1z", done)}
    ${musclePath("triceps", counts, max, "M27 47c3-1 6 0 7 2l-2 19c-2 1-4 0-5-2z M93 47c-3-1-6 0-7 2l2 19c2 1 4 0 5-2z", done)}
    ${musclePath("glutes", counts, max, "M47 93c3-3 8-3 11 0l-1 10c-3 2-7 2-9 0z M73 93c-3-3-8-3-11 0l1 10c3 2 7 2 9 0z", done)}
    ${musclePath("hamstrings", counts, max, "M47 108h10l-1 38c-2 1-5 1-7 0z M63 108h10l-2 38c-2 1-5 1-7 0z", done)}
    ${musclePath("calves", counts, max, "M48 155h7l-1 23c-1 1-3 1-4 0z M65 155h7l-2 23c-1 1-3 1-4 0z", done)}`;

  return `<svg class="muscle-map" viewBox="0 0 120 200" role="img" aria-label="${esc(label)}">
    ${outline}
    ${view === "front" ? front : back}
  </svg>`;
}

/** Both silhouettes side by side, the shared shell for card and logger. */
export function renderBodyPair(counts, max, { caption = "", ariaLabel = "Muscle map" } = {}) {
  const inner = (view, label) => `
    <div class="muscle-side">
      <span class="muscle-side-label">${label}</span>
      ${renderBodyMap(view, counts, max, caption)}
    </div>`;
  return `
    <div class="muscle-body" role="img" aria-label="${esc(ariaLabel)}">
      ${inner("front", "Front")}
      <span class="muscle-divider" aria-hidden="true"></span>
      ${inner("back", "Back")}
    </div>`;
}
