/**
 * IronLog — animated movement and muscle diagrams.
 *
 * WHY THIS EXISTS
 * ---------------
 * The upstream exercise dataset ships 180x180 animation GIFs, but its licence
 * carries an explicit MEDIA EXCEPTION: that media is (c) Gym Visual, included in
 * the dataset with the rights holder's written permission, and "cloning this
 * repository does not grant you any license to the media". IronLog therefore
 * redistributes it only under the app operator's separate Gym Visual media
 * licence, with every record's credit retained. See NOTICE and app/media/README.md.
 *
 * Where no licensed catalogue media exists, original vector geometry is drawn from the
 * dataset's own MIT-licensed fields (category, muscle, equipment, target,
 * secondaryMuscles). It is deliberately NOT a picture of a person. The craft
 * floor bans figure-bearing illustration as amateur while naming "crisp vector
 * shapes, diagrams, animated linework" as first-class media, so every shape here
 * is a lever, an arc, a vector or a travel path - the mechanics of the movement
 * rather than an imitation of a body. That also makes it themeable, tiny, and
 * sharp at any size, which a 180x180 GIF is not.
 *
 * Every function is pure: exercise object in, SVG string out. No DOM, no
 * randomness, no clock. That keeps them testable and keeps re-render cheap.
 *
 * Animation lives in CSS (app.css, "Motion" layer), driven by the class names
 * emitted here and runs consistently regardless of OS motion preferences.
 */

import { esc, icon } from "./ui.js";

/**
 * Movement classes. Derived from the dataset's real vocabulary, checked in this
 * order so the most specific signal wins: `category` first (it is the coarsest
 * and most reliable), then `muscle`, then the equipment as a tie-breaker.
 *
 * Each class draws different geometry, because a hinge is not a press and the
 * diagram should say so.
 */
const MOVEMENT_RULES = [
  // ORDER IS THE LOGIC HERE. Several rules match the same words - a curl works
  // the biceps and so does a chin-up, a hinge works the glutes and so does a
  // squat - so the rules are arranged most-specific first and each one states
  // what makes it specific. Getting this wrong does not throw; it silently draws
  // the wrong diagram, which is why tests/diagrams.test.js pins every class.
  { id: "cardio", match: (e) => e.category === "cardio" || e.muscle === "cardio" },
  { id: "carry", match: (e) => /sled|farmer|carry|shrug/i.test(`${e.name} ${e.target}`) },

  // The arms first, decided on CATEGORY rather than on the muscle name. The
  // dataset puts 289 records in "upper arms" and 37 in "lower arms", and both
  // biceps and triceps also appear as secondaries on back and chest work - so
  // "bicep" alone would swallow every chin-up and row into the curl diagram.
  {
    id: "curl",
    match: (e) =>
      (e.category === "upper arms" && /bicep|curl|brachialis/i.test(`${e.muscleGroup} ${e.target} ${e.name}`)) ||
      /\bcurl\b|hammer curl|preacher/i.test(e.name),
  },
  {
    id: "extend",
    match: (e) =>
      (e.category === "upper arms" && /tricep|extension|pushdown|kickback/i.test(`${e.muscleGroup} ${e.target} ${e.name}`)) ||
      (e.category === "lower arms" || /forearm|wrist/i.test(`${e.muscleGroup} ${e.target}`)) ||
      /pushdown|skull ?crusher|\bextension\b/i.test(e.name),
  },

  // Legs. Decided on the NAME first, then on anatomy.
  //
  // A split squat lists "glutes" as its muscle group, and a Romanian deadlift
  // lists hamstrings - so anatomy alone sends the squat to the hinge diagram.
  // The name is what the lifter actually chose and is the more specific signal,
  // so it votes first: anything called a deadlift or good morning is a hinge,
  // anything called a squat, lunge or press is a squat. Only when the name is
  // silent does the posterior chain decide.
  { id: "hinge", match: (e) => /deadlift|good morning|stiff leg|straight leg|hip hinge|back extension|hyperextension/i.test(e.name) },
  { id: "squat", match: (e) => /squat|lunge|leg press|hack|step-?up|split|leg extension|calf raise/i.test(e.name) },
  { id: "hinge", match: (e) => /hamstring|glute|lower back|\bhip\b/i.test(`${e.muscleGroup} ${e.target} ${e.muscle}`) },
  { id: "squat", match: (e) => /quadricep|\bquad|calf|calves|upper legs|lower legs/i.test(`${e.muscleGroup} ${e.muscle} ${e.category}`) },

  // Torso and back. Pull is decided on category first so a back exercise stays a
  // pull even when the biceps are listed as the muscle group.
  { id: "pull", match: (e) => e.category === "back" || /\blat|row|pull-?up|chin-?up|rear delt|pulldown|face pull/i.test(`${e.muscleGroup} ${e.target} ${e.name}`) },
  { id: "core", match: (e) => e.category === "waist" || /\bab|oblique|core|crunch|sit-?up|plank/i.test(`${e.muscleGroup} ${e.muscle} ${e.target} ${e.name}`) },
  { id: "press", match: (e) => /chest|shoulder|press|pec|delt|push-?up/i.test(`${e.category} ${e.muscleGroup} ${e.target} ${e.name}`) },
];

