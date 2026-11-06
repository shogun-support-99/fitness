/**
 * IronLog landing page interactions.
 *
 * Eight small behaviours, no runtime dependency: the mobile menu, the workout
 * preview tabs (roving focus, arrow keys, a shared travelling pill), the
 * pointer-driven hero cards, pointer spotlights on routine cards, magnetic
 * hero/final CTAs, a reveal-on-scroll pass that never leaves content hidden
 * when the observer is unavailable, the sample training-year heatmap, and the
 * nav scroll spy.
 */

import {
  activityLevels,
  compactNumber,
  streaks,
  trainingYear,
} from "../../app/js/stats.js";

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
const tabGlider = tabList?.querySelector(".tabs-glider");
const mockScenes = [...doc.querySelectorAll("[data-mock-scene]")];
const mockTitle = doc.querySelector("[data-mock-title]");
const mockState = doc.querySelector("[data-mock-state]");
const mockMeta = [
  { title: "IronLog — live session", state: "Saved locally" },
  { title: "IronLog — rest timer", state: "Countdown live" },
  { title: "IronLog — session archive", state: "3 saved" },
];

if (tabList && tabs.length === panels.length) {
  let activeTab = Math.max(
    0,
    tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true"),
  );

  // One shared pill travels between tabs, so the control reads as a single
  // segmented switch instead of three buttons flipping independently.
  const placeGlider = (index, { animate = true } = {}) => {
    const tab = tabs[index];
    if (!tabGlider || !tab) return;
    if (!animate) tabGlider.classList.add("no-anim");
    const base = tabList.getBoundingClientRect();
    const box = tab.getBoundingClientRect();
    tabGlider.style.setProperty("--tab-x", `${box.left - base.left}px`);
    tabGlider.style.setProperty("--tab-w", `${box.width}px`);
    tabGlider.style.setProperty("--tab-h", `${box.height}px`);
    tabGlider.classList.add("is-ready");
    if (!animate) {
      void tabGlider.offsetWidth;
      tabGlider.classList.remove("no-anim");
    }
  };

  const select = (index, { focus = false } = {}) => {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
    activeTab = index;
    placeGlider(index);

    if (!reduceMotion.matches) {
      const panel = panels[index];
      panel.classList.remove("is-switching");
      void panel.offsetWidth;
      panel.classList.add("is-switching");
    }

    // The preview is a stage, not a screenshot: the ledger mock changes with
    // the tab so the paragraph, the control and the artefact stay one story.
    if (mockScenes.length === panels.length) {
      mockScenes.forEach((scene, i) => {
        const on = i === index;
        scene.hidden = !on;
        scene.classList.toggle("is-active", on);
        if (on && !reduceMotion.matches) {
          scene.classList.remove("is-switching");
          void scene.offsetWidth;
          scene.classList.add("is-switching");
        }
      });
      if (mockTitle) mockTitle.textContent = mockMeta[index].title;
      if (mockState) mockState.textContent = mockMeta[index].state;
    }

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

  placeGlider(activeTab, { animate: false });
  doc.fonts?.ready.then(() => placeGlider(activeTab, { animate: false }));
  window.addEventListener("resize", () => placeGlider(activeTab, { animate: false }));
}

/* ── Hero folder cards ─────────────────────────────────────────────────── */

const heroArt = doc.querySelector(".hero-art");
const heroStack = heroArt?.querySelector(".folder-stack");
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

/* A deliberately visible pointer response gives the landing page a clear
   desktop affordance: a small signal ring trails the cursor and expands over
   controls. It never replaces the OS cursor and is absent on touch/reduced
   motion so it cannot interfere with reading or accessibility. */
if (finePointer.matches && !reduceMotion.matches) {
  const cursorOrbit = doc.createElement("span");
  cursorOrbit.className = "cursor-orbit";
  cursorOrbit.setAttribute("aria-hidden", "true");
  doc.body.append(cursorOrbit);

  let pointerX = -40;
  let pointerY = -40;
  let orbitX = pointerX;
  let orbitY = pointerY;
  let cursorFrame = 0;

  const moveOrbit = () => {
    orbitX += (pointerX - orbitX) * 0.22;
    orbitY += (pointerY - orbitY) * 0.22;
    cursorOrbit.style.transform = `translate3d(${orbitX}px, ${orbitY}px, 0)`;
    if (Math.abs(pointerX - orbitX) + Math.abs(pointerY - orbitY) > 0.25) {
      cursorFrame = requestAnimationFrame(moveOrbit);
    } else {
      cursorFrame = 0;
    }
  };

  doc.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    const target = event.target instanceof Element ? event.target : null;
    cursorOrbit.classList.toggle(
      "is-over-control",
      Boolean(target?.closest("a, button, summary, [role=tab]")),
    );
    if (!cursorFrame) cursorFrame = requestAnimationFrame(moveOrbit);
  }, { passive: true });

  doc.documentElement.addEventListener("pointerleave", () => {
    cursorOrbit.classList.add("is-away");
  });
  doc.documentElement.addEventListener("pointerenter", () => {
    cursorOrbit.classList.remove("is-away");
  });
  reduceMotion.addEventListener("change", (event) => {
    if (!event.matches) return;
    if (cursorFrame) cancelAnimationFrame(cursorFrame);
    cursorOrbit.remove();
  });
}

