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
 * Motion is always enabled for this product: operating-system reduced-motion
 * preferences do not suppress the authored transitions or pointer effects.
 * The safety controls here are instead bounded effects, scoped listeners,
 * reduced work offscreen, and teardown when views change.
 *
 * Start from visible. Entrances settle INTO place from an already-legible
 * default (a clip-path wipe, a small offset) rather than fading up from
 * nothing, which is what makes motion feel cheap.
 */

/** Motion is enabled in browsers, regardless of the operating-system setting. */
export function prefersReducedMotion() {
  return typeof window === "undefined";
}

/**
 * Pointer position inside a box, normalised to -0.5 … 0.5.
 * Shared by tilt, magnetic buttons and the cursor so every surface speaks
 * the same coordinate language.
 */
export function pointerNorm(clientX, clientY, rect) {
  const width = Math.max(rect?.width || 0, 1);
  const height = Math.max(rect?.height || 0, 1);
  const left = rect?.left || 0;
  const top = rect?.top || 0;
  return {
    x: (clientX - left) / width - 0.5,
    y: (clientY - top) / height - 0.5,
  };
}

/**
 * One critically-damped spring step. Pure, so tests can assert the settle
 * without a browser frame loop. Stiffness pulls toward the target; damping
 * kills residual velocity so the plate does not wobble forever.
 */
export function springStep(current, target, velocity, { stiffness = 0.22, damping = 0.72 } = {}) {
  const nextVelocity = (Number(velocity) + (Number(target) - Number(current)) * stiffness) * damping;
  return { value: Number(current) + nextVelocity, velocity: nextVelocity };
}

/** Clamp a tilt sample so a fast flick cannot flip a card past `max`. */
export function clampUnit(value, max = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const limit = Math.abs(Number(max)) || 0.5;
  return Math.max(-limit, Math.min(limit, n));
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
 * by `selector`. Without IntersectionObserver, every element is placed in its
 * final state immediately and nothing is observed.
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
 * for the no-JS case, then animates the strips.
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
 * Pauses on hover, on keyboard focus within and when the tab is hidden. The
 * content is duplicated so the loop is seamless, and the duplicate is hidden
 * from assistive tech.
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
 * Pointer-reactive tilt for every `[data-tilt]` surface in a scope.
 *
 * The listener is delegated from the stable container, so cards repainted by a
 * view change keep responding without re-binding. Kept deliberately small
 * (under 5deg). Fine pointers steer continuously;
 * touch gets a brief press-and-drag tilt that resets on release. The 3D class is
 * added on first interaction, after entrance motion, so the two never fight.
 *
 * @param {Element|string} [el] element, container or selector; defaults to document
 * @param {{max?: number, selector?: string}} [options]
 * @returns {() => void} teardown
 */
export function initTilt(el, { max = 4.5, selector = "[data-tilt]" } = {}) {
  const scope =
    typeof el === "string"
      ? document.querySelector(el)
      : el || (typeof document !== "undefined" ? document : null);
  if (!scope) return () => {};
  if (prefersReducedMotion()) return () => {};
  const fine = window.matchMedia?.("(hover: hover) and (pointer: fine)");
  const coarse = window.matchMedia?.("(pointer: coarse)");
  if (fine && coarse && !fine.matches && !coarse.matches) return () => {};

  const isTarget = scope.matches?.(selector) ?? false;
  let frame = 0;
  let target = null;
  let activeTouch = null;
  let tiltMax = max;
  let px = 0;
  let py = 0;

  let rx = 0;
  let ry = 0;
  let vx = 0;
  let vy = 0;

  const paint = () => {
    frame = 0;
    if (!target) return;
    const sx = springStep(rx, px, vx);
    const sy = springStep(ry, py, vy);
    rx = sx.value;
    vx = sx.velocity;
    ry = sy.value;
    vy = sy.velocity;
    target.style.setProperty("--tilt-x", `${(-ry * tiltMax).toFixed(2)}deg`);
    target.style.setProperty("--tilt-y", `${(rx * tiltMax).toFixed(2)}deg`);
    target.style.setProperty("--glare-x", `${((rx + 0.5) * 100).toFixed(1)}%`);
    target.style.setProperty("--glare-y", `${((ry + 0.5) * 100).toFixed(1)}%`);
    const leftover = Math.abs(px - rx) + Math.abs(py - ry) + Math.abs(vx) + Math.abs(vy);
    if (leftover > 0.001) frame = requestAnimationFrame(paint);
  };

  const reset = () => {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    if (target) {
      target.style.setProperty("--tilt-x", "0deg");
      target.style.setProperty("--tilt-y", "0deg");
      target.classList.remove("is-tilting");
    }
    target = null;
    px = 0;
    py = 0;
    rx = 0;
    ry = 0;
    vx = 0;
    vy = 0;
  };

  const onMove = (event) => {
    if (prefersReducedMotion()) return;
    const isTouch = event.pointerType === "touch";
    if (isTouch && event.pointerId !== activeTouch) return;
    if (!isTouch && event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") {
      return;
    }
    const found = event.target instanceof Element ? event.target.closest(selector) : null;
    const next = found && (isTarget ? found === scope : scope.contains(found)) ? found : null;
    if (!next) {
      if (!isTouch) reset();
      return;
    }
    if (next !== target) {
      reset();
      target = next;
      const value = Number(next.dataset.tiltMax);
      tiltMax = Number.isFinite(value) && value > 0 ? value : max;
      next.classList.add("is-tilt-ready", "is-tilting");
    }
    const rect = next.getBoundingClientRect();
    const n = pointerNorm(event.clientX, event.clientY, rect);
    px = clampUnit(n.x);
    py = clampUnit(n.y);
    if (!frame) frame = requestAnimationFrame(paint);
  };

  const onDown = (event) => {
    if (event.pointerType !== "touch" || prefersReducedMotion()) return;
    const found = event.target instanceof Element ? event.target.closest(selector) : null;
    if (!found || (isTarget ? found !== scope : !scope.contains(found))) return;
    activeTouch = event.pointerId;
    onMove(event);
  };
  const onTouchEnd = (event) => {
    if (event.pointerId !== activeTouch) return;
    activeTouch = null;
    reset();
  };

  scope.addEventListener("pointermove", onMove, { passive: true });
  scope.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointerup", onTouchEnd, { passive: true });
  window.addEventListener("pointercancel", onTouchEnd, { passive: true });
  scope.addEventListener("pointerleave", reset);
  scope.addEventListener("pointercancel", reset);
  window.addEventListener("blur", reset);
  return () => {
    scope.removeEventListener("pointermove", onMove);
    scope.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onTouchEnd);
    window.removeEventListener("pointercancel", onTouchEnd);
    scope.removeEventListener("pointerleave", reset);
    scope.removeEventListener("pointercancel", reset);
    window.removeEventListener("blur", reset);
    reset();
    const cleaned = isTarget ? [scope] : [...scope.querySelectorAll(".is-tilt-ready")];
    cleaned.forEach((node) => node.classList.remove("is-tilt-ready", "is-tilting"));
  };
}

