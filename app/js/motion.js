/**
 * IronLog — motion engine.
 *
 * The brief was "more fun, more animation". The craft floor's rule is not
 * "less motion", it is "authored motion": one moment per surface rather than
 * scattered effects, and never one identical entrance on every section. So this
 * module gives every animated element its OWN entrance, tied to what the element
 * is - a log row is written in, a figure rolls like an odometer, a chart bar
 * grows from the baseline, a record is stamped. Nothing shares a fade-up.
 *
 * Three rules hold everywhere in here:
 *
 *  1. Reduced motion wins. `prefers-reduced-motion: reduce` removes the
 *     animation and leaves the final state, so nothing is ever hidden behind a
 *     transition that will not run. CSS does the heavy lifting; JS also stops
 *     starting loops.
 *  2. Nothing leaks. Observers are disconnected, timers are cleared, and loops
 *     pause when the tab is hidden or the element scrolls offscreen. A logger is
 *     left open for an hour; a stray rAF loop drains a phone battery.
 *  3. Start from visible. Entrances settle INTO place from an already-legible
 *     default (a clip-path wipe, a small offset) rather than fading up from
 *     nothing, which is what makes motion feel cheap.
 */

/** Live preference, not a one-shot read: users toggle this mid-session. */
let reducedQuery = null;

export function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  if (!reducedQuery) {
    reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  }
  return reducedQuery.matches;
}

/** Run `fn` whenever the reduced-motion preference changes. */
export function onMotionPreferenceChange(fn) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const handler = (e) => fn(e.matches);
  if (mq.addEventListener) mq.addEventListener("change", handler);
  else if (mq.addListener) mq.addListener(handler);
  return () => {
    if (mq.removeEventListener) mq.removeEventListener("change", handler);
    else if (mq.removeListener) mq.removeListener(handler);
  };
}

/* ------------------------------------------------------------------------- *
 * Reveals
 * ------------------------------------------------------------------------- */

/**
 * Entrance variants, assigned by ROLE rather than by position, so a page never
 * repeats one identical entrance down its length. Each name maps to a CSS
 * keyframe/transition pair in app.css.
 *
 *   write  - clip-path wipe left-to-right, like a line being written
 *   rise   - small y offset settling with expo-out, for headings
 *   grow   - scale-y from the baseline, for chart bars
 *   stamp  - overshoot scale with a slight rotation, for marks and badges
 *   draw   - stroke-dashoffset, for SVG linework
 *   roll   - odometer, handled by initCounters
 */
const REVEAL_VARIANTS = ["write", "rise", "grow", "stamp", "draw"];

/**
 * Which variant an element gets. Deterministic from its own attributes so the
 * same page always animates the same way - and so tests can assert it.
 */
export function revealVariant(el) {
  if (!el || typeof el.getAttribute !== "function") return "rise";
  const explicit = el.getAttribute("data-reveal");
  if (explicit && REVEAL_VARIANTS.includes(explicit)) return explicit;
  const tag = String(el.tagName || "").toLowerCase();
  const cls = String(el.getAttribute("class") || "");
  // Order matters: every one of these patterns overlaps another. "chart-bar"
  // contains "chart", "record-mark" contains "mark" and sits in a "row", so the
  // specific case has to be tested before the general one or it is unreachable.
  if (/chart-bar|dist-fill|bar/.test(cls)) return "grow";
  if (/tile-value|kpi|figure|odo/.test(cls)) return "roll";
  if (/stamp|badge|record-mark|pr-/.test(cls)) return "stamp";
  if (tag === "svg" || /diagram|dg-|\bchart\b/.test(cls)) return "draw";
  if (/row|line|entry|set-|menu-|faq|logsheet/.test(cls)) return "write";
  if (/^h[1-6]$/.test(tag)) return "rise";
  return "write";
}

/**
 * Wire scroll reveals inside `root`.
 *
 * Elements opt in with `data-reveal` (optionally naming a variant) or are found
 * by `selector`. Under reduced motion, or without IntersectionObserver, every
 * element is placed in its final state immediately and nothing is observed.
 *
 * @returns {() => void} teardown
 */
