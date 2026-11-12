/**
 * IronLog — application bootstrap.
 *
 * Owns the store, the router, the rest timer and the render loop. All DOM
 * behaviour is wired through a single delegated listener keyed on
 * [data-action], so views stay pure functions of state.
 */

import { STORAGE_KEY, Store } from "./store.js";
import { RestTimer, formatElapsed, formatSeconds } from "./timer.js";
import { Router, parseHash } from "./router.js";
import { searchExercises } from "./exercises.js";
import { hasInstructions, stepsFor } from "./catalogue.js";
import { compactNumber, estimatedOneRepMax } from "./stats.js";
import { esc, icon } from "./ui.js";
import {
  initReveals,
  initCounters,
  initChartMotion,
  initHeatmapTip,
  initPressFeedback,
  initTicker,
  initTilt,
  initAmbientLight,
  initScrollMeter,
  initSpatialField,
  initSpotlight,
  initMagnetic,
  initGyroTilt,
  initTapRipple,
  drawTick,
  celebrateRecord,
  prefersReducedMotion,
} from "./motion.js";

import { renderHome } from "./views/home.js";
import { renderWorkout, renderPickerRow, renderLoggerBody, PICKER_CAP } from "./views/workout.js";
import { renderHistory } from "./views/history.js";
import { renderStats } from "./views/stats.js";
import { renderLibrary, renderLibraryRow, renderExerciseDetail, renderCustomSheet, RESULT_CAP } from "./views/library.js";
import { renderSettings } from "./views/settings.js";
import { renderRoutineEditor, blankRoutineDraft, routineDraft } from "./views/routine-editor.js";
import { routineExerciseIds } from "./views/routines.js";

const store = new Store();
let elapsedTimer = null;
let pickerState = { query: "", muscle: "all" };
let libraryState = { query: "", muscle: "all" };

/**
 * Profile chart state: which window the muscle heatmap reads, which
 * granularity the volume chart aggregates, and which personal-record
 * category the board filters. View-local, like the library filters, so the
 * segmented controls on the profile do not reset on every unrelated render.
 */
let statsState = { musclePeriod: "7d", volumePeriod: "week", prKind: "all" };

/**
 * The routine being edited. The editor is a route rather than a sheet, so this
 * draft survives the re-renders that follow each muscle toggle without writing
 * a half-finished routine to storage on every tap.
 */
let routineDraftState = null;

/** The exercise whose detail sheet is open, plus its async instruction state. */
let detailState = { exercise: null, stepsState: "idle", stepsResult: null };

/** Once the user dismisses the update banner, leave them alone this session. */
let updateDismissed = false;

/**
 * True inside the packaged Android shell. The shell serves the site from a
 * stable local HTTPS origin, so localStorage survives APK updates; the native
 * side owns update prompts and the file-picker export path.
 */
const isNativeShell = Boolean(globalThis.IronLogNative);

const restTimer = new RestTimer({
  onFinish: () => notify("Rest complete", "Time for your next set."),
});

const router = new Router({ onNavigate: (route) => render(route) });

const $ = (selector, root = document) => root.querySelector(selector);

/**
 * Motion teardowns. Every re-render replaces the outlet's markup, so any
 * IntersectionObserver watching the old nodes must be disconnected first or it
 * leaks for the life of the page. A logger stays open for an hour.
 */
let motionTeardowns = [];
let lastRenderedRoute = null;
let routeAnimationTimer = 0;
let detailTiltBound = false;
function teardownMotion() {
  for (const fn of motionTeardowns) {
    try { fn(); } catch { /* a torn-down observer is not an error */ }
  }
  motionTeardowns = [];
}
function startMotion(root) {
  teardownMotion();
  motionTeardowns.push(initReveals(root));
  motionTeardowns.push(initCounters(root));
  motionTeardowns.push(initChartMotion(root));
  motionTeardowns.push(initHeatmapTip(root));
  motionTeardowns.push(initTicker(root));
  motionTeardowns.push(initTilt(root, { max: 3.4 }));
}
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Tab-bar titles. One line per route so the bar and <title> never disagree. */
const ROUTE_TITLES = {
  home: "Home",
  workout: "Workout",
  "routine-editor": "Routine builder",
  history: "History",
  stats: "Profile",
  library: "Exercises",
  settings: "Settings",
};

/** The nav glider is measured from layout, so it must be re-placed on resize. */
const desktopNav = window.matchMedia("(min-width: 720px)");
let navGliderPlaced = false;
let navResizeFrame = 0;

function layoutNavGlider({ animate = true } = {}) {
  const nav = $(".nav");
  const glider = $(".nav-glider");
  if (!nav || !glider) return;

  const active = $$(".nav .nav-item.is-active").find(
    (item) => item.getClientRects().length > 0,
  );
  if (!active) {
    glider.classList.remove("is-ready");
    navGliderPlaced = false;
    return;
  }

  // The phone bar has one yellow icon tile; the desktop rail has a full row.
  // Collapsed desktop still uses the row: the icon alone is too small to
  // anchor a 3px notch cleanly.
  const iconOnly = !desktopNav.matches;
  const target = iconOnly ? active.querySelector(".nav-icon") : active;
  if (!target) return;

  // offset* is layout geometry, so it ignores the one-off -7px translate the
  // nav entrance animation applies. getBoundingClientRect() would bake that
  // skew into the glider if it happened to be measured mid-entrance.
  const box = {
    left: active.offsetLeft + (iconOnly ? target.offsetLeft : 0),
    top: active.offsetTop + (iconOnly ? target.offsetTop : 0),
    width: target.offsetWidth,
    height: target.offsetHeight,
  };
  const canAnimate = animate && navGliderPlaced && box.width > 0;

  if (!canAnimate) glider.classList.add("is-laying-out");
  nav.dataset.glider = iconOnly ? "icon" : "tile";
  glider.style.setProperty("--glider-x", `${box.left}px`);
  glider.style.setProperty("--glider-y", `${box.top}px`);
  glider.style.setProperty("--glider-w", `${box.width}px`);
  glider.style.setProperty("--glider-h", `${box.height}px`);
  glider.classList.add("is-ready");
  navGliderPlaced = true;

  if (!canAnimate) {
    void glider.offsetWidth;
    glider.classList.remove("is-laying-out");
  }
}

function placeNavGlider() {
  if (navResizeFrame) return;
  navResizeFrame = requestAnimationFrame(() => {
    navResizeFrame = 0;
    layoutNavGlider({ animate: false });
  });
}

function initNavGlider() {
  const nav = $(".nav");
  if (!nav || !$(".nav-glider")) return;
  layoutNavGlider({ animate: false });
  window.addEventListener("resize", placeNavGlider, { passive: true });
  desktopNav.addEventListener?.("change", placeNavGlider);
  document.fonts?.ready.then(() => layoutNavGlider({ animate: false }));
  if ("ResizeObserver" in window) {
    new ResizeObserver(placeNavGlider).observe(nav);
  }
}

