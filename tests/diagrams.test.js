/**
 * Tests for the diagram engine and the motion helpers.
 *
 * Both modules are pure: an exercise object in, a string out. That is what makes
 * them testable without a browser, and it is also why re-rendering a view stays
 * cheap.
 *
 * The licensing assertions at the bottom are the reason this file exists in its
 * current form. IronLog ships no third-party exercise media, and a test is the
 * only guard that survives a careless future edit.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  movementClass,
  movementDiagram,
  muscleDiagram,
  exerciseMedia,
  exerciseThumbnail,
  mediaPath,
  MEDIA_EXTENSIONS,
} from "../app/js/diagrams.js";

import {
  clampUnit,
  depthVector,
  odometerChars,
  odometerMarkup,
  pointerNorm,
  revealVariant,
  spotlightPercent,
  springStep,
  trailWidth,
  viewportNorm,
} from "../app/js/motion.js";

/* ------------------------------------------------------------------ *
 * Movement classification
 * ------------------------------------------------------------------ */

describe("movementClass", () => {
  test("classifies a press from the chest", () => {
    assert.equal(
      movementClass({ category: "chest", muscle: "chest", muscleGroup: "chest", target: "pectorals", name: "Barbell Bench Press" }),
      "press",
    );
  });

  test("classifies a pull from the back", () => {
    assert.equal(
      movementClass({ category: "back", muscle: "back", muscleGroup: "lats", target: "lats", name: "Pull-Up" }),
      "pull",
    );
  });

  test("classifies a hinge from the posterior chain", () => {
    assert.equal(
      movementClass({ category: "upper legs", muscle: "glutes", muscleGroup: "hamstrings", target: "hamstrings", name: "Romanian Deadlift" }),
      "hinge",
    );
  });

  test("classifies a squat from the quads", () => {
    assert.equal(
      movementClass({ category: "upper legs", muscle: "quads", muscleGroup: "quadriceps", target: "quads", name: "Back Squat" }),
      "squat",
    );
  });

  test("classifies core work", () => {
    assert.equal(
      movementClass({ category: "waist", muscle: "core", muscleGroup: "abs", target: "abs", name: "3/4 sit-up" }),
      "core",
    );
  });

  test("classifies cardio before anything else", () => {
    // A rowing machine works the back, but it is cardio, and the diagram should
    // show repeated travel rather than a pull.
    assert.equal(
      movementClass({ category: "cardio", muscle: "cardio", muscleGroup: "back", target: "row", name: "Rowing Machine" }),
      "cardio",
    );
  });

  test("classifies a curl from the upper arms", () => {
    assert.equal(
      movementClass({ category: "upper arms", muscle: "biceps", muscleGroup: "biceps", target: "biceps", name: "Barbell Curl" }),
      "curl",
    );
  });

  test("classifies an extension from the triceps", () => {
    assert.equal(
      movementClass({ category: "upper arms", muscle: "triceps", muscleGroup: "triceps", target: "triceps", name: "Cable Pushdown" }),
      "extend",
    );
  });

  test("recognises a loaded carry", () => {
    assert.equal(
      movementClass({ category: "waist", muscle: "core", muscleGroup: "traps", target: "traps", name: "Farmers Carry" }),
      "carry",
    );
  });

  test("falls back to generic rather than throwing", () => {
    assert.equal(movementClass({}), "generic");
    assert.equal(movementClass(null), "generic");
    assert.equal(movementClass(undefined), "generic");
  });

  test("never lets a non-string field break the match", () => {
    // A numeric or null field would throw inside a regex test if not coerced.
    assert.equal(movementClass({ category: null, muscle: 42, name: undefined }), "generic");
  });

  test("is deterministic: same input, same class", () => {
    const e = { category: "chest", muscle: "chest", muscleGroup: "chest", target: "pectorals", name: "Barbell Bench Press" };
    assert.equal(movementClass(e), movementClass(e));
  });
});

/* ------------------------------------------------------------------ *
 * Movement diagram
 * ------------------------------------------------------------------ */

