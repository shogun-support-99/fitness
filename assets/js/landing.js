/**
 * IronLog landing page interactions.
 *
 * Six small behaviours, no runtime dependency: the mobile menu, the workout
 * preview tabs (roving focus, arrow keys), a sliding indicator on the tabs and
 * the section nav, the pointer-driven hero cards, a reveal-on-scroll pass that
 * never leaves content hidden when the observer is unavailable, the number
 * count-up in the stats band, and the nav scroll spy.
 */

import { slidingIndicator } from "./sliding-indicator.js";

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

// A plate that travels to the selected tab. Created here rather than by the
// generic pass so the tab handler can move it the moment selection changes.
const tabsIndicator = tabList ? slidingIndicator(tabList) : null;

if (tabList && tabs.length === panels.length) {
  const select = (index, { focus = false } = {}) => {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
    if (focus) tabs[index].focus();
    tabsIndicator?.update();
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

/* ── Hero folder cards ─────────────────────────────────────────────────── */

const heroArt = doc.querySelector(".hero-art");
const heroStack = heroArt?.querySelector(".folder-stack");
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

if (heroArt && heroStack && finePointer.matches) {
  let frame = 0;
  let x = 0;
  let y = 0;

  const paint = () => {
    frame = 0;
    heroStack.style.setProperty("--hero-x", x.toFixed(3));
    heroStack.style.setProperty("--hero-y", y.toFixed(3));
  };

  // One style write per frame: pointermove fires far faster than paint.
  const queue = () => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  const reset = () => {
    x = 0;
    y = 0;
    queue();
  };

  heroArt.addEventListener("pointermove", (event) => {
    if (reduceMotion.matches) return;
    const rect = heroArt.getBoundingClientRect();
    x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    queue();
  });

  heroArt.addEventListener("pointerleave", reset);
  heroArt.addEventListener("pointercancel", reset);
  reduceMotion.addEventListener("change", (event) => {
    if (event.matches) reset();
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

const spyLinks = [...doc.querySelectorAll(".site-nav a")].filter((link) =>
  (link.getAttribute("href") ?? "").startsWith("#"),
);
const spySections = spyLinks
  .map((link) => doc.querySelector(link.getAttribute("href")))
  .filter(Boolean);

const siteNav = doc.querySelector(".site-nav");
// A fixed 16px tab, not a full-width underline: the notch is the same small
// wedge as the logo, and it reads as a mark rather than as a rule.
const navIndicator = siteNav
  ? slidingIndicator(siteNav, { track: "underline", width: 16 })
  : null;

if (spyLinks.length && spySections.length && "IntersectionObserver" in window) {
  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = `#${entry.target.id}`;
        spyLinks.forEach((link) => {
          link.classList.toggle("is-on", link.getAttribute("href") === id);
        });
        navIndicator?.update();
      });
    },
    { rootMargin: "-40% 0px -55% 0px", threshold: 0 },
  );
  spySections.forEach((section) => spy.observe(section));
}

/* ── Stats band count-up ─────────────────────────────────────────────────
   The final figure is already in the markup, so this only ever runs on top of
   correct content: with no JS, or with reduced motion, the numbers just sit
   there already right.
   ------------------------------------------------------------------------- */

const counters = [...doc.querySelectorAll("[data-count-to]")];

if (counters.length) {
  const format = (value) => value.toLocaleString("en-US");

  if (reduceMotion.matches || !("IntersectionObserver" in window)) {
    counters.forEach((el) => {
      const target = Number(el.dataset.countTo);
      if (Number.isFinite(target)) el.textContent = format(target);
    });
  } else {
    const roll = (el) => {
      const target = Number(el.dataset.countTo);
      if (!Number.isFinite(target)) return;
      const duration = 1000;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min((now - start) / duration, 1);
        // easeOutExpo: the low digits blur early and settle cleanly on the
        // final value rather than sliding to a stop.
        const eased = t === 1 ? 1 : 1 - 2 ** (-10 * t);
        el.textContent = format(Math.round(target * eased));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const counterSpy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          counterSpy.unobserve(entry.target);
          roll(entry.target);
        });
      },
      { threshold: 0.4 },
    );

    counters.forEach((el) => counterSpy.observe(el));
  }
}

/* ── Footer year ───────────────────────────────────────────────────────── */

doc.querySelectorAll("[data-year]").forEach((el) => {
  el.textContent = String(new Date().getFullYear());
});
