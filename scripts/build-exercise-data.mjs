#!/usr/bin/env node
/**
 * Build IronLog's exercise catalogue from hasaneyldrm/exercises-dataset.
 *
 *   node scripts/build-exercise-data.mjs [--source <path-to-dataset>]
 *
 * WHAT THIS SHIPS
 * ---------------
 * The upstream repository is dual-licensed (see its LICENSE and NOTICE.md):
 *
 *   - The exercise DATA — names, category, body part, equipment, target,
 *     muscle group, secondary muscles, and the step-by-step instruction text
 *     and its translations — is MIT licensed, (c) 2026 Hasan Emir Yildirim.
 *
 *   - The exercise MEDIA in images/ and videos/ is (c) Gym Visual. The
 *     upstream LICENSE grants the media permission to be redistributed at
 *     180x180 with the attribution field retained, and IronLog's operator
 *     holds that media licence. This script therefore copies the 180x180
 *     GIFs into app/media/gymvisual/ and emits a `media` field for every
 *     record carrying the local path and the required attribution.
 *
 * OUTPUT
 *   app/data/exercises-index.json   compact metadata for every exercise
 *   app/data/steps.<lang>.json      id -> numbered instruction steps, per
 *                                   language, loaded lazily on demand
 *   app/data/catalogue-meta.json    counts, languages, source provenance
 *   app/media/gymvisual/*.gif      the licensed 180x180 exercise GIFs
 */

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── Taxonomy mapping ───────────────────────────────────────────────────────
//
// Upstream uses a 10-value body_part and a 19-value target. IronLog groups by
// the muscle a lifter thinks about, so target wins where it is specific and
// body_part is the fallback.

const TARGET_TO_MUSCLE = {
  pectorals: "chest",
  lats: "back",
  "upper back": "back",
  traps: "back",
  spine: "back",
  "levator scapulae": "back",
  "serratus anterior": "back",
  delts: "shoulders",
  biceps: "biceps",
  triceps: "triceps",
  forearms: "forearms",
  quads: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  abductors: "glutes",
  adductors: "glutes",
  calves: "calves",
  abs: "core",
  "cardiovascular system": "cardio",
};

const BODY_PART_TO_MUSCLE = {
  chest: "chest",
  back: "back",
  shoulders: "shoulders",
  "upper arms": "biceps",
  "lower arms": "forearms",
  "upper legs": "quads",
  "lower legs": "calves",
  waist: "core",
  cardio: "cardio",
  neck: "neck",
};

/**
 * Media fields copied verbatim onto each record. The GIF is the primary
 * animated media; the still image and attribution are retained for the detail
 * sheet and for the licence the operator holds.
 */
const MEDIA_FIELDS = ["image", "gif_url", "media_id", "attribution"];

/** Local directory (relative to app/) where licensed GIFs are stored. */
const GYMVISUAL_DIR = "media/gymvisual";

const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "it", label: "Italian", native: "Italiano" },
  { code: "pl", label: "Polish", native: "Polski" },
  { code: "ru", label: "Russian", native: "Русский" },
  { code: "tr", label: "Turkish", native: "Türkçe" },
  { code: "zh", label: "Chinese", native: "中文" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "ko", label: "Korean", native: "한국어" },
];

export function mapMuscle(record) {
  const byTarget = TARGET_TO_MUSCLE[record.target];
  if (byTarget) return byTarget;
  const byBodyPart = BODY_PART_TO_MUSCLE[record.body_part];
  return byBodyPart ?? "other";
}

/** Normalise a name so "Barbell Bench Press" and "barbell bench press" collide. */
export function normaliseName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseArgs(argv) {
  const args = { source: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--source") args.source = argv[++i];
  }
  return args;
}

