/**
 * IronLog — external exercise catalogue loader.
 *
 * IronLog ships a curated starter library inline (exercises.js) plus one
 * fetched catalogue: MIT-licensed data from hasaneyldrm/exercises-dataset.
 * Fetching rather than importing keeps the index off the critical
 * first-paint path, and the curated library still works if the request fails.
 *
 * Instruction text is split by language and loaded only when an exercise
 * detail is opened. Ten languages are available without downloading every
 * pack up front.
 *
 * LICENSING: the dataset's Gym Visual 180x180 GIFs are redistributed here
 * under a media licence held by the app operator, with attribution retained.
 */

const INDEX_PATH = "data/exercises-index.json";
const META_PATH = "data/catalogue-meta.json";
const stepsPath = (lang) => `data/steps.${lang}.json`;
const SOURCE_LANGUAGES = {
  dataset: ["en", "es", "fr", "it", "pl", "ru", "tr", "zh", "hi", "ko"],
};

/** Strip the "ds-" prefix the generator adds, to key into a step pack. */
export function rawDatasetId(id) {
  return String(id ?? "").replace(/^ds-/, "");
}

export function normaliseName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Fetch and parse JSON, returning null rather than throwing so a missing or
 * malformed file degrades to "curated library only" instead of a blank app.
 */
async function fetchJson(path, { timeoutMs = 15000 } = {}) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(path, { signal: controller?.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Load the external catalogue.
 *
 * @param {string} [base] directory the data files live in, relative to the page
 * @returns {Promise<{exercises: object[], meta: object|null, available: boolean}>}
 */
export async function loadCatalogue(base = "") {
  const prefix = base ? `${base.replace(/\/+$/, "")}/` : "";
  const [index, meta] = await Promise.all([
    fetchJson(`${prefix}${INDEX_PATH}`),
    fetchJson(`${prefix}${META_PATH}`),
  ]);

  const baseAvailable = Array.isArray(index) && index.length > 0;
  if (!baseAvailable) {
    return { exercises: [], meta: null, available: false };
  }

  return { exercises: index, meta, available: true };
}

/**
 * Load one language's instruction pack, memoised per language so reopening
 * details never refetches.
 *
 * @type {Map<string, Promise<Object<string, string[]>|null>>}
 */
const stepCache = new Map();

export function loadSteps(lang = "en", base = "") {
  const prefix = base ? `${base.replace(/\/+$/, "")}/` : "";
  const key = `${prefix}${lang}`;
  if (!stepCache.has(key)) {
    stepCache.set(
      key,
      fetchJson(`${prefix}${stepsPath(lang)}`).then((pack) =>
        pack && typeof pack === "object" ? pack : null,
      ),
    );
  }
  return stepCache.get(key);
}

/** Clear the memo, used when the user switches language or in tests. */
export function clearStepsCache() {
  stepCache.clear();
}

/**
 * Whether an exercise has catalogue instructions to show. True for catalogue
 * entries, and for a curated entry that won a name collision and was therefore
 * linked to the losing record's instructions via stepsId.
 */
export function hasInstructions(exercise) {
  return Boolean(exercise) && (exercise.source === "dataset" || Boolean(exercise.stepsId));
}

/** The catalogue id whose instructions apply to this exercise, if any. */
export function stepsKey(exercise) {
  if (!exercise) return null;
  if (exercise.stepsId) return exercise.stepsId;
  return exercise.source === "dataset" ? exercise.id : null;
}

/**
 * Resolve the instruction steps for one exercise in one language.
 * Returns { steps, language, fellBack } — falls back to English when the
 * requested pack is missing or has no entry for that exercise.
 *
 * Accepts either an id string or an exercise object, so a linked curated entry
 * transparently resolves through its stepsId.
 */
export async function stepsFor(exerciseOrId, lang = "en", base = "") {
  const exerciseId =
    typeof exerciseOrId === "string" ? exerciseOrId : (stepsKey(exerciseOrId) ?? exerciseOrId?.id);
  const raw = rawDatasetId(exerciseId);

  // Language availability is source-specific. Do not issue a known-404 request
  // for a language the dataset does not ship just to discover that English is
  // the appropriate fallback.
  if (lang !== "en" && !SOURCE_LANGUAGES.dataset.includes(lang)) {
    const fallback = await loadSteps("en", base);
    const enSteps = fallback?.[raw];
    return {
      steps: Array.isArray(enSteps) ? enSteps : [],
      language: "en",
      fellBack: true,
    };
  }

  const requested = await loadSteps(lang, base);
  const steps = requested?.[raw];
  if (Array.isArray(steps) && steps.length > 0) {
    return { steps, language: lang, fellBack: false };
  }
  if (lang === "en") return { steps: [], language: "en", fellBack: false };

  const fallback = await loadSteps("en", base);
  const enSteps = fallback?.[raw];
  if (Array.isArray(enSteps) && enSteps.length > 0) {
    return { steps: enSteps, language: "en", fellBack: true };
  }
  return { steps: [], language: lang, fellBack: false };
}

/**
 * Language names, in English and in the language itself.
 *
 * Held here rather than in the generated metadata so the picker does not depend
 * on a regeneration, and because a flag is not a language: emoji flags are both
 * an icon system standing on a glyph and wrong for most speakers (Spanish is
 * not only Spain, English is not only Britain). The native name carries the
 * choice instead.
 */
export const LANGUAGE_NAMES = {
  en: { label: "English", native: "English" },
  es: { label: "Spanish", native: "Español" },
  de: { label: "German", native: "Deutsch" },
  fr: { label: "French", native: "Français" },
  it: { label: "Italian", native: "Italiano" },
  pl: { label: "Polish", native: "Polski" },
  ru: { label: "Russian", native: "Русский" },
  tr: { label: "Turkish", native: "Türkçe" },
  zh: { label: "Chinese", native: "中文" },
  hi: { label: "Hindi", native: "हिन्दी" },
  ko: { label: "Korean", native: "한국어" },
};

/** Languages present in the generated metadata, for the settings picker. */
export function availableLanguages(meta) {
  const list = meta?.languages;
  if (!Array.isArray(list) || list.length === 0) {
    return [{ code: "en", ...LANGUAGE_NAMES.en }];
  }
  return list.map((l) => {
    const names = LANGUAGE_NAMES[l.code] ?? { label: l.label ?? l.code, native: l.label ?? l.code };
    return { code: l.code, label: names.label, native: names.native };
  });
}
