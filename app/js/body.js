/**
 * IronLog — muscle map.
 *
 * WHY THIS IS NOT A PICTURE OF A PERSON
 * -------------------------------------
 * Hevy's muscle screens colour a photograph-like human silhouette. IronLog's
 * craft floor bans figure-bearing illustration (see the header comment in
 * diagrams.js): every shape in this app is a mechanism or a diagram, never an
 * imitation of a body. So this module keeps the *pattern* — a spatial body map
 * you read at a glance — and builds it from abstract vector geometry: a
 * mannequin of rounded plates and tapered segments, drawn once on the left of
 * the centre line and mirrored. Mirroring is the whole trick; it guarantees the
 * figure is perfectly symmetric and halves the geometry to maintain.
 *
 * Everything here is pure: data in, SVG string out. No DOM, no clock, no
 * randomness, so it runs under Node (see tests/body.test.js) and re-renders for
 * free.
 */

import { esc } from "./ui.js";

/** Drawable area. Half the figure is authored; the other half is mirrored. */
export const MAP_WIDTH = 220;
export const MAP_HEIGHT = 470;

/** Mirror transform: reflects an authored left-half shape onto the right. */
const MIRROR = `matrix(-1 0 0 1 ${MAP_WIDTH} 0)`;

/** Which side of the body a plate belongs to. */
export const BODY_VIEWS = ["front", "back"];

/**
 * Muscle groups, in the order Hevy's muscle-distribution grid uses them.
 *
 * `muscles` are IronLog's catalogue values: the twelve `muscle` fields in
 * app/data/exercises-index.json. Cardio has no muscle plate, so it is only ever
 * reported as a figure, never highlighted on the map.
 */
export const BODY_PART_GROUPS = [
  { id: "back", label: "Back", muscles: ["back"] },
  { id: "chest", label: "Chest", muscles: ["chest"] },
  { id: "legs", label: "Legs", muscles: ["quads", "hamstrings", "glutes", "calves"] },
  { id: "core", label: "Core", muscles: ["core"] },
  { id: "arms", label: "Arms", muscles: ["biceps", "triceps", "forearms"] },
  { id: "shoulders", label: "Shoulders", muscles: ["shoulders"] },
];

/** Every catalogue `muscle` value, including the one with no plate. */
export const CATALOGUE_MUSCLES = [
  "back",
  "biceps",
  "calves",
  "cardio",
  "chest",
  "core",
  "forearms",
  "glutes",
  "hamstrings",
  "quads",
  "shoulders",
  "triceps",
];

/**
 * Plate geometry.
 *
 * Each entry is authored as a LEFT-HALF shape: `d` is a path, or `r` is a
 * rounded-rect descriptor with an optional rotation about its own centre. The
 * renderer emits the shape and a mirrored copy, so nothing here needs a
 * right-hand twin.
 */