describe("movementDiagram", () => {
  const bench = {
    name: "Barbell Bench Press",
    category: "chest",
    muscle: "chest",
    muscleGroup: "chest",
    target: "pectorals",
    equipment: "barbell",
  };

  test("emits valid SVG with an accessible name", () => {
    const svg = movementDiagram(bench);
    assert.match(svg, /^<svg /);
    assert.match(svg, /role="img"/);
    assert.match(svg, /aria-label="Barbell Bench Press: Press away from the body diagram"/);
    assert.match(svg, /<\/svg>$/);
  });

  test("carries the movement class as data for styling and tests", () => {
    assert.match(movementDiagram(bench), /data-movement="press"/);
    assert.match(
      movementDiagram({ name: "Back Squat", category: "upper legs", muscle: "quads", muscleGroup: "quadriceps" }),
      /data-movement="squat"/,
    );
  });

  test("draws a travel path and puts the load on that same path", () => {
    const svg = movementDiagram(bench);
    const travel = svg.match(/class="dg-travel" d="([^"]+)"/)[1];
    assert.ok(travel.length > 0, "travel path exists");
    // The load rides the line it describes; if these diverge the animation
    // separates from the diagram, which reads as a bug rather than a style.
    assert.ok(svg.includes(`offset-path:path('${travel}')`), "mover follows the travel path");
  });

  test("marks the press load as reversed so it starts at the bottom", () => {
    // A press travels up from the chest; geometry("press") puts the load at the
    // path start, which needs the reverse animation to read correctly.
    assert.match(movementDiagram(bench), /data-reverse="1"/);
  });

  test("does not reverse a hinge, which starts at the top", () => {
    const svg = movementDiagram({
      name: "Romanian Deadlift",
      category: "upper legs",
      muscle: "glutes",
      muscleGroup: "hamstrings",
      equipment: "barbell",
    });
    assert.match(svg, /data-movement="hinge"/);
    assert.doesNotMatch(svg, /data-reverse/);
  });

  test("draws plates for a barbell and none for bodyweight", () => {
    const barbell = movementDiagram({ ...bench, equipment: "barbell" });
    const bodyweight = movementDiagram({ ...bench, equipment: "body weight" });
    // Four plate rects on a loaded bar (two per side, in the plated branch).
    assert.equal((barbell.match(/width="5" height="18"/g) || []).length, 2);
    assert.equal((bodyweight.match(/width="5" height="18"/g) || []).length, 0);
  });

  test("draws dumbbell heads for a dumbbell movement", () => {
    const svg = movementDiagram({ ...bench, name: "Dumbbell Bench Press", equipment: "dumbbell" });
    assert.match(svg, /width="7" height="12"/);
  });

  test("draws a kettlebell handle for a kettlebell movement", () => {
    const svg = movementDiagram({
      name: "Kettlebell Swing",
      category: "upper legs",
      muscle: "glutes",
      muscleGroup: "hamstrings",
      equipment: "kettlebell",
    });
    assert.match(svg, /kettlebell|dg-load-line/);
    assert.match(svg, /a5 5 0 0 1 10 0/);
  });

  test("honours animate:false by dropping the animation class", () => {
    assert.doesNotMatch(movementDiagram(bench, { animate: false }), /is-animated/);
    assert.match(movementDiagram(bench), /is-animated/);
  });

  test("honours a custom size", () => {
    assert.match(movementDiagram(bench, { size: 88 }), /width="88" height="88"/);
  });

  test("escapes a hostile exercise name", () => {
    const svg = movementDiagram({ ...bench, name: '<img src=x onerror="alert(1)">' });
    assert.doesNotMatch(svg, /<img/);
    assert.match(svg, /&lt;img/);
  });

  test("every movement class produces a non-empty diagram", () => {
    const kinds = ["press", "pull", "hinge", "squat", "curl", "extend", "core", "carry", "cardio", "generic"];
    const samples = {
      press: { category: "chest", muscle: "chest", muscleGroup: "chest", name: "Bench" },
      pull: { category: "back", muscle: "back", muscleGroup: "lats", name: "Row" },
      hinge: { category: "upper legs", muscle: "glutes", muscleGroup: "hamstrings", name: "RDL" },
      squat: { category: "upper legs", muscle: "quads", muscleGroup: "quadriceps", name: "Squat" },
      curl: { category: "upper arms", muscle: "biceps", muscleGroup: "biceps", name: "Curl" },
      extend: { category: "upper arms", muscle: "triceps", muscleGroup: "triceps", name: "Pushdown" },
      core: { category: "waist", muscle: "core", muscleGroup: "abs", name: "Crunch" },
      carry: { category: "waist", muscle: "core", muscleGroup: "traps", name: "Farmers Carry" },
      cardio: { category: "cardio", muscle: "cardio", name: "Treadmill" },
      generic: { name: "Unknown" },
    };
    for (const kind of kinds) {
      assert.equal(movementClass(samples[kind]), kind, `${kind} should classify as itself`);
      const svg = movementDiagram(samples[kind]);
      assert.ok(svg.length > 200, `${kind} diagram should not be empty`);
      assert.match(svg, /dg-travel/, `${kind} diagram needs a travel path`);
      assert.match(svg, /dg-mover/, `${kind} diagram needs a moving load`);
    }
  });

  test("produces no unresolved template literals", () => {
    const svg = movementDiagram(bench);
    assert.doesNotMatch(svg, /\$\{/);
    assert.doesNotMatch(svg, /undefined|NaN/);
  });
});