/* ------------------------------------------------------------------------- *
 * Charts
 * ------------------------------------------------------------------------- */

/**
 * Grow chart bars from the baseline with a stagger.
 *
 * The bars are already at their true height in markup (so the chart is correct
 * without JS); this animates a transform, never the
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

/* ------------------------------------------------------------------------- *
 * Ambient pointer light and scroll meter
 * ------------------------------------------------------------------------- */

/**
 * A very quiet shop-light behind the workspace that follows a fine pointer.
 *
 * The app is a ledger, not a toy, so the light is fixed at low opacity and
 * sits behind the shell; it never sits on top of data or changes legibility.
 * Touch gets a short-lived light on press.
 *
 * @returns {() => void} teardown
 */
export function initAmbientLight(root = document) {
  if (typeof window === "undefined" || prefersReducedMotion()) return () => {};
  const fine = window.matchMedia?.("(hover: hover) and (pointer: fine)");
  const coarse = window.matchMedia?.("(pointer: coarse)");
  if (fine && coarse && !fine.matches && !coarse.matches) return () => {};

  const scope = root || document;
  const el = scope.querySelector("[data-ambient]");
  if (!el) return () => {};

  let frame = 0;
  let activeTouch = null;
  let touchHideTimer = 0;
  let x = window.innerWidth * 0.5;
  let y = window.innerHeight * 0.18;

  const paint = () => {
    frame = 0;
    el.style.setProperty("--ambient-x", `${x.toFixed(0)}px`);
    el.style.setProperty("--ambient-y", `${y.toFixed(0)}px`);
  };

  const move = (event) => {
    const isTouch = event.pointerType === "touch";
    if (isTouch && event.pointerId !== activeTouch) return;
    if (!isTouch && event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    x = event.clientX;
    y = event.clientY;
    el.classList.add("is-live");
    if (!frame) frame = requestAnimationFrame(paint);
  };

  const onDown = (event) => {
    if (event.pointerType !== "touch" || prefersReducedMotion()) return;
    activeTouch = event.pointerId;
    if (touchHideTimer) clearTimeout(touchHideTimer);
    move(event);
  };
  const onTouchEnd = (event) => {
    if (event.pointerId !== activeTouch) return;
    activeTouch = null;
    touchHideTimer = window.setTimeout(hide, 520);
  };
  const hide = () => {
    if (touchHideTimer) clearTimeout(touchHideTimer);
    touchHideTimer = 0;
    el.classList.remove("is-live");
  };

  scope.addEventListener("pointermove", move, { passive: true });
  scope.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointerup", onTouchEnd, { passive: true });
  window.addEventListener("pointercancel", onTouchEnd, { passive: true });
  document.addEventListener("pointerleave", hide);
  window.addEventListener("blur", hide);
  motionQuery?.addEventListener?.("change", onMotionChange);

  return () => {
    scope.removeEventListener("pointermove", move);
    scope.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onTouchEnd);
    window.removeEventListener("pointercancel", onTouchEnd);
    document.removeEventListener("pointerleave", hide);
    window.removeEventListener("blur", hide);
    if (frame) cancelAnimationFrame(frame);
    hide();
  };
}