const PLATES = [
  // ── Front ────────────────────────────────────────────────────────────────
  {
    id: "chest",
    view: "front",
    label: "Chest",
    r: { x: 62, y: 100, w: 46, h: 48, rx: 16 },
  },
  {
    id: "shoulders-front",
    view: "front",
    label: "Shoulders",
    r: { x: 38, y: 88, w: 32, h: 34, rx: 16, rotate: -8 },
  },
  { id: "abs", view: "front", label: "Abdominals", r: { x: 88, y: 156, w: 21, h: 88, rx: 9 } },
  { id: "obliques", view: "front", label: "Obliques", r: { x: 68, y: 162, w: 17, h: 70, rx: 8 } },
  { id: "biceps", view: "front", label: "Biceps", r: { x: 30, y: 124, w: 21, h: 44, rx: 10 } },
  { id: "forearms-front", view: "front", label: "Forearms", r: { x: 22, y: 190, w: 20, h: 50, rx: 10 } },
  { id: "quads", view: "front", label: "Quadriceps", r: { x: 62, y: 272, w: 34, h: 74, rx: 16 } },
  { id: "adductors", view: "front", label: "Adductors", r: { x: 98, y: 276, w: 11, h: 62, rx: 5 } },
  { id: "calves-front", view: "front", label: "Calves", r: { x: 74, y: 364, w: 34, h: 60, rx: 15 } },

  // ── Back ─────────────────────────────────────────────────────────────────
  { id: "traps", view: "back", label: "Trapezius", r: { x: 82, y: 88, w: 27, h: 44, rx: 11 } },
  {
    id: "shoulders-back",
    view: "back",
    label: "Shoulders",
    r: { x: 38, y: 88, w: 32, h: 34, rx: 16, rotate: -8 },
  },
  { id: "upper-back", view: "back", label: "Upper back", r: { x: 74, y: 136, w: 35, h: 40, rx: 12 } },
  { id: "lats", view: "back", label: "Lats", r: { x: 60, y: 142, w: 14, h: 64, rx: 7 } },
  { id: "lower-back", view: "back", label: "Lower back", r: { x: 86, y: 180, w: 23, h: 44, rx: 10 } },
  { id: "triceps", view: "back", label: "Triceps", r: { x: 30, y: 124, w: 21, h: 44, rx: 10 } },
  { id: "forearms-back", view: "back", label: "Forearms", r: { x: 22, y: 190, w: 20, h: 50, rx: 10 } },
  { id: "glutes", view: "back", label: "Glutes", r: { x: 68, y: 262, w: 41, h: 48, rx: 20 } },
  { id: "hamstrings", view: "back", label: "Hamstrings", r: { x: 62, y: 314, w: 42, h: 40, rx: 16 } },
  { id: "calves-back", view: "back", label: "Calves", r: { x: 74, y: 360, w: 34, h: 64, rx: 15 } },
];

/**
 * The mannequin underneath the plates. Authored the same way — left half only —
 * and drawn as a quiet frame so the plates read as data laid over a body
 * outline rather than floating rectangles.
 */
const FRAME = [
  { el: "circle", cx: 110, cy: 46, r: 26, mirror: false },
  { el: "rect", x: 98, y: 64, w: 12, h: 22, rx: 6, mirror: false },
  {
    el: "path",
    d: "M110 80 C84 80 64 88 58 104 C53 118 53 146 57 174 C60 196 56 216 58 238 C59 252 64 262 74 268 L110 272 Z",
  },
  { el: "rect", x: 28, y: 98, w: 26, h: 82, rx: 13, rotate: -5 },
  { el: "rect", x: 20, y: 176, w: 24, h: 80, rx: 12, rotate: -3 },
  { el: "rect", x: 18, y: 250, w: 22, h: 28, rx: 11 },
  {
    el: "path",
    d: "M110 266 L74 266 C64 266 58 274 58 286 C58 306 60 330 64 344 C67 352 74 354 84 354 L110 354 Z",
  },
  {
    el: "path",
    d: "M110 356 L86 356 C78 356 72 362 70 372 C68 386 68 404 70 418 C72 428 78 432 88 432 L110 432 Z",
  },
  { el: "rect", x: 74, y: 428, w: 36, h: 18, rx: 8 },
];

/** Catalogue `muscle` -> plates it lights up, on either view. */
const MUSCLE_PLATES = {
  back: ["traps", "upper-back", "lats", "lower-back"],
  biceps: ["biceps"],
  calves: ["calves-front", "calves-back"],
  cardio: [],
  chest: ["chest"],
  core: ["abs", "obliques"],
  forearms: ["forearms-front", "forearms-back"],
  glutes: ["glutes"],
  hamstrings: ["hamstrings"],
  quads: ["quads", "adductors"],
  shoulders: ["shoulders-front", "shoulders-back"],
  triceps: ["triceps"],
};

