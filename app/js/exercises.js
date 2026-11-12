/**
 * IronLog — built-in exercise library.
 *
 * IronLog has no hand-curated starter library. Every built-in exercise comes
 * from the MIT-licensed hasaneyldrm/exercises-dataset catalogue (loaded at
 * runtime from app/data/exercises-index.json), and users can add their own;
 * custom entries are merged at runtime by the store, never by editing this
 * file.
 */

export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "cardio",
  "neck",
  "other",
];

export const EQUIPMENT = [
  "assisted",
  "band",
  "barbell",
  "body weight",
  "bosu ball",
  "cable",
  "dumbbell",
  "elliptical machine",
  "ez barbell",
  "hammer",
  "kettlebell",
  "leverage machine",
  "medicine ball",
  "olympic barbell",
  "resistance band",
  "roller",
  "rope",
  "skierg machine",
  "sled machine",
  "smith machine",
  "stability ball",
  "stationary bike",
  "stepmill machine",
  "tire",
  "trap bar",
  "upper body ergometer",
  "weighted",
  "wheel roller",
];

/**
 * @typedef {object} Exercise
 * @property {string} id
 * @property {string} name
 * @property {string} muscle
 * @property {string} equipment
 * @property {boolean} [barbell] true when weight is a barbell load (plate maths)
 * @property {string} [note]
 */

/**
 * Merge the external catalogue with any user-created exercises.
 *
 * Precedence, highest first: custom (user) > external catalogue. The catalogue
 * is the only built-in source; a user's own entry with the same id overrides it.
 *
 * @param {Exercise[]} custom
 * @param {Exercise[]} [dataset] external catalogue loaded at runtime
 * @returns {Exercise[]}
 */
export function allExercises(custom = [], dataset = []) {
  const map = new Map();
  for (const e of dataset ?? []) {
    if (e && typeof e.id === "string" && e.id.length > 0) map.set(e.id, e);
  }
  for (const e of custom) {
    if (e && typeof e.id === "string" && e.id.length > 0) map.set(e.id, e);
  }
  return [...map.values()];
}

/** The dataset catalogue is the only built-in source, so there is no static index. */
export const EXERCISE_INDEX = {};

/**
 * Rank a match so the most likely intent comes first. With ~1,300 exercises in
 * the catalogue, relevance order matters more than alphabetical order.
 * 0 = no match, lower is better.
 */
function matchRank(exercise, q) {
  const name = exercise.name.toLowerCase();
  const muscle = String(exercise.muscle ?? "").toLowerCase();
  const equipment = String(exercise.equipment ?? "").toLowerCase();
  const target = String(exercise.target ?? "").toLowerCase();

  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  // Word-boundary match, e.g. "press" in "barbell bench press".
  if (name.split(" ").some((word) => word.startsWith(q))) return 2;
  if (name.includes(q)) return 3;
  if (target.startsWith(q)) return 4;
  if (muscle.includes(q)) return 5;
  if (equipment.includes(q)) return 6;
  return -1;
}

/**
 * Case-insensitive, relevance-ranked search across name, target, muscle and
 * equipment. A multi-word query is matched token-by-token: "dumbbell curl"
 * finds "Dumbbell Alternating Biceps Curl", the way Hevy's library behaves,
 * instead of demanding the words appear as one contiguous phrase. Rank is the
 * best-ranked token, so the strongest signal orders the list.
 * @param {Exercise[]} list
 * @param {string} query
 * @param {string} [muscle] optional muscle-group filter
 */
export function searchExercises(list, query, muscle = "all") {
  const q = (query ?? "").trim().toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);

  const filtered = list.filter((e) => {
    if (muscle !== "all" && e.muscle !== muscle) return false;
    if (tokens.length === 0) return true;
    return tokens.every((token) => matchRank(e, token) >= 0);
  });

  if (tokens.length === 0) return filtered;

  return filtered
    .map((e) => ({ e, rank: Math.min(...tokens.map((token) => matchRank(e, token))) }))
    .sort((a, b) => a.rank - b.rank || a.e.name.localeCompare(b.e.name))
    .map(({ e }) => e);
}

/** Slugify a name into a stable custom-exercise id. */
export function makeExerciseId(name) {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `custom-${slug || "exercise"}`;
}