// ── Render loop ────────────────────────────────────────────────────────────

const VIEWS = {
  home: () => renderHome(store),
  workout: () => renderWorkout(store, { elapsed: currentElapsed(), timer: restTimer.snapshot() }),
  history: (params) => renderHistory(store, { openId: params.get("id") }),
  stats: () => renderStats(store, statsState),
  library: () => renderLibrary(store, libraryState),
  settings: () => renderSettings(store),
  "routine-editor": (params) => {
    const id = params.get("id");
    if (!routineDraftState) {
      const existing = id ? store.settings.routines.find((routine) => routine.id === id) : null;
      routineDraftState = existing
        ? routineDraft(existing, store.settings.restSeconds)
        : blankRoutineDraft(store.settings.restSeconds);
    }
    return renderRoutineEditor(store, routineDraftState);
  },
};

function currentElapsed() {
  const active = store.activeWorkout();
  if (!active) return "00:00";
  return formatElapsed(Date.now() - new Date(active.startedAt).getTime());
}

/**
 * Publish the theme preference to the document.
 *
 * This was stored but never applied, so the setting did nothing. "auto" follows
 * the OS via the media query in the token block; light and dark pin it.
 */
function applyTheme() {
  const theme = store.settings.theme ?? "light";
  const root = document.documentElement;
  if (theme === "auto") {
    root.removeAttribute("data-theme");
    return;
  }
  root.setAttribute("data-theme", theme);
}

function render(navigation = router.current) {
  const outlet = $("#view-outlet");
  if (!outlet) return;

  const focusBefore = document.activeElement;
  const focusKey = focusBefore?.dataset?.focusKey ?? null;

  const view = VIEWS[navigation.route] ?? VIEWS.home;
  const routeChanged = lastRenderedRoute !== null && lastRenderedRoute !== navigation.route;

  // A route change replaces the outlet, taking any sheet in it with it. Drop the
  // detail state and the scroll lock too: left behind, the lock freezes the page
  // and the next render on the library route reopens a sheet nobody asked for.
  if (routeChanged) {
    detailState = { exercise: null, stepsState: "idle", stepsResult: null };
    document.body.classList.remove("sheet-open");
    // Leaving the routine editor abandons an unsaved draft; re-entering the
    // route later starts from a clean card rather than the last edit.
    if (lastRenderedRoute === "routine-editor") routineDraftState = null;
  }

  outlet.innerHTML = view(navigation.params);
  lastRenderedRoute = navigation.route;

  // Navigate as one workspace, not as a page full of independent entrances.
  // Same-route logging updates never replay this transition.
  if (routeChanged && !prefersReducedMotion()) {
    clearTimeout(routeAnimationTimer);
    outlet.classList.remove("is-entering");
    void outlet.offsetWidth;
    outlet.classList.add("is-entering");
    routeAnimationTimer = window.setTimeout(() => outlet.classList.remove("is-entering"), 420);
  }

  // Motion is wired after the markup exists, and torn down before the next
  // render, so a view change never leaves an observer on detached nodes.
  startMotion(outlet);

  syncNav(navigation.route);
  restoreFocus(focusKey);
  syncElapsedClock();
  syncMiniPlayer();

  // Replacing the outlet rebuilds the sheet markup, which would silently close
  // an open exercise detail — for instance when the catalogue finishes loading
  // while the user is reading one. Repaint it from state instead.
  if (detailState.exercise) renderDetail();

  // Storage protection is async; fill the row after the settings markup exists.
  refreshStorageProtection();
}

function syncNav(route) {
  // The routine editor is part of the Workout tab; keep the tab lit while it is open.
  const navRoute = route === "routine-editor" ? "workout" : route;
  $$(".nav-item").forEach((item) => {
    const isActive = item.dataset.route === navRoute;
    item.classList.toggle("is-active", isActive);
    item.setAttribute("aria-current", isActive ? "page" : "false");
  });
  // The tab bar replaces the old rail, so the title and the document title both
  // follow the active tab rather than a sidebar label.
  const title = ROUTE_TITLES[route] ?? "IronLog";
  const node = $("[data-topbar-title]");
  if (node) node.textContent = title;
  document.title = `${title} · IronLog`;
  layoutNavGlider({ animate: navGliderPlaced });
}

/** Keep focus where the user was after a re-render, using data-focus-key. */
function restoreFocus(key) {
  if (!key) return;
  const target = $(`[data-focus-key="${CSS.escape(key)}"]`);
  if (!target) return;
  target.focus();
  if (target instanceof HTMLInputElement && target.type !== "checkbox") {
    const len = target.value.length;
    target.setSelectionRange(len, len);
  }
}

function syncElapsedClock() {
  const active = store.activeWorkout();
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
  if (!active) return;
  elapsedTimer = setInterval(() => {
    const node = $('[data-role="elapsed"]');
    if (node) node.textContent = currentElapsed();
    const miniElapsed = $("[data-mini-elapsed]");
    if (miniElapsed) miniElapsed.textContent = currentElapsed();
  }, 1000);
}

/**
 * The floating resume bar. It appears on every route except the logger itself,
 * which is already showing the live workout, and disappears the moment the
 * session is finished or discarded.
 */
function syncMiniPlayer() {
  const player = $("#mini-player");
  if (!player) return;
  const active = store.activeWorkout();
  const visible = Boolean(active) && router.current.route !== "workout";
  player.hidden = !visible;
  if (!active) return;

  const name = $("[data-mini-name]", player);
  const meta = $("[data-mini-meta]", player);
  const elapsed = $("[data-mini-elapsed]", player);
  const done = active.exercises.reduce(
    (n, entry) => n + entry.sets.filter((set) => set.done).length,
    0,
  );
  if (name) name.textContent = active.name;
  if (meta) meta.textContent = `${done} set${done === 1 ? "" : "s"} logged`;
  if (elapsed) elapsed.textContent = currentElapsed();
}

// ── Toasts ─────────────────────────────────────────────────────────────────

let toastTimer = null;
function toast(message, { tone = "default", timeout = 2600 } = {}) {
  let host = $("#toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  host.innerHTML = `<div class="toast toast-${esc(tone)}">${esc(message)}</div>`;
  host.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.classList.remove("is-visible"), timeout);
}

function notify(title, body) {
  toast(`${title} — ${body}`, { tone: "accent" });
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate?.([120, 60, 120]);
    } catch {
      /* vibration is best-effort */
    }
  }
}

// ── App lifecycle: storage protection and updates ──────────────────────────