/**
 * Catalogue `target` -> plates. The body-distribution table lists targets, so
 * selecting a row has to highlight something on the map.
 */
const TARGET_PLATES = {
  abductors: ["glutes"],
  abs: ["abs"],
  adductors: ["adductors"],
  biceps: ["biceps"],
  calves: ["calves-front", "calves-back"],
  "cardiovascular system": [],
  delts: ["shoulders-front", "shoulders-back"],
  forearms: ["forearms-front", "forearms-back"],
  glutes: ["glutes"],
  hamstrings: ["hamstrings"],
  lats: ["lats"],
  "levator scapulae": ["traps"],
  pectorals: ["chest"],
  quads: ["quads", "adductors"],
  "serratus anterior": ["lats"],
  spine: ["lower-back", "upper-back"],
  traps: ["traps"],
  triceps: ["triceps"],
  "upper back": ["upper-back"],
};

/**
 * Display names for the body-distribution table. The catalogue's `target`
 * vocabulary is lower-case and anatomical; the table reads better in sentence
 * case, and "cardiovascular system" is not a muscle group.
 */
export const TARGET_LABELS = {
  abductors: "Abductors",
  abs: "Abdominals",
  adductors: "Adductors",
  biceps: "Biceps",
  calves: "Calves",
  "cardiovascular system": "Cardio",
  delts: "Delts",
  forearms: "Forearms",
  glutes: "Glutes",
  hamstrings: "Hamstrings",
  lats: "Lats",
  "levator scapulae": "Levator scapulae",
  pectorals: "Pectorals",
  quads: "Quads",
  "serratus anterior": "Serratus anterior",
  spine: "Spine",
  traps: "Traps",
  triceps: "Triceps",
  "upper back": "Upper back",
};

export function targetLabel(target) {
  return TARGET_LABELS[target] ?? String(target ?? "").replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

/** Every plate on one view, in authored order. */
export function platesFor(view) {
  return PLATES.filter((p) => p.view === view);
}

/** Plates lit by a set of catalogue `muscle` values. */
export function platesForMuscles(muscles) {
  const out = new Set();
  for (const muscle of muscles ?? []) {
    for (const plate of MUSCLE_PLATES[muscle] ?? []) out.add(plate);
  }
  return out;
}

/** Plates lit by one catalogue `target` value. */
export function platesForTarget(target) {
  return new Set(TARGET_PLATES[target] ?? []);
}

/** Plates belonging to one of the six body-part groups. */
export function platesForGroup(groupId) {
  const group = BODY_PART_GROUPS.find((g) => g.id === groupId);
  return group ? platesForMuscles(group.muscles) : new Set();
}

function shapeToElement(shape) {
  if (shape.el === "circle") {
    return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}"/>`;
  }
  if (shape.el === "path") return `<path d="${shape.d}"/>`;
  const { x, y, w, h, rx, rotate } = shape;
  const transform = rotate ? ` transform="rotate(${rotate} ${x + w / 2} ${y + h / 2})"` : "";
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"${transform}/>`;
}

function plateToElement(plate) {
  if (plate.d) return `<path d="${plate.d}"/>`;
  const { x, y, w, h, rx, rotate } = plate.r;
  const transform = rotate ? ` transform="rotate(${rotate} ${x + w / 2} ${y + h / 2})"` : "";
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"${transform}/>`;
}

function renderFrame() {
  const halves = FRAME.map((shape) => {
    const el = shapeToElement(shape);
    return shape.mirror === false ? el : `${el}<g transform="${MIRROR}">${el}</g>`;
  }).join("");
  return `<g class="bodymap-frame" aria-hidden="true">${halves}</g>`;
}

/**
 * Render one side of the mannequin as an SVG string.
 *
 * @param {object} options
 * @param {"front"|"back"} options.view
 * @param {Map<string, number>} [options.setsByPlate] raw set counts per plate
 * @param {Set<string>} [options.highlight] plates to mark regardless of volume
 * @param {string} [options.summary] accessible description of the whole figure
 * @param {number} [options.max] override the normalisation ceiling
 */
