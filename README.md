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
- **Progress views** — weekly volume bars, muscle-group balance, lifetime totals, and a
  training-day streak. Charts are inline SVG, so no charting library loads.
- **Exercise library** — **1,406 unique exercises**: 90 curated staples plus a 1,316-record
  MIT data catalogue, with name collisions resolved without breaking saved exercise IDs.
  Search is relevance-ranked and grouped by muscle and equipment. Custom exercises
  persist alongside them.
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
# tests 312
# suites 65
# pass 312
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

## Exercise catalogue

The library combines two sources:

| Source | Count | Ships as |
| --- | --- | --- |
| Curated starter library | 90 | inline in `app/js/exercises.js` |
| [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) | 1,316 | MIT data/instructions in generated JSON |
| **Merged library** | **1,406** | 126 name collisions resolved without changing existing IDs |

The catalogue is fetched after first paint rather than imported, and a failed fetch leaves
the curated library fully working. Instruction text is split by language and loaded only
when an exercise detail needs it — not as one up-front multi-megabyte bundle. Sources
without a requested translation fall back to English.

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

The app and landing page share one bright, focused training-product system, built on the
patterns of Hevy's public front end — Figtree, a single blue action colour (#008CFF),
near-white ground, soft grey pill secondaries, 16px cards, green completed sets and blue
tabs — implemented with IronLog's own markup, local-first architecture and licensed media. The workflow centres on reusable routines, an empty
workout, previous-performance columns, completed-set checks, automatic rest and a clear
session summary rather than on decorative dashboards.

| | |
| --- | --- |
| Grounds | cool white `#f5f6f8` with white product cards; `#111315` in dark mode |
| Action and data | bright blue `#1b96e8` for primary actions, links, timers and charts |
| Completed sets | green checks and a restrained green row wash |
| Navigation | six desktop destinations; Home, Workout, Exercises and Profile on mobile |
| Type | self-hosted Geist, with tabular figures for measurements and updating values |
| Geometry | compact 12px cards, 8px controls, thin borders and floating sheets/toasts |
| Product artwork | working interface samples, licensed exercise stills and original SVG diagrams |

The light theme is the default. Dark and match-system appearances use the same blue
actions and green completion feedback, and an existing browser preference is respected
before first paint. Responsive layouts keep the logger's Set / Previous / Weight / Reps /
Done workflow usable on narrow screens.

Both faces are **self-hosted** from `fonts/` under the SIL Open Font License, so the site
makes no request to any third party — including for its type. See [`NOTICE`](./NOTICE).
Browser surfaces are themed from the palette rather than left at their defaults: text
selection, the caret, scrollbars, focus rings, underline offset and tabular numerals.
There is a print stylesheet, because a log is a thing people print.

## Motion

Animation is authored around the product's central ritual: **a completed set connects
logging, rest, records and progress**. The landing page has two native-scroll scenes:
a three-frame set/rest/progress reel and a single session interface inspected at three
distances. Their transform origins are solved from the rendered timer and record values,
so the zoom lands on the actual data at every viewport. A quiet reading section separates
the two held scenes.

| Element | Motion |
| --- | --- |
| Landing hero | native scroll scrubs three working product frames; completing the sample advances to rest |
| Landing showcase | pans and scales from the session to its timer, then to its estimated-1RM record |
| Interface controls | shutter/clip reveals, short press feedback and visible focus |
| A chart bar | grows from the baseline, staggered |
| A personal record | **stamped** — overshoot and rotation, with bounded linework |
| SVG linework | draws itself via `stroke-dashoffset` |
| A figure | rolls with tabular numerals and thousands separators intact |
| The rest timer | real countdown state with a draining progress rule and final-fifth warning |
| A completed set | the tick draws its own check |
| App navigation | one active line travels between destinations; route changes are short and never replay on input updates |

The hero sample is functional, not a mock clock: editing weight/reps recomputes volume and
the Epley estimate, and completing the set starts an actual 90-second countdown. The
85 kg × 6 reps example therefore produces 510 kg of volume and a 102 kg estimated 1RM.

Three rules hold everywhere:

1. **Content has a readable default and a finished state.** No script, a failed module or
   reduced motion never leaves a blank stage or hides the product behind an entrance.
2. **Large scene motion stays compositor-friendly.** Scroll work uses one
   `requestAnimationFrame` pass and native scrolling; transforms, opacity, clip paths and
   SVG strokes do the visual work. Countdown progress updates at clock frequency.
3. **`prefers-reduced-motion` removes non-essential motion and leaves the final state.**
   Loops stop outright, scene content becomes a normal readable composition, and useful
   state changes remain visible.

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
required attribution retained. If you independently hold rights to other media,
`app/media/README.md` documents the override slot and required credit.

## Architecture notes

- **No build step.** Plain ES modules loaded by the browser. Nothing to compile, bundle
  or version, so deployment cannot fail on a toolchain change.
- **No runtime dependencies.** No framework, no charting library, no icon font, no
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

Pages is configured with **Source: GitHub Actions** on this repository. Run history:
[Actions](https://github.com/shogun-support-99/fitness/actions).

## Privacy

No data leaves the device. There is no backend, no analytics, no cookies and no
third-party network request; all fonts, data and licensed illustrations are self-hosted. Workouts are stored under a single versioned local storage key and can
be exported or erased from the app's settings screen.

The trade-off is worth stating plainly: because storage is per-browser and per-origin,
clearing site data removes your log, and it does not sync between devices. Export a backup
if your history matters to you.

## License

MIT — see [LICENSE](./LICENSE).

The exercise catalogue data and instruction text come from
[hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset), also MIT
licensed (© 2026 Hasan Emir Yıldırım), and are attributed in [`NOTICE`](./NOTICE) and in the
app itself. That project's exercise media is © Gym Visual and is **not** covered by its MIT
grant; it is redistributed here under a media licence held by the app operator, with
attribution retained. See [Exercise catalogue](#exercise-catalogue) and
[`NOTICE`](./NOTICE).

This is an independent project. It is not affiliated with, endorsed by, or derived from
any other fitness product.
