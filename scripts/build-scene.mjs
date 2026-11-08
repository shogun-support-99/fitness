#!/usr/bin/env node
/**
 * Bundle the React Three Fiber hero into a single committed ES module.
 *
 * Visitors get a static file; there is no runtime build step. Rebuild with
 * `npm run build:scene` after editing anything under `src/scene` or
 * `src/components`.
 */

import { build } from "esbuild";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

await build({
  absWorkingDir: root,
  entryPoints: [resolve(root, "src/scene/mount.jsx")],
  outfile: resolve(root, "assets/js/scene3d.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  jsx: "automatic",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  banner: {
    js: "/*! IronLog hero — built from src/ by scripts/build-scene.mjs. Do not edit directly. */",
  },
  logLevel: "info",
});