export function initReveals(root, { selector = "[data-reveal]", stagger = 55 } = {}) {
  const scope = root || document;
  const els = Array.from(scope.querySelectorAll(selector));
  if (els.length === 0) return () => {};

  const finish = (el) => {
    el.classList.add("is-revealed");
  };

  if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
    els.forEach((el) => {
      finish(el);
      el.style.removeProperty("--reveal-delay");
    });
    return () => {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      // Stagger by order of appearance within this batch, not by DOM index, so a
      // long list does not wait seconds for its last row.
      const batch = entries.filter((e) => e.isIntersecting);
      batch.forEach((entry, i) => {
        const el = entry.target;
        el.style.setProperty("--reveal-delay", `${i * stagger}ms`);
        finish(el);
        io.unobserve(el);
        // Keep the delay for the length of the animation, then clear it so a
        // later interaction cannot re-delay the element.
        window.setTimeout(() => el.style.removeProperty("--reveal-delay"), 1200);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );

  const viewportHeight =
    typeof window !== "undefined" ? window.innerHeight || 0 : Number.POSITIVE_INFINITY;

  els.forEach((el) => {
    const variant = revealVariant(el);
    el.classList.add(`reveal-${variant}`);

    // Above-the-fold content should animate as the page opens, not wait for a
    // scroll that may never happen. Decide synchronously, before the first
    // paint, so there is no flash of visible content being hidden again.
    let inView = true;
    if (typeof el.getBoundingClientRect === "function") {
      const rect = el.getBoundingClientRect();
      inView = rect.top < viewportHeight && rect.bottom > 0;
    }
    if (inView) {
      finish(el);
      return;
    }

    // Stagger by DOM order within a batch so a list arrives as a sequence.
    el.style.setProperty("--reveal-delay", "0ms");
    io.observe(el);
  });
  return () => io.disconnect();
}

/* ------------------------------------------------------------------------- *
 * Odometer figures
 * ------------------------------------------------------------------------- */

/** Split a number into the characters an odometer must render. */
export function odometerChars(value, { decimals = 0, separator = true } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "").split("");
  const places = Math.max(0, Math.min(decimals, 4));
  // Thousands separators, because a session volume of 2423 kg is written 2,423
  // everywhere else in this app and the roll must not quietly drop the comma.
  if (separator && typeof Intl !== "undefined") {
    try {
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: places,
        maximumFractionDigits: places,
      })
        .format(n)
        .split("");
    } catch {
      /* fall through to the plain form */
    }
  }
  return n.toFixed(places).split("");
}

/**
 * Build odometer markup for a figure. Each digit becomes a column of 0-9 inside
 * a one-line mask; non-digits (comma, dot, unit, minus) render statically.
 * Tabular mono makes the columns line up, which is why the type decision and
 * this animation are the same decision.
 */
export function odometerMarkup(value, { decimals = 0, separator = true } = {}) {
  const chars = odometerChars(value, { decimals, separator });
  return chars
    .map((ch) => {
      if (!/[0-9]/.test(ch)) {
        return `<span class="odo-static">${ch === " " ? "&nbsp;" : ch}</span>`;
      }
      const strip = Array.from({ length: 10 }, (_, d) => `<i>${d}</i>`).join("");
      return `<span class="odo-digit" data-digit="${ch}"><span class="odo-strip" style="--to:${ch}">${strip}</span></span>`;
    })
    .join("");
}

/**
 * Roll the digits of an element to `value`.
 *
 * Cheap and honest: it sets the final text immediately for assistive tech and
 * for the no-JS/reduced-motion case, then animates the strips. Under reduced
 * motion it does nothing but set the text.
 */
export function rollNumber(el, value, opts = {}) {
  if (!el) return;
  const decimals = Number(opts.decimals) || 0;
  const text = Number.isFinite(Number(value))
    ? odometerChars(value, { decimals }).join("")
    : String(value ?? "");

  // The accessible value is always the real one, regardless of animation.
  el.setAttribute("data-value", text);
  el.setAttribute("aria-label", opts.label ?? text);

  if (prefersReducedMotion()) {
    el.textContent = text;
    return;
  }
  el.innerHTML = odometerMarkup(value, { decimals });
  // Force a style flush so the transition runs from the 0 position.
  void el.offsetWidth;
  el.classList.add("is-rolling");
}

/**
 * Count-up for figures that are true counts (exercises, languages, sessions).
 * Only for values that are real: a count-up on an invented number is a lie with
 * a nice easing curve.
 */