/** Fallback when nothing matches: a neutral travel path, never an empty box. */
const DEFAULT_MOVEMENT = "generic";

/**
 * Classify an exercise into a movement class.
 * Exported because the picker, the tests and the diagram all need one answer.
 */
export function movementClass(exercise) {
  if (!exercise || typeof exercise !== "object") return DEFAULT_MOVEMENT;
  const probe = {
    category: String(exercise.category ?? ""),
    muscle: String(exercise.muscle ?? ""),
    muscleGroup: String(exercise.muscleGroup ?? ""),
    target: String(exercise.target ?? ""),
    name: String(exercise.name ?? ""),
    equipment: String(exercise.equipment ?? ""),
  };
  for (const rule of MOVEMENT_RULES) {
    if (rule.match(probe)) return rule.id;
  }
  return DEFAULT_MOVEMENT;
}

/** Human wording for a movement class, used as the diagram's accessible name. */
const MOVEMENT_LABEL = {
  cardio: "Repeated travel",
  carry: "Loaded carry",
  hinge: "Hip hinge",
  squat: "Vertical travel under load",
  pull: "Pull toward an anchor",
  extend: "Extension from a pivot",
  curl: "Flexion around a pivot",
  core: "Bracing and rotation",
  press: "Press away from the body",
  generic: "Loaded movement",
};

/**
 * Geometry per movement class.
 *
 * Coordinates are in a 120x120 box. Each entry supplies:
 *   frame   - static reference geometry (ground, pivot, anchor, ruled limits)
 *   travel  - the path the load moves along; animated by stroke-dashoffset
 *   load    - the moving element; animated by offset-path along `travel`
 *   arc     - an optional swept arc, dashed, drawn in on mount
 *
 * Keeping the vocabulary this small is what makes the set read as one diagram
 * language rather than ten unrelated doodles.
 */