if (heroArt && heroStack) {
  let frame = 0;
  let x = 0;
  let y = 0;
  let spotX = 50;
  let spotY = 45;
  let pressed = false;

  const paint = () => {
    frame = 0;
    heroStack.style.setProperty("--hero-x", x.toFixed(3));
    heroStack.style.setProperty("--hero-y", y.toFixed(3));
    heroArt.style.setProperty("--hero-x", x.toFixed(3));
    heroArt.style.setProperty("--hero-y", y.toFixed(3));
    // Make the depth cue readable at a glance: the stack leans toward the
    // pointer while each paper layer gets a slightly different Z offset.
    heroArt.style.setProperty("--tilt-x", `${(-y * 9).toFixed(2)}deg`);
    heroArt.style.setProperty("--tilt-y", `${(x * 11).toFixed(2)}deg`);
    heroStack.style.setProperty("--hero-depth", (Math.abs(x) + Math.abs(y)).toFixed(3));
    heroArt.style.setProperty("--spot-size", "340px");
    heroArt.style.setProperty("--spot-x", `${spotX.toFixed(1)}%`);
    heroArt.style.setProperty("--spot-y", `${spotY.toFixed(1)}%`);
  };

  // One style write per frame: pointermove fires far faster than paint.
  const queue = () => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  const track = (event) => {
    const rect = heroArt.getBoundingClientRect();
    spotX = ((event.clientX - rect.left) / rect.width) * 100;
    spotY = ((event.clientY - rect.top) / rect.height) * 100;
    if (!reduceMotion.matches) {
      x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    }
    queue();
  };

  const reset = () => {
    x = 0;
    y = 0;
    spotX = 50;
    spotY = 45;
    heroStack?.style.setProperty("--hero-depth", "0");
    heroArt.style.setProperty("--spot-size", "280px");
    heroArt.classList.remove("is-tilting");
    queue();
  };

  heroArt.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") {
      heroArt.classList.add("is-pointing");
      if (!reduceMotion.matches) heroArt.classList.add("is-tilting");
    }
  });

  heroArt.addEventListener("pointermove", (event) => {
    // A finger only steers while it is down; a swipe that scrolls the page
    // must not leave the stack leaning afterwards. The spotlight still tracks
    // under reduced motion; only the tilt and parallax are withheld.
    if (event.pointerType !== "mouse" && !pressed) return;
    heroArt.classList.add("is-pointing");
    if (!reduceMotion.matches) heroArt.classList.add("is-tilting");
    track(event);
  });

  heroArt.addEventListener("pointerdown", (event) => {
    pressed = true;
    heroArt.classList.add("is-pressed", "is-pointing");
    if (event.pointerType !== "mouse" && !reduceMotion.matches) {
      heroArt.classList.add("is-tilting");
    }
    track(event);
  });

  const release = (event) => {
    if (!pressed) return;
    pressed = false;
    heroArt.classList.remove("is-pressed");
    if (event.pointerType !== "mouse") {
      heroArt.classList.remove("is-pointing");
      reset();
    }
  };

  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);

  heroArt.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") {
      heroArt.classList.remove("is-pointing");
      reset();
    }
  });

  reduceMotion.addEventListener("change", (event) => {
    if (!event.matches) return;
    heroArt.classList.remove("is-pressed", "is-tilting");
    reset();
  });
}

