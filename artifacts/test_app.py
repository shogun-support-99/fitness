"""End-to-end pass over IronLog: real browser, real storage, no mocks.

Checks the logging loop, then the specific defects fixed this round:
  * custom-exercise form reachable from the picker (was a dead button)
  * library search keeps focus when a query returns nothing
  * a detail sheet closed by navigating away does not reopen, scroll stays free
  * the week's volume tile follows the units setting
  * ticking a set keeps focus on that tick
  * Escape dismisses the summary instead of stranding a finished workout
Any console error, page error or 4xx/5xx response is collected and reported.
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000/app/"
LANDING = "http://127.0.0.1:3000/"
SHOTS = "artifacts/shots"
os.makedirs(SHOTS, exist_ok=True)

problems = []
console_errors = []
bad_responses = []


def check(cond, label, detail=""):
    if cond:
        print(f"PASS  {label}")
    else:
        print(f"FAIL  {label}  {detail}")
        problems.append(f"{label} {detail}".strip())


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        page.set_default_timeout(20000)

        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(f"pageerror: {e}"))
        page.on("response", lambda r: bad_responses.append(f"{r.status} {r.url}") if r.status >= 400 else None)

        # ── Landing page ────────────────────────────────────────────────────
        page.goto(LANDING)
        page.wait_for_load_state("networkidle")
        check(page.title().startswith("IronLog"), "landing: title", page.title())
        page.screenshot(path=f"{SHOTS}/landing.png", full_page=True)

        tabs = page.locator("[data-tab]")
        check(tabs.count() >= 2, "landing: preview tabs present", tabs.count())
        if tabs.count() >= 2:
            tabs.nth(1).click()
            check(page.locator("[data-panel]").nth(1).is_visible(), "landing: tab switches panel")
            check(page.locator("[data-panel]").nth(0).is_hidden(), "landing: old panel hidden")

        # ── App boots ───────────────────────────────────────────────────────
        page.goto(BASE)
        page.wait_for_selector(".view-home", state="visible")
        check(page.locator("h1").first.inner_text().strip() == "Home", "app: home renders")
        ring = page.evaluate(
            """() => {
            const el = document.querySelector('.goal-ring-value');
            if (!el) return null;
            const cs = getComputedStyle(el);
            const box = document.querySelector('.goal-ring').getBoundingClientRect();
            return { fill: cs.fill, stroke: cs.stroke, w: Math.round(box.width), h: Math.round(box.height) };
        }"""
        )
        check(ring is not None, "home: goal ring rendered")
        if ring:
            check(ring["fill"] in ("none", "rgba(0, 0, 0, 0)"), "home: ring has no black fill", ring["fill"])
            check(ring["stroke"] != "none", "home: ring has a stroke", ring["stroke"])
            check(0 < ring["w"] <= 200 and abs(ring["w"] - ring["h"]) <= 2, "home: ring is a 200px-max circle", ring)
        sparks = page.evaluate(
            "() => [...document.querySelectorAll('.hero-spark')].map(e => getComputedStyle(e).position)"
        )
        check(all(pos == "absolute" for pos in sparks) and len(sparks) >= 1, "home: sparks are decoration", sparks)
        page.screenshot(path=f"{SHOTS}/app-home.png", full_page=True)

        # ── Start a session and log a set ───────────────────────────────────
        page.locator('button[data-action="start-workout"]').first.click()
        page.wait_for_selector(".view-workout")
        check("#/workout" in page.url, "workout: route after start", page.url)

        page.locator('button[data-action="open-picker"]').first.click()
        page.wait_for_selector("#exercise-picker:not([hidden])")
        check(page.locator("#exercise-picker").is_visible(), "picker: opens")

        # Custom exercise reachable from the picker (bug: sheet lived only in library view)
        page.locator('button[data-action="open-custom-exercise"]').first.click()
        page.wait_for_timeout(300)
        check(page.locator("#custom-exercise-sheet").is_visible(), "picker: create-custom form opens")
        check(
            page.evaluate("document.querySelectorAll('#custom-exercise-sheet').length") == 1,
            "custom sheet: exactly one instance",
        )

        # And it actually saves, from this route
        page.fill('#custom-exercise-sheet input[name="name"]', "Landmine Press")
        page.locator('#custom-exercise-sheet button[type="submit"]').click()
        page.wait_for_timeout(400)
        check(page.locator("#custom-exercise-sheet").is_hidden(), "custom: form closes after save")
        check(
            page.evaluate("JSON.parse(localStorage.getItem('ironlog.v1')).customExercises.length") == 1,
            "custom: exercise persisted",
        )

        # Reopening the long-lived form must not show the last entry or a stale error
        page.locator('button[data-action="open-picker"]').first.click()
        page.wait_for_selector("#exercise-picker:not([hidden])")
        page.locator('button[data-action="open-custom-exercise"]').first.click()
        page.wait_for_timeout(300)
        check(
            page.input_value('#custom-exercise-sheet input[name="name"]') == "",
            "custom: fields cleared on reopen",
        )
        check(page.locator('[data-role="custom-error"]').is_hidden(), "custom: stale error cleared")
        page.keyboard.press("Escape")
        page.wait_for_timeout(250)

        # Pick a real exercise and log it
        page.locator('button[data-action="open-picker"]').first.click()
        page.wait_for_selector("#exercise-picker:not([hidden])")
        page.fill("#picker-search", "bench press")
        page.wait_for_timeout(250)
        rows = page.locator("#picker-list .picker-row button")
        check(rows.count() > 0, "picker: search returns rows", rows.count())
        rows.first.click()
        page.wait_for_selector(".exercise-card")

        page.locator('.set-row:not(.set-head) input[data-action="set-weight"]').first.fill("80")
        page.locator('.set-row:not(.set-head) input[data-action="set-reps"]').first.fill("5")
        page.wait_for_timeout(150)
        onerm = page.locator(".set-onerm").first.inner_text().strip()
        check(onerm not in ("", "—"), "set: estimated 1RM computed", onerm)

        page.locator(".set-row:not(.set-head) .tick").first.click()
        page.wait_for_timeout(350)
        check(page.locator(".set-row.is-done").count() == 1, "set: marks done")
        check(page.locator(".timer-bar").is_visible(), "timer: auto-starts on tick")
        urgent = page.evaluate("() => document.querySelector('.timer-bar')?.dataset.urgent")
        check(urgent == "0", "timer: a fresh rest is not flagged urgent", urgent)
        focus_cls = page.evaluate("document.activeElement && document.activeElement.className")
        check("tick" in (focus_cls or ""), "set: focus stays on the tick", focus_cls)
        page.screenshot(path=f"{SHOTS}/app-workout.png", full_page=True)

        # ── Library: focus retention and stale sheet ────────────────────────
        page.locator('a[data-route="library"]').click()
        page.wait_for_selector(".view-library")
        page.fill("#library-search", "zzzzz")
        page.wait_for_timeout(350)
        check(page.locator(".empty").is_visible(), "library: empty state for no matches")
        active_id = page.evaluate("document.activeElement && document.activeElement.id")
        check(active_id == "library-search", "library: search keeps focus on empty result", active_id)

        page.fill("#library-search", "bench")
        page.wait_for_timeout(350)
        page.locator(".library-row .library-open").first.click()
        page.wait_for_selector("#exercise-detail-sheet:not([hidden])")
        check(page.locator("#exercise-detail-sheet").is_visible(), "detail: sheet opens")

        page.locator('a[data-route="home"]').click()
        page.wait_for_selector(".view-home")
        locked = page.evaluate("document.body.classList.contains('sheet-open')")
        check(not locked, "detail: scroll lock released on navigation")
        page.locator('a[data-route="library"]').click()
        page.wait_for_selector(".view-library")
        page.wait_for_timeout(350)
        check(page.locator("#exercise-detail-sheet").is_hidden(), "detail: does not reopen after route change")
        page.screenshot(path=f"{SHOTS}/app-library.png", full_page=True)

        # ── Units setting reaches Home ──────────────────────────────────────
        page.locator('a[data-route="settings"]').click()
        page.wait_for_selector(".view-settings")
        page.locator('button[data-action="set-units"][data-units="lb"]').click()
        page.locator('a[data-route="home"]').click()
        page.wait_for_selector(".view-home")
        week_tile = page.locator(".tile", has_text="This week").first.inner_text()
        check("lb" in week_tile, "home: week tile follows units setting", week_tile.replace("\n", " "))
        page.locator('a[data-route="home"]').click()
        page.locator('a[data-route="settings"]').click()
        page.locator('button[data-action="set-units"][data-units="kg"]').click()

        # ── Finish, then Escape the summary ─────────────────────────────────
        page.locator('a[data-route="workout"]').click()
        page.wait_for_selector(".view-workout")
        page.locator('button[data-action="complete-workout"]').click()
        page.wait_for_selector("#summary-modal:not([hidden])")
        check(page.locator("#summary-content .summary").is_visible(), "summary: opens on finish")
        page.wait_for_timeout(700)  # let the open transition settle before judging paint
        page.screenshot(path=f"{SHOTS}/app-summary.png")
        panel = page.evaluate(
            """() => {
            const el = document.querySelector('#summary-modal .sheet-panel');
            const cs = getComputedStyle(el);
            const box = el.getBoundingClientRect();
            return { bg: cs.backgroundColor, opacity: cs.opacity, w: Math.round(box.width), h: Math.round(box.height) };
        }"""
        )
        check(panel["opacity"] == "1", "summary: panel fully opaque", panel["opacity"])
        check("rgba(0, 0, 0, 0)" not in panel["bg"], "summary: panel has a solid background", panel["bg"])
        check(panel["h"] > 120, "summary: panel has height", panel)
        cell = page.evaluate(
            """() => {
            const d = document.querySelector('.summary-grid > div');
            if (!d) return null;
            const cs = getComputedStyle(d);
            return { display: cs.display, pad: cs.paddingLeft, children: d.children.length };
        }"""
        )
        check(
            cell and cell["display"] == "grid" and cell["pad"] not in ("0px", "") and cell["children"] == 2,
            "summary: stat cells laid out with padding",
            cell,
        )
        mark = page.evaluate(
            "() => { const m = document.querySelector('.summary-mark'); const r = m.getBoundingClientRect(); const p = document.querySelector('#summary-content').getBoundingClientRect(); return { inside: r.left >= p.left - 1 && r.top >= p.top - 1 }; }"
        )
        check(mark["inside"], "summary: record mark sits inside the padding")
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
        check(page.locator("#summary-modal").is_hidden(), "summary: Escape closes it")
        check(page.url.endswith("#/home"), "summary: Escape lands on home", page.url)

        # ── History shows the finished session ──────────────────────────────
        page.locator('a[data-route="history"]').click()
        page.wait_for_selector(".view-history")
        check(page.locator(".history-item").count() == 1, "history: session listed")
        page.locator(".history-head").first.click()
        page.wait_for_timeout(300)
        check(page.locator(".history-detail").is_visible(), "history: detail expands")

        browser.close()


main()

print("\nconsole errors:", len(console_errors))
for e in console_errors[:10]:
    print("  ", e)
print("bad responses:", len(bad_responses))
for r in bad_responses[:10]:
    print("  ", r)
print("\nfailures:", len(problems))
for p in problems:
    print("  ", p)
sys.exit(1 if problems or console_errors else 0)