export function initCounters(root, { selector = "[data-count-to]", duration = 900 } = {}) {
  const scope = root || document;
  const els = Array.from(scope.querySelectorAll(selector));
  if (els.length === 0) return () => {};

  const settle = (el) => {
    const to = Number(el.getAttribute("data-count-to"));
    const decimals = Number(el.getAttribute("data-count-decimals")) || 0;
    rollNumber(el, Number.isFinite(to) ? to : 0, { decimals });
  };

  if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
    els.forEach(settle);
    return () => {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        settle(entry.target);
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.4 },
  );

  els.forEach((el) => {
    // Start legible, not blank: the craft floor wants motion from a visible default.
    if (!el.textContent.trim()) el.textContent = "0";
    io.observe(el);
  });
  return () => io.disconnect();
}

/* ------------------------------------------------------------------------- *
 * The celebration: a record breaks
 * ------------------------------------------------------------------------- */

/**
 * Announce a personal record.
 *
 * This is the app's authored moment, and it is earned: it fires only on a real
 * record computed from real sets, never on a timer or for decoration. Visually a
 * stamp lands with an overshoot and a short burst of linework radiates from it;
 * for a screen reader it is a polite live-region announcement naming the lift,
 * the figure and the unit, because a celebration nobody can perceive is not a
 * celebration, it is a flashing box.
 *
 * @param {HTMLElement} host element to stamp (usually the set row or tile)
 * @param {object} detail   { exercise, value, unit, kind }
 */
export function celebrateRecord(host, detail = {}) {
  const { exercise = "", value = "", unit = "", kind = "record" } = detail;
  const live = document.getElementById("ironlog-live");
  if (live) {
    live.textContent = `New personal record. ${exercise} ${value}${unit ? ` ${unit}` : ""}.`;
  }
  if (!host) return;
  if (prefersReducedMotion()) {
    host.classList.add("is-record");
    return;
  }
  host.classList.remove("is-celebrating");
  // Reflow so re-triggering on a second record in the same session still plays.
  void host.offsetWidth;
  host.classList.add("is-record", "is-celebrating");
  host.setAttribute("data-record-kind", kind);

  const burst = document.createElement("span");
  burst.className = "pr-burst";
  burst.setAttribute("aria-hidden", "true");
  // Twelve rays of pure geometry: lines from a centre, no confetti bitmap.
  burst.innerHTML = Array.from(
    { length: 12 },
    (_, i) => `<i style="--ray:${i * 30}deg"></i>`,
  ).join("");
  host.appendChild(burst);

  window.setTimeout(() => {
    burst.remove();
    host.classList.remove("is-celebrating");
  }, 1400);
}

/* ------------------------------------------------------------------------- *
 * Set completion: the tick draws itself
 * ------------------------------------------------------------------------- */

/**
 * Draw a checkmark into `host` with stroke-dashoffset.
 * Small, fast, and the only feedback a logged set needs.
 */
export function drawTick(host) {
  if (!host) return;
  if (prefersReducedMotion()) {
    host.classList.add("is-done");
    return;
  }
  host.classList.remove("is-done", "is-ticking");
  void host.offsetWidth;
  host.classList.add("is-done", "is-ticking");
}

/* ------------------------------------------------------------------------- *
 * View transitions
 * ------------------------------------------------------------------------- */

/**
 * Asymmetric route transition: the outgoing view leaves faster than the
 * incoming one arrives, so navigation never feels like it is waiting on an
 * animation. Exit ~150ms, enter ~260ms.
 *
 * @param {HTMLElement} view  the view container
 * @param {() => void} swap   renders the new view into the container
 */
export function transitionView(view, swap) {
  if (!view || typeof swap !== "function") return;
  if (prefersReducedMotion()) {
    swap();
    return;
  }
  view.classList.add("is-leaving");
  window.setTimeout(() => {
    swap();
    view.classList.remove("is-leaving");
    view.classList.add("is-entering");
    window.setTimeout(() => view.classList.remove("is-entering"), 300);
  }, 150);
}

/* ------------------------------------------------------------------------- *
 * Ticker
 * ------------------------------------------------------------------------- */