function geometry(kind) {
  switch (kind) {
    case "press":
      return {
        frame: `<path class="dg-frame" d="M22 100h76M60 100V26"/>
                <path class="dg-limit" d="M46 34h28M46 92h28"/>`,
        travel: `M60 92V34`,
        arc: `<path class="dg-arc" d="M44 62h32"/>`,
        force: `<path class="dg-force" d="M60 26l-7 9M60 26l7 9"/>`,
        load: { shape: "bar", at: "start" },
      };
    case "pull":
      return {
        frame: `<circle class="dg-anchor" cx="60" cy="24" r="5"/>
                <path class="dg-frame" d="M22 100h76"/>
                <path class="dg-limit" d="M46 34h28M46 92h28"/>`,
        travel: `M60 92V34`,
        arc: `<path class="dg-arc" d="M44 62h32"/>`,
        force: `<path class="dg-force" d="M60 30l-6-7M60 30l6-7"/>`,
        load: { shape: "bar", at: "end" },
      };
    case "hinge":
      return {
        frame: `<circle class="dg-pivot" cx="34" cy="82" r="5"/>
                <path class="dg-frame" d="M16 100h88"/>`,
        travel: `M34 82 L92 44`,
        arc: `<path class="dg-arc" d="M84 74A56 56 0 0 0 62 34"/>`,
        force: `<path class="dg-force" d="M92 44l-2 10M92 44l-10 2"/>`,
        load: { shape: "block", at: "end" },
        sweep: true,
      };
    case "squat":
      return {
        frame: `<path class="dg-frame" d="M22 104h76M60 104V20"/>
                <path class="dg-limit" d="M40 30h40M40 96h40"/>
                <path class="dg-spring" d="M44 96l6-8 6 8 6-8 6 8 6-8"/>`,
        travel: `M60 30V96`,
        force: `<path class="dg-force" d="M60 20l-7 9M60 20l7 9"/>`,
        load: { shape: "bar", at: "start" },
      };
    case "curl":
      return {
        frame: `<circle class="dg-pivot" cx="38" cy="86" r="5"/>
                <path class="dg-frame" d="M20 104h80M38 86V40"/>`,
        travel: `M38 86 L84 62`,
        arc: `<path class="dg-arc" d="M74 86A36 36 0 0 0 38 50"/>`,
        force: `<path class="dg-force" d="M84 62l-11 1M84 62l-4 10"/>`,
        load: { shape: "block", at: "end" },
        sweep: true,
      };
    case "extend":
      return {
        frame: `<circle class="dg-pivot" cx="38" cy="40" r="5"/>
                <path class="dg-frame" d="M20 22h80M38 40v50"/>`,
        travel: `M38 40 L84 74`,
        arc: `<path class="dg-arc" d="M74 40A36 36 0 0 1 38 76"/>`,
        force: `<path class="dg-force" d="M84 74l-11-1M84 74l-4-10"/>`,
        load: { shape: "block", at: "end" },
        sweep: true,
      };
    case "core":
      return {
        frame: `<circle class="dg-pivot" cx="60" cy="62" r="5"/>
                <path class="dg-arc" d="M28 62A32 32 0 0 1 92 62"/>
                <path class="dg-arc" d="M28 62A32 32 0 0 0 92 62"/>`,
        travel: `M28 62A32 32 0 0 1 92 62`,
        force: `<path class="dg-force" d="M92 62l-9-5M92 62l-9 5"/>`,
        load: { shape: "dot", at: "end" },
        sweep: true,
      };
    case "carry":
      return {
        frame: `<path class="dg-frame" d="M14 96h92"/>
                <path class="dg-limit" d="M22 96v-8M98 96v-8"/>
                <path class="dg-ticks" d="M34 96v-4M46 96v-4M58 96v-4M70 96v-4M82 96v-4"/>`,
        travel: `M22 78h76`,
        force: `<path class="dg-force" d="M98 78l-9-5M98 78l-9 5"/>`,
        load: { shape: "block", at: "end" },
      };
    case "cardio":
      return {
        frame: `<path class="dg-frame" d="M14 96h92"/>
                <path class="dg-wave" d="M14 74q11-22 23 0t23 0 23 0 23 0"/>`,
        travel: `M14 74q11-22 23 0t23 0 23 0 23 0`,
        load: { shape: "dot", at: "end" },
      };
    default:
      return {
        frame: `<path class="dg-frame" d="M22 100h76M60 100V28"/>`,
        travel: `M60 92V36`,
        force: `<path class="dg-force" d="M60 28l-7 9M60 28l7 9"/>`,
        load: { shape: "bar", at: "start" },
      };
  }
}

/** The moving element, drawn per equipment so a barbell reads as a barbell. */
function loadShape(shape, equipment = "") {
  const eq = String(equipment).toLowerCase();
  if (shape === "dot") return `<circle class="dg-load dg-load-dot" r="5" cx="0" cy="0"/>`;
  if (shape === "block") {
    // A kettlebell or dumbbell is drawn as a block with a handle; a plate as a disc.
    if (eq.includes("kettlebell")) {
      return `<g class="dg-load"><path d="M-5-6a5 5 0 0 1 10 0" class="dg-load-line"/><rect x="-8" y="-6" width="16" height="15" rx="3"/></g>`;
    }
    return `<g class="dg-load"><rect x="-9" y="-7" width="18" height="14" rx="3"/></g>`;
  }
  // "bar": a loaded bar. Plates appear when the equipment is a barbell variant.
  const plated = /barbell|smith|ez bar/.test(eq);
  const plates = plated
    ? `<rect x="-26" y="-9" width="5" height="18" rx="1.5"/><rect x="21" y="-9" width="5" height="18" rx="1.5"/>`
    : "";
  const heads = /dumbbell/.test(eq)
    ? `<rect x="-24" y="-6" width="7" height="12" rx="2"/><rect x="17" y="-6" width="7" height="12" rx="2"/>`
    : /cable|band/.test(eq)
      ? `<circle cx="-22" cy="0" r="4"/><circle cx="22" cy="0" r="4"/>`
      : `<rect x="-22" y="-4" width="5" height="8" rx="1.5"/><rect x="17" y="-4" width="5" height="8" rx="1.5"/>`;
  return `<g class="dg-load">${plates}<path class="dg-load-line" d="M-22 0h44"/>${heads}</g>`;
}

