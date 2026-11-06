import test from "node:test";
import assert from "node:assert/strict";
import { prefersReducedMotion } from "../app/js/motion.js";

test("browser motion stays enabled when the OS requests reduced motion", () => {
  const originalWindow = globalThis.window;
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  try {
    assert.equal(prefersReducedMotion(), false);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