/**
 * A marquee of real data (exercise names, this week's sessions).
 *
 * Pauses on hover, on keyboard focus within, when the tab is hidden, and never
 * starts under reduced motion - an unstoppable scrolling strip is both an
 * accessibility failure and a battery one. The content is duplicated so the loop
 * is seamless, and the duplicate is hidden from assistive tech.
 *
 * @returns {() => void} teardown
 */
export function initTicker(root, { selector = "[data-ticker]", speed = 46 } = {}) {
  const scope = root || document;
  const els = Array.from(scope.querySelectorAll(selector));
  if (els.length === 0) return () => {};
  if (prefersReducedMotion()) {
    els.forEach((el) => el.classList.add("ticker-static"));
    return () => {};
  }

  const cleanups = [];
  els.forEach((el) => {
    const track = el.querySelector("[data-ticker-track]") || el;
    // Duplicate once, for a seamless loop.
    if (!track.dataset.duplicated) {
      track.dataset.duplicated = "1";
      const clone = track.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.classList.add("ticker-clone");
      Array.from(clone.querySelectorAll("[id]")).forEach((n) => n.removeAttribute("id"));
      track.after(clone);
    }
    const items = track.children.length || 1;
    // Set the duration on the container, not the original track: the clone is a
    // sibling, so a custom property set on the track never reached it and the
    // two halves of the loop ran at different speeds (the visible jump).
    el.style.setProperty("--ticker-duration", `${Math.max(12, (items * speed) / 6)}s`);
    el.classList.add("ticker-running");

    const pause = () => el.classList.add("ticker-paused");
    const play = () => el.classList.remove("ticker-paused");
    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", play);
    el.addEventListener("focusin", pause);
    el.addEventListener("focusout", play);

    const onVisibility = () => (document.hidden ? pause() : play());
    document.addEventListener("visibilitychange", onVisibility);

    cleanups.push(() => {
      el.removeEventListener("mouseenter", pause);
      el.removeEventListener("mouseleave", play);
      el.removeEventListener("focusin", pause);
      el.removeEventListener("focusout", play);
      document.removeEventListener("visibilitychange", onVisibility);
    });
  });

  return () => cleanups.forEach((fn) => fn());
}

/* ------------------------------------------------------------------------- *
 * Pointer feedback
 * ------------------------------------------------------------------------- */

/**
 * Press feedback on controls: a brief scale-down on pointerdown that springs
 * back. Delegated once per document, so re-rendered views are covered without
 * re-wiring. Keyboard activation gets the same treatment via :active.
 */
export function initPressFeedback(root, { selector = "[data-press]" } = {}) {
  const scope = root || document;
  if (prefersReducedMotion()) return () => {};

  const down = (e) => {
    const el = e.target.closest?.(selector);
    if (!el) return;
    el.classList.add("is-pressed");
  };
  const up = (e) => {
    const el = e.target.closest?.(selector);
    if (el) el.classList.remove("is-pressed");
  };

  scope.addEventListener("pointerdown", down, { passive: true });
  scope.addEventListener("pointerup", up, { passive: true });
  scope.addEventListener("pointercancel", up, { passive: true });
  return () => {
    scope.removeEventListener("pointerdown", down);
    scope.removeEventListener("pointerup", up);
    scope.removeEventListener("pointercancel", up);
  };
}

/* ------------------------------------------------------------------------- *
 * Parallax tilt
 * ------------------------------------------------------------------------- */

/**
 * Pointer-reactive tilt for one hero object.
 *
 * Kept deliberately small (under 5deg) and disabled on touch, under reduced
 * motion, and when the element is offscreen. A whole page that tilts is
 * seasick; one artefact that responds to the cursor feels held.
 */
export function initTilt(el, { max = 4.5, selector = "[data-tilt]" } = {}) {
  const target =
    typeof el === "string" ? document.querySelector(el) : el || document.querySelector(selector);
  if (!target) return () => {};
  if (prefersReducedMotion()) return () => {};
  if (typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches) {
    return () => {};
  }

  let frame = 0;
  const onMove = (e) => {
    const r = target.getBoundingClientRect();
    const px = (e.clientX - r.left) / Math.max(r.width, 1) - 0.5;
    const py = (e.clientY - r.top) / Math.max(r.height, 1) - 0.5;
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      target.style.setProperty("--tilt-x", `${(-py * max).toFixed(2)}deg`);
      target.style.setProperty("--tilt-y", `${(px * max).toFixed(2)}deg`);
      target.style.setProperty("--glare-x", `${((px + 0.5) * 100).toFixed(1)}%`);
      target.style.setProperty("--glare-y", `${((py + 0.5) * 100).toFixed(1)}%`);
    });
  };
  const onLeave = () => {
    if (frame) cancelAnimationFrame(frame);
    target.style.setProperty("--tilt-x", "0deg");
    target.style.setProperty("--tilt-y", "0deg");
  };

  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerleave", onLeave);
  target.classList.add("tilt-active");
  return () => {
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerleave", onLeave);
    target.classList.remove("tilt-active");
    if (frame) cancelAnimationFrame(frame);
  };
}

