#!/usr/bin/env node
/**
 * Build IronLog's RepDB-backed catalogue records and licensed still media.
 *
 *   node scripts/build-repdb-data.mjs --source /path/to/repdb-exercise-dataset
 *
 * RepDB's free tier permits personal and commercial use inside applications
 * with visible attribution. It does not permit republishing the data as a
 * standalone dataset/API, and its premium-samples animations are evaluation
 * only. This generator therefore emits app-specific index/step artefacts and
 * copies only referenced images/flat/*.webp files. It never copies the raw
 * upstream repository, premium samples, GIFs, videos or thumbnails.
 *
 * Output:
 *   app/data/repdb-index.json
 *   app/data/repdb-steps.{en,de,es}.json
 *   app/data/repdb-meta.json
 *   app/media/repdb/*.webp
 *   LICENSE-REPDB.md
 */

import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DATA = join(ROOT, "app/data");
const OUT_MEDIA = join(ROOT, "app/media/repdb");

const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "es", label: "Spanish", native: "Español" },
];

const PRIMARY_MUSCLE_MAP = {
  pectoralis_major: "chest",
  latissimus_dorsi: "back",
  rhomboids: "back",
  trapezius: "back",
  erector_spinae: "back",
  quadratus_lumborum: "back",
  serratus_anterior: "back",
  anterior_deltoid: "shoulders",
  lateral_deltoid: "shoulders",
  posterior_deltoid: "shoulders",
  biceps_brachii: "biceps",
  brachialis: "biceps",
  triceps_brachii: "triceps",
  brachioradialis: "forearms",
  forearm_extensors: "forearms",
  forearm_flexors: "forearms",
  forearms: "forearms",
  quadriceps: "quads",
  hip_flexors: "quads",
  hamstrings: "hamstrings",
  gluteus_maximus: "glutes",
  gluteus_medius: "glutes",
  abductors: "glutes",
  adductors: "glutes",
  gastrocnemius: "calves",
  soleus: "calves",
  tibialis_anterior: "calves",
  rectus_abdominis: "core",
  obliques: "core",
  transverse_abdominis: "core",
};

const BODY_PART_MAP = {
  chest: "chest",
  back: "back",
  shoulders: "shoulders",
  upper_arms: "biceps",
  lower_arms: "forearms",
  upper_legs: "quads",
  lower_legs: "calves",
  core: "core",
  full_body: "other",
};

export function humanise(value) {
  return String(value ?? "")
    .replace(/_/g, " ")
    .trim();
}

export function normaliseName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Map RepDB's anatomical taxonomy to IronLog's stable filter groups. */
export function mapRepDBMuscle(record) {
  if (record?.category === "cardio") return "cardio";
  for (const muscle of record?.primary_muscles ?? []) {
    if (PRIMARY_MUSCLE_MAP[muscle]) return PRIMARY_MUSCLE_MAP[muscle];
  }
  return BODY_PART_MAP[record?.body_part] ?? "other";
}

function parseArgs(argv) {
  const args = { source: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--source") args.source = argv[++i];
  }
  return args;
}

function findSource(explicit) {
  const candidates = explicit
    ? [resolve(explicit)]
    : [
        resolve(ROOT, "../repdb-exercise-dataset"),
        resolve(ROOT, "third_party/repdb-exercise-dataset"),
        resolve(process.cwd(), "exercise-dataset"),
      ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "exercises.json"))) return dir;
  }
  throw new Error(`Could not find RepDB. Pass --source /path/to/exercise-dataset.\nLooked in:\n${candidates.join("\n")}`);
}

