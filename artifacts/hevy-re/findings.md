# Hevy 3.2.7 APK — REA reverse-engineering findings

Source artifact (reference only, never committed — proprietary):

```
C:\Users\dell\Downloads\com.hevy_3.2.7-3440406_1arch_1dpi_1lang_3915700ed0abcfcc78ceaafb659732ab_apkmirror.com.apkm
76.37 MB, APKMirror split-APK bundle (apkm v5)
```

Extracted to `%TEMP%\opencode\hevy-extract\bundle` (rename `.apkm` → `.zip` first;
PowerShell `Expand-Archive` only accepts `.zip`).

| Part | Bytes | Contents used |
| --- | --- | --- |
| `base.apk` | 72,493,257 | `assets/index.android.bundle` (Hermes), `assets/widgetPreviewData.json`, `assets/fonts/*` |
| `split_config.arm64_v8a.apk` | 20,904,476 | native libs (not inspected) |
| `split_config.xxhdpi.apk` | 34,457,956 | 775 drawables, incl. the muscle-heatmap set |
| `split_config.en.apk` | 123,289 | English strings |

`bundle/info.json` (verbatim, evidence):

```json
{
  "apkm_version": 5,
  "apk_title": "Hevy - Gym Log Workout Tracker 3.2.7 (arm64-v8a) (480dpi) (Android 7.0+)",
  "app_name": "Hevy - Gym Log Workout Tracker",
  "release_version": "3.2.7",
  "variant": "(arm64-v8a) (480dpi) (Android 7.0+)",
  "versioncode": "3440406",
  "pname": "com.hevy",
  "post_date": "2026-11-09 20:04:13",
  "capabilities": [],
  "languages": ["en"],
  "arches": ["arm64-v8a"],
  "dpis": ["480"],
  "min_api": "24",
  "accent_color": "000000",
  "apk_id": 17152286,
  "release_id": 17152287
}
```

`assets/app.config` (verbatim):

```json
{"name":"Hevy","slug":"pump","android":{"package":"com.hevy"},"ios":{"bundleIdentifier":"com.hevyapp.hevy"},"extra":{"eas":{"projectId":"447faa45-5117-46b0-98a8-863deae6c626"}},"owner":"hevy-organization","version":"1.8.1","sdkVersion":"54.0.0","platforms":["ios","android"]}
```

Expo SDK 54.0.0, React Native Hermes.

## REA limits encountered (recorded, not worked around silently)

* `open_binary` on `assets/index.android.bundle` →
  `target_unavailable / unsupported binary format (reason: unsupported binary format, constraint: file_format_rejected)`.
  Confirmed Hermes bytecode by magic bytes `c6 1f bc 03` in the first 64 bytes.
* `recover_javascript_sources` requires Wakaru ^1.13.0 + Linux x64 + `util-linux prlimit`,
  so it cannot run on this Windows host.
* Therefore bundle analysis is **string-table extraction** from the Hermes string pool
  (`56,591` printable runs) plus resource-name enumeration. Quotes below are byte-exact
  substrings of the bundle, not reconstructions.

## Design tokens

* Accent blue: **`#1382F3`** — one occurrence in the bundle, adjacent to the community
  guideline strings and a UUID. `#2196F3` appears twice, both times as the React Native
  Android default (`android.R.color`/`tabWidget` default) rather than Hevy's own accent.
* Fonts shipped in `base.apk`: **Figtree Regular / Medium / SemiBold / Bold** (OFL, SIL Open
  Font License — self-hostable), plus the IMG.LY editor faces. Figtree is the Hevy UI face.
* Media CDN: `https://d2l9nsnmtah87f.cloudfront.net/exercise-assets/` and
  `/exercise-thumbnails/…_thumbnail_@3x.jpg`. IronLog's local `app/media/gymvisual/`
  GIF+JPG set already mirrors the same `NNNN-Slug_Name_Muscle_thumbnail` naming.

## Data model (from `assets/widgetPreviewData.json`, verbatim keys)

