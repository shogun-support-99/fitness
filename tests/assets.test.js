/**
 * Asset integrity tests: everything the shell references must exist on disk,
 * so a renamed file or a forgotten PRECACHE entry fails CI instead of 404ing
 * for a user. Run: node --test "tests/*.test.js"
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(ROOT, "app");

const read = (p) => readFileSync(join(ROOT, p), "utf8");

describe("service worker precache", () => {
  const sw = read("app/sw.js");
  const precache = sw.match(/const PRECACHE = \[([\s\S]*?)\];/)[1];
  const entries = [...precache.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

  test("every PRECACHE entry exists on disk", () => {
    assert.ok(entries.length > 20, "precache list is populated");
    const missing = entries.filter((e) => !existsSync(resolve(APP, e)));
    assert.deepEqual(missing, [], `missing precache files: ${missing.join(", ")}`);
  });

  test("every app JS module is precached (no stale shell for new modules)", () => {
    const jsFiles = readdirSync(join(APP, "js")).filter((f) => f.endsWith(".js"));
    const views = readdirSync(join(APP, "js/views")).filter((f) => f.endsWith(".js"));
    const all = [...jsFiles.map((f) => `./js/${f}`), ...views.map((f) => `./js/views/${f}`)];
    const missing = all.filter((f) => !entries.includes(f));
    assert.deepEqual(missing, [], `JS modules missing from PRECACHE: ${missing.join(", ")}`);
  });

  test("cache version is bumped and well-formed", () => {
    const m = sw.match(/const CACHE = "ironlog-shell-v(\d+)";/);
    assert.ok(m, "CACHE constant found");
    assert.ok(Number(m[1]) >= 6, "version bumped when shell assets changed");
  });
});

describe("module imports resolve", () => {
  test("every relative import in app/js resolves to a real file", () => {
    const files = [
      ...readdirSync(join(APP, "js")).filter((f) => f.endsWith(".js")).map((f) => `app/js/${f}`),
      ...readdirSync(join(APP, "js/views")).filter((f) => f.endsWith(".js")).map((f) => `app/js/views/${f}`),
      "assets/js/landing.js",
    ];
    const missing = [];
    for (const file of files) {
      const src = read(file);
      for (const m of src.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
        const target = resolve(join(ROOT, dirname(file)), m[1]);
        if (!existsSync(target)) missing.push(`${file} -> ${m[1]}`);
      }
    }
    assert.deepEqual(missing, []);
  });
});

describe("manifest and page assets", () => {
  test("manifest icons and start_url exist", () => {
    const manifest = JSON.parse(read("app/manifest.json"));
    for (const icon of manifest.icons) {
      assert.ok(existsSync(resolve(APP, icon.src)), `icon missing: ${icon.src}`);
    }
    assert.ok(existsSync(resolve(APP, manifest.start_url)));
    for (const sc of manifest.shortcuts ?? []) {
      assert.ok(existsSync(resolve(APP, sc.url.replace(/#.*$/, ""))), `shortcut missing: ${sc.url}`);
    }
  });

  test("preloaded fonts exist", () => {
    for (const page of ["index.html", "app/index.html"]) {
      const html = read(page);
      for (const m of html.matchAll(/<link[^>]+href="(\.\.?\/[^"]*fonts\/[^"]+)"/g)) {
        const target = resolve(join(ROOT, dirname(page)), m[1]);
        assert.ok(existsSync(target), `${page} preloads missing font: ${m[1]}`);
      }
    }
  });

  test("OG image and icons referenced by the landing page exist", () => {
    for (const p of ["assets/img/og-cover.png", "assets/img/og-cover.svg", "assets/img/logo.svg", "assets/img/apple-touch-icon.png"]) {
      assert.ok(existsSync(join(ROOT, p)), `missing ${p}`);
    }
  });

  test("data files referenced by catalogue.js exist", () => {
    for (const f of ["data/exercises-index.json", "data/catalogue-meta.json", "data/steps.en.json"]) {
      assert.ok(existsSync(join(APP, f)), `missing ${f}`);
    }
    const meta = JSON.parse(read("app/data/catalogue-meta.json"));
    for (const lang of meta.languages) {
      assert.ok(existsSync(join(APP, `data/steps.${lang.code}.json`)), `missing steps pack ${lang.code}`);
    }
  });
});