/* Set 4 is a real button: the demo runs itself until the first tap, then the
   stats count up, sparks fly and the rest bar starts at demo speed. */
const heroSet = heroArt?.querySelector("[data-hero-set]");
const heroStatus = heroArt?.querySelector("[data-hero-status]");

if (heroArt && heroSet) {
  const volumeEl = heroArt.querySelector("[data-hero-volume]");
  const setsEl = heroArt.querySelector("[data-hero-sets]");
  const recordsEl = heroArt.querySelector("[data-hero-records]");
  const restEl = heroArt.querySelector(".front-rest");
  const restTime = heroArt.querySelector("[data-hero-rest]");
  const liveLabel = heroArt.querySelector("[data-hero-live]");
  const burst = heroSet.querySelector(".hero-burst");

  const numberFormat = new Intl.NumberFormat("en-US");
  const statEls = { volume: volumeEl, sets: setsEl, records: recordsEl };
  const statValues = { volume: 6140, sets: 14, records: 2 };
  const statSuffix = { volume: " kg", sets: "", records: "" };
  const statFrames = { volume: 0, sets: 0, records: 0 };
  const loggedValues = { volume: 6635, sets: 15, records: 3 };
  const restSeconds = 84;
  const restDuration = 6000;

  let logged = false;
  let restFrame = 0;
  let restStart = 0;

  const paintStat = (key, value) => {
    statValues[key] = value;
    if (statEls[key]) {
      statEls[key].textContent = `${numberFormat.format(value)}${statSuffix[key]}`;
    }
  };

  const pop = (el) => {
    if (!el || reduceMotion.matches) return;
    el.classList.remove("is-bumped");
    void el.offsetWidth;
    el.classList.add("is-bumped");
  };

  const animateStat = (key, to) => {
    const el = statEls[key];
    if (statFrames[key]) cancelAnimationFrame(statFrames[key]);
    if (!el || reduceMotion.matches) {
      paintStat(key, to);
      pop(el);
      return;
    }
    const from = statValues[key];
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 560);
      const eased = 1 - (1 - t) ** 3;
      paintStat(key, Math.round(from + (to - from) * eased));
      if (t < 1) {
        statFrames[key] = requestAnimationFrame(step);
      } else {
        statFrames[key] = 0;
        pop(el);
      }
    };
    statFrames[key] = requestAnimationFrame(step);
  };

  const formatRest = (seconds) => {
    const whole = Math.max(0, Math.ceil(seconds));
    const minutes = String(Math.floor(whole / 60)).padStart(2, "0");
    return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
  };

  const tickRest = (now) => {
    const elapsed = Math.min(now - restStart, restDuration);
    if (restTime) restTime.textContent = formatRest(restSeconds * (1 - elapsed / restDuration));
    if (elapsed < restDuration) {
      restFrame = requestAnimationFrame(tickRest);
    } else {
      restFrame = 0;
    }
  };

  const startRest = () => {
    if (restFrame) cancelAnimationFrame(restFrame);
    restEl?.classList.add("is-resting");
    if (reduceMotion.matches) {
      if (restTime) restTime.textContent = "00:00";
      return;
    }
    restStart = performance.now();
    restFrame = requestAnimationFrame(tickRest);
  };

  const stopRest = () => {
    if (restFrame) cancelAnimationFrame(restFrame);
    restFrame = 0;
    restEl?.classList.remove("is-resting");
    if (restTime) restTime.textContent = "01:24";
  };

  const burstSparks = () => {
    if (!burst || reduceMotion.matches) return;
    for (let i = 0; i < 12; i += 1) {
      const spark = doc.createElement("i");
      spark.style.setProperty("--a", `${-165 + Math.random() * 150}deg`);
      spark.style.setProperty("--d", `${28 + Math.random() * 46}px`);
      spark.style.setProperty("--delay", `${Math.random() * 80}ms`);
      spark.style.setProperty("--s", `${8 + Math.random() * 4}px`);
      spark.addEventListener("animationend", () => spark.remove(), { once: true });
      burst.append(spark);
    }
  };

  heroSet.addEventListener("click", () => {
    heroArt.classList.add("is-live");
    logged = !logged;
    heroSet.classList.toggle("is-done", logged);
    heroSet.querySelector("i")?.classList.toggle("is-idle", !logged);
    heroSet.setAttribute("aria-pressed", String(logged));
    heroSet.setAttribute(
      "aria-label",
      logged
        ? "Set 4 logged: 82.5 kilograms for 6 reps. Activate to undo."
        : "Log set 4: 82.5 kilograms for 6 reps",
    );

    animateStat("volume", logged ? loggedValues.volume : 6140);
    animateStat("sets", logged ? loggedValues.sets : 14);
    animateStat("records", logged ? loggedValues.records : 2);

    if (liveLabel) {
      liveLabel.textContent = logged ? "set logged" : "live session";
      liveLabel.classList.toggle("is-logged", logged);
    }

    if (logged) {
      startRest();
      burstSparks();
    } else {
      stopRest();
    }

    if (heroStatus) {
      heroStatus.textContent = logged
        ? "Set 4 logged. Session volume 6,635 kilograms, 15 sets, 3 records."
        : "Set 4 undone. Session volume 6,140 kilograms, 14 sets, 2 records.";
    }
  });
}

