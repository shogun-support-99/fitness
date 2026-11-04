# Launch checklist

IronLog is a static site with no runtime build step. This checklist is for the person
operating a **public deployment** — not for someone running it locally. Work through it
before announcing the URL.

## 1. Blocking: Gym Visual media licence

The exercise animation GIFs in `app/media/gymvisual/` are © Gym Visual and are **not**
covered by the repository's MIT licence. They are included on the basis that the
operator of this deployment holds a media licence from Gym Visual. See `NOTICE`.

- [ ] Confirm you hold a current Gym Visual licence that covers public web
      redistribution at 180×180 with the attribution retained.
- [ ] If you do not, remove the media and regenerate the catalogue without it (or use a
      build that omits `media`), and update `NOTICE` before publishing. Do not publish
      first and sort out licensing later.
- [ ] Keep `NOTICE`, `app/data/catalogue-meta.json` and the per-record `media.credit`
      fields intact. CI fails if they disappear.

Exercise **data** is MIT-licensed and is fine to redistribute with its copyright notice
retained. The media is the separately licensed part.

## 2. Repository and Pages

- [ ] Push the repository to GitHub.
- [ ] In **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**.
      The workflow tries to enable Pages through the API, but GitHub may refuse; this is
      the one manual step that cannot be automated on every account.
- [ ] Confirm the `test` job passes on the first push: unit tests, `node --check`, local
      link checks, and the media/licensing guards.
- [ ] Confirm the `deploy` job publishes and that the environment URL opens the site.
- [ ] Every later push to `main` deploys automatically. Pull requests run tests only.

## 3. Change the hard-coded public URLs

The project currently points at `https://shogun-support-99.github.io/fitness/`. If the
site moves to another account, organisation or custom domain, update **all** of these
before announcing it:

- [ ] `index.html` — canonical, Open Graph `og:url` / `og:image`, Twitter image URLs.
- [ ] `privacy.html` — canonical and social URLs.
- [ ] `app/index.html` — canonical, `og:url`, `og:image`, manifest/link URLs if needed.
- [ ] `sitemap.xml` — every `<loc>`.
- [ ] `robots.txt` — sitemap URL, if present.
- [ ] `README.md` — live links and clone URL.
- [ ] Optional: replace `assets/img/og-cover.png` with artwork that matches the new name
      or domain, then verify the social preview.

Relative app URLs are intentional and work from any base path; the absolute URLs above
are only for canonical/social metadata and the sitemap.

## 4. First-run and data behaviour

- [ ] Open the deployed app in a **fresh browser profile** (or clear site data). Home
      must show “Your log starts empty”, not sample workouts. There is no demo seeding in
      the code; any workouts you see in your own browser are from your own test sessions.
- [ ] Complete one workout. The first-run panel disappears and the workout appears in
      History and Profile.
- [ ] Reload. The workout is still there.
- [ ] Export JSON, erase all data, then import the file. Workouts and settings return.
- [ ] Open two tabs, log a set in one, and confirm the other notices the change instead of
      overwriting it on its next save.
- [ ] In Settings, confirm **Storage protection** shows a real state (Protected /
      Best effort / Not supported) and that **Protect storage** does not throw.
- [ ] Confirm the **Last backup** row updates after an export, and that an old or missing
      backup produces the warning after a workout exists.
- [ ] Test in a private window. If local storage is blocked, the app must warn that the
      log will vanish when the tab closes rather than silently losing data.

## 5. Updates and the service worker

Each deploy rewrites `app/sw.js`'s `CACHE` with the commit SHA and rewrites
`app/js/version.js` with the short SHA and build time. That means:

- Returning visitors are offered a **“new version ready”** banner instead of being
  silently stranded on an old shell.
- The banner's **Reload to update** posts `SKIP_WAITING`; the new worker takes over and
  the page reloads once.
- Settings → About shows the deployed version, which should match the commit you pushed.
- A first-time visitor still gets the worker claiming immediately, so offline support
  works after one visit.

Verify after a deploy:

- [ ] Settings shows the new short SHA.
- [ ] With the previous version open in a tab, a new deploy eventually shows the banner
      (reopen or wait for the periodic update check).
- [ ] Clicking **Reload to update** loads the new build; dismissing the banner does not
      break the current session.
- [ ] Offline: load the app once, go offline, reload, and confirm the shell opens. The
      library index and core instructions should also work offline after the first visit.
- [ ] If a browser is stuck on an old shell during local testing, bump the local
      `CACHE` suffix in `app/sw.js` (CI replaces it on deploy anyway).

## 6. Smoke test the public site

Run `npm test` and `npm run check` locally first, then repeat on the deployed URL:

- [ ] Landing page: nav links, mobile menu, FAQ, preview tabs, footer and privacy link.
- [ ] App: start empty workout, add an exercise, log a set, rest timer, finish workout.
- [ ] History, Statistics (chart and muscle balance), Exercises search, custom exercise.
- [ ] Settings: units, theme, rest defaults, export, import, erase, privacy link.
- [ ] Browser console: no errors on first load and after a route change.
- [ ] Narrow viewport (360–430px) and desktop (≥1280px): no horizontal scroll, sidebar
      collapse works on desktop, mobile tabs do not cover content.
- [ ] Keyboard: skip link, visible focus, sheets/dialogs close with Escape.
- [ ] Lighthouse/PWA: installable, offline reload works, no third-party network requests
      other than the site's own files.

## 7. Data, privacy and support

- [ ] Publish `privacy.html` and link it from the landing footer and Settings.
- [ ] Keep the medical disclaimer in Settings and on the privacy page. IronLog is a log,
      not medical advice.
- [ ] Decide how users can report problems (the GitHub issue tracker is linked). Never ask
      users to post exported logs publicly; a log contains training and body data.
- [ ] Understand the failure mode: there is no server and no account recovery. A user who
      clears site data or loses a device loses the log unless they exported a backup. Say
      this plainly wherever the app is promoted.
- [ ] If you add analytics, accounts or cloud sync later, update the privacy page and the
      first-run copy **before** shipping the change. The current claims are only true while
      the app remains local-only.

## 8. Before you announce it

- [ ] `npm test` green, `npm run check` green, `node --check` clean in CI.
- [ ] `git status` clean and the deploy commit is the one you intend to publish.
- [ ] Version SHA in Settings matches the deploy commit.
- [ ] Gym Visual licence confirmed (section 1) or media removed.
- [ ] Canonical/social URLs point at the real public address.
- [ ] A fresh profile sees an empty log and can create, export, erase and re-import data.
- [ ] Privacy page, NOTICE and medical disclaimer reachable from the live site.
