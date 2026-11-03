<!--
  GitHub profile README.

  GitHub renders the README of a repository named exactly like your username
  (shogun-support-99/shogun-support-99) at the top of your profile page.

  scripts/setup-github.sh creates that repository and pushes this file there
  automatically. To do it by hand instead: create a public repo named
  "shogun-support-99", add this file as its README.md, and push.

  Replace anything marked EDIT to make it your own.
-->

<div align="center">

<img src="https://shogun-support-99.github.io/fitness/assets/img/logo.svg" alt="IronLog" width="72" height="72" />

# Hey, I'm shogun-support-99

**I build fast, private web tools that don't need a backend.**

[![IronLog — live app](https://img.shields.io/badge/IronLog-open_the_app-e05a1b?style=for-the-badge&labelColor=1b1917)](https://shogun-support-99.github.io/fitness/app/)
[![Landing page](https://img.shields.io/badge/site-landing_page-2b2622?style=for-the-badge&labelColor=1b1917)](https://shogun-support-99.github.io/fitness/)
![License](https://img.shields.io/badge/license-MIT-e05a1b?style=for-the-badge&labelColor=1b1917)

</div>

---

## 🔨 What I'm working on

### IronLog — an offline-first strength training log

A workout journal for strength training: log sets and reps, time your rest, and watch
personal records and volume trends build up over time.

**[Open the app →](https://shogun-support-99.github.io/fitness/app/)** ·
**[Landing page →](https://shogun-support-99.github.io/fitness/)** ·
**[Source →](https://github.com/shogun-support-99/fitness)**

What makes it interesting is what it *doesn't* have:

- **No backend.** A static site with no server, no database and no account system.
- **No build step.** Plain ES modules loaded straight by the browser, so a deploy can't
  break on a toolchain change.
- **No dependencies.** No framework, no charting library, no icon font, no webfont — the
  charts are hand-drawn inline SVG.
- **No tracking.** Nothing leaves the device. Your history lives in local storage and
  exports to a single JSON file.

It ships with 304 unit tests on the Node built-in test runner, and every push to `main`
redeploys itself through GitHub Actions.

## 🧰 How I work

- **Vanilla first.** Reach for the platform before reaching for a framework. Most
  interfaces don't need a dependency, and the ones that do should earn it.
- **Test the tricky maths.** Rounding, streak logic, week bucketing and record detection
  are exactly where bugs hide, so they get unit tests rather than hopeful manual clicks.
- **Escape by default.** Anything a user typed goes through an escape function before it
  reaches `innerHTML` — with a test proving a hostile payload is neutralised.
- **Design for the base path.** Relative URLs everywhere, so the same files work from a
  subdirectory, a subdomain or a local server with no configuration.

## 📊 GitHub stats

<div align="center">

<img src="https://github-readme-stats.vercel.app/api?username=shogun-support-99&show_icons=true&hide_border=true&bg_color=0a0c0f&title_color=e05a1b&icon_color=f08a3c&text_color=a9b6c6&rank_icon=github" alt="GitHub stats" height="160" />
<img src="https://github-readme-stats.vercel.app/api/top-langs/?username=shogun-support-99&layout=compact&hide_border=true&bg_color=0a0c0f&title_color=e05a1b&text_color=a9b6c6&langs_count=6" alt="Top languages" height="160" />

</div>

<!--
  EDIT: the two images above call a third-party service (github-readme-stats) and
  will render as broken images if that service is down or blocks the request.
  Delete this block if you would rather keep the profile dependency-free, which is
  more consistent with the rest of this page.
-->

## 📫 Reach me

<!-- EDIT: add the contact details you are comfortable publishing. -->

- 💬 Open an issue on [IronLog](https://github.com/shogun-support-99/fitness/issues)
- 🔗 [shogun-support-99.github.io/fitness](https://shogun-support-99.github.io/fitness/)

---

<div align="center">

<sub>Built as static files, deployed by a workflow, and free under MIT.</sub>

</div>