```json
{
  "workoutDayStats": [ { "date": "2024-08-04", "volumeKg": 2205, "workouts": 1,
                         "sets": 14, "reps": 168, "durationSeconds": 3679 } ],
  "latestRoutines": [ { "id": "c7596008-04ce-4dcb-b32a-6f1a1caa94ee", "title": "wednesday" } ],
  "routines":         [ { "id": "1f63984c-…", "title": " legs", "index": 2, "folderId": "521328" } ],
  "folders":          [ { "id": "…", "title": "…", "index": 0 } ],
  "streakLength": 3,
  "latestWorkoutTimeISO": "…",
  "weightUnit": "kg",
  "weekdayIndex": 4
}
```

So the widget — the only machine-readable surface in the APK — computes exactly five
per-day scalars: **volumeKg, workouts, sets, reps, durationSeconds**, and a routine is
`{id, title, index, folderId?}`. Volume is `Σ weight × reps` over completed sets
(2,205 kg / 14 sets / 168 reps on 2024-08-04 ⇒ 13.17 kg per rep, consistent with
`weight × reps` including partials).

## Logger semantics (string-exact)

| Hevy string | Meaning |
| --- | --- |
| `Start Empty Workout` | primary empty-session CTA; bundle copy: `Starting a workout is easy! Just tap "Start Empty Workout" and start tracking your sets.` |
| `Start Routine` | start from a saved routine |
| `Finish Workout` | completes the session |
| `wearable.logWorkoutScreen.discardWorkoutDialog.title` | discard confirmation |
| `Resume Workout` | return to the live session (widget + mini player) |
| `logWorkout.addExercise.button`, `Add Exercise` | picker entry point |
| `Add Set`, `setRowColumnStyles` | set row + its column layout identifier |
| `Set %{setNumber}: %{weight}%{weightUnit} x %{reps} reps` | per-set announce/summary format |
| `Delete Set %{setNumber}: %{reps} reps` | set-delete variant |
| `%{setNumber} einstellen: %{weight}%{weightUnit} x %{reps} Wiederholungen` | German equivalent, confirms the same field order |
| `Rest: %{value}`, `Rest time is over!`, `Timer de descanso` | rest-timer labels |
| `autoRestTimer`, `settings_restTimer_subtitle_part1_android`, `wearable.restTimerCompleteNotification` | automatic rest timers + notification copy |
| `advancedStats.muscleDistribution`, `SharingMuscleDistributionAsset` | Profile muscle-distribution chart and its share card |
| `Body.info.warmupExcluded`, `Check Set Volume is the aggregate of all completed sets` | volume excludes warm-up sets |
| `%{numberOfRoutines} Routines`, `Routines (%{routineCount})`, `setsCount` | routine/set counters |

Set-row column header vocabulary (Hevy order): **`Set` · `Previous` · `KG`/`LBS` · `REPS` · `✓`**.

## Muscle anatomy (drawable enumeration, `split_config.xxhdpi.apk`, 775 entries)

Heatmap naming convention:

```
src_components_muscleheatmap_assets_{male|female}_{muscle}_{back|front}.png
```

Muscle keys: `abdominals, abductors, adductors, biceps, body, calves, chest,
forearms, glutes, hamstrings, lats, lowerback, neck, quadriceps, shoulders, traps,
triceps, upperback`.

Single-muscle icons use `src_styleguide_assets_{male|female}{muscle}.png`.
Tab bar icons are `tabbarhome`, `tabbarworkout`, `tabbarprofile`, `tabbarcoach`
(+ `active` variants) — Hevy's bottom bar is **Home · Workout · Coach · Profile**.

`export const MUSCLES` in IronLog's `app/js/stats.js` and the SVG silhouettes in
`app/js/views/heatmap.js` follow this exact front/back, male/female split.

## Consequence for the IronLog rebuild

Every one of those behaviours already maps onto IronLog's offline store
(`app/js/store.js`, schema `ironlog.v1`), its rest timer (`app/js/timer.js`) and its
`data-action` delegated listener, so the rebuild is a presentation-layer change:
true-black ground, `#161618` cards, `#2196F3` primary actions (spec) over Hevy's
`#1382F3` (observed accent), Figtree-class geometry, the Hevy set-row column order,
and a phone-first 390×844 shell.
