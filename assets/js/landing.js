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
