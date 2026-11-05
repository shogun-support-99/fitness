/**
 * IronLog landing page interactions.
 *
 * Seven small behaviours, no runtime dependency: the mobile menu, the workout
 * preview tabs (roving focus, arrow keys, a shared travelling pill), the
 * pointer-driven hero cards, pointer spotlights on routine cards, magnetic
 * hero/final CTAs, a reveal-on-scroll pass that never leaves content hidden
 * when the observer is unavailable, and the nav scroll spy.
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
const tabGlider = tabList?.querySelector(".tabs-glider");

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
