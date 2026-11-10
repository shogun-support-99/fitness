#!/usr/bin/env node
/**
 * Link and asset checker.
 *
 * Walks the HTML files and confirms every local href/src actually exists on
 * disk, and that relative links stay inside the site. Runs in CI so a renamed
 * asset cannot silently ship a broken page.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const IGNORED = new Set([".git", "node_modules", "tests", "scripts", ".github"]);

/**
 * Directories whose HTML is generated rather than authored. `android` holds the
 * native shell plus Gradle's build output, and the Gradle `syncWebAssets` task
 * copies the whole web app into `android/app/src/main/assets/` at build time —
 * scanning those would report the same links twice and flag the deliberately
 * external `../sitemap.xml` / `../` references in a copy nobody edits.
 */
const SKIP_DIRS = ["build", ".gradle", "intermediates", "generated", "reports", "outputs", "tmp"];
const SKIP_PATHS = ["android/app/src/main/assets"];

function skipPath(rel) {
  const parts = rel.split("/");
  if (SKIP_DIRS.some((part) => parts.includes(part))) return true;
  return SKIP_PATHS.some((p) => rel === p || rel.startsWith(`${p}/`));
}

async function walk(dir, rel = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const full = join(dir, entry.name);
    // Compared with forward slashes so the skip list is platform independent.
    const relFull = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (skipPath(relFull)) continue;
      out.push(...(await walk(full, relFull)));
    } else if (entry.name.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

/** Pull href/src values out of HTML, ignoring external and fragment links. */
function extractLinks(html) {
  const pattern = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  const links = [];
  let match;
  while ((match = pattern.exec(html)) !== null) links.push(match[1]);
  return links;
}

function isExternal(link) {
  return /^(?:https?:)?\/\//i.test(link) || /^[a-z][a-z0-9+.-]*:/i.test(link);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const problems = [];
let checked = 0;

for (const file of await walk(root)) {
  const html = await readFile(file, "utf8");
  const dir = dirname(file);

  for (const raw of extractLinks(html)) {
    if (raw.startsWith("#") || raw.startsWith("mailto:") || isExternal(raw)) continue;

    const [pathPart] = raw.split("#");
    if (!pathPart) continue;

    checked += 1;
    const target = resolve(dir, pathPart);

    // Never allow a link to escape the repository root.
    const rel = relative(root, target);
    if (rel.startsWith("..") || rel.split(sep)[0] === "..") {
      problems.push(`${relative(root, file)}: link escapes the site root -> ${raw}`);
      continue;
    }

    if (await exists(target)) continue;

    // Directory links are fine when they resolve to an index.html.
    if (await exists(join(target, "index.html"))) continue;

    problems.push(`${relative(root, file)}: missing local target -> ${raw}`);
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} broken local link(s):\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error("");
  process.exit(1);
}

console.log(`OK — ${checked} local link(s) resolve.`);
