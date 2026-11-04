/**
 * Shell/static-build invariants that are easy to break silently.
 *
 * These are not app-logic tests: they guard the files the service worker and
 * the deploy workflow depend on, because a missing precache entry or an
 * unstamped cache name turns into a stale app for every returning visitor.
 */

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

import { BUILT_AT, VERSION } from "../app/js/version.js";

const root = fileURLToPath(new URL("../", import.meta.url));

test("build identity exports strings for Settings", () => {
  assert.equal(typeof VERSION, "string");
  assert.ok(VERSION.length > 0);
  assert.equal(typeof BUILT_AT, "string");
});

test("service worker precaches version.js and every shell asset exists", async () => {
  const source = await readFile(path.join(root, "app/sw.js"), "utf8");
  assert.match(source, /const CACHE = "ironlog-shell-[^"]+";/);

  const block = source.match(/const PRECACHE = \[([\s\S]*?)\];/);
  assert.ok(block, "PRECACHE array not found");
  const entries = [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(entries.includes("./js/version.js"), "version.js must be precached");
  assert.ok(entries.includes("./data/exercises-index.json"), "catalogue index must be precached");

  for (const entry of entries) {
    const target = path.resolve(root, "app", entry);
    await access(target).catch(() => {
      assert.fail(`PRECACHE entry does not resolve: ${entry} -> ${target}`);
    });
  }
});

test("deploy stamps the cache name and version from the pushed commit", async () => {
  const workflow = await readFile(path.join(root, ".github/workflows/deploy.yml"), "utf8");
  assert.match(workflow, /short="\$\{SHA::12\}"/);
  assert.match(workflow, /ironlog-shell-\$\{short\}/);
  assert.match(workflow, /app\/js\/version\.js/);
});