/* ── Spotlight cards ───────────────────────────────────────────────────── */

const spotlit = [...doc.querySelectorAll("[data-spotlight]")];

if (spotlit.length && finePointer.matches) {
  let frame = 0;
  let card = null;
  let x = 0;
  let y = 0;

  const paint = () => {
    frame = 0;
    if (!card) return;
    card.style.setProperty("--spot-x", `${x.toFixed(1)}px`);
    card.style.setProperty("--spot-y", `${y.toFixed(1)}px`);
  };

  doc.addEventListener(
    "pointermove",
    (event) => {
      if (reduceMotion.matches) return;
      const next = event.target instanceof Element ? event.target.closest("[data-spotlight]") : null;
      if (!next) return;
      const rect = next.getBoundingClientRect();
      card = next;
      x = event.clientX - rect.left;
      y = event.clientY - rect.top;
      if (!frame) frame = requestAnimationFrame(paint);
    },
    { passive: true },
  );
}

/* ── Pointer tilt ──────────────────────────────────────────────────────── */

const tiltables = [...doc.querySelectorAll("[data-tilt]")];

const coarsePointer = window.matchMedia("(pointer: coarse)");

if (tiltables.length && (finePointer.matches || coarsePointer.matches) && !reduceMotion.matches) {
  let frame = 0;
  let target = null;
  let activeTouch = null;
  let max = 3.2;
  let x = 0;
  let y = 0;

  const paint = () => {
    frame = 0;
    if (!target) return;
    target.style.setProperty("--tilt-x", `${(-y * max).toFixed(2)}deg`);
    target.style.setProperty("--tilt-y", `${(x * max).toFixed(2)}deg`);
    target.style.setProperty("--glare-x", `${((x + 0.5) * 100).toFixed(1)}%`);
    target.style.setProperty("--glare-y", `${((y + 0.5) * 100).toFixed(1)}%`);
  };

  const rest = () => {
    if (!target) return;
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    target.style.setProperty("--tilt-x", "0deg");
    target.style.setProperty("--tilt-y", "0deg");
    target.classList.remove("is-tilting");
    target = null;
  };

  const queue = () => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  const trackTilt = (event) => {
    if (reduceMotion.matches) return;
    const isTouch = event.pointerType === "touch";
    if (isTouch && event.pointerId !== activeTouch) return;
    if (!isTouch && event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") {
      return;
    }
    const next = event.target instanceof Element ? event.target.closest("[data-tilt]") : null;
    if (!next) {
      if (!isTouch) rest();
      return;
    }
    if (next !== target) {
      rest();
      target = next;
      const value = Number(next.dataset.tiltMax);
      max = Number.isFinite(value) && value > 0 ? value : 3.2;
      // Add the 3D transform on first interaction, after reveal animations settle.
      next.classList.add("is-tilt-ready", "is-tilting");
    }
    const rect = next.getBoundingClientRect();
    x = (event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5;
    y = (event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5;
    queue();
  };

  doc.addEventListener("pointermove", trackTilt, { passive: true });
  doc.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" || reduceMotion.matches) return;
    activeTouch = event.pointerId;
    trackTilt(event);
  }, { passive: true });
  const finishTouchTilt = (event) => {
    if (event.pointerId !== activeTouch) return;
    activeTouch = null;
    rest();
  };
  window.addEventListener("pointerup", finishTouchTilt, { passive: true });
  window.addEventListener("pointercancel", finishTouchTilt, { passive: true });

  doc.addEventListener("pointerleave", rest);
  doc.addEventListener("pointercancel", rest);
  window.addEventListener("blur", rest);
  reduceMotion.addEventListener("change", (event) => {
    if (event.matches) rest();
  });
}