/**
 * Thin progress rule under the topbar. It is a reading aid, not a loading
 * indicator: it tracks the document, never a route transition.
 *
 * @returns {() => void} teardown
 */
export function initScrollMeter(root = document) {
  const scope = root || document;
  const bar = scope.querySelector("[data-app-scroll]");
  if (!bar) return () => {};

  const topbar = document.querySelector(".app-topbar");
  let frame = 0;

  const paint = () => {
    frame = 0;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    bar.style.setProperty("--app-progress", progress.toFixed(4));
    topbar?.classList.toggle("is-scrolled", window.scrollY > 8);
  };

  const queue = () => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  paint();

  return () => {
    window.removeEventListener("scroll", queue);
    window.removeEventListener("resize", queue);
    if (frame) cancelAnimationFrame(frame);
    topbar?.classList.remove("is-scrolled");
  };
}

/* ------------------------------------------------------------------------- *
 * Cursor, magnetic pull, gyro lean, tap ripples
 * ------------------------------------------------------------------------- */

const CONTROL_SELECTOR = "a, button, summary, [role=tab], [role=button], .nav-item, .chip, .tick";

/**
 * A dual cursor for fine pointers: a tight core that tracks the pointer 1:1
 * and a heavier ring that springs behind it. Expands over controls. Never
 * replaces the OS cursor and never appears on touch.
 *
 * @returns {() => void} teardown
 */
