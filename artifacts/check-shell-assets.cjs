/*
 * Verifies every local asset reference the app shell makes actually resolves
 * against the tree Gradle stages into the APK.
 *
 * The shell is served from https://appassets.androidplatform.net/app/, so each
 * reference must be resolved against that origin and directory exactly as the
 * WebView would, then found under the staged assets. `node` is the only
 * dependency; this is a debug tool, not shipped app code (see AGENTS.md).
 *
 * Only references the shell has to serve itself are required to resolve:
 * stylesheets, scripts, fonts, images and the web manifest. Sitemap hints and
 * `<a href="../">` links deliberately leave for the public site, and
 * MainActivity routes them to the browser, so they are reported separately.
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.argv[2] || ".";
const ORIGIN = "https://appassets.androidplatform.net";
const BASE = `${ORIGIN}/app/`;
const STAGED = path.join(ROOT, "android/app/src/main/assets");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const staged = new Set(
  walk(STAGED).map((f) => path.resolve(f).slice(path.resolve(STAGED).length).replace(/\\/g, "/")),
);

// References the WebView shell must serve locally.
const LOCAL_KINDS = new Set([
  "stylesheet",
  "script",
  "preload",
  "icon",
  "image",
  "manifest",
  "apple-touch-icon",
  "stylesheet-url",
]);

const found = new Map();
function collect(file, kind, ref) {
  if (!/^(https?:|data:|#|mailto:|tel:|blob:|about:)/i.test(ref)) {
    if (!found.has(ref)) found.set(ref, { kind, file });
  }
}

const html = fs.readFileSync(path.join(ROOT, "app/index.html"), "utf8");
for (const tag of html.matchAll(/<(?:link|script|img)\b[^>]*>/g)) {
  const markup = tag[0];
  const isLink = markup.startsWith("<link");
  const rel = (/rel\s*=\s*["']([^"']+)["']/.exec(markup) || [, ""])[1].trim();
  const ref = (/(?:href|src)\s*=\s*["']([^"']+)["']/.exec(markup) || [])[1];
  if (!ref) continue;
  const kind = isLink ? rel || "link" : markup.startsWith("<script") ? "script" : "image";
  collect(path.relative(ROOT, path.join(ROOT, "app/index.html")), kind, ref);
}
for (const tag of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/g)) {
  collect("app/index.html", "anchor", tag[1]);
}
const css = fs.readFileSync(path.join(ROOT, "app/css/app.css"), "utf8");
for (const tag of css.matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g)) {
  collect("app/css/app.css", "stylesheet-url", tag[1]);
}

let resolved = 0;
const missing = [];
const external = [];
for (const [ref, meta] of found) {
  let href;
  try {
    href = new URL(ref, BASE).pathname;
  } catch {
    continue;
  }
  if (!LOCAL_KINDS.has(meta.kind)) {
    external.push({ ref, href, ...meta });
    continue;
  }
  if (staged.has(href)) resolved += 1;
  else missing.push({ ref, href, ...meta });
}

console.log(`resolved locally: ${resolved}`);
console.log(`missing:          ${missing.length}`);
for (const item of missing) {
  console.log(`  ${item.kind}: ${item.ref} -> ${item.href}   (from ${item.file})`);
}
console.log(`left to the browser by design: ${external.length}`);
for (const item of external) {
  console.log(`  ${item.kind}: ${item.ref} -> ${item.href}   (from ${item.file})`);
}
process.exit(missing.length === 0 ? 0 : 1);