/* ── Magnetic buttons ──────────────────────────────────────────────────── */

const magnetic = [...doc.querySelectorAll("[data-magnetic]")];

if (magnetic.length && finePointer.matches) {
  magnetic.forEach((button) => {
    let frame = 0;
    let x = 0;
    let y = 0;

    const paint = () => {
      frame = 0;
      button.style.setProperty("--mag-x", `${x.toFixed(2)}px`);
      button.style.setProperty("--mag-y", `${y.toFixed(2)}px`);
    };

    const queue = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };

    button.addEventListener("pointermove", (event) => {
      if (reduceMotion.matches) return;
      const rect = button.getBoundingClientRect();
      x = ((event.clientX - rect.left) / rect.width - 0.5) * 7;
      y = ((event.clientY - rect.top) / rect.height - 0.5) * 5;
      queue();
    });

    const reset = () => {
      x = 0;
      y = 0;
      queue();
    };

    button.addEventListener("pointerleave", reset);
    button.addEventListener("pointercancel", reset);
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

/* ── Scroll spy ────────────────────────────────────────────────────────── */

/* ── Stats count-up ────────────────────────────────────────────────────── */

const countEls = [...doc.querySelectorAll("[data-count]")];

if (countEls.length && !reduceMotion.matches) {
  const formatCount = new Intl.NumberFormat("en-US");

  const countUp = (el) => {
    const end = Number(el.dataset.count);
    if (!Number.isFinite(end) || end <= 0) return;
    const started = performance.now();
    const duration = 900;
    const tick = (now) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - t) ** 3;
      el.textContent = formatCount.format(Math.round(end * eased));
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = formatCount.format(end);
    };
    requestAnimationFrame(tick);
  };

  if ("IntersectionObserver" in window) {
    const countObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          countUp(entry.target);
          countObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.5 },
    );
    countEls.forEach((el) => countObserver.observe(el));
  } else {
    countEls.forEach(countUp);
  }
}

