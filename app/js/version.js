/**
 * IronLog — build identity.
 *
 * The deploy workflow rewrites both values from the commit being published.
 * `VERSION` is a short SHA that matches the service-worker cache stamp, and
 * `BUILT_AT` is the ISO timestamp of that deploy. They are shown in Settings
 * and make a stale cached shell easy to spot.
 *
 * This file is intentionally tiny and dependency-free: the service worker
 * precaches it with the shell.
 */

export const VERSION = "dev";
export const BUILT_AT = "";
