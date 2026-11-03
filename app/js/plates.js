/**
 * IronLog — plate maths for barbell lifts.
 *
 * Pure functions only: target weight in, plates per side out. No DOM, no
 * storage, so the whole thing runs in Node tests. The plate inventories are
 * the standard Olympic sets; the bar weight follows the selected units
 * (20 kg / 45 lb), which is what a lifter means when they type a total.
 */

/** Standard bar weight per unit system. */
export const BAR_WEIGHT = { kg: 20, lb: 45 };

/** Plate inventory per side, heaviest first. */
export const PLATES = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

/** Round to the smallest plate increment so results are actually loadable. */
export function roundToStep(value, step) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const s = Number(step) > 0 ? Number(step) : 1;
  return Math.round(n / s) * s;
}

/**
 * Greedy plate decomposition for a total barbell weight.
 *
 * @param {number} totalWeight target total including the bar
 * @param {"kg"|"lb"} [units]
 * @returns {{bar: number, perSide: Array<{weight: number, count: number}>,
 *            total: number, exact: boolean, remainder: number}}
 *   `total` is the achievable weight (bar + plates), `exact` says whether it
 *   equals the request, `remainder` is the unloadable leftover per side.
 */
export function platesForWeight(totalWeight, units = "kg") {
  const unit = units === "lb" ? "lb" : "kg";
  const bar = BAR_WEIGHT[unit];
  const inventory = PLATES[unit];
  const step = inventory[inventory.length - 1];

  const rawRequest = Number(totalWeight);
  const requested = Math.max(bar, roundToStep(Number.isFinite(rawRequest) ? rawRequest : 0, step));
  let perSideTarget = (requested - bar) / 2;

  const perSide = [];
  let remainder = perSideTarget;
  for (const plate of inventory) {
    if (remainder + 1e-9 < plate) continue;
    const count = Math.floor(remainder / plate + 1e-9);
    if (count > 0) {
      perSide.push({ weight: plate, count });
      remainder -= count * plate;
    }
  }
  // Snap a hair of float drift onto the smallest plate.
  if (remainder > 1e-6) {
    const last = perSide[perSide.length - 1];
    if (last && Math.abs(remainder - last.weight) < 1e-6) {
      last.count += 1;
      remainder = 0;
    }
  }

  const plated = perSide.reduce((sum, p) => sum + p.weight * p.count, 0);
  const total = bar + plated * 2;
  return {
    bar,
    perSide,
    total: roundToStep(total, step),
    // "exact" compares against what the user actually typed, not the snapped
    // request, so an unloadable target is honestly reported as approximate.
    exact: Number.isFinite(rawRequest) && Math.abs(total - rawRequest) < 1e-6,
    remainder: roundToStep(remainder, step),
  };
}

/** "2×20 + 1×10 kg per side" — human line for the sheet and the summary. */
export function formatPlates(result, units = "kg") {
  if (!result || result.perSide.length === 0) return `just the bar (${result?.bar ?? BAR_WEIGHT[units === "lb" ? "lb" : "kg"]} ${units})`;
  const parts = result.perSide.map((p) => `${p.count}×${p.weight}`);
  return `${parts.join(" + ")} ${units} per side`;
}