const spyLinks = [...doc.querySelectorAll(".site-nav a")].filter((link) =>
  (link.getAttribute("href") ?? "").startsWith("#"),
);
const spySections = spyLinks
  .map((link) => doc.querySelector(link.getAttribute("href")))
  .filter(Boolean);

if (spyLinks.length && spySections.length && "IntersectionObserver" in window) {
  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = `#${entry.target.id}`;
        spyLinks.forEach((link) => {
          link.classList.toggle("is-on", link.getAttribute("href") === id);
        });
      });
    },
    { rootMargin: "-40% 0px -55% 0px", threshold: 0 },
  );
  spySections.forEach((section) => spy.observe(section));
}

/* ── Footer year ───────────────────────────────────────────────────────── */

doc.querySelectorAll("[data-year]").forEach((el) => {
  el.textContent = String(new Date().getFullYear());
});

/* ── Scroll meter ──────────────────────────────────────────────────────── */

const scrollMeter = doc.querySelector("[data-scroll-meter]");
const siteHeader = doc.querySelector("[data-header]");

if (scrollMeter || siteHeader) {
  let frame = 0;

  const paint = () => {
    frame = 0;
    const max = doc.documentElement.scrollHeight - window.innerHeight;
    const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (scrollMeter) {
      scrollMeter.parentElement.style.setProperty("--scroll-progress", progress.toFixed(4));
    }
    if (siteHeader) siteHeader.classList.toggle("is-scrolled", window.scrollY > 10);
  };

  const queue = () => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  paint();
}

/* ── Touch tap glow ──────────────────────────────────────────────────────
   Tilt needs a mouse. A finger gets a different signal: a soft pool of light
   where it landed, only when the gesture was a tap and not a scroll. */

let tapStart = null;

const interactiveTarget = (node) =>
  node instanceof Element
    ? node.closest("a, button, summary, .routine-card, .stat, .feature-row, .faq-item")
    : null;

doc.addEventListener(
  "pointerdown",
  (event) => {
    if (event.pointerType === "mouse" || reduceMotion.matches) return;
    if (!interactiveTarget(event.target)) return;
    tapStart = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      id: event.pointerId,
    };
  },
  { passive: true },
);

const releaseTap = (event) => {
  if (!tapStart || event.pointerId !== tapStart.id) return;
  const start = tapStart;
  tapStart = null;
  const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
  if (moved > 14 || performance.now() - start.time > 700) return;

  const glow = doc.createElement("span");
  glow.className = "tap-glow";
  glow.style.left = `${event.clientX}px`;
  glow.style.top = `${event.clientY}px`;
  glow.addEventListener("animationend", () => glow.remove(), { once: true });
  doc.body.append(glow);
  window.setTimeout(() => glow.remove(), 900);
};

doc.addEventListener("pointerup", releaseTap, { passive: true });
doc.addEventListener("pointercancel", () => {
  tapStart = null;
});

/* -- Progress: sample training year -------------------------------------- */

/**
 * Deterministic sample data for the landing page.
 *
 * The grid must look the same on every visit, so this uses a small seeded
 * PRNG rather than Math.random. Sessions are planned per week with a weighted
 * weekday pick, the occasional skipped week, and volume that drifts upward
 * over the year. The resulting objects have the same shape the app stores, so
 * trainingYear/activityLevels consume them unchanged.
 */