async function findDataset(explicit) {
  const candidates = explicit
    ? [resolve(explicit)]
    : [
        resolve(ROOT, "../exercises-dataset"),
        resolve(ROOT, "third_party/exercises-dataset"),
        resolve(process.cwd(), "exercises-dataset"),
      ];
  for (const dir of candidates) {
    const file = join(dir, "data/exercises.json");
    if (existsSync(file)) return { dir, file };
  }
  throw new Error(
    `Could not find the dataset. Clone it first, or pass --source:\n` +
      `  git clone https://github.com/hasaneyldrm/exercises-dataset.git\n` +
      `  node scripts/build-exercise-data.mjs --source /path/to/exercises-dataset\n` +
      `Looked in:\n${candidates.map((c) => `  - ${c}`).join("\n")}`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { dir, file } = await findDataset(args.source);

  console.log(`Source dataset : ${dir}`);
  const raw = JSON.parse(await readFile(file, "utf8"));
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("exercises.json is not a non-empty array");
  console.log(`Records read   : ${raw.length}`);

  // Reject anything carrying media references, rather than silently dropping it,
  // so a future upstream field rename cannot smuggle them through.
  const index = [];
  const steps = new Map(LANGUAGES.map((l) => [l.code, {}]));
  const seenNames = new Map();
  const skipped = { dupeName: 0, noId: 0 };
  let mediaFieldsSeen = 0;
  let mediaCopied = 0;

  const mediaOutDir = join(ROOT, "app", GYMVISUAL_DIR);
  await mkdir(mediaOutDir, { recursive: true });

  for (const record of raw) {
    for (const field of MEDIA_FIELDS) {
      if (field in record) mediaFieldsSeen += 1;
    }
    if (!record.id || !record.name) {
      skipped.noId += 1;
      continue;
    }

    const key = normaliseName(record.name);
    if (seenNames.has(key)) {
      skipped.dupeName += 1;
      continue;
    }
    seenNames.set(key, record.id);

    // Copy the licensed media (GIF animation and still poster) into the app.
    // The upstream names are already stable/unique per record.
    const gifName = typeof record.gif_url === "string" ? basename(record.gif_url) : null;
    const imageName = typeof record.image === "string" ? basename(record.image) : null;
    for (const [rel, name] of [["videos", gifName], ["images", imageName]]) {
      if (!name) continue;
      const src = join(dir, rel, name);
      if (!existsSync(src)) {
        throw new Error(`Media file missing in dataset for ${record.id}: ${src}`);
      }
      await copyFile(src, join(mediaOutDir, name));
      mediaCopied += 1;
    }

    const media = {
      provider: "gymvisual",
      gif: gifName ? `${GYMVISUAL_DIR}/${gifName}` : null,
      image: imageName ? `${GYMVISUAL_DIR}/${imageName}` : null,
      credit: typeof record.attribution === "string" && record.attribution
        ? record.attribution
        : "© Gym visual — https://gymvisual.com/",
    };

    index.push({
      id: `ds-${record.id}`,
      name: record.name,
      muscle: mapMuscle(record),
      bodyPart: record.body_part ?? null,
      target: record.target ?? null,
      equipment: record.equipment ?? "other",
      category: record.category ?? null,
      muscleGroup: record.muscle_group ?? null,
      secondaryMuscles: Array.isArray(record.secondary_muscles) ? record.secondary_muscles : [],
      media,
      source: "dataset",
    });

    for (const lang of LANGUAGES) {
      const list = record.instruction_steps?.[lang.code];
      if (Array.isArray(list) && list.length > 0) {
        steps.get(lang.code)[record.id] = list.map((s) => String(s).trim()).filter(Boolean);
      }
    }
  }

  // Fail closed on unsafe media: every record must carry a local gymvisual GIF
  // and the required attribution; no remote media URLs and no raw upstream
  // field names may leak through. This guards against a future upstream field
  // rename silently letting a remote or unlicensed reference back into the
  // index. The attribution string itself legitimately contains the Gym Visual
  // URL, so only the media paths and the raw field names are screened.
  const emitted = JSON.stringify(index);
  for (const banned of ["gif_url", "media_id"]) {
    if (emitted.toLowerCase().includes(banned)) {
      throw new Error(`Refusing to write output: found media reference "${banned}" in the index.`);
    }
  }
  let missingMedia = 0;
  let missingCredit = 0;
  for (const entry of index) {
    const media = entry.media;
    if (!media || !media.gif || media.provider !== "gymvisual") {
      missingMedia += 1;
      continue;
    }
    for (const field of ["gif", "image"]) {
      const value = media[field];
      if (value != null && !/^media\/gymvisual\/[^/]+$/.test(value)) {
        throw new Error(`Refusing to write output: ${entry.id} media ${field} is not a local gymvisual path: ${value}`);
      }
    }
    if (!media.credit?.includes("Gym visual")) missingCredit += 1;
    const file = join(ROOT, "app", media.gif);
    if (!existsSync(file)) {
      throw new Error(`Refusing to write output: media file missing for ${entry.id}: ${media.gif}`);
    }
  }
  if (missingMedia > 0) throw new Error(`Refusing to write output: ${missingMedia} records lack licensed GIF media.`);
  if (missingCredit > 0) throw new Error(`Refusing to write output: ${missingCredit} records lack Gym Visual attribution.`);

  const outDir = join(ROOT, "app/data");
  await mkdir(outDir, { recursive: true });

  await writeFile(join(outDir, "exercises-index.json"), `${JSON.stringify(index)}\n`);

  const languagesWritten = [];
  for (const lang of LANGUAGES) {
    const entries = steps.get(lang.code);
    const ids = Object.keys(entries);
    if (ids.length === 0) continue;
    await writeFile(join(outDir, `steps.${lang.code}.json`), `${JSON.stringify(entries)}\n`);
    languagesWritten.push({
      code: lang.code,
      label: lang.label,
      native: lang.native,
      exercises: ids.length,
      bytes: JSON.stringify(entries).length,
    });
  }

  const upstreamLicense = existsSync(join(dir, "LICENSE"))
    ? await readFile(join(dir, "LICENSE"), "utf8")
    : "";
  const upstreamCommit = await readUpstreamCommit(dir);

  const meta = {
    generatedAt: new Date().toISOString(),
    generator: "scripts/build-exercise-data.mjs",
    source: {
      repository: "https://github.com/hasaneyldrm/exercises-dataset",
      commit: upstreamCommit,
      localPath: dir,
      recordsRead: raw.length,
    },
    counts: {
      exercises: index.length,
      languages: languagesWritten.length,
      skippedDuplicateNames: skipped.dupeName,
      skippedMissingId: skipped.noId,
      mediaFieldsStripped: 0,
      mediaCopied,
    },
    languages: languagesWritten,
    licensing: {
      data: {
        license: "MIT",
        copyright: "Copyright (c) 2026 Hasan Emir Yıldırım",
        note: "Exercise names, taxonomy and instruction text/translations are MIT licensed. The copyright notice is retained here and surfaced in the app as MIT requires.",
      },
      media: {
        included: true,
        provider: "gymvisual",
        copyright: "© Gym Visual — https://gymvisual.com/",
        note: "Gym Visual 180x180 GIFs and stills are redistributed with the rights holder's permission under their terms, with attribution retained on every record. The upstream MIT grant does not cover this media; the app operator holds the media licence.",
        mediaFieldsStripped: mediaFieldsSeen,
        mediaCopied,
        directory: GYMVISUAL_DIR,
      },
      upstreamLicenseContainsMediaException: upstreamLicense.includes("MEDIA EXCEPTION"),
    },
  };

  await writeFile(join(outDir, "catalogue-meta.json"), `${JSON.stringify(meta, null, 2)}\n`);

  const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
  console.log("");
  console.log(`Exercises kept : ${index.length}  (${kb(emitted.length)} index)`);
  console.log(`Duplicate names: ${skipped.dupeName} skipped`);
  console.log(`Media files    : ${mediaCopied} copied to app/${GYMVISUAL_DIR}/`);
  console.log(`Languages      : ${languagesWritten.length}`);
  for (const l of languagesWritten) console.log(`   ${l.code}  ${l.native.padEnd(10)} ${l.exercises} exercises  ${kb(l.bytes)}`);
  console.log("");
  console.log(`Wrote to ${outDir}`);
}

async function readUpstreamCommit(dir) {
  try {
    const { execFileSync } = await import("node:child_process");
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/**
 * Run only when executed directly, so tests can import mapMuscle and
 * normaliseName without triggering a full regeneration.
 */
function isDirectRun() {
  const entry = process.argv[1];
  return Boolean(entry) && resolve(entry) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  });
}