export function bodyMap({
  view = "front",
  setsByPlate = new Map(),
  highlight = null,
  summary = "",
  max = null,
} = {}) {
  const plates = platesFor(view);
  const values = plates.map((p) => Number(setsByPlate.get(p.id)) || 0);
  const ceiling = max ?? Math.max(...values, 0);

  const regions = plates
    .map((plate) => {
      const sets = Number(setsByPlate.get(plate.id)) || 0;
      const isLit = sets > 0 || highlight?.has(plate.id);
      // A plate with volume gets heat; a highlighted plate with none gets the
      // outline only, so "trained" and "selected" never look identical.
      const t = ceiling > 0 ? Math.min(sets / ceiling, 1) : 0;
      const classes = ["bodymap-region"];
      if (sets > 0) classes.push("is-warm");
      if (highlight?.has(plate.id)) classes.push("is-lit");
      const title = sets > 0 ? `${plate.label} · ${sets} sets` : plate.label;
      const el = plateToElement(plate);
      return `<g class="${classes.join(" ")}" data-region="${esc(plate.id)}" style="--t:${t.toFixed(3)}">`
        + `<title>${esc(title)}</title>${el}<g transform="${MIRROR}">${el}</g></g>`;
    })
    .join("");

  return `<svg class="bodymap" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" role="img" aria-label="${esc(summary || "Muscle map")}">`
    + `${renderFrame()}<g class="bodymap-regions">${regions}</g></svg>`;
}

/**
 * A small figure used on the six body-part cards. Volume is not interesting
 * here — the card already prints the number — so the map is binary: the part
 * lights up, the rest of the body stays as a quiet frame.
 */
export function bodyPartThumb(groupId, { view = "front" } = {}) {
  const lit = platesForGroup(groupId);
  const group = BODY_PART_GROUPS.find((g) => g.id === groupId);
  return bodyMap({
    view,
    highlight: lit,
    summary: group ? `${group.label} muscle map` : "Muscle map",
  });
}

/** Plates lit by a `Map<catalogue target, sets>`, for the day-level view. */
export function platesFromTargetCounts(targetCounts) {
  const out = new Map();
  for (const [target, sets] of targetCounts ?? []) {
    for (const plate of TARGET_PLATES[target] ?? []) {
      out.set(plate, (out.get(plate) ?? 0) + sets);
    }
  }
  return out;
}

/**
 * Spread `Map<catalogue muscle, sets>` onto plates.
 *
 * A muscle owns several plates (back is four), and each plate takes the full
 * count rather than a share: the map answers "how much did you train here",
 * not "how should one set be divided".
 */
export function platesFromMuscleCounts(muscleCounts) {
  const out = new Map();
  for (const [muscle, sets] of muscleCounts ?? []) {
    for (const plate of MUSCLE_PLATES[muscle] ?? []) {
      out.set(plate, (out.get(plate) ?? 0) + sets);
    }
  }
  return out;
}

/**
 * The six-part split, from muscle counts. Cardio lands in its own group when
 * it exists, because it is real training volume with nowhere to highlight.
 */
export function groupSetCounts(muscleCounts) {
  const out = new Map();
  for (const group of BODY_PART_GROUPS) {
    let total = 0;
    for (const muscle of group.muscles) total += Number(muscleCounts.get(muscle)) || 0;
    out.set(group.id, total);
  }
  const cardio = Number(muscleCounts.get("cardio")) || 0;
  if (cardio > 0) out.set("cardio", cardio);
  return out;
}

/** Label for a group id, including the conditional cardio group. */
export function groupLabel(groupId) {
  if (groupId === "cardio") return "Cardio";
  return BODY_PART_GROUPS.find((g) => g.id === groupId)?.label ?? groupId;
}
