<div align="center">

<img src="./assets/img/logo.svg" alt="IronLog" width="88" height="88" />

# IronLog

### Log workouts. Get stronger.

**Routines, previous numbers, rest and progress — all yours.**

[**Open the app**](https://shogun-support-99.github.io/fitness/app/) · [**Landing page**](https://shogun-support-99.github.io/fitness/)

Free · No account · No server · Works offline · MIT licensed

</div>

---

## Live links

| | URL |
| --- | --- |
| 🏠 **Landing page** | https://shogun-support-99.github.io/fitness/ |
| 🏋️ **The app** | https://shogun-support-99.github.io/fitness/app/ |

Both are served from this repository by GitHub Pages. **Every push to `main` redeploys
automatically** — see [Deployment](#deployment).

## What it is

IronLog is a workout journal for strength training. It records what you lifted, how many
reps you got, how long you rested, and whether you beat your previous best — then turns
that into volume trends and personal records you can actually read.

It is a static web app with **no backend**. There is no account system, no database and
no analytics script, because there is no server to have them on. Your training history
lives in your browser's local storage, and you can export all of it as JSON at any time.

## Features

- **Fast set logging** — weight and reps per set, ticked as you go, with your previous
  performance shown beside each field so you never have to recall last week's numbers.
- **Live estimated 1RM** — Epley formula, recalculated as you type.
- **Rest timer** — starts automatically when you complete a set, or on demand. Add 15
  seconds mid-count, and it survives a page reload.
- **Personal records** — three independent records per exercise: heaviest weight, most
  reps, and highest estimated 1RM. The session summary names exactly which you broke.
- **Progress views** — a training-year heatmap on Home, weekly volume bars, muscle-group
  balance, lifetime totals, and a training-day streak. Charts are plain HTML squares,
  columns and bars, so no charting library loads.
- **Exercise library** — **1,316 exercises** from a single MIT data catalogue, deduplicated
  by normalised name so saved exercise IDs never change. Search is relevance-ranked and
  grouped by muscle and equipment. Rows carry labelled animated Gym Visual thumbnails, and
  custom exercises persist alongside them.
- **Step-by-step instructions across 10 languages** — English, Spanish, French, Italian,
  Polish, Russian, Turkish, Chinese, Hindi and Korean. Each language pack downloads only
  when needed, with English fallback.
- **Exercise detail** — target muscle, secondary muscles, body part and equipment, written
  instructions, plus a licensed Gym Visual animation or an original movement diagram when
  no licensed media is available.
- **Reusable routines** — start empty, repeat your last workout with its sets and weights
  prefilled, or use Push, Pull, Legs and Full body routines from Home or Workout.
- **Focused navigation** — Home, Workout, Exercises and Profile tabs on mobile, with
  History and Settings alongside them on larger screens.
- **Motion with a job** — Tailwind-compiled keyframes and utilities handle entrances,
  floating accents, sheens and reveals, while the authored app motion still runs on
  `IntersectionObserver` and yields entirely to `prefers-reduced-motion`.
- **Installable PWA** — a manifest with 192/512 maskable icons and shortcuts to Workout
  and Library, plus a service worker that precaches the shell for offline use.
- **Export, import, erase** — your whole history is one JSON document.

## Try it

Open **[the app](https://shogun-support-99.github.io/fitness/app/)** and:

1. Tap **Start empty workout** (or pick a split).
2. Add an exercise — search "bench", pick **Barbell Bench Press**.
3. Enter `80` and `8`, tick the set. The rest timer starts and the 1RM appears.
4. Add a couple more sets, then **Finish workout** to see the summary.
5. Open **Profile** to see the records and weekly volume.

Everything is written to local storage immediately, so a closed tab never costs a session.

## Running it locally

There is no build step and no dependency to install. Serve the repository root with any
static file server:

```bash
git clone https://github.com/shogun-support-99/fitness.git
cd fitness
python3 -m http.server 8080
```

Then open http://localhost:8080/ for the landing page and http://localhost:8080/app/ for
the app. Relative paths are used throughout, so the site works from any base path.

## Tests

The training maths, persistence layer, rest timer, exercise library, router and HTML
escaping are unit-tested in Node using the built-in test runner — no test framework to
install:

```bash
node --test "tests/*.test.js"
```

```
# tests 310
# suites 62
# pass 310
# fail 0
```

The tests cover the behaviour that is easy to get subtly wrong: Epley rounding without
binary-float drift, personal records ignoring unticked and incomplete sessions, streak
logic across missed days, ISO week bucketing, corrupt-payload recovery, storage quota
failure, timer completion semantics, source-specific instruction routing, merged-library
ID stability, and the provenance/licensing checks for every committed piece of licensed
media.

## Project layout

```
.
├── index.html                 # Landing page
├── assets/
│   ├── css/landing.css        # Landing design system
│   ├── css/tailwind.css       # Compiled Tailwind layer: motion + block components
│   ├── js/landing.js          # Menu, preview tabs, reveal-on-scroll
│   └── img/                   # Logo and OG cover (inline SVG, no CDN)
├── app/                       # The application
│   ├── index.html             # App shell: sidebar, workspace top bar, outlet
│   ├── manifest.json          # PWA manifest
│   ├── css/app.css            # Working component and motion primitives
│   ├── css/kinetic.css        # Bright blue product theme, dark mode and responsive shell
│   ├── data/                  # Generated exercise catalogue (see below)
│   │   ├── exercises-index.json   # metadata for 1,316 MIT data records
│   │   ├── steps.<lang>.json      # original instructions, lazy-loaded
│   │   └── catalogue-meta.json    # original provenance and licensing record
│   └── js/
│       ├── main.js            # Bootstrap, render loop, event delegation
│       ├── store.js           # Persistence (injected storage)
│       ├── stats.js           # Pure training maths
│       ├── timer.js           # Rest timer (injected clock)
│       ├── exercises.js       # Curated starter library + search ranking
│       ├── catalogue.js       # External catalogue: fetch, merge, instructions
│       ├── router.js          # Hash router
│       ├── ui.js              # Escaping, icons, chart primitives
│       └── views/             # home, routines, workout, history, stats, library, settings
├── scripts/
│   ├── build-exercise-data.mjs    # Regenerates the original MIT data catalogue
│   ├── check-links.mjs            # CI check: every local link resolves
│   └── setup-github.sh            # One-shot repo/profile makeover
├── fonts/                     # Self-hosted Figtree + Geist Mono (SIL OFL) and their licences
├── NOTICE                     # Third-party data/media attribution and exclusions
├── tests/                     # Node test-runner suites
└── .github/workflows/deploy.yml
```

## Building the CSS

The site is served as plain static files with no build step at runtime. Tailwind is an
authoring tool only: `src/tailwind.css` is compiled ahead of time and the output is
committed, so GitHub Pages serves it directly and the service worker precaches it.

```sh
npm install
npm run build:css     # rewrites assets/css/tailwind.css
```

Preflight is disabled, so Tailwind contributes utilities, keyframes and the document
block components (`feature-row`, `notion-callout`, toggle rows) without resetting the
hand-written design system.

## Building the hero 3D scene

The landing hero renders the authored marble golem at `assets/models/golem.glb`
with React Three Fiber. The scene is online-first: the 17 MB GLB, its embedded
PBR textures and the studio HDR stream from the same origin and are preloaded
from the document head. The page stays readable without JavaScript or WebGL —
the card keeps its "IL" fallback — but the full experience is the live 3D one.

Like the CSS, the scene bundle is an authoring-time step whose output is
committed, so GitHub Pages serves a plain static file with no runtime build:

```sh
npm run build:scene   # rewrites assets/js/scene3d.js from src/scene + src/components
npm run build         # scene bundle, then build:css
```

- `scripts/build-scene.mjs` bundles `src/scene/mount.jsx` + `src/components/Scene3D.jsx`
  with esbuild into `assets/js/scene3d.js`, which the landing page mounts into
  `[data-scene3d]` only when WebGL is available.
- The GLB has no skeleton or animation clips, so `Scene3D.jsx` drives it with
  wrapper-group motion: breathing, cursor look-at, hover lift, press squash, a
  vertex-space chest flex and a periodic CTA guide that turns the golem toward
  "Start logging" or "See how it works" and points a 3D arrow at the button.
- PBR materials keep their authored maps, normal scales and roughness/metalness
  values. Base colour and emissive maps use sRGB; data maps stay linear; every
  texture gets the renderer's maximum anisotropy and every mesh casts/receives
  shadows.
- Lighting combines the PMREM-baked CC0 city HDR at
  `assets/models/potsdamer_platz_1k.hdr` with key, fill and rim lights. If the
  HDR cannot be fetched, the scene falls back to a procedural RoomEnvironment.
- `Box3` framing and a bounding-sphere-derived near/far plane keep the golem
  centred and unclipped at every card aspect ratio. Cursor tracking, CTA
  hover/focus, canvas click-to-flex and OrbitControls (fine pointers only) make
  the character reactive rather than a looping video.

See [`NOTICE`](./NOTICE) for the model provenance and the CC0 HDR dedication.

## Exercise catalogue

The library has a single source:

| Source | Count | Ships as |
| --- | --- | --- |
| [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) | 1,316 | MIT data/instructions in generated JSON |

The generator drops duplicate names (8 skipped) and records the provenance in
`catalogue-meta.json`. The catalogue is fetched after first paint rather than imported;
a failed fetch is reported honestly in the library heading and leaves custom exercises usable.
Instruction text is split by language and loaded only when an exercise detail needs it —
not as one up-front multi-megabyte bundle. Sources without a requested translation fall
back to English.

### Regenerating

```bash
git clone https://github.com/hasaneyldrm/exercises-dataset.git
node scripts/build-exercise-data.mjs --source /path/to/exercises-dataset
```

The generator maps taxonomy, dedupes by normalised name and records provenance in
`catalogue-meta.json`.

### Licensing — source-specific data and media

- **Original catalogue data — MIT, © 2026 Hasan Emir Yıldırım.** Exercise names, taxonomy
  and instruction translations retain their copyright notice in `NOTICE`, generated
  metadata, Settings and relevant exercise details.
- **Original catalogue media — © Gym Visual, licensed by the operator.** The images and
  videos are excluded from the MIT grant, but IronLog's operator holds the media licence,
  so the licensed 180×180 GIFs (and static posters) ship in `app/media/gymvisual/` with
  attribution retained on every record. The generator copies only local referenced files
  and fails closed on remote or raw-upstream media references.
CI and unit tests preserve the Gym Visual media block and the licensed-media directory
allowlist. See [`NOTICE`](./NOTICE) for the complete third-party record.

## Design

The app and landing page share one restrained training-product system: stone-paper
grounds, bottle-green ink, a single yellow signal, and a data green reserved for completed
work and the leading series. There is no brand-coloured button and no rainbow of cards;
weight, reps, volume and records carry the colour. The workflow centres on reusable
routines, an empty workout, previous-performance columns, completed-set checks, automatic
rest and a clear session summary rather than on decorative dashboards.

| | |
| --- | --- |
| Grounds | warm stone `#f2f1ec` with paper `#fbfaf6` surfaces; true neutral darks in dark mode |
| Action | bottle ink `#0f2a1d` for primary actions; yellow `#f6e016` for the one signal |
| Data | deep green `#1f5c3f` for completed sets, the active chart series and record marks |
| Navigation | six desktop destinations; Home, Workout, Exercises and Profile on mobile |
| Type | Figtree on the landing page, Geist in the workspace, Geist Mono for figures |
| Geometry | 8–12px controls and cards, thin rules, no resting shadows and floating sheets/toasts |
| Product artwork | working interface samples, licensed exercise stills and original SVG diagrams |

The light theme is the default. Dark and match-system appearances reuse the same signal and
data hues, and an existing browser preference is respected before first paint. Responsive
layouts keep the logger's Set / Previous / Weight / Reps / Done workflow usable on narrow
screens. The sidebar is docked on the left from 720px up (starting as the icon rail on tablets) and becomes a bottom bar only below 720px.

All faces are **self-hosted** from `fonts/` under the SIL Open Font License, so the site
makes no request to any third party — including for its type. See [`NOTICE`](./NOTICE).
Browser surfaces are themed from the palette rather than left at their defaults: text
selection, the caret, scrollbars, focus rings, underline offset and tabular numerals.
There is a print stylesheet, because a log is a thing people print.

## Motion

Motion is authored around the product's central ritual: **a completed set connects
logging, rest, records and progress**. The landing page uses scroll-triggered reveals, a
working tabbed preview and a live nav marker; the app reveals each route once, staggers the
sidebar destinations, draws the completed-set tick, grows chart bars from the baseline and
stamps a personal record. A rest timer is real countdown state with a draining progress
rule, and a record summary animates once rather than looping.

Three rules hold everywhere:

1. **Content has a readable default and a finished state.** No script, a failed module or
   reduced motion never leaves a blank stage or hides the product behind an entrance.
2. **Motion stays compositor-friendly.** Transforms, opacity, clip paths and short timers
   do the visual work; there is no scroll-jacking and no animation loop left running.
3. **`prefers-reduced-motion` removes non-essential motion and leaves the final state.**
   Loops stop outright, reveals resolve immediately, and useful state changes remain visible.

`app/js/motion.js` declines to start observers and loops under reduced motion, and
disconnects every observer before a re-render so a session left open for an hour does not
accumulate leaks on detached nodes. There is no animation runtime or third-party script.

## Exercise visuals

Dataset entries carry the licensed 180×180 Gym Visual GIFs (with their static poster as
the loading/fallback frame) and the required © Gym Visual credit. Images are lazy-loaded
with explicit dimensions. Entries without licensed media retain the original diagrams
from `app/js/diagrams.js`:

- **Movement diagram** — a lever, arc, travel path and force vector. Ten movement classes
  are derived from category, muscle, equipment, target and name; the drawn load follows
  the same path as the travel line.
- **Muscle graph** — the primary muscle at the centre, secondaries ranged on an ellipse,
  joined by linework that draws in sequence.

Gym Visual's 180×180 GIFs ship under the media licence held by the app operator, with the
required attribution retained on every catalogue record. If you independently hold rights to
other media, `app/media/README.md` documents the override slot and required credit.

## Architecture notes

- **No runtime build step.** Plain ES modules are loaded by the browser; the only compiled
  artefact is the Tailwind CSS file, which is committed so deployment cannot fail on a
  toolchain change.
- **No runtime dependencies.** No framework, no charting library, no icon font, no remote
  webfont. The only requests a page makes are for its own files.
- **Views are pure functions of state.** Each view returns an HTML string from the store;
  behaviour is wired once through a delegated listener keyed on `data-action`. That makes
  re-rendering cheap and the flow easy to follow.
- **Testable seams.** `store.js` takes an injected `Storage` and `timer.js` takes an
  injected clock, so both run in Node against fakes instead of a browser.
- **Escape by default.** All user-supplied text passes through `esc()` before reaching
  `innerHTML`; there is a test asserting a stored-XSS payload is neutralised.
- **Relative URLs everywhere.** The app works at `/`, at `/fitness/`, or from a local
  server without any base-path configuration.

## Deployment

Pushes to `main` deploy automatically via GitHub Actions:

1. **`test`** — runs the unit tests, checks every JS module parses, and verifies all local
   links resolve.
2. **`deploy`** — only on `main`, and only after `test` passes. Uploads the repository to
   GitHub Pages and publishes it.

There is nothing to do manually. Commit to `main` and the site updates itself within a
minute or two. Pull requests run the `test` job without deploying, so a broken change is
caught before it can reach production.

Each deploy stamps the service-worker cache with the commit SHA and rewrites
`app/js/version.js`, so returning visitors are offered a “new version ready” banner and
Settings → About shows the live build. The worker waits for the user to accept an update
rather than swapping modules under an open workout; a first-time install still claims
immediately so offline support works after one visit.

Before announcing a public deployment, complete the operator checklist in
[`docs/LAUNCH.md`](./docs/LAUNCH.md) — especially the **Gym Visual media licence**, the
one-time Pages setting, and the canonical/social URL check.

Pages is configured with **Source: GitHub Actions** on this repository. Run history:
[Actions](https://github.com/shogun-support-99/fitness/actions).

## Privacy

No training data leaves the device. There is no backend, no analytics and no third-party
network request; all fonts, data and licensed illustrations are self-hosted. Workouts are
stored under a single versioned local storage key and can be exported or erased from the
app's settings screen. Full details, including routine hosting request logs, are on the
[privacy and data page](https://shogun-support-99.github.io/fitness/privacy.html).

The trade-off is worth stating plainly: because storage is per-browser and per-origin,
clearing site data removes your log, and it does not sync between devices. Export a backup
if your history matters to you.

## License

MIT — see [LICENSE](./LICENSE).

The exercise catalogue data and instruction text come from
[hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset), also MIT
licensed (© 2026 Hasan Emir Yıldırım), and are attributed in [`NOTICE`](./NOTICE). That
project's exercise media is © Gym Visual and is **not** covered by its MIT
grant; it is redistributed here under a media licence held by the app operator, with
attribution retained on every record and in `NOTICE`. See
[Exercise catalogue](#exercise-catalogue) and [`NOTICE`](./NOTICE).

This is an independent project. It is not affiliated with, endorsed by, or derived from
any other fitness product.