/**
 * Render a movement diagram for an exercise.
 *
 * @param {object} exercise  a catalogue or custom exercise record
 * @param {object} [opts]
 * @param {number} [opts.size]      rendered box size in px (viewBox is fixed)
 * @param {boolean} [opts.animate]  emit animation classes (default true)
 * @param {string} [opts.label]     override the accessible name
 * @returns {string} SVG markup
 */
export function movementDiagram(exercise, opts = {}) {
  const kind = movementClass(exercise);
  const g = geometry(kind);
  const size = Number(opts.size) || 120;
  const animate = opts.animate !== false;
  const name = exercise?.name ?? "Exercise";
  const label =
    opts.label ?? `${name}: ${MOVEMENT_LABEL[kind] ?? MOVEMENT_LABEL.generic} diagram`;

  // offset-path needs the travel path repeated in CSS, so it is inlined here.
  // The load starts at the path's "at" end and travels to the other.
  const travel = g.travel;
  const reverse = g.load.at === "start";

  return `<svg class="diagram diagram-movement${animate ? " is-animated" : ""}" data-movement="${esc(kind)}" viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${esc(label)}">
  <g class="dg-static">${g.frame}</g>
  <path class="dg-travel" d="${esc(travel)}"/>
  ${g.arc ? `<g class="dg-sweep">${g.arc}</g>` : ""}
  ${g.force ? `<g class="dg-arrow">${g.force}</g>` : ""}
  <g class="dg-mover"${reverse ? ` data-reverse="1"` : ""} style="offset-path:path('${esc(travel)}')">
    ${loadShape(g.load.shape, exercise?.equipment)}
  </g>
</svg>`;
}

/**
 * Render a muscle diagram: the primary muscle at the centre, the secondaries
 * ranged around it, joined by linework that draws itself in.
 *
 * This is a graph, not an anatomy picture. It answers "what does this work?"
 * with the dataset's own fields and nothing invented.
 *
 * @param {object} exercise
 * @param {object} [opts]
 * @param {number} [opts.limit]   max secondary nodes (default 6)
 * @param {boolean} [opts.animate]
 */