/** Reflect the browser's storage-protection state in Settings when it is open. */
async function refreshStorageProtection() {
  const target = document.querySelector('[data-role="storage-protection"]');
  if (!target) return;
  if (!navigator.storage || typeof navigator.storage.persisted !== "function") {
    target.textContent = "Not supported";
    return;
  }
  try {
    const persisted = await navigator.storage.persisted();
    target.textContent = persisted ? "Protected" : "Best effort";
    target.title = persisted
      ? "The browser will not evict this log automatically. Erasing site data still removes it."
      : "The browser may evict this log when space is low. Export a backup.";
  } catch {
    target.textContent = "Unknown";
  }
}

/**
 * Register the service worker and offer a reload when a new build is waiting.
 *
 * The worker deliberately does not skipWaiting on updates: swapping the shell
 * mid-session can pull the page out from under a workout. The banner lets the
 * user choose the moment, and the first install still claims immediately so
 * offline caching works after a single visit.
 */
async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  let hadController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    location.reload();
  });

  try {
    const registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
    const offer = () => {
      if (registration.waiting && navigator.serviceWorker.controller) showUpdateBanner();
    };
    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed") offer();
      });
    });
    offer();

    const check = () => {
      registration.update().catch(() => {
        /* offline or a transient error: try again on the next check */
      });
    };
    check();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) check();
    });
    window.setInterval(check, 30 * 60 * 1000);
  } catch {
    /* offline caching is progressive enhancement */
  }
}

function showUpdateBanner() {
  if (updateDismissed) return;
  const banner = document.querySelector("#update-banner");
  if (banner) banner.hidden = false;
}

/**
 * Native Android writes the chosen document through the system picker. The
 * callback lands here only after that write succeeds, so the backup age shown
 * in Settings is not advanced when the user cancels.
 */
globalThis.__ironlogNativeBackupSaved = () => {
  store.updateSettings({ lastBackupAt: new Date().toISOString() });
  if (router.current.route === "settings") render();
  toast("Backup saved");
};

// ── Sheets ─────────────────────────────────────────────────────────────────

function openSheet(id, { focus = true } = {}) {
  const sheet = document.getElementById(id);
  if (!sheet) return;
  // Cancel a pending close: reopening within the 180ms exit transition used
  // to let the old timer hide the freshly opened sheet.
  clearTimeout(sheet._closeTimer);
  sheet._closeTimer = 0;
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add("is-open"));
  document.body.classList.add("sheet-open");
  if (focus) sheet.querySelector("input, button, select")?.focus();
}

function closeSheet(id) {
  const sheet = document.getElementById(id);
  if (!sheet) return;
  clearTimeout(sheet._closeTimer);
  sheet.classList.remove("is-open");
  document.body.classList.remove("sheet-open");
  sheet._closeTimer = setTimeout(() => {
    // Only hide if the sheet was not reopened while the transition ran.
    if (!sheet.classList.contains("is-open")) sheet.hidden = true;
  }, 180);
}

// ── Actions ────────────────────────────────────────────────────────────────