function buildSampleYear(today = new Date()) {
  let seed = 0x49524f4e; // "IRON"
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const workouts = [];
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const cursor = new Date(end);
  cursor.setDate(cursor.getDate() - 370);
  // Rewind to the Monday of that week so each plan starts on a clean week.
  cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));

  const weights = [3, 2.4, 1.1, 3, 2.1, 1.6, 0.4];
  const volumeBase = [7600, 6900, 3600, 8200, 6400, 4300, 3000];
  const weekCount = Math.ceil((end - cursor) / (7 * 24 * 3600 * 1000)) + 1;

  for (let week = 0; week < weekCount; week += 1) {
    const monday = new Date(cursor);
    monday.setDate(monday.getDate() + week * 7);
    const recent = end - monday < 70 * 24 * 3600 * 1000;

    // Rest weeks happen; recent weeks run a little hotter to show momentum.
    const skip = random() < 0.055 || (week > 4 && week % 19 === 11);
    const target = skip ? 2 : recent ? 4 + (random() < 0.45 ? 1 : 0) : 3 + (random() < 0.55 ? 1 : 0);

    const pool = [0, 1, 2, 3, 4, 5, 6];
    const chosen = [];
    while (chosen.length < target && pool.length) {
      const total = pool.reduce((sum, day) => sum + weights[day], 0);
      let ticket = random() * total;
      let pick = pool[0];
      for (const day of pool) {
        ticket -= weights[day];
        if (ticket <= 0) {
          pick = day;
          break;
        }
      }
      pool.splice(pool.indexOf(pick), 1);
      chosen.push(pick);
    }

    for (const day of chosen.sort((a, b) => a - b)) {
      const date = new Date(monday);
      date.setDate(date.getDate() + day);
      if (date > end) continue;

      const season = 1 + 0.12 * Math.sin((week / 52) * Math.PI * 2);
      const volume = Math.round(volumeBase[day] * season * (0.78 + random() * 0.44));
      const setCount = 5 + Math.floor(random() * 4);
      const reps = 5 + Math.floor(random() * 5);
      const weight = Math.max(20, Math.round(volume / (setCount * reps) / 2.5) * 2.5);
      const sets = Array.from({ length: setCount }, (_, index) => ({
        weight,
        reps: index === setCount - 1 && reps < 12 ? reps + 2 : reps,
        done: true,
      }));
      const endedAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 18, 30);
      const startedAt = new Date(endedAt.getTime() - (48 + Math.round(random() * 34)) * 60000);

      workouts.push({
        id: `sample-${week}-${day}`,
        name: "Sample session",
        status: "completed",
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        exercises: [{ id: `sample-e-${week}-${day}`, exerciseId: "sample", sets }],
      });

      // Most lifters occasionally log a second, lighter session on the same
      // day. This keeps the summary honest about sessions vs. active days.
      if (random() < 0.085) {
        const secondEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 7, 30);
        const secondStart = new Date(secondEnd.getTime() - 25 * 60000);
        workouts.push({
          id: `sample-${week}-${day}-b`,
          name: "Conditioning",
          status: "completed",
          startedAt: secondStart.toISOString(),
          endedAt: secondEnd.toISOString(),
          exercises: [
            {
              id: `sample-e-${week}-${day}-b`,
              exerciseId: "sample",
              sets: [{ weight: 0, reps: 20, done: true }, { weight: 0, reps: 20, done: true }],
            },
          ],
        });
      }
    }
  }

  return workouts;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sampleDayTip(day) {
  const date = new Date(`${day.date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  if (!day.sessions) return `${date} \u00b7 rest day`;
  const parts = [`${day.sessions} session${day.sessions === 1 ? "" : "s"}`];
  if (day.volume > 0) parts.push(`${compactNumber(day.volume)} kg`);
  if (day.sets > 0) parts.push(`${day.sets} set${day.sets === 1 ? "" : "s"}`);
  return `${date} \u00b7 ${parts.join(" \u00b7 ")}`;
}

function renderYearHeatmap(mount, workouts) {
  const year = trainingYear(workouts);
  const levels = activityLevels(year);
  const totals = year.totals;
  const weekdayLabels = ["Mon", "", "Wed", "", "Fri", "", ""];

  const weeks = year.weeks
    .map((week, col) => {
      const cells = week
        .map((day, row) => {
          if (!day) {
            return `<span class="heatmap-cell is-empty" style="--row:${row}" aria-hidden="true"></span>`;
          }
          const level = levels.get(day.date) ?? 0;
          const tip = sampleDayTip(day);
          return `<span class="heatmap-cell" data-level="${level}" style="--row:${row}" data-tip="${escapeHtml(tip)}" title="${escapeHtml(tip)}" aria-hidden="true"></span>`;
        })
        .join("");
      return `<div class="heatmap-week" style="--col:${col}">${cells}</div>`;
    })
    .join("");

  const months = year.months
    .map(
      (month) =>
        `<span class="heatmap-month" style="grid-column:${month.col + 1}">${escapeHtml(month.label)}</span>`,
    )
    .join("");

  const summary = `${totals.sessions} sessions across ${totals.activeDays} training days`;
  mount.innerHTML = `
    <div class="heatmap-plot">
      <div class="heatmap-weekdays" aria-hidden="true">
        ${weekdayLabels.map((day) => `<span>${day}</span>`).join("")}
      </div>
      <div class="heatmap-scroll" data-year-scroll>
        <div class="heatmap-months" aria-hidden="true" style="--weeks:${year.weeks.length}">${months}</div>
        <div class="heatmap-grid" role="img" aria-label="Sample training year heatmap. ${escapeHtml(summary)}." style="--weeks:${year.weeks.length}">${weeks}</div>
      </div>
    </div>
    <div class="heatmap-foot">
      <span>Every square is a finished session. Darker means heavier.</span>
      <span class="year-legend" aria-hidden="true">
        Less
        <span class="heatmap-keys">${[0, 1, 2, 3, 4]
          .map((level) => `<i class="heatmap-key" data-level="${level}"></i>`)
          .join("")}</span>
        More
      </span>
    </div>
    <div class="heatmap-tip" data-year-tip hidden></div>`;

  return { year, totals, scroller: mount.querySelector("[data-year-scroll]") };
}

function initYearTooltip(mount) {
  const tip = mount.querySelector("[data-year-tip]");
  if (!tip) return;

  // Native titles would double up with the shared tooltip after a hover delay.
  mount.querySelectorAll(".heatmap-cell[title]").forEach((cell) => {
    cell.removeAttribute("title");
  });

  let frame = 0;
  let current = null;

  const place = (cell) => {
    const box = mount.getBoundingClientRect();
    const cellBox = cell.getBoundingClientRect();
    tip.hidden = false;
    tip.textContent = cell.dataset.tip ?? "";
    const half = tip.offsetWidth / 2 + 4;
    const x = Math.min(
      Math.max(cellBox.left - box.left + cellBox.width / 2, half),
      Math.max(half, box.width - half),
    );
    tip.style.left = `${x}px`;
    tip.style.top = `${cellBox.top - box.top - 7}px`;
  };

  mount.addEventListener("pointerover", (event) => {
    const cell =
      event.target instanceof Element ? event.target.closest(".heatmap-cell[data-tip]") : null;
    if (!cell || !mount.contains(cell)) return;
    current = cell;
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (current === cell) place(cell);
    });
  });

  mount.addEventListener("pointerleave", () => {
    current = null;
    tip.hidden = true;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  });

  const scroller = mount.querySelector("[data-year-scroll]");
  scroller?.addEventListener(
    "scroll",
    () => {
      tip.hidden = true;
    },
    { passive: true },
  );
}

const yearMount = doc.querySelector("[data-year-heatmap]");
if (yearMount) {
  const workouts = buildSampleYear();
  const { totals } = renderYearHeatmap(yearMount, workouts);
  const setText = (selector, value) => {
    const el = doc.querySelector(selector);
    if (el) el.textContent = value;
  };
  setText("[data-year-sessions]", String(totals.sessions));
  setText("[data-year-days]", String(totals.activeDays));
  setText("[data-year-volume]", `${compactNumber(totals.volume)} kg`);
  setText("[data-year-streak]", `${streaks(workouts).best} days`);
  initYearTooltip(yearMount);

  // The calendar is chronological; open it at the most recent week.
  const scroller = yearMount.querySelector("[data-year-scroll]");
  if (scroller) {
    requestAnimationFrame(() => {
      scroller.scrollLeft = scroller.scrollWidth;
    });
  }
}
