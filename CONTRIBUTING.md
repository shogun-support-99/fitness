# Contributing to IronLog

IronLog is a static site: no build step at runtime, no framework, no backend. That makes
contributions easy — most changes are a single file plus a test.

## Ground rules

- **Privacy is a feature.** No analytics, no third-party requests, no accounts, no network
  calls in the app shell. If a change needs the network, it must be opt-in, same-origin, and
  degrade gracefully (see how `app/js/catalogue.js` fetches the exercise data).
- **Offline is a promise.** Anything in the app shell must be added to the `PRECACHE` list in
  `app/sw.js`, and the `CACHE` version must be bumped in the same commit, or the service
  worker will serve a stale shell for one extra load.
- **Media licensing is enforced in CI.** Binary media may only live in
  `app/media/gymvisual/` (licensed) and `assets/img/` / `app/icons/` (original artwork).
  The workflow in `.github/workflows/deploy.yml` rejects anything else — don't commit
  screenshots or downloaded media.
- **Tests run in Node, no dependencies.** Add or update tests in `tests/` using
  `node:test`. Run them with `node --test "tests/*.test.js"`.

## Workflow

1. Fork, branch, and keep changes small.
2. Make the change. If you touch `src/tailwind.css`, run `npm install && npm run build:css`
   so the committed `assets/css/tailwind.css` stays in sync.
3. Run the checks locally — they are the same ones CI runs:

   ```bash
   node --test "tests/*.test.js"          # unit tests
   node scripts/check-links.mjs           # every local link in every HTML file resolves
   for f in $(find app assets scripts -name '*.js'); do node --check "$f"; done
   ```

4. Update `README.md` when behaviour changes (features list, test count, project layout).
5. Open a pull request against `main`. The `Test and deploy` workflow runs the checks above
   plus the licensing assertions, then deploys to GitHub Pages on merge.

## Where things live

| Path | What it is |
| --- | --- |
| `index.html`, `assets/` | Landing page (plain HTML/CSS/JS) |
| `app/index.html` | App shell (sidebar, outlet) |
| `app/js/main.js` | Bootstrap, render loop, all `[data-action]` handlers |
| `app/js/store.js` | Persistence (localStorage), import/export, unit conversion |
| `app/js/stats.js` | Pure training maths (1RM, volume, streaks, weeks) |
| `app/js/timer.js` | Rest timer (injectable clock) |
| `app/js/plates.js` | Plate calculator maths |
| `app/js/views/` | One pure render function per screen |
| `app/js/diagrams.js` | Original SVG movement diagrams |
| `app/sw.js` | Service worker — bump `CACHE` when shell assets change |
| `scripts/build-exercise-data.mjs` | Regenerates `app/data/` from the MIT dataset |
| `tests/` | Node test-runner suites |

## Good first issues

- Views are pure functions of the store, so `tests/views.test.js` is the place to extend
  coverage when you change markup.
- The exercise data is generated — never hand-edit `app/data/*.json`; change
  `scripts/build-exercise-data.mjs` and regenerate.