export function muscleDiagram(exercise, opts = {}) {
  if (!exercise || typeof exercise !== "object") return "";
  const limit = Number(opts.limit) || 6;
  const animate = opts.animate !== false;

  const primary = String(exercise.muscleGroup || exercise.target || exercise.muscle || "").trim();
  if (!primary) return "";

  const seen = new Set([primary.toLowerCase()]);
  const secondaries = []
    .concat(exercise.secondaryMuscles ?? [])
    .map((m) => String(m ?? "").trim())
    .filter((m) => {
      const key = m.toLowerCase();
      if (!m || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);

  const W = 220;
  const H = 150;
  const cx = W / 2;
  const cy = H / 2;
  const rx = 84;
  const ry = 54;
  const n = secondaries.length;

  // Nodes are placed on an ellipse, starting at the top and spreading evenly so
  // the layout is stable for a given count rather than jittering per exercise.
  const nodes = secondaries.map((name, i) => {
    const t = n === 1 ? -Math.PI / 2 : -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return {
      name,
      x: Math.round((cx + rx * Math.cos(t)) * 10) / 10,
      y: Math.round((cy + ry * Math.sin(t)) * 10) / 10,
    };
  });

  const links = nodes
    .map(
      (p, i) =>
        `<path class="dg-link" d="M${cx} ${cy}L${p.x} ${p.y}" style="--i:${i}"/>`,
    )
    .join("");

  const labels = nodes
    .map(
      (p, i) =>
        `<g class="dg-node" style="--i:${i}">
      <circle cx="${p.x}" cy="${p.y}" r="4.5"/>
      <text x="${p.x}" y="${p.y - 10}" text-anchor="middle">${esc(p.name)}</text>
    </g>`,
    )
    .join("");

  return `<svg class="diagram diagram-muscle${animate ? " is-animated" : ""}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Works ${primary}${n ? `, with ${secondaries.join(", ")}` : ""}`)}">
  <g class="dg-links">${links}</g>
  <g class="dg-core">
    <circle cx="${cx}" cy="${cy}" r="26"/>
    <text x="${cx}" y="${cy + 4}" text-anchor="middle">${esc(primary)}</text>
  </g>
  ${labels}
</svg>`;
}

/**
 * Compact decorative artwork for exercise lists and the live logger.
 *
 * Licensed Gym Visual animations are reused at list size; entries without media
 * get the same small local dumbbell mark. The adjacent exercise name supplies
 * the accessible label, so the thumbnail itself is hidden from assistive tech.
 * Per-record credit lives in the catalogue data and NOTICE, not in the list.
 */
export function exerciseThumbnail(exercise) {
  const media = exercise?.media?.provider === "gymvisual" ? exercise.media : null;
  const gif = media?.gif || "";
  const url = gif || media?.image || "";
  if (url) {
    return `<span class="exercise-thumb has-image${gif ? " is-motion" : ""}" aria-hidden="true"><img src="${esc(url)}" alt="" loading="lazy" decoding="async" width="52" height="52" />${gif ? `<span class="thumb-gif">GIF</span>` : ""}</span>`;
  }
  return `<span class="exercise-thumb" aria-hidden="true">${icon("dumbbell")}</span>`;
}

/**
 * Render the media slot for an exercise.
 *
 * The slot resolves in this order:
 *   1. an explicitly supplied licensed file at app/media/<id>.<ext>
 *   2. the catalogue's licensed Gym Visual animation
 *   3. the original drawn movement diagram above
 *
 * User-supplied media keeps the caller's credit wording.
 *
 * @param {object} exercise
 * @param {object} [opts]
 * @param {string|null} [opts.mediaUrl] resolved licensed media URL, or null
 * @param {string} [opts.mediaCredit]  attribution string for supplied media
 */
export function exerciseMedia(exercise, opts = {}) {
  const name = esc(exercise?.name ?? "Exercise");
  if (opts.mediaUrl) {
    const credit = esc(
      opts.mediaCredit ?? "© Gym Visual — https://gymvisual.com/",
    );
    return `<figure class="media media-file">
  <img src="${esc(opts.mediaUrl)}" alt="${name} demonstration" loading="lazy" decoding="async" width="180" height="180"/>
  <figcaption>${credit}</figcaption>
</figure>`;
  }

  // Licensed Gym Visual media: an animated 180x180 GIF (primary). The static
  // poster sits underneath so the media card is never blank while the larger
  // GIF is fetched or decoded. Per-record credit stays in the catalogue data
  // and in NOTICE; the detail card itself stays free of caption clutter.
  if (exercise?.media?.provider === "gymvisual" && exercise.media.gif) {
    const gif = esc(exercise.media.gif);
    const still = exercise.media.image ? esc(exercise.media.image) : "";
    return `<figure class="media media-file media-gymvisual">
  <span class="media-frame">
    ${still ? `<img class="media-poster" src="${still}" alt="" aria-hidden="true" width="180" height="180" decoding="async" />` : ""}
    <img class="media-anim" src="${gif}" alt="${name} demonstration" loading="eager" decoding="async" width="180" height="180" />
  </span>
</figure>`;
  }

  return `<figure class="media media-drawn">
  ${movementDiagram(exercise, { size: 120 })}
  <figcaption>Original movement diagram. No external illustration is bundled for this exercise.</figcaption>
</figure>`;
}

/** File extensions probed, in order, when looking for user-supplied media. */
export const MEDIA_EXTENSIONS = ["gif", "webp", "mp4", "jpg"];

/** Relative path for a candidate media file. `rawDatasetId()` keys the dataset. */
export function mediaPath(id, ext) {
  return `media/${encodeURIComponent(String(id))}.${ext}`;
}
