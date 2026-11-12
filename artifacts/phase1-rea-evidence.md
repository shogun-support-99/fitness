# IronLog Phase 1 — REA evidence and host limitation (verified 2026-11-12)

## Target artifact availability

Phase 1 names `./hevy.apk` as the REA target. Verified on this host:

    PS> Get-ChildItem -Recurse -Include *.apk,*.apkm,*.apks,*.xapk

    FullName                                          Length
    C:\...\android\app\build\outputs\apk\release\app-release.apk   151121710

The only APK present is IronLog's own release build output. **No Hevy
`.apk`/`.apkm`/`.apks`/`.xapk` exists anywhere on this filesystem.** This is
by design: reference APKs are never committed to the repository, so the
analysis target does not survive into a fresh working copy.

## REA capability on this host (win32)

From the REA tool catalog, not assumption:

- `recover_javascript_sources` — "Recover readable modules from local UTF-8
  JavaScript bundles ... Requires caller-supplied Wakaru ^1.13.0 (verified
  1.14.0), **Linux x64 and util-linux prlimit**."
  Host platform is `win32`, so this provider cannot execute here.
- `decode_android_resources` — decodes APK resources with apktool. Available in
  principle, but has no target: without a Hevy APK there is nothing to decode.

## Consequence for the reconstruction

Phase 1 could not be executed. No Hevy JavaScript bundle, component hierarchy,
set-logging matrix, rest-timer thread logic, volume algorithm, or SVG muscle
coordinate set was extracted, because neither the input file nor the Linux-only
recovery provider is available on this host.

Parity for phases 2–4 was therefore driven by the Hevy-derived UI contract
already encoded in the repository (OLED tokens, 5-screen system, set-row
grammar `SET | PREVIOUS | KG | REPS | ✓`, front/back silhouettes,
rest-timer pills, mini-player) plus live behavioural verification of IronLog's
own implementation. Every 1:1 claim below is backed by runtime evidence from
the Playwright audit, not by decompiled Hevy sources.

## To close Phase 1 properly

Provide either:
1. `hevy.apk` (or the `.apkm`/`.xapk` bundle) placed outside the repo working
   tree, plus a Linux x64 host with Wakaru + util-linux, or
2. a pre-extracted Hevy JS bundle at a local path for
   `analyze_javascript_application` (works from a local extracted JS app
   without executing it, and is not Linux-gated).

Until one of those is supplied, this phase remains an explicit,
host-verified limitation rather than a skipped step.