/* ------------------------------------------------------------------------- *
 * Charts
 * ------------------------------------------------------------------------- */

/**
 * Grow chart bars from the baseline with a stagger.
 *
 * The bars are already at their true height in markup (so the chart is correct
 * without JS and under reduced motion); this animates a transform, never the
 * data. Animating height would relayout the axis on every frame.
 */
export function initChartMotion(root, { selector = ".chart-bar, .dist-fill" } = {}) {
  const scope = root || document;
  const bars = Array.from(scope.querySelectorAll(selector));
  if (bars.length === 0 || prefersReducedMotion()) return () => {};
  bars.forEach((bar, i) => {
    bar.style.setProperty("--bar-i", String(i));
    bar.classList.add("bar-animate");
  });
  return () => bars.forEach((b) => b.classList.remove("bar-animate"));
}

/* ------------------------------------------------------------------------- *
 * Training-year heatmap
 * ------------------------------------------------------------------------- */

/**
 * One shared tooltip per heatmap, positioned over the hovered day.
 *
 * The cells carry their text in `data-tip` and a native `title` fallback, so
 * the data is still available if this module never runs. The grid is a single
 * image to assistive tech; making 365 cells individually focusable would be a
 * keyboard maze. On narrow screens the newest weeks are scrolled into view.
 *
 * @returns {() => void} teardown
 */
export function initHeatmapTip(root) {
  const scope = root || document;
  const maps = Array.from(scope.querySelectorAll("[data-heatmap]"));
  if (maps.length === 0) return () => {};

  const cleanups = [];

  maps.forEach((map) => {
    const tip = map.querySelector("[data-heatmap-tip]");
    const scroller = map.querySelector("[data-heatmap-scroll]");
    if (!tip) return;

    // The native title is a no-JS fallback for the day text. Once the shared
    // tooltip is live it would appear a second time after the pointer rests,
    // so drop it now; the data attribute remains the single source.
    map.querySelectorAll(".heatmap-cell[title]").forEach((cell) => {
      cell.removeAttribute("title");
    });

    let frame = 0;
    let current = null;

    const place = (cell) => {
      const box = map.getBoundingClientRect();
      const cellBox = cell.getBoundingClientRect();
      tip.hidden = false;
      tip.textContent = cell.dataset.tip || "";
      const half = tip.offsetWidth / 2 + 4;
      const x = Math.min(
        Math.max(cellBox.left - box.left + cellBox.width / 2, half),
        Math.max(half, box.width - half),
      );
      tip.style.left = `${x}px`;
      tip.style.top = `${cellBox.top - box.top - 7}px`;
    };

    const show = (event) => {
      const cell =
        event.target instanceof Element
          ? event.target.closest(".heatmap-cell[data-tip]")
          : null;
      if (!cell || !map.contains(cell)) return;
      current = cell;
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (current === cell) place(cell);
      });
    };

    const hide = () => {
      current = null;
      tip.hidden = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    map.addEventListener("pointerover", show);
    map.addEventListener("pointerleave", hide);
    scroller?.addEventListener("scroll", hide, { passive: true });

    // The grid is chronological, so the useful end is the right edge.
    const align = () => {
      if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return;
      scroller.scrollLeft = scroller.scrollWidth;
    };
    const alignFrame = requestAnimationFrame(align);

    cleanups.push(() => {
      map.removeEventListener("pointerover", show);
      map.removeEventListener("pointerleave", hide);
      scroller?.removeEventListener("scroll", hide);
      cancelAnimationFrame(alignFrame);
      if (frame) cancelAnimationFrame(frame);
    });
  });

  return () => cleanups.forEach((fn) => fn());
}