function upstreamCommit(dir) {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function mediaReference(record, pose, relativePath) {
  if (typeof relativePath !== "string") {
    throw new Error(`${record.id}: missing ${pose} image path`);
  }
  if (!/^images\/flat\/[a-z0-9-]+\.webp$/.test(relativePath)) {
    throw new Error(`${record.id}: refusing non-free or unsafe media path ${relativePath}`);
  }
  return {
    upstream: relativePath,
    local: `media/repdb/${basename(relativePath)}`,
  };
}

/** Convert one upstream record without carrying over remote/raw repository paths. */
export function toAppRecord(record) {
  const id = `repdb-${record.id}`;
  const primary = Array.isArray(record.primary_muscles) ? record.primary_muscles : [];
  const secondary = Array.isArray(record.secondary_muscles) ? record.secondary_muscles : [];
  const flat = record.images?.flat ?? {};
  const poses = {};
  const upstreamPaths = {};

  for (const pose of ["start", "peak", "main"]) {
    if (!flat[pose]) continue;
    const ref = mediaReference(record, pose, flat[pose]);
    poses[pose] = ref.local;
    upstreamPaths[pose] = ref.upstream;
  }
  if (Object.keys(poses).length === 0) throw new Error(`${record.id}: no free-tier illustration`);

  return {
    entry: {
      id,
      name: record.name_en,
      muscle: mapRepDBMuscle(record),
      bodyPart: humanise(record.body_part),
      target: humanise(primary[0] ?? record.body_part),
      equipment: record.equipment ? humanise(record.equipment) : "bodyweight",
      category: humanise(record.body_part),
      trainingCategory: record.category ?? null,
      muscleGroup: humanise(primary[0] ?? record.body_part),
      secondaryMuscles: secondary.map(humanise).filter(Boolean),
      difficulty: record.difficulty ?? null,
      met: Number.isFinite(record.met) ? record.met : null,
      media: { provider: "repdb", poses },
      source: "repdb",
    },
    upstreamPaths,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = findSource(args.source);
  const file = join(dir, "exercises.json");
  const licensePath = join(dir, "LICENSE-DATA.md");
  if (!existsSync(licensePath)) throw new Error("RepDB LICENSE-DATA.md is missing; refusing to copy data or media.");

  const license = await readFile(licensePath, "utf8");
  for (const required of [
    "Free Tier License",
    "personal and commercial use inside applications",
    "Attribution required",
    "No redistribution as a dataset",
    "premium-samples",
  ]) {
    if (!license.includes(required)) throw new Error(`RepDB license no longer contains expected term: ${required}`);
  }

  const document = JSON.parse(await readFile(file, "utf8"));
  const rows = document?.exercises;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("RepDB exercises.json has no exercises array.");
  if (Number(document.count) !== rows.length) throw new Error("RepDB count does not match its exercise array.");

  const ids = new Set();
  const names = new Set();
  const index = [];
  const steps = Object.fromEntries(LANGUAGES.map(({ code }) => [code, {}]));
  const copies = new Map();

  // Dedupe against the hasaneyldrm catalogue: when both sources contain the
  // same exercise, the hasaneyldrm record (with its Gym Visual GIF) wins so
  // the merged library does not show the same exercise twice. The normalised
  // names come from the already-generated exercise index when available.
  const catalogueIndexPath = join(OUT_DATA, "exercises-index.json");
  const catalogueNames = new Set();
  if (existsSync(catalogueIndexPath)) {
    const catalogue = JSON.parse(await readFile(catalogueIndexPath, "utf8"));
    for (const entry of catalogue) {
      if (entry?.source === "dataset" && entry.name) catalogueNames.add(normaliseName(entry.name));
    }
  }
  let skippedAsDuplicate = 0;

  for (const record of rows) {
    if (!record.id || !record.name_en) throw new Error("Every RepDB record needs an id and English name.");
    const nameKey = normaliseName(record.name_en);
    if (catalogueNames.has(nameKey)) {
      skippedAsDuplicate += 1;
      continue;
    }
    if (ids.has(record.id) || names.has(nameKey)) throw new Error(`Duplicate RepDB record: ${record.id}`);
    ids.add(record.id);
    names.add(nameKey);

    const { entry, upstreamPaths } = toAppRecord(record);
    index.push(entry);

    for (const { code } of LANGUAGES) {
      const list = record[`instructions_${code}`];
      if (!Array.isArray(list) || list.length === 0) throw new Error(`${record.id}: missing ${code} instructions`);
      steps[code][entry.id] = list.map((step) => String(step).trim()).filter(Boolean);
    }

    for (const relative of Object.values(upstreamPaths)) {
      const target = basename(relative);
      if (copies.has(target) && copies.get(target) !== relative) {
        throw new Error(`Conflicting RepDB image basename: ${target}`);
      }
      copies.set(target, relative);
      const sourceFile = join(dir, relative);
      if (!existsSync(sourceFile)) throw new Error(`Missing RepDB image: ${relative}`);
    }
  }

  await mkdir(OUT_DATA, { recursive: true });
  await rm(OUT_MEDIA, { recursive: true, force: true });
  await mkdir(OUT_MEDIA, { recursive: true });

  let imageBytes = 0;
  for (const [target, relative] of copies) {
    const sourceFile = join(dir, relative);
    const targetFile = join(OUT_MEDIA, target);
    await copyFile(sourceFile, targetFile);
    imageBytes += (await stat(targetFile)).size;
  }

  await writeFile(join(OUT_DATA, "repdb-index.json"), `${JSON.stringify(index)}\n`);
  const languageMeta = [];
  for (const lang of LANGUAGES) {
    const payload = steps[lang.code];
    const raw = `${JSON.stringify(payload)}\n`;
    await writeFile(join(OUT_DATA, `repdb-steps.${lang.code}.json`), raw);
    languageMeta.push({ ...lang, exercises: Object.keys(payload).length, bytes: Buffer.byteLength(raw) });
  }
  await writeFile(join(ROOT, "LICENSE-REPDB.md"), license);

  const meta = {
    generatedAt: new Date().toISOString(),
    generator: "scripts/build-repdb-data.mjs",
    source: {
      repository: "https://github.com/RepDB/exercise-dataset",
      homepage: "https://repdb.co",
      commit: upstreamCommit(dir),
      schemaVersion: document.schema_version ?? null,
      recordsRead: rows.length,
    },
    counts: {
      exercises: index.length,
      languages: languageMeta.length,
      images: copies.size,
      imageBytes,
      skippedAsDuplicate: skippedAsDuplicate,
    },
    languages: languageMeta,
    licensing: {
      license: "RepDB Free Tier v1.0",
      copyright: "© 2026 Sergei Argutin (RepDB)",
      attribution: "Exercise data by RepDB (repdb.co)",
      usage: "Personal and commercial in-app use with visible attribution.",
      redistribution: "No standalone dataset, dataset repository or API redistribution.",
      premiumSamplesIncluded: false,
      mediaModified: false,
      licenseFile: "LICENSE-REPDB.md",
    },
    media: {
      included: true,
      format: "webp",
      dimensions: "512x512",
      localDirectory: "app/media/repdb",
      files: copies.size,
      bytes: imageBytes,
    },
  };
  await writeFile(join(OUT_DATA, "repdb-meta.json"), `${JSON.stringify(meta, null, 2)}\n`);

  const committedMedia = await readdir(OUT_MEDIA);
  if (committedMedia.length !== copies.size) throw new Error("RepDB media output count mismatch after generation.");

  console.log(`Source        : ${dir}`);
  console.log(`Commit        : ${meta.source.commit ?? "unknown"}`);
  console.log(`Exercises     : ${index.length}`);
  console.log(`Languages     : ${languageMeta.map((lang) => lang.code).join(", ")}`);
  console.log(`WebP stills   : ${copies.size} (${(imageBytes / 1024 / 1024).toFixed(1)} MB)`);
  console.log("Premium media : excluded");
  console.log(`Wrote         : ${OUT_DATA} and ${OUT_MEDIA}`);
}

const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  main().catch((error) => {
    console.error(`\n${error.stack ?? error.message}\n`);
    process.exit(1);
  });
}
