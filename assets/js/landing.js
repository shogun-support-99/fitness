/**
 * IronLog landing page interactions.
 *
 * Four small behaviours, no runtime dependency: the mobile menu, the workout
 * preview tabs (roving focus, arrow keys) and a reveal-on-scroll pass that
 * never leaves content hidden when the observer is unavailable.
 */

const doc = document;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ── Mobile menu ───────────────────────────────────────────────────────── */

const toggle = doc.querySelector("[data-nav-toggle]");
const mobileNav = doc.querySelector("[data-mobile-nav]");

if (toggle && mobileNav) {
  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    mobileNav.hidden = !open;
  };

  toggle.addEventListener("click", () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });

  mobileNav.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });

  doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      toggle.focus();
    }
  });

  const wide = window.matchMedia("(min-width: 901px)");
  wide.addEventListener("change", (event) => {
    if (event.matches) setOpen(false);
  });
}

/* ── Workout preview tabs ──────────────────────────────────────────────── */

const tabList = doc.querySelector(".tabs");
const tabs = [...doc.querySelectorAll("[data-tab]")];
const panels = [...doc.querySelectorAll("[data-panel]")];

if (tabList && tabs.length === panels.length) {
  const select = (index, { focus = false } = {}) => {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
    if (focus) tabs[index].focus();
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(index));
    tab.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: tabs.length - 1 - index }[event.key];
      if (!step) return;
      event.preventDefault();
      select((index + step + tabs.length) % tabs.length, { focus: true });
    });
  });
}

/* ── Reveal on scroll ──────────────────────────────────────────────────── */

const revealables = [...doc.querySelectorAll("[data-reveal]")];

if (revealables.length) {
  const showAll = () => revealables.forEach((el) => el.classList.add("is-in"));

  if (reduceMotion.matches || !("IntersectionObserver" in window)) {
    showAll();
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 },
    );

    revealables.forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i % 6, 5) * 45}ms`;
      observer.observe(el);
    });

    // A tab restored in the background can defer the observer indefinitely;
    // content must never stay invisible, so fall back after a beat.
    setTimeout(() => {
      revealables.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight) el.classList.add("is-in");
      });
    }, 1200);
  }
}

/* ── Footer year ───────────────────────────────────────────────────────── */

doc.querySelectorAll("[data-year]").forEach((el) => {
  el.textContent = String(new Date().getFullYear());
});

/* ── Interactive demo logger ─────────────────────────────────────────────
   A miniature of the real logging flow, running on this page: tick a set,
   the row confirms, volume and est. 1RM recompute, a PR flag appears when
   last time's best is beaten, and the rest countdown starts itself. */

const demo = doc.querySelector("[data-demo]");

if (demo) {
  const demoSets = [...demo.querySelectorAll(".demo-set")];
  const volumeEl = demo.querySelector("[data-demo-volume]");
  const onermEl = demo.querySelector("[data-demo-onerm]");
  const setsEl = demo.querySelector("[data-demo-sets]");
  const prEl = demo.querySelector("[data-demo-pr]");
  const restRead = demo.querySelector("[data-demo-rest-read]");
  const restBox = demo.querySelector("[data-demo-rest]");
  const copyBtn = demo.querySelector("[data-demo-copy]");

  // Last session: 72.5 kg x 8 -> est. 1RM 91.8 (Epley).
  const prevBestOneRm = 72.5 * (1 + 8 / 30);
  const epley = (w, r) => (w > 0 && r > 0 ? w * (1 + r / 30) : 0);
  const fmtClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  let restEndsAt = null;
  let restHandle = null;

  function recalc() {
    let volume = 0;
    let best = 0;
    let done = 0;
    for (const row of demoSets) {
      if (!row.classList.contains("is-done")) continue;
      const w = Number(row.dataset.weight);
      const r = Number(row.dataset.reps);
      done += 1;
      volume += w * r;
      best = Math.max(best, epley(w, r));
    }
    if (volumeEl) volumeEl.textContent = `${volume.toLocaleString("en-US")} kg`;
    if (onermEl) onermEl.textContent = best > 0 ? `${best.toFixed(1)} kg` : "—";
    if (setsEl) setsEl.textContent = `${done} / ${demoSets.length}`;
    if (prEl) prEl.hidden = !(best > prevBestOneRm);
  }

  function tickRest() {
    if (!restRead) return;
    if (restEndsAt === null) {
      restRead.textContent = "–:––";
      restBox?.classList.remove("is-running");
      return;
    }
    const left = Math.max(0, Math.round((restEndsAt - Date.now()) / 1000));
    restRead.textContent = fmtClock(left);
    restBox?.classList.toggle("is-running", left > 0);
    if (left <= 0) stopRest();
  }

  function startRest() {
    restEndsAt = Date.now() + 90 * 1000;
    if (restHandle) clearInterval(restHandle);
    restHandle = setInterval(tickRest, 250);
    tickRest();
  }

  function stopRest() {
    restEndsAt = null;
    if (restHandle) {
      clearInterval(restHandle);
      restHandle = null;
    }
    tickRest();
  }

  function flash(btn, msg) {
    if (!btn) return;
    const old = btn.textContent;
    btn.textContent = msg;
    setTimeout(() => {
      btn.textContent = old;
    }, 1600);
  }

  demo.addEventListener("click", (event) => {
    const tick = event.target.closest("[data-demo-tick]");
    if (tick) {
      const row = tick.closest(".demo-set");
      const nowDone = !row.classList.contains("is-done");
      row.classList.toggle("is-done", nowDone);
      tick.setAttribute("aria-pressed", String(nowDone));
      if (nowDone) {
        startRest();
      } else if (!demoSets.some((s) => s.classList.contains("is-done"))) {
        stopRest();
      }
      recalc();
      return;
    }
    if (event.target.closest("[data-demo-add15]") && restEndsAt !== null) {
      restEndsAt += 15 * 1000;
      tickRest();
      return;
    }
    if (event.target.closest("[data-demo-copy]")) {
      let volume = 0;
      let best = 0;
      let done = 0;
      const lines = [];
      for (const row of demoSets) {
        if (!row.classList.contains("is-done")) continue;
        const w = Number(row.dataset.weight);
        const r = Number(row.dataset.reps);
        done += 1;
        volume += w * r;
        best = Math.max(best, epley(w, r));
        lines.push(`  ${w} kg x ${r}`);
      }
      const head = `IronLog — Bench press demo · ${volume.toLocaleString("en-US")} kg volume · ${done}/${demoSets.length} sets` +
        (best > 0 ? ` · est. 1RM ${best.toFixed(1)} kg` : "") +
        (best > prevBestOneRm ? " · NEW PR" : "");
      const text = [head, ...lines].join("\n");
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(
          () => flash(copyBtn, "Copied!"),
          () => flash(copyBtn, "Select & copy manually"),
        );
      } else {
        flash(copyBtn, "Clipboard unavailable");
      }
    }
  });

  recalc();
}