export function initCursor(root = document) {
  if (typeof window === "undefined" || prefersReducedMotion()) return () => {};
  const fine = window.matchMedia?.("(hover: hover) and (pointer: fine)");
  if (!fine?.matches) return () => {};

  const scope = root || document;
  const host = scope.body || (scope === document ? document.body : scope);
  if (!host) return () => {};

  const core = document.createElement("span");
  core.className = "cursor-core";
  core.setAttribute("aria-hidden", "true");
  const ring = document.createElement("span");
  ring.className = "cursor-orbit";
  ring.setAttribute("aria-hidden", "true");
  host.append(core, ring);
  document.documentElement.classList.add("has-cursor");

  let pointerX = -40;
  let pointerY = -40;
  let ringX = pointerX;
  let ringY = pointerY;
  let ringVx = 0;
  let ringVy = 0;
  let frame = 0;

  const paint = () => {
    frame = 0;
    core.style.transform = `translate3d(${pointerX}px, ${pointerY}px, 0)`;
    const sx = springStep(ringX, pointerX, ringVx, { stiffness: 0.18, damping: 0.68 });
    const sy = springStep(ringY, pointerY, ringVy, { stiffness: 0.18, damping: 0.68 });
    ringX = sx.value;
    ringVx = sx.velocity;
    ringY = sy.value;
    ringVy = sy.velocity;
    ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
    const leftover = Math.abs(pointerX - ringX) + Math.abs(pointerY - ringY) + Math.abs(ringVx) + Math.abs(ringVy);
    if (leftover > 0.4) frame = requestAnimationFrame(paint);
  };

  const onMove = (event) => {
    if (event.pointerType && event.pointerType !== "mouse") return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    const target = event.target instanceof Element ? event.target : null;
    const over = Boolean(target?.closest(CONTROL_SELECTOR));
    core.classList.toggle("is-over-control", over);
    ring.classList.toggle("is-over-control", over);
    core.classList.remove("is-away");
    ring.classList.remove("is-away");
    if (!frame) frame = requestAnimationFrame(paint);
  };

  const hide = () => {
    core.classList.add("is-away");
    ring.classList.add("is-away");
  };
  const show = () => {
    core.classList.remove("is-away");
    ring.classList.remove("is-away");
  };

  const down = () => {
    core.classList.add("is-down");
    ring.classList.add("is-down");
  };
  const up = () => {
    core.classList.remove("is-down");
    ring.classList.remove("is-down");
  };

  document.addEventListener("pointermove", onMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", hide);
  document.documentElement.addEventListener("pointerenter", show);
  document.addEventListener("pointerdown", down, { passive: true });
  window.addEventListener("pointerup", up, { passive: true });
  return () => {
    document.removeEventListener("pointermove", onMove);
    document.documentElement.removeEventListener("pointerleave", hide);
    document.documentElement.removeEventListener("pointerenter", show);
    document.removeEventListener("pointerdown", down);
    window.removeEventListener("pointerup", up);
    if (frame) cancelAnimationFrame(frame);
    core.remove();
    ring.remove();
    document.documentElement.classList.remove("has-cursor");
  };
}

/**
 * Magnetic pull on `[data-magnetic]` controls. Fine pointers only; springs
 * back on leave. Delegated so re-rendered views stay magnetic without rebind.
 *
 * @returns {() => void} teardown
 */
export function initMagnetic(root, { selector = "[data-magnetic]", strength = 8 } = {}) {
  const scope = root || document;
  if (prefersReducedMotion()) return () => {};
  const fine = window.matchMedia?.("(hover: hover) and (pointer: fine)");
  if (!fine?.matches) return () => {};

  let frame = 0;
  let target = null;
  let mx = 0;
  let my = 0;
  let rx = 0;
  let ry = 0;
  let vx = 0;
  let vy = 0;
  let pull = strength;

  const paint = () => {
    frame = 0;
    if (!target) return;
    const sx = springStep(rx, mx, vx, { stiffness: 0.28, damping: 0.7 });
    const sy = springStep(ry, my, vy, { stiffness: 0.28, damping: 0.7 });
    rx = sx.value;
    vx = sx.velocity;
    ry = sy.value;
    vy = sy.velocity;
    target.style.setProperty("--mag-x", `${rx.toFixed(2)}px`);
    target.style.setProperty("--mag-y", `${ry.toFixed(2)}px`);
    const leftover = Math.abs(mx - rx) + Math.abs(my - ry) + Math.abs(vx) + Math.abs(vy);
    if (leftover > 0.05) frame = requestAnimationFrame(paint);
  };

  const rest = () => {
    mx = 0;
    my = 0;
    if (target && !frame) frame = requestAnimationFrame(paint);
  };

  const onMove = (event) => {
    if (prefersReducedMotion()) return;
    if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    const found = event.target instanceof Element ? event.target.closest(selector) : null;
    const next = found && scope.contains(found) ? found : null;
    if (!next) {
      if (target) rest();
      return;
    }
    if (next !== target) {
      if (target) {
        target.style.setProperty("--mag-x", "0px");
        target.style.setProperty("--mag-y", "0px");
      }
      target = next;
      rx = 0;
      ry = 0;
      vx = 0;
      vy = 0;
      const value = Number(next.dataset.magnetic);
      pull = Number.isFinite(value) && value > 0 ? value : strength;
    }
    const rect = next.getBoundingClientRect();
    const n = pointerNorm(event.clientX, event.clientY, rect);
    mx = clampUnit(n.x) * pull * 2;
    my = clampUnit(n.y) * pull * 1.4;
    if (!frame) frame = requestAnimationFrame(paint);
  };

  const onLeave = () => {
    rest();
  };

  scope.addEventListener("pointermove", onMove, { passive: true });
  scope.addEventListener("pointerleave", onLeave);
  window.addEventListener("blur", onLeave);

  return () => {
    scope.removeEventListener("pointermove", onMove);
    scope.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("blur", onLeave);
    if (frame) cancelAnimationFrame(frame);
    if (target) {
      target.style.setProperty("--mag-x", "0px");
      target.style.setProperty("--mag-y", "0px");
    }
  };
}

/**
 * Device-orientation lean for coarse pointers. A phone held in the rack
 * tilts the `[data-tilt]` surfaces a few degrees — the same language as
 * the cursor, without fighting a scroll. Permission is requested on the
 * first touch so iOS 13+ can grant it from a user gesture.
 *
 * @returns {() => void} teardown
 */
export function initGyroTilt(root, { selector = "[data-tilt]", max = 5 } = {}) {
  if (typeof window === "undefined" || prefersReducedMotion()) return () => {};
  const coarse = window.matchMedia?.("(pointer: coarse)");
  if (coarse && !coarse.matches) return () => {};
  if (typeof window.DeviceOrientationEvent === "undefined") return () => {};

  const scope = root || document;
  let frame = 0;
  let gx = 0;
  let gy = 0;
  let listening = false;
  let asked = false;

  const paint = () => {
    frame = 0;
    const nodes = scope.querySelectorAll ? scope.querySelectorAll(selector) : [];
    nodes.forEach((el) => {
      el.classList.add("is-tilt-ready", "is-tilting");
      el.style.setProperty("--tilt-x", `${(gy * max).toFixed(2)}deg`);
      el.style.setProperty("--tilt-y", `${(gx * max).toFixed(2)}deg`);
      el.style.setProperty("--glare-x", `${((gx + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty("--glare-y", `${((gy + 0.5) * 100).toFixed(1)}%`);
    });
  };

  const onOrient = (event) => {
    if (prefersReducedMotion()) return;
    const beta = Number(event.beta) || 0;
    const gamma = Number(event.gamma) || 0;
    gy = clampUnit(beta / 36, 0.5);
    gx = clampUnit(gamma / 36, 0.5);
    if (!frame) frame = requestAnimationFrame(paint);
  };

  const start = () => {
    if (listening) return;
    listening = true;
    window.addEventListener("deviceorientation", onOrient, { passive: true });
  };

  const request = () => {
    if (asked || prefersReducedMotion()) return;
    asked = true;
    const requestPermission = window.DeviceOrientationEvent?.requestPermission;
    if (typeof requestPermission === "function") {
      requestPermission()
        .then((state) => {
          if (state === "granted") start();
        })
        .catch(() => {});
    } else {
      start();
    }
  };

  scope.addEventListener("pointerdown", request, { passive: true, once: true });
  return () => {
    scope.removeEventListener("pointerdown", request);
    window.removeEventListener("deviceorientation", onOrient);
    if (frame) cancelAnimationFrame(frame);
  };
}

/**
 * A short ripple where a finger lands on a control. Mouse never sees it;
 * a scroll that moved more than 14px is not
 * a tap and does not fire.
 *
 * @returns {() => void} teardown
 */
export function initTapRipple(root = document) {
  if (typeof window === "undefined" || prefersReducedMotion()) return () => {};
  const scope = root || document;
  let tapStart = null;
  const ripples = new Set();

  const interactive = (node) =>
    node instanceof Element ? node.closest(CONTROL_SELECTOR + ", .routine-card, .tile, .panel, [data-tilt], .feature-row, .faq-item") : null;

  const onDown = (event) => {
    if (event.pointerType === "mouse" || prefersReducedMotion()) return;
    if (!interactive(event.target)) return;
    tapStart = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      id: event.pointerId,
    };
  };

  const onUp = (event) => {
    if (!tapStart || event.pointerId !== tapStart.id) return;
    const start = tapStart;
    tapStart = null;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > 14 || performance.now() - start.time > 700) return;
    const host = scope.body || (scope === document ? document.body : scope);
    if (!host) return;
    const glow = document.createElement("span");
    glow.className = "tap-glow";
    glow.setAttribute("aria-hidden", "true");
    glow.style.left = `${event.clientX}px`;
    glow.style.top = `${event.clientY}px`;
    const done = () => {
      glow.remove();
      ripples.delete(glow);
    };
    glow.addEventListener("animationend", done, { once: true });
    host.append(glow);
    ripples.add(glow);
    window.setTimeout(done, 900);
  };

  const onCancel = () => {
    tapStart = null;
  };

  scope.addEventListener("pointerdown", onDown, { passive: true });
  scope.addEventListener("pointerup", onUp, { passive: true });
  scope.addEventListener("pointercancel", onCancel, { passive: true });

  return () => {
    scope.removeEventListener("pointerdown", onDown);
    scope.removeEventListener("pointerup", onUp);
    scope.removeEventListener("pointercancel", onCancel);
    ripples.forEach((node) => node.remove());
    ripples.clear();
  };
}