/* ------------------------------------------------------------------ *
 * Muscle diagram
 * ------------------------------------------------------------------ */

describe("muscleDiagram", () => {
  const row = {
    name: "Barbell Row",
    muscle: "back",
    muscleGroup: "lats",
    target: "lats",
    secondaryMuscles: ["biceps", "forearms", "traps"],
  };

  test("renders the primary muscle at the centre", () => {
    const svg = muscleDiagram(row);
    assert.match(svg, /class="dg-core"/);
    assert.match(svg, />lats</);
  });

  test("renders one node per secondary muscle", () => {
    const svg = muscleDiagram(row);
    assert.equal((svg.match(/class="dg-node"/g) || []).length, 3);
    for (const m of ["biceps", "forearms", "traps"]) assert.match(svg, new RegExp(`>${m}<`));
  });

  test("draws a link from centre to every node", () => {
    const svg = muscleDiagram(row);
    assert.equal((svg.match(/class="dg-link"/g) || []).length, 3);
  });

  test("names the whole thing in its accessible label", () => {
    const svg = muscleDiagram(row);
    assert.match(svg, /aria-label="Works lats, with biceps, forearms, traps"/);
  });

  test("deduplicates a secondary that repeats the primary", () => {
    const svg = muscleDiagram({ ...row, secondaryMuscles: ["lats", "biceps", "Lats"] });
    assert.equal((svg.match(/class="dg-node"/g) || []).length, 1);
  });

  test("caps the node count at the limit", () => {
    const many = { ...row, secondaryMuscles: ["a", "b", "c", "d", "e", "f", "g", "h"] };
    assert.equal((muscleDiagram(many).match(/class="dg-node"/g) || []).length, 6);
    assert.equal((muscleDiagram(many, { limit: 3 }).match(/class="dg-node"/g) || []).length, 3);
  });

  test("still renders with no secondaries", () => {
    const svg = muscleDiagram({ ...row, secondaryMuscles: [] });
    assert.match(svg, /class="dg-core"/);
    assert.equal((svg.match(/class="dg-node"/g) || []).length, 0);
    assert.match(svg, /aria-label="Works lats"/);
  });

  test("returns empty rather than a blank graph when there is no muscle", () => {
    assert.equal(muscleDiagram({ name: "Mystery" }), "");
    assert.equal(muscleDiagram(null), "");
  });

  test("places nodes on a stable ellipse, indexed for the stagger", () => {
    const svg = muscleDiagram(row);
    const indices = [...svg.matchAll(/class="dg-link"[^>]*style="--i:(\d+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(indices, [0, 1, 2]);
    // Coordinates stay inside the 220x150 viewBox.
    for (const [, x, y] of svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="4.5"\/>/g)) {
      assert.ok(Number(x) >= 0 && Number(x) <= 220, `x ${x} in range`);
      assert.ok(Number(y) >= 0 && Number(y) <= 150, `y ${y} in range`);
    }
  });

  test("is deterministic for the same input", () => {
    assert.equal(muscleDiagram(row), muscleDiagram(row));
  });

  test("escapes hostile muscle names", () => {
    const svg = muscleDiagram({ ...row, secondaryMuscles: ['<script>"x"</script>'] });
    assert.doesNotMatch(svg, /<script/);
    assert.match(svg, /&lt;script&gt;/);
  });
});

/* ------------------------------------------------------------------ *
 * The media slot — licensing
 * ------------------------------------------------------------------ */

describe("exerciseMedia", () => {
  const bench = { id: "ds-0289", name: "Barbell Bench Press", equipment: "barbell", category: "chest", muscle: "chest", muscleGroup: "chest" };

  test("ships the drawn diagram by default, not third-party media", () => {
    const html = exerciseMedia(bench);
    assert.match(html, /class="media media-drawn"/);
    assert.match(html, /diagram-movement/);
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /No external illustration is bundled for this exercise/);
  });

  test("carries the required attribution when a licensed file is supplied", () => {
    const html = exerciseMedia(bench, { mediaUrl: "media/ds-0289.gif" });
    assert.match(html, /<img src="media\/ds-0289\.gif"/);
    // The dataset's MEDIA EXCEPTION requires this exact credit on any reuse.
    assert.match(html, /© Gym Visual — https:\/\/gymvisual\.com\//);
    assert.match(html, /width="180" height="180"/);
  });

  test("lets a caller supply its own credit for non-Gym-Visual media", () => {
    const html = exerciseMedia(bench, { mediaUrl: "media/own.mp4", mediaCredit: "Filmed by the author" });
    assert.match(html, /Filmed by the author/);
    assert.doesNotMatch(html, /Gym Visual/);
  });

  test("lazy-loads and sizes the image so it cannot shift layout", () => {
    const html = exerciseMedia(bench, { mediaUrl: "media/x.gif" });
    assert.match(html, /loading="lazy"/);
    assert.match(html, /decoding="async"/);
    assert.match(html, /alt="Barbell Bench Press demonstration"/);
  });

  test("escapes a hostile name in the alt text", () => {
    const html = exerciseMedia({ ...bench, name: '"><script>' }, { mediaUrl: "media/x.gif" });
    assert.doesNotMatch(html, /<script/);
  });
  test("an explicitly supplied licensed file still takes precedence", () => {
    const html = exerciseMedia(
      { ...bench, media: { provider: "gymvisual", gif: "media/gymvisual/x.gif" } },
      { mediaUrl: "media/own.webp", mediaCredit: "Filmed by the author" },
    );
    assert.match(html, /media\/own\.webp/);
    assert.doesNotMatch(html, /media\/gymvisual\/x\.gif/);
  });

  test("shows the licensed GIF eagerly over its still poster", () => {
    const html = exerciseMedia({
      ...bench,
      media: {
        provider: "gymvisual",
        gif: "media/gymvisual/x.gif",
        image: "media/gymvisual/x.jpg",
        credit: "© Gym Visual — https://gymvisual.com/",
      },
    });
    assert.match(html, /class="media-anim" src="media\/gymvisual\/x\.gif"/);
    assert.match(html, /class="media-poster" src="media\/gymvisual\/x\.jpg"/);
    assert.match(html, /loading="eager"/);
    assert.doesNotMatch(html, /figcaption/);
    assert.doesNotMatch(html, /media-credit/);
  });
});

describe("exerciseThumbnail", () => {
  test("uses the licensed animation and labels it as a GIF", () => {
    const html = exerciseThumbnail({
      name: "Bench Press",
      media: { provider: "gymvisual", gif: "media/gymvisual/x.gif", image: "media/gymvisual/x.jpg" },
    });
    assert.match(html, /src="media\/gymvisual\/x\.gif"/);
    assert.match(html, /class="exercise-thumb has-image is-motion"/);
    assert.match(html, />GIF</);
    assert.match(html, /loading="lazy"/);
    assert.match(html, /aria-hidden="true"/);
  });

  test("falls back to the poster, then the dumbbell mark", () => {
    const still = exerciseThumbnail({
      media: { provider: "gymvisual", image: "media/gymvisual/x.jpg" },
    });
    assert.match(still, /src="media\/gymvisual\/x\.jpg"/);
    assert.doesNotMatch(still, />GIF</);

    const drawn = exerciseThumbnail({ name: "Custom" });
    assert.match(drawn, /class="exercise-thumb"/);
    assert.doesNotMatch(drawn, /<img/);
  });
});

describe("mediaPath", () => {
  test("builds a relative path from the dataset id", () => {
    assert.equal(mediaPath("ds-0289", "gif"), "media/ds-0289.gif");
  });

  test("encodes an id that is not path-safe", () => {
    assert.equal(mediaPath("../etc/passwd", "gif"), "media/..%2Fetc%2Fpasswd.gif");
  });

  test("probes the documented extensions in order", () => {
    assert.deepEqual(MEDIA_EXTENSIONS, ["gif", "webp", "mp4", "jpg"]);
  });
});

/* ------------------------------------------------------------------ *
 * Motion helpers
 * ------------------------------------------------------------------ */

describe("odometerChars", () => {
  test("keeps the thousands separator the rest of the app uses", () => {
    // Without this, rolling a session volume would silently drop the comma and
    // contradict every other figure on screen.
    assert.deepEqual(odometerChars(1388), ["1", ",", "3", "8", "8"]);
    assert.deepEqual(odometerChars(2423), ["2", ",", "4", "2", "3"]);
  });

  test("leaves small numbers alone", () => {
    assert.deepEqual(odometerChars(10), ["1", "0"]);
    assert.deepEqual(odometerChars(0), ["0"]);
  });

  test("respects decimals", () => {
    assert.deepEqual(odometerChars(101.3, { decimals: 1 }), ["1", "0", "1", ".", "3"]);
    assert.deepEqual(odometerChars(1575, { decimals: 1 }), ["1", ",", "5", "7", "5", ".", "0"]);
  });

  test("clamps out-of-range decimals", () => {
    assert.equal(odometerChars(1, { decimals: -3 }).join(""), "1");
    assert.equal(odometerChars(1, { decimals: 99 }).length, "1.0000".length);
  });

  test("passes non-numeric input through as characters", () => {
    assert.deepEqual(odometerChars("—"), ["—"]);
    assert.deepEqual(odometerChars(NaN), ["N", "a", "N"]);
  });

  test("can be told to skip the separator", () => {
    assert.deepEqual(odometerChars(1388, { separator: false }), ["1", "3", "8", "8"]);
  });
});

describe("odometerMarkup", () => {
  test("makes a rolling column per digit and a static span per separator", () => {
    const html = odometerMarkup(1388);
    assert.equal((html.match(/odo-digit/g) || []).length, 4);
    assert.equal((html.match(/odo-static/g) || []).length, 1);
    assert.match(html, />,</);
  });

  test("gives each digit strip all ten values to roll through", () => {
    const html = odometerMarkup(7);
    assert.equal((html.match(/<i>\d<\/i>/g) || []).length, 10);
  });

  test("sets --to so CSS knows where to land", () => {
    assert.match(odometerMarkup(42), /--to:4/);
    assert.match(odometerMarkup(42), /--to:2/);
  });

  test("escapes nothing that needs it and emits no unresolved literals", () => {
    const html = odometerMarkup(1388);
    assert.doesNotMatch(html, /\$\{/);
    assert.doesNotMatch(html, /undefined|NaN/);
  });
});

describe("revealVariant", () => {
  const el = (attrs = {}) => ({
    tagName: attrs.tag ?? "DIV",
    getAttribute: (name) => attrs[name] ?? null,
  });

  test("prefers an explicit variant", () => {
    assert.equal(revealVariant(el({ "data-reveal": "stamp" })), "stamp");
  });

  test("ignores an unknown explicit variant", () => {
    assert.equal(revealVariant(el({ "data-reveal": "cartwheel", class: "session-row" })), "write");
  });

  test("assigns draw to SVG and diagram markup", () => {
    assert.equal(revealVariant(el({ tag: "SVG" })), "draw");
    assert.equal(revealVariant(el({ class: "diagram diagram-movement" })), "draw");
  });

  test("assigns grow to chart bars", () => {
    assert.equal(revealVariant(el({ tag: "RECT", class: "chart-bar" })), "grow");
    assert.equal(revealVariant(el({ class: "dist-fill" })), "grow");
  });

  test("assigns roll to figures", () => {
    assert.equal(revealVariant(el({ class: "tile-value" })), "roll");
  });

  test("assigns stamp to marks", () => {
    assert.equal(revealVariant(el({ class: "record-mark" })), "stamp");
    assert.equal(revealVariant(el({ class: "pr-flag" })), "stamp");
  });

  test("assigns write to rows and list items", () => {
    assert.equal(revealVariant(el({ class: "set-row" })), "write");
    assert.equal(revealVariant(el({ class: "menu-item" })), "write");
    assert.equal(revealVariant(el({ class: "logsheet" })), "write");
  });

  test("assigns rise to headings", () => {
    assert.equal(revealVariant(el({ tag: "H1" })), "rise");
    assert.equal(revealVariant(el({ tag: "H3" })), "rise");
  });

  test("defaults to write rather than throwing", () => {
    assert.equal(revealVariant(el({})), "write");
    assert.equal(revealVariant(null), "rise");
  });

  test("never returns the same variant for everything", () => {
    // The point of the exercise: the craft floor's complaint is one identical
    // entrance repeated down a page. If this ever collapses to one value the
    // page loses its authored motion.
    const seen = new Set(
      [
        el({ tag: "SVG" }),
        el({ class: "chart-bar" }),
        el({ class: "tile-value" }),
        el({ class: "record-mark" }),
        el({ class: "set-row" }),
        el({ tag: "H1" }),
      ].map(revealVariant),
    );
    assert.ok(seen.size >= 5, `expected varied variants, got ${[...seen].join(", ")}`);
  });
});

describe("pointerNorm", () => {
  const box = { left: 100, top: 50, width: 200, height: 100 };

  test("puts the centre at the origin", () => {
    assert.deepEqual(pointerNorm(200, 100, box), { x: 0, y: 0 });
  });

  test("puts the top-left at -0.5, -0.5", () => {
    assert.deepEqual(pointerNorm(100, 50, box), { x: -0.5, y: -0.5 });
  });

  test("puts the bottom-right at 0.5, 0.5", () => {
    assert.deepEqual(pointerNorm(300, 150, box), { x: 0.5, y: 0.5 });
  });

  test("does not divide by a zero-size rect", () => {
    const n = pointerNorm(10, 10, { left: 0, top: 0, width: 0, height: 0 });
    assert.equal(n.x, 9.5);
    assert.equal(n.y, 9.5);
  });

  test("treats a missing rect as a 1x1 box at the origin", () => {
    assert.deepEqual(pointerNorm(0.5, 0.5, null), { x: 0, y: 0 });
  });
});

describe("clampUnit", () => {
  test("passes values inside the default ±0.5 band", () => {
    assert.equal(clampUnit(0), 0);
    assert.equal(clampUnit(0.25), 0.25);
    assert.equal(clampUnit(-0.5), -0.5);
  });

  test("clips a flick past the band", () => {
    assert.equal(clampUnit(2), 0.5);
    assert.equal(clampUnit(-4), -0.5);
  });

  test("honours a custom max", () => {
    assert.equal(clampUnit(2, 1), 1);
    assert.equal(clampUnit(-0.8, 0.3), -0.3);
  });

  test("returns 0 for non-finite input rather than NaN", () => {
    assert.equal(clampUnit(NaN), 0);
    assert.equal(clampUnit(Infinity), 0);
    assert.equal(clampUnit(undefined), 0);
  });
});

describe("viewportNorm", () => {
  test("puts the centre of the window at the origin", () => {
    const n = viewportNorm(500, 300, { width: 1000, height: 600 });
    assert.equal(n.x, 0);
    assert.equal(n.y, 0);
  });

  test("maps the corners to ±1", () => {
    assert.deepEqual(viewportNorm(0, 0, { width: 1000, height: 600 }), { x: -1, y: -1 });
    assert.deepEqual(viewportNorm(1000, 600, { width: 1000, height: 600 }), { x: 1, y: 1 });
  });

  test("clamps a pointer that leaves the window", () => {
    const n = viewportNorm(4000, -900, { width: 1000, height: 600 });
    assert.equal(n.x, 1);
    assert.equal(n.y, -1);
  });

  test("never divides by a zero-size viewport", () => {
    const n = viewportNorm(0, 0, { width: 0, height: 0 });
    assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
    assert.deepEqual(n, { x: -1, y: -1 });
  });
});

describe("depthVector", () => {
  test("is at rest in the centre with no scroll", () => {
    assert.deepEqual(depthVector(0, 0, 12, 0), { x: 0, y: 0 });
  });

  test("travels further at a greater depth", () => {
    const near = depthVector(0.5, 0.5, 6, 0);
    const far = depthVector(0.5, 0.5, 24, 0);
    assert.equal(far.x, near.x * 4);
    assert.equal(far.y, near.y * 4);
  });

  test("pulls the field upward as the page scrolls", () => {
    const rest = depthVector(0, 0, 20, 0);
    const scrolled = depthVector(0, 0, 20, 1);
    assert.equal(rest.y, 0);
    assert.ok(scrolled.y < rest.y);
  });

  test("survives nonsense input", () => {
    assert.deepEqual(depthVector(NaN, NaN, NaN, NaN), { x: 0, y: 0 });
    assert.deepEqual(depthVector(9, -9, 0, 0), { x: 0, y: 0 });
  });
});

describe("trailWidth", () => {
  test("rests at the base width when the pointer is slow", () => {
    assert.equal(trailWidth(0, 4), 4);
  });

  test("tapers as the pointer speeds up", () => {
    assert.ok(trailWidth(0.8, 4) < trailWidth(0.2, 4));
  });

  test("never reaches zero, even at an absurd speed", () => {
    assert.ok(trailWidth(100, 4) >= 4 * 0.32);
  });

  test("never produces NaN from missing input", () => {
    assert.ok(Number.isFinite(trailWidth(undefined, undefined)));
  });
});

describe("spotlightPercent", () => {
  const box = { left: 100, top: 50, width: 200, height: 100 };

  test("centres the light in the middle of the card", () => {
    assert.deepEqual(spotlightPercent(200, 100, box), { x: 50, y: 50 });
  });

  test("maps the top-left corner to 0, 0", () => {
    assert.deepEqual(spotlightPercent(100, 50, box), { x: 0, y: 0 });
  });

  test("clamps a finger that drags past the card edge", () => {
    assert.deepEqual(spotlightPercent(900, -400, box), { x: 100, y: 0 });
  });

  test("does not divide by a zero-size rect", () => {
    const p = spotlightPercent(0, 0, { left: 0, top: 0, width: 0, height: 0 });
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  });
});

describe("springStep", () => {
  test("stays put when already at the target with no velocity", () => {
    assert.deepEqual(springStep(4, 4, 0), { value: 4, velocity: 0 });
  });

  test("moves toward the target and damps residual velocity", () => {
    const first = springStep(0, 10, 0, { stiffness: 0.22, damping: 0.72 });
    assert.ok(first.value > 0 && first.value < 10, "first step advances toward the target");
    assert.ok(first.velocity > 0, "first step has positive velocity");
    const second = springStep(first.value, 10, first.velocity, { stiffness: 0.22, damping: 0.72 });
    assert.ok(second.value > first.value, "second step continues toward the target");
  });

  test("settles close to the target after enough steps", () => {
    let value = 0;
    let velocity = 0;
    for (let i = 0; i < 80; i += 1) {
      const step = springStep(value, 1, velocity);
      value = step.value;
      velocity = step.velocity;
    }
    assert.ok(Math.abs(value - 1) < 0.01, `settled at ${value}`);
    assert.ok(Math.abs(velocity) < 0.01, `residual velocity ${velocity}`);
  });
});