const actions = {
  "start-workout": () => {
    const result = store.startWorkout();
    if (!result.ok) return toast(result.error, { tone: "danger" });
    router.go("workout");
    toast("Workout started");
  },

  "repeat-last": () => startFromTemplate(store.lastWorkoutTemplate(), "Repeating your last session"),

  "repeat-workout": (el) => {
    const workout = store.getWorkout(el.dataset.id);
    if (!workout) return;
    startFromTemplate(
      {
        name: workout.name,
        exercises: workout.exercises.map((e) => ({
          exerciseId: e.exerciseId,
          sets: e.sets.filter((s) => s.done).map((s) => ({ weight: s.weight, reps: s.reps })),
        })),
      },
      "Session copied",
    );
  },

  "start-split": (el) => {
    const muscles = (el.dataset.muscles || "").split(",").filter(Boolean);
    const splitName = el.dataset.split || "Workout";
    // "Custom workout" already names the session; the presets need the suffix.
    const sessionName = / workout$/i.test(splitName) ? splitName : `${splitName} workout`;
    if (store.activeWorkout()) return toast("A workout is already in progress.", { tone: "danger" });
    const rest = Number(el.dataset.rest) || 0;
    if (rest > 0) store.updateSettings({ restSeconds: rest });
    if (muscles.length === 0) return startEmpty(sessionName);

    // One familiar compound per requested muscle group, resolved from the
    // catalogue by name with an alphabetical fallback.
    const picks = routineExerciseIds(store.exercises(), muscles);
    if (picks.length === 0) return startEmpty(sessionName);

    const result = store.startWorkout({ name: sessionName, exerciseIds: picks });
    if (!result.ok) return toast(result.error, { tone: "danger" });
    seedPreviousSets(result.workout);
    router.go("workout");
    toast(`${splitName} session started with ${picks.length} exercises`);
  },

  // Routines
  "new-routine": () => {
    routineDraftState = blankRoutineDraft(store.settings.restSeconds);
    router.go("routine-editor");
  },

  "edit-routine": (el) => {
    const routine = store.settings.routines.find((item) => item.id === el.dataset.routineId);
    if (!routine) return toast("Routine not found", { tone: "danger" });
    routineDraftState = routineDraft(routine, store.settings.restSeconds);
    router.go("routine-editor");
  },

  "routine-name": (el) => {
    if (routineDraftState) routineDraftState.name = el.value;
  },

  "toggle-routine-muscle": (el) => {
    if (!routineDraftState) return;
    const muscle = el.dataset.muscle;
    const index = routineDraftState.muscles.indexOf(muscle);
    if (index >= 0) routineDraftState.muscles.splice(index, 1);
    else routineDraftState.muscles.push(muscle);
    el.dataset.focusKey = `muscle-${muscle}`;
    render();
  },

  "set-editor-rest": (el) => {
    if (!routineDraftState) return;
    routineDraftState.restSeconds = Number(el.dataset.seconds) || 90;
    el.dataset.focusKey = `rest-${el.dataset.seconds}`;
    render();
  },

  "save-routine": () => {
    if (!routineDraftState) return;
    const result = store.saveRoutine(routineDraftState);
    if (!result.ok) return toast(result.error, { tone: "danger" });
    routineDraftState = null;
    router.go("workout");
    toast("Routine saved");
  },

  "start-editor-routine": () => {
    if (!routineDraftState) return;
    if (!routineDraftState.name.trim()) {
      return toast("Give the routine a name first", { tone: "danger" });
    }
    if (store.activeWorkout()) return toast("A workout is already in progress.", { tone: "danger" });
    const result = store.saveRoutine(routineDraftState);
    if (!result.ok) return toast(result.error, { tone: "danger" });
    const routine = result.routine;
    const picks = routineExerciseIds(store.exercises(), routine.muscles);
    const sessionName = / workout$/i.test(routine.name) ? routine.name : `${routine.name} workout`;
    store.updateSettings({ restSeconds: routine.restSeconds });
    routineDraftState = null;

    if (picks.length === 0) {
      startEmpty(sessionName);
      return;
    }
    const started = store.startWorkout({ name: sessionName, exerciseIds: picks });
    if (!started.ok) return toast(started.error, { tone: "danger" });
    seedPreviousSets(started.workout);
    router.go("workout");
    toast(`${routine.name} session started with ${picks.length} exercises`);
  },

  "delete-routine": (el) => {
    const id = el.dataset.routineId || routineDraftState?.id;
    if (!id) return;
    if (!window.confirm("Delete this routine? Workouts already logged are untouched.")) return;
    store.deleteRoutine(id);
    routineDraftState = null;
    router.go("workout");
    toast("Routine deleted");
  },

  "set-exercise-note": (el) => {
    const active = store.activeWorkout();
    if (!active) return;
    store.setExerciseNote(active.id, el.dataset.entry, el.value);
  },

  "resume-workout": () => router.go("workout"),

  "rename-workout": (el) => {
    const active = store.activeWorkout();
    if (!active) return;
    store.updateWorkout(active.id, { name: el.value });
  },

  "open-picker": () => {
    pickerState = { query: "", muscle: "all" };
    openSheet("exercise-picker");
    filterPicker();
  },
  "close-picker": () => closeSheet("exercise-picker"),

  "pick-exercise": (el) => {
    const active = store.activeWorkout();
    if (!active) return;
    const result = store.addExerciseToWorkout(active.id, el.dataset.exercise);
    if (!result.ok) return toast(result.error, { tone: "danger" });
    const previous = store.previousPerformance(el.dataset.exercise);
    if (previous) {
      store.addSet(active.id, result.entry.id, { weight: previous.weight, reps: previous.reps });
    } else {
      store.addSet(active.id, result.entry.id, { weight: 0, reps: 0 });
    }
    closeSheet("exercise-picker");
    render();
    toast("Exercise added");
  },

  "remove-exercise": (el) => {
    const active = store.activeWorkout();
    if (!active) return;
    store.removeExerciseFromWorkout(active.id, el.dataset.entry);
    render();
  },

  "add-set": (el) => {
    const active = store.activeWorkout();
    if (!active) return;
    store.addSet(active.id, el.dataset.entry, { fromPrevious: el.dataset.previous === "true" });
    render();
  },

  "remove-set": (el) => {
    const active = store.activeWorkout();
    if (!active) return;
    store.removeSet(active.id, el.dataset.entry, el.dataset.set);
    render();
  },

  "set-weight": (el) => {
    const active = store.activeWorkout();
    if (!active) return;
    el.dataset.focusKey = `w-${el.dataset.set}`;
    store.updateSet(active.id, el.dataset.entry, el.dataset.set, { weight: el.value });
    updateSetRowInPlace(el);
  },

  "set-reps": (el) => {
    const active = store.activeWorkout();
    if (!active) return;
    el.dataset.focusKey = `r-${el.dataset.set}`;
    store.updateSet(active.id, el.dataset.entry, el.dataset.set, { reps: el.value });
    updateSetRowInPlace(el);
  },

  "toggle-set": (el) => {
    const active = store.activeWorkout();
    if (!active) return;
    const entry = active.exercises.find((e) => e.id === el.dataset.entry);
    const set = entry?.sets.find((s) => s.id === el.dataset.set);
    if (!set) return;

    // The logger repaints after a tick, so remember which control the user was
    // on; restoreFocus() puts them back on it instead of dropping focus to the body.
    el.dataset.focusKey = `tick-${el.dataset.set}`;

    const next = !set.done;
    store.updateSet(active.id, el.dataset.entry, el.dataset.set, { done: next });

    let recordDetail = null;
    if (next && set.weight > 0 && set.reps > 0) {
      const oneRm = estimatedOneRepMax(set.weight, set.reps);
      if (oneRm > 0) {
        const previousBest = previousBestOneRm(active, entry.exerciseId, set.id);
        if (oneRm > previousBest) {
          toast(`New session best — est. 1RM ${compactNumber(oneRm)} ${store.settings.units}`, { tone: "accent" });
          // Real data only: this fires because a computed 1RM beat the session's
          // previous best, never on a timer or for decoration.
          recordDetail = {
            exercise: store.exerciseIndex()[entry.exerciseId]?.name || "This lift",
            value: compactNumber(oneRm),
            unit: store.settings.units,
            kind: "session-best",
          };
        }
      }
    }
    if (next && store.settings.autoStartRestTimer) restTimer.start(store.settings.restSeconds);

    render();

    // Animate the replacement row, not the detached row from before render().
    // This keeps the check draw, colour pop and earned PR burst visible.
    const updatedRow = $$(".exercise-card[data-entry] .set-row[data-set]").find((row) =>
      row.dataset.set === el.dataset.set && row.closest(".exercise-card")?.dataset.entry === el.dataset.entry,
    );
    if (next && updatedRow) {
      updatedRow.classList.add("just-completed");
      drawTick(updatedRow);
    }
    if (recordDetail) {
      celebrateRecord(updatedRow || $(".logger-metrics") || $("#view-outlet"), recordDetail);
    }
  },

  "rest-now": () => restTimer.start(store.settings.restSeconds),
  "timer-stop": () => restTimer.stop(),
  "timer-add": (el) => restTimer.addSeconds(Number(el.dataset.seconds) || 15),

  "complete-workout": () => {
    const active = store.activeWorkout();
    if (!active) return;
    const result = store.completeWorkout(active.id);
    if (!result.ok) return toast(result.error, { tone: "danger" });
    restTimer.stop();
    showSummary(result.workout, result.summary);
  },

  "discard-workout": () => {
    const active = store.activeWorkout();
    if (!active) return;
    if (!window.confirm("Discard this workout? Nothing will be saved.")) return;
    store.discardWorkout(active.id);
    restTimer.stop();
    router.go("home");
    toast("Workout discarded");
  },

  "delete-workout": (el) => {
    if (!window.confirm("Delete this workout permanently?")) return;
    store.deleteWorkout(el.dataset.id);
    render();
    toast("Workout deleted");
  },

  "toggle-history": (el) => {
    const id = el.dataset.id;
    const open = el.getAttribute("aria-expanded") === "true";
    const target = open ? null : id;
    globalThis.location.hash = `#/history${target ? `?id=${encodeURIComponent(target)}` : ""}`;
  },

  // Library
  "library-search": (el) => {
    libraryState.query = el.value;
    el.dataset.focusKey = "library-search";
    filterLibraryList();
  },
  "clear-search": () => {
    libraryState = { query: "", muscle: "all" };
    render();
  },
  "filter-muscle": (el) => {
    libraryState.muscle = el.dataset.muscle;
    $$("#library-muscles .chip").forEach((c) =>
      c.classList.toggle("is-active", c.dataset.muscle === libraryState.muscle),
    );
    filterLibraryList();
  },

  // Custom exercises
  "open-exercise": (el) => openExerciseDetail(el.dataset.id),
  "close-exercise-detail": () => closeExerciseDetail(),

  /** Works from both the settings chips and the detail-sheet select. */
  "set-instruction-language": (el) => {
    const lang = el.dataset.lang ?? el.value ?? "en";
    store.updateSettings({ instructionLanguage: lang });
    if (hasInstructions(detailState.exercise)) {
      loadDetailSteps(detailState.exercise, lang);
    }
    render();
  },

  "add-current-to-workout": (el) => {
    const active = store.activeWorkout();
    if (!active) return;
    const exercise = store.getExercise(el.dataset.id);
    const result = store.addExerciseToWorkout(active.id, el.dataset.id);
    if (!result.ok) return toast(result.error, { tone: "danger" });
    const previous = store.previousPerformance(el.dataset.id);
    store.addSet(active.id, result.entry.id, previous ? previous : { weight: 0, reps: 0 });
    closeExerciseDetail();
    toast(`Added ${exercise?.name ?? "exercise"}`);
    location.hash = "#/workout";
    render();
  },

  "start-with-exercise": (el) => {
    const exercise = store.exerciseIndex()[el.dataset.id];
    const created = store.startWorkout(exercise ? { name: exercise.name } : {});
    // The button only renders while idle, but a second tab can start a session
    // first. Without this guard the next line dereferences an undefined workout.
    if (!created.ok) return toast(created.error, { tone: "danger" });
    closeExerciseDetail();
    const result = store.addExerciseToWorkout(created.workout.id, el.dataset.id);
    if (result.ok) store.addSet(created.workout.id, result.entry.id, { weight: 0, reps: 0 });
    toast("Workout started");
    location.hash = "#/workout";
    render();
  },

  "open-custom-exercise": () => {
    closeSheet("exercise-picker");
    closeExerciseDetail();
    // The form is mounted once for the whole app, so a message left by the last
    // attempt would still be on screen the next time it opens.
    const stale = $('[data-role="custom-error"]');
    if (stale) {
      stale.textContent = "";
      stale.hidden = true;
    }
    openSheet("custom-exercise-sheet");
  },
  "close-custom-exercise": () => closeSheet("custom-exercise-sheet"),
  "submit-custom-exercise": (el, event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(el).entries());
    const result = store.addCustomExercise(data);
    const errorNode = $('[data-role="custom-error"]');
    if (!result.ok) {
      if (errorNode) {
        errorNode.textContent = result.error;
        errorNode.hidden = false;
      }
      return;
    }
    // Long-lived form: clear the fields or the next exercise starts pre-filled.
    el.reset();
    closeSheet("custom-exercise-sheet");
    render();
    toast(`"${result.exercise.name}" added to your library`);
  },
  "delete-custom": (el) => {
    if (!window.confirm("Remove this custom exercise? Past logs keep their recorded values.")) return;
    store.removeCustomExercise(el.dataset.id);
    render();
    toast("Custom exercise removed");
  },

  // Settings
  "set-theme": (el) => {
    store.updateSettings({ theme: el.dataset.theme });
    applyTheme();
    render();
  },

  "set-units": (el) => {
    store.updateSettings({ units: el.dataset.units });
    render();
  },
  "set-rest": (el) => {
    store.updateSettings({ restSeconds: Number(el.dataset.seconds) || 120 });
    render();
  },
  "toggle-autorest": (el) => store.updateSettings({ autoStartRestTimer: el.checked }),

  "protect-storage": async () => {
    if (!navigator.storage || typeof navigator.storage.persist !== "function") {
      return toast("This browser does not offer storage protection", { tone: "danger", timeout: 3800 });
    }
    try {
      const already = await navigator.storage.persisted?.();
      const granted = already || (await navigator.storage.persist());
      await refreshStorageProtection();
      toast(
        granted
          ? "Storage protected from automatic cleanup"
          : "Browser kept storage best-effort — export a backup",
        { tone: granted ? "default" : "danger", timeout: 4400 },
      );
    } catch {
      toast("Could not request storage protection", { tone: "danger", timeout: 3800 });
    }
  },

  "export-data": () => {
    const filename = `ironlog-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const payload = store.exportData();
    if (isNativeShell && globalThis.IronLogNative?.exportBackup) {
      globalThis.IronLogNative.exportBackup(payload, filename);
      toast("Choose where to save the backup");
      return;
    }
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    store.updateSettings({ lastBackupAt: new Date().toISOString() });
    if (router.current.route === "settings") render();
    toast("Backup downloaded");
  },

  "check-updates": () => {
    if (!isNativeShell || !globalThis.IronLogNative?.checkForUpdates) {
      return toast("The web app updates automatically. Reload to get the latest build.");
    }
    globalThis.IronLogNative.checkForUpdates();
  },

  "apply-update": async () => {
    const banner = $("#update-banner");
    if (banner) banner.hidden = true;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting) {
        registration.waiting.postMessage("SKIP_WAITING");
        // controllerchange reloads; this is only a fallback for a stuck worker.
        window.setTimeout(() => location.reload(), 1800);
        return;
      }
    } catch {
      /* fall through to a plain reload */
    }
    location.reload();
  },

  "dismiss-update": () => {
    updateDismissed = true;
    const banner = $("#update-banner");
    if (banner) banner.hidden = true;
  },

  "import-file": (el) => {
    const file = el.files?.[0];
    if (!file) return;
    // A training log is small; a multi-megabyte file is likely a mistake or a
    // denial-of-service attempt against the main thread. Reject it up front.
    if (file.size > 10 * 1024 * 1024) {
      el.value = "";
      return toast("That backup is too large (10 MB maximum)", { tone: "danger", timeout: 4200 });
    }
    // Importing replaces the current log. Warn before overwriting existing data.
    const hasData = store.doc.workouts.length > 0 || store.doc.customExercises.length > 0;
    if (hasData && !window.confirm("Import replaces your current workouts and custom exercises in this browser. Continue?")) {
      el.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = store.importData(String(reader.result));
      if (!result.ok) return toast(result.error, { tone: "danger", timeout: 4200 });
      el.value = "";
      render();
      toast(`Imported ${result.workouts} workouts`);
    };
    reader.onerror = () => toast("Could not read that file", { tone: "danger" });
    reader.readAsText(file);
  },

  "reset-data": () => {
    const where = isNativeShell ? "this phone" : "this browser";
    if (!window.confirm(`Erase every workout, set and custom exercise from ${where}? This cannot be undone.`)) return;
    store.reset();
    restTimer.stop();
    router.go("home");
    toast("All data erased");
  },

  "to-landing": (el, event) => {
    // Let the normal relative link navigate; nothing to override.
  },

  "dismiss-summary": () => {
    closeSheet("summary-modal");
    router.go("home");
  },

  "view-stats-from-summary": () => {
    closeSheet("summary-modal");
    router.go("stats");
  },

  /**
   * The Profile's segmented controls. One handler serves all three charts
   * because each button carries its own kind, so a new period or granularity
   * never needs a second action wired through the delegation map.
   */
  "set-stats-period": (el) => {
    const kind = el.dataset.kind;
    const period = el.dataset.period;
    if (kind === "muscle") statsState.musclePeriod = period;
    else if (kind === "volume") statsState.volumePeriod = period;
    else if (kind === "pr") statsState.prKind = period;
    else return;
    // Only the one segment flips, so the rest of the row keeps its state.
    const group = el.closest(".segmented");
    if (group) {
      $$(".segment", group).forEach((button) => {
        const on = button === el;
        button.classList.toggle("is-active", on);
        button.setAttribute("aria-checked", String(on));
      });
    }
    render();
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function startEmpty(name) {
  const result = store.startWorkout({ name });
  if (!result.ok) return toast(result.error, { tone: "danger" });
  router.go("workout");
  toast("Workout started");
}

function startFromTemplate(template, message) {
  if (!template) return toast("No previous session to repeat", { tone: "danger" });
  const result = store.startWorkout({
    name: template.name,
    exerciseIds: template.exercises.map((e) => e.exerciseId),
  });
  if (!result.ok) return toast(result.error, { tone: "danger" });

  template.exercises.forEach((tpl, i) => {
    const entry = result.workout.exercises[i];
    if (!entry) return;
    const sets = tpl.sets?.length ? tpl.sets : [{ weight: 0, reps: 0 }];
    for (const s of sets) {
      store.addSet(result.workout.id, entry.id, { weight: s.weight, reps: s.reps });
    }
  });

  router.go("workout");
  render();
  toast(message);
}

function seedPreviousSets(workout) {
  for (const entry of workout.exercises) {
    const previous = store.previousPerformance(entry.exerciseId);
    store.addSet(workout.id, entry.id, previous ? { weight: previous.weight, reps: previous.reps } : { weight: 0, reps: 0 });
  }
  render();
}

/** Highest est. 1RM already logged for this exercise in this workout. */
function previousBestOneRm(workout, exerciseId, excludeSetId) {
  let best = 0;
  for (const entry of workout.exercises) {
    if (entry.exerciseId !== exerciseId) continue;
    for (const s of entry.sets) {
      if (s.id === excludeSetId || !s.done) continue;
      best = Math.max(best, estimatedOneRepMax(s.weight, s.reps));
    }
  }
  return best;
}

/**
 * Update only the derived cells in one set row instead of re-rendering the
 * whole logger, so typing into weight/reps never loses focus or cursor.
 */
function updateSetRowInPlace(input) {
  const row = input.closest(".set-row");
  if (!row) return;
  const weight = Number(row.querySelector('[data-action="set-weight"]')?.value) || 0;
  const reps = Number(row.querySelector('[data-action="set-reps"]')?.value) || 0;
  const oneRmNode = row.querySelector(".set-onerm");
  if (oneRmNode) {
    const oneRm = weight > 0 && reps > 0 ? estimatedOneRepMax(weight, reps) : 0;
    oneRmNode.textContent = oneRm > 0 ? compactNumber(oneRm) : "—";
  }
  const active = store.activeWorkout();
  if (active) {
    const doneSets = active.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
    const volume = active.exercises.reduce(
      (sum, e) => sum + e.sets.filter((s) => s.done).reduce((v, s) => v + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0),
      0,
    );
    const volumeNode = $(".logger-metrics > span:nth-child(2) strong");
    const setsNode = $(".logger-metrics > span:nth-child(3) strong");
    if (volumeNode) volumeNode.textContent = `${compactNumber(volume)} ${store.settings.units}`;
    if (setsNode) setsNode.textContent = String(doneSets);
  }
}

function showSummary(workout, summary) {
  const host = $("#summary-content");
  if (!host) return;
  const records = summary.records ?? [];
  host.innerHTML = `
    <div class="summary">
      <span class="summary-mark">${icon(records.length > 0 ? "trophy" : "check")}</span>
      <h2>Session saved</h2>
      <p class="summary-cheer">Every set counts. Nice work.</p>
      <p class="summary-name">${esc(workout.name)}</p>
      <div class="summary-grid">
        <div><strong>${compactNumber(summary.volume)}</strong><span>${esc(store.settings.units)} volume</span></div>
        <div><strong>${esc(summary.sets)}</strong><span>sets</span></div>
        <div><strong>${esc(summary.minutes)}</strong><span>minutes</span></div>
        <div><strong>${esc(summary.exercises)}</strong><span>exercises</span></div>
      </div>
      ${
        records.length > 0
          ? `<div class="summary-records">
               <h3>${icon("trophy")} ${records.length} personal record${records.length === 1 ? "" : "s"}</h3>
               <ul>${records.map((r) => `<li><b>${esc(r.name)}</b><span>${esc(r.kinds.join(" · "))}</span></li>`).join("")}</ul>
             </div>`
          : ""
      }
      <div class="summary-actions">
        <button class="btn btn-primary btn-wide" data-action="dismiss-summary">Done</button>
        <button class="btn btn-ghost btn-wide" data-action="view-stats-from-summary">${icon("stats")} See progress</button>
      </div>
    </div>`;
  openSheet("summary-modal");

  // The session's authored moment: the summary mark stamps in and radiates
  // linework when a record actually broke.
  if (records.length > 0) {
    const mark = $("#summary-content .summary-mark");
    celebrateRecord(mark, {
      exercise: records[0].name,
      value: String(records.length),
      unit: records.length === 1 ? "record" : "records",
      kind: "session-summary",
    });
  }
}

function filterPicker() {
  const list = $("#picker-list");
  const note = $("#picker-note");
  if (!list) return;

  const results = searchExercises(store.exercises(), pickerState.query, pickerState.muscle);
  const shown = results.slice(0, PICKER_CAP);

  list.innerHTML = shown.length
    ? shown.map((exercise) => renderPickerRow(exercise)).join("")
    : `<li class="picker-empty">No exercises match that search.</li>`;

  if (note) {
    note.textContent =
      results.length === 0
        ? ""
        : results.length > shown.length
          ? `Showing ${shown.length} of ${results.length} matches — refine your search.`
          : "";
  }
}

// ── Exercise detail sheet ───────────────────────────────────────────────────
//
// The sheet paints the taxonomy synchronously, then fills in the numbered
// instructions once that language's pack resolves. Instructions live in
// per-language files fetched on demand, so opening one exercise costs at most
// one pack rather than shipping every source/language pack.

function renderDetail() {
  const sheet = $("#exercise-detail-sheet");
  const content = $("#exercise-detail-content");
  if (!sheet || !content) return;

  if (!detailState.exercise) return;
  const exerciseId = detailState.exercise.id;
  const wasHidden = sheet.hidden;
  const previousBody = content.querySelector(".detail-body");
  // Instructions resolve asynchronously and a language switch repaints the
  // sheet. Keep the reader where they were, but start a newly opened exercise
  // at the top. Focus follows the language select across the repaint.
  const sameExercise = content.dataset.exerciseId === exerciseId;
  const scrollTop = sameExercise ? previousBody?.scrollTop ?? 0 : 0;
  const languageFocused =
    sameExercise &&
    content.contains(document.activeElement) &&
    document.activeElement?.matches?.('[data-action="set-instruction-language"]');

  content.innerHTML = renderExerciseDetail(detailState.exercise, {
    store,
    stepsResult: detailState.stepsResult,
    stepsState: detailState.stepsState,
  });
  content.dataset.exerciseId = exerciseId;

  // The sheet lives outside the view outlet, so its markup is repainted
  // separately. Bind the delegated tilt once and let it follow every repaint.
  if (!detailTiltBound) {
    detailTiltBound = true;
    initTilt(content, { max: 3.4 });
  }

  const body = content.querySelector(".detail-body");
  if (body && scrollTop) body.scrollTop = scrollTop;
  if (languageFocused) {
    content.querySelector('[data-action="set-instruction-language"]')?.focus({ preventScroll: true });
  }

  // openSheet is idempotent: it unhides, adds .is-open for the transition and
  // locks body scroll, matching every other sheet in the app. Only the first
  // paint should move focus into the dialog.
  openSheet("exercise-detail-sheet", { focus: wasHidden });
}

async function loadDetailSteps(exercise, lang) {
  detailState.stepsState = "loading";
  detailState.stepsResult = null;
  renderDetail();

  // Pass the exercise, not its id, so a curated entry linked to a catalogue
  // record resolves through its stepsId.
  const result = await stepsFor(exercise, lang, "");

  // Drop stale responses: the user may have opened another exercise or changed
  // language while the pack was in flight.
  if (detailState.exercise?.id !== exercise.id) return;
  if ((store.settings.instructionLanguage ?? "en") !== lang) return;

  detailState.stepsResult = result;
  detailState.stepsState = result.steps.length > 0 ? "ready" : "empty";
  renderDetail();
}

function openExerciseDetail(id) {
  const exercise = store.exerciseIndex()[id];
  if (!exercise) return;
  detailState = { exercise, stepsState: "idle", stepsResult: null };
  renderDetail();
  if (hasInstructions(exercise)) {
    loadDetailSteps(exercise, store.settings.instructionLanguage ?? "en");
  } else {
    detailState.stepsState = "empty";
    renderDetail();
  }
}

function closeExerciseDetail() {
  detailState = { exercise: null, stepsState: "idle", stepsResult: null };
  const content = $("#exercise-detail-content");
  if (content) delete content.dataset.exerciseId;
  closeSheet("exercise-detail-sheet");
}

function filterLibraryList() {
  const list = $(".library-list");
  const emptyHost = $(".view-library");
  if (!list || !emptyHost) return render();
  const results = searchExercises(store.exercises(), libraryState.query, libraryState.muscle);
  // Zero results changes the whole view (empty state plus a create affordance),
  // so hand back to a full render rather than patching the list in place.
  if (results.length === 0) return render();
  list.innerHTML = results.slice(0, RESULT_CAP).map((exercise) => renderLibraryRow(exercise)).join("");
  updateResultNote(results.length);
}

function updateResultNote(total) {
  const text =
    total > RESULT_CAP
      ? `Showing ${RESULT_CAP} of ${total} matches \u2014 refine your search to see the rest.`
      : "";
  const note = $(".result-note");
  if (note) {
    note.textContent = text;
    note.hidden = !text;
    return;
  }
  if (text) {
    const list = $(".library-list");
    if (list) list.insertAdjacentHTML("beforebegin", `<p class="result-note">${esc(text)}</p>`);
  }
}

// ── Event wiring ───────────────────────────────────────────────────────────

document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const handler = actions[el.dataset.action];
  if (!handler) return;
  handler(el, event);
});

document.addEventListener("input", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  if (action === "set-weight" || action === "set-reps" || action === "library-search") {
    actions[action]?.(el, event);
    return;
  }
  if (action === "rename-workout" || action === "routine-name") {
    actions[action](el, event);
  }
});

document.addEventListener("change", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  if (
    action === "toggle-autorest" ||
    action === "import-file" ||
    action === "set-instruction-language" ||
    action === "set-exercise-note"
  ) {
    actions[action]?.(el, event);
  }
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-action]");
  if (!form) return;
  actions[form.dataset.action]?.(form, event);
});

// Exercise-picker search + muscle chips (delegated, inside the sheet).
document.addEventListener("input", (event) => {
  if (event.target.id !== "picker-search") return;
  pickerState.query = event.target.value;
  filterPicker();
});

document.addEventListener("click", (event) => {
  const chip = event.target.closest("#picker-muscles .chip");
  if (!chip) return;
  pickerState.muscle = chip.dataset.muscle;
  $$("#picker-muscles .chip").forEach((c) => c.classList.toggle("is-active", c === chip));
  filterPicker();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const open = $(".sheet:not([hidden])");
  if (!open) return;
  // Sheets that carry state need their own close path: the detail sheet owns
  // detailState, and dismissing the summary is what navigates home afterwards.
  if (open.id === "exercise-detail-sheet") return closeExerciseDetail();
  if (open.id === "summary-modal") return actions["dismiss-summary"]();
  closeSheet(open.id);
});

/** Press "/" anywhere to search the library, or the open exercise picker. */
document.addEventListener("keydown", (event) => {
  if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
  const focused = document.activeElement;
  if (
    focused instanceof HTMLElement &&
    (focused.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(focused.tagName))
  ) {
    return;
  }

  // A detail or summary sheet owns the screen; the picker is the exception
  // because its search field is the thing "/" should reach.
  const openSheet = $(".sheet:not([hidden])");
  if (openSheet && !openSheet.querySelector('input[type="search"]')) return;

  const search = $$('input[type="search"]').find((input) => input.getClientRects().length > 0);
  event.preventDefault();
  if (search) {
    search.focus();
    search.select();
    return;
  }

  if (router.current.route !== "library") {
    window.addEventListener(
      "hashchange",
      () => {
        requestAnimationFrame(() => {
          const input = $("#library-search");
          input?.focus();
          input?.select();
        });
      },
      { once: true },
    );
    router.go("library");
    return;
  }

  const input = $("#library-search");
  input?.focus();
  input?.select();
});

// Rest timer ticks update only the timer bar, never a full re-render.
restTimer.subscribe((snapshot) => {
  const bar = $(".timer-bar");
  if (!snapshot.running) {
    // Finishing a workout stops the timer after the store has cleared the
    // active session. That completion path owns the summary; re-rendering the
    // now-empty logger here would delete the summary before it can open.
    if (bar && router.current.route === "workout" && store.activeWorkout()) render();
    return;
  }
  if (!bar) {
    if (router.current.route === "workout") render();
    return;
  }
  const read = $('[data-role="timer-read"]');
  if (read) read.textContent = formatSeconds(snapshot.secondsLeft);
  const fill = $(".timer-fill");
  if (fill) fill.style.width = `${Math.round(snapshot.progress * 100)}%`;
});

// Another tab wrote the same key. Re-read before this tab's next write so the
// last action cannot silently discard the other tab's workout.
window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY) return;
  store.reloadFromStorage();
  applyTheme();
  render();
  toast("Synced changes from another tab");
});

store.subscribe((event) => {
  if (event.persisted === false && store.lastError) {
    toast("Could not save to this browser's storage", { tone: "danger", timeout: 4000 });
  }

  // The catalogue arrives after first paint. Repaint only the surfaces whose
  // content depends on it, so an in-progress set is never re-rendered out from
  // under the user's cursor.
  if (event.type === "catalogue:ready") {
    const route = parseHash(location.hash).route;
    // Home's ticker and routine counts, Settings' status line, History's exercise
    // names and the statistics board all resolve through the catalogue. Repaint
    // whichever of them is visible when the fetch lands.
    const usesCatalogue =
      route === "library" ||
      route === "home" ||
      route === "settings" ||
      route === "history" ||
      route === "stats" ||
      (route === "workout" && !store.activeWorkout());
    if (usesCatalogue) {
      render();
    } else if (route === "workout") {
      // A live logger keeps its set inputs, so patch only the parts that read
      // the catalogue: exercise names and the muscle silhouettes. Both are
      // text/aria-only, so no caret is at risk.
      patchLoggerForCatalogue();
    } else if ($("#exercise-picker") && !$("#exercise-picker").hidden) {
      filterPicker();
    }
  }
});

/**
 * Re-resolve a live logger's catalogue-dependent markup when the catalogue
 * lands after the logger was painted.
 *
 * A full re-render would rebuild every weight/reps input and steal the caret
 * mid-set, so this swaps the two blocks that only read the catalogue: each
 * exercise card's identity line and the header's silhouettes.
 */
function patchLoggerForCatalogue() {
  const active = store.activeWorkout();
  if (!active) return;
  const index = store.exerciseIndex();

  const cards = $$("#view-outlet .exercise-card");
  cards.forEach((card, i) => {
    const entry = active.exercises[i];
    if (!entry) return;
    const exercise = index[entry.exerciseId];
    if (!exercise) return;
    card.dataset.muscle = exercise.muscle ?? "other";
    const name = exercise.name ?? entry.exerciseId;
    const heading = card.querySelector("h3");
    if (heading) heading.textContent = name;
    const sub = card.querySelector(".exercise-sub");
    if (sub) sub.textContent = `${exercise.muscle ?? "other"} · ${exercise.equipment ?? ""}`.trim();
    const remove = card.querySelector('[data-action="remove-exercise"]');
    if (remove) remove.setAttribute("aria-label", `Remove ${name}`);
  });

  const head = $("#view-outlet .logger-head");
  const body = $("#view-outlet .logger-body");
  if (head && body) {
    const template = document.createElement("template");
    template.innerHTML = renderLoggerBody(active, index).trim();
    const fresh = template.content.firstElementChild;
    if (fresh) body.replaceWith(fresh);
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────

function boot() {
  // The shell is phone-first: there is no collapsible rail to restore, so boot
  // goes straight to the first render. The tab bar and top bar are static
  // markup in index.html and need no rehydrating.
  if (isNativeShell) {
    // The APK ships every asset, so a service worker would only add a second
    // cache that can go stale between APK updates. Remove any worker left by a
    // previous build, then move the save label from browser to phone.
    document.documentElement.classList.add("is-native-shell");
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => {
          /* no worker support: the bundled shell is already offline */
        });
    }
    if ("caches" in globalThis) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch(() => {
          /* Cache Storage is optional */
        });
    }
    const saveLabel = document.querySelector("[data-local-label]");
    if (saveLabel) saveLabel.textContent = "Saved on phone";
  } else {
    // Register the service worker for offline support. Best-effort: if the
    // browser or environment can't support it, the app still runs normally.
    registerServiceWorker();
  }

  // localStorage can be unavailable (private windows, locked-down browsers).
  // Store falls back to memory so the app still works, but the user must know
  // the log will not survive the tab closing.
  if (store.volatile) {
    toast("Local storage is blocked here — your log will vanish when this tab closes.", {
      tone: "danger",
      timeout: 9000,
    });
  }
  applyTheme();
  // Mounted once for the whole app, because three different routes offer the
  // "create custom exercise" action and only one view ever rendered the form.
  if (!$("#custom-exercise-sheet")) {
    document.body.insertAdjacentHTML("beforeend", renderCustomSheet());
  }
  initPressFeedback(document, {
    selector:
      ".btn, .routine-card, .chip, .nav-item, .icon-btn, .timer-btn, .tick, .session-row, .history-head, .library-open, .exercise-rest, .tile",
  });
  initSpatialField(document);
  initSpotlight(document);
  initAmbientLight(document);
  initScrollMeter(document);
  initMagnetic(document, { strength: 7 });
  initTapRipple(document);
  initGyroTilt(document, { max: 4.5 });
  if (!globalThis.location.hash) globalThis.location.hash = "#/home";
  router.start();
  initNavGlider();

  /**
   * Kick off the external catalogue load without awaiting it. The app is fully
   * usable while it loads; custom exercises are available immediately; when the fetch
   * resolves the subscriber above repaints the library or picker. Data files are
   * resolved relative to this page (app/index.html -> app/data/).
   */
  store.loadCatalogue("").catch(() => {
    /* loadCatalogue never rejects; belt and braces for the boot path. */
  });

  // Restore a rest timer that was running when the page was reloaded.
  const active = store.activeWorkout();
  if (active) {
    for (const entry of active.exercises) {
      const lastDone = [...entry.sets].reverse().find((s) => s.done && s.restStartedAt);
      if (lastDone) {
        const endsAt = new Date(lastDone.restStartedAt).getTime() + store.settings.restSeconds * 1000;
        if (endsAt > Date.now()) restTimer.resumeFrom(endsAt, store.settings.restSeconds);
        break;
      }
    }
  }
}

boot();
