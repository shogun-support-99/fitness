/**
 * IronLog — sliding indicator ("limelight").
 *
 * WHAT THIS IS
 * ------------
 * A single pill that slides between the options of a segmented control, tabs or
 * nav, instead of each option swapping its own background. The move is borrowed
 * from the "limelight" navigation pattern and re-skinned for this app: no glow,
 * no gradient, no colour — a solid surface plate travelling over a sunken track,
 * which is the same elevation language as the rest of the chrome.
 *
 * WHY IT IS SHARED
 * ----------------
 * The landing page and the app are separate bundles, but both want this. It
 * lives in assets/ (already shared: the app loads assets/css/tailwind.css) so
 * there is one implementation rather than two that drift.
 *
 * DESIGN NOTES
 * ------------
 * - The active option is found from ARIA state or a class, so the indicator
 *   follows whatever the markup already claims is active. Nothing here owns
 *   state.
 * - Geometry is computed by the pure `indicatorBox()` below, which is why the
 *   module is testable without a DOM.
 * - The indicator is absolutely positioned, so it stays out of the flex flow
 *   and scrolls with the content of a horizontally scrolling row.
 * - Motion is entirely CSS-driven and killed under prefers-reduced-motion, so
 *   the pill jumps instead of sliding.
 */

/** What counts as "the active one", in the order we look for it. */
export const ACTIVE_SELECTOR = [
  '[aria-selected="true"]',
  '[aria-current="true"]',
  '[aria-checked="true"]',
  ".is-active",
  ".is-on",
].join(", ");

/**
 * Where the indicator should sit, in container-relative coordinates.
 *
 * Pure: takes plain rect-like objects so it can be tested without a DOM. The
 * scroll offsets matter for a horizontally scrolling chip row, where the
 * indicator lives inside the scrolled content but the rects are viewport based.
 *
 * @returns {{x: number, y: number, width: number, height: number}|null}
 */
export function indicatorBox(container, target, scrollLeft = 0, scrollTop = 0) {
  if (!container || !target) return null;
  const width = Number(target.width) || 0;
  const height = Number(target.height) || 0;
  // A hidden container (a nav collapsed behind a media query) measures zero.
  // Returning null keeps the indicator invisible rather than pinning it to 0,0.
  if (width <= 0 || height <= 0) return null;
  return {
    x: (Number(target.left) || 0) - (Number(container.left) || 0) + (Number(scrollLeft) || 0),
    y: (Number(target.top) || 0) - (Number(container.top) || 0) + (Number(scrollTop) || 0),
    width,
    height,
  };
}

/**
 * Re-centre a box to a fixed width.
 *
 * Used by the underline variant, where the plate is deliberately narrower than
 * the option it marks — the landing nav's yellow notch is a 16px tab, not a
 * full-width underline. Clamped so a plate wider than its target still starts
 * at the target's left edge rather than overhanging into the previous one.
 *
 * @returns the box, or the original if no fixed width applies
 */
export function centerOn(box, width) {
  if (!box || !Number.isFinite(width) || width <= 0) return box;
  const shift = Math.max((box.width - width) / 2, 0);
  return { ...box, x: box.x + shift, width: Math.min(width, box.width) };
}

/**
 * Attach a sliding indicator to a container.
 *
 * @param {Element} container
 * @param {object} [options]
 * @param {string} [options.active] selector for the active child
 * @param {"fill"|"underline"} [options.track] "fill" sizes the pill to the
 *   whole option; "underline" moves a fixed-height bar along the bottom
 * @param {string} [options.className]
 * @returns {{update: () => void, destroy: () => void, el: Element}|null}
 */
export function slidingIndicator(container, options = {}) {
  if (!container || typeof container.querySelector !== "function") return null;

  const {
    active = ACTIVE_SELECTOR,
    track = "fill",
    className = "seg-indicator",
    // Fixed plate width, for marks that are narrower than their option.
    width = null,
  } = options;

  const indicator = container.ownerDocument.createElement("span");
  // The track name doubles as a modifier class, so each variant ("fill",
  // "underline") is styled in CSS rather than branching here.
  indicator.className = `${className} is-${track}`;
  // Decorative: the active state is already announced by aria-selected or
  // aria-current on the option itself.
  indicator.setAttribute("aria-hidden", "true");
  container.appendChild(indicator);

  let frame = 0;
  let settled = false;

  function update() {
    const target = container.querySelector(active);
    const box = target
      ? indicatorBox(
          container.getBoundingClientRect(),
          target.getBoundingClientRect(),
          container.scrollLeft,
          container.scrollTop,
        )
      : null;

    if (!box) {
      indicator.style.opacity = "0";
      return;
    }

    const placed = centerOn(box, width);
    indicator.style.width = `${placed.width}px`;
    indicator.style.transform = `translateX(${placed.x}px)`;
    if (track === "fill") {
      indicator.style.height = `${box.height}px`;
      indicator.style.top = `${box.y}px`;
    }
    indicator.style.opacity = "1";

    // The first placement must not animate: the pill would otherwise fly in
    // from the left edge every time a view renders. Position it, then let the
    // CSS transition take over on the next frame.
    if (!settled) {
      indicator.style.transition = "none";
      requestAnimationFrame(() => {
        indicator.style.transition = "";
        settled = true;
      });
    }
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  }

  // Re-measure when the container changes size, which covers font loading,
  // responsive breakpoints, a sidebar collapsing, and a nav becoming visible
  // again after being display:none (it measures zero while hidden).
  let observer = null;
  if (typeof ResizeObserver === "function") {
    observer = new ResizeObserver(schedule);
    observer.observe(container);
    for (const child of container.children) {
      if (child !== indicator) observer.observe(child);
    }
  }

  update();

  // Entrance animations may still be running when a view renders. A translate
  // cancels out (both boxes move together, and only the difference is used),
  // but reveal-draw and reveal-grow scale, and a scaled measurement would be
  // baked into the plate until something happened to re-measure it. Nothing
  // puts a control inside one today; this is the cheap guard for when it does.
  const settle = setTimeout(schedule, 700);

  return {
    el: indicator,
    update: schedule,
    destroy() {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      observer?.disconnect();
      indicator.remove();
    },
  };
}

/**
 * Attach indicators to every opted-in container inside a root.
 *
 * Opt-in rather than automatic: a wrapping chip row (the rest-timer presets)
 * would put a pill on one line and leave the next line bare.
 *
 * @returns {() => void} teardown
 */
export function initIndicators(root = document, { selector = "[data-indicator]" } = {}) {
  const handles = [];
  for (const container of root.querySelectorAll(selector)) {
    const track = container.dataset.indicator || "fill";
    const handle = slidingIndicator(container, { track });
    if (handle) handles.push(handle);
  }
  return () => {
    for (const handle of handles) handle.destroy();
  };
}
