// All money maths happens in integer paise so totals always add up exactly.
// Rupee values only exist at the edges: user input, display, and DB rows.

export type Paise = number;

/** Rupees (number or numeric string) → integer paise. Invalid input → 0. */
export function toPaise(rupees: number | string | null | undefined): Paise {
  const n = typeof rupees === 'string' ? Number(rupees) : rupees;
  if (n == null || !Number.isFinite(n)) return 0;
  // toFixed avoids float artefacts like 276.78 * 100 = 27677.999…
  return Math.round(Number(n.toFixed(2)) * 100);
}

export function toRupees(paise: Paise): number {
  return paise / 100;
}

/**
 * Split `total` paise into `n` parts that differ by at most one paisa and add
 * up exactly. The first `total % n` parts get the extra paisa.
 */
export function splitEvenly(total: Paise, n: number): Paise[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Divide `total` paise by weights (e.g. percentages) so parts add up exactly
 * to `total`, using the largest-remainder method.
 */
export function allocateByWeights(total: Paise, weights: number[]): Paise[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map((r) => Math.floor(r));
  let left = total - floors.reduce((s, f) => s + f, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]! += 1;
    left -= 1;
  }
  return floors;
}

const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

/** Format rupees as ₹ in en-IN style. */
export function fmtINR(rupees: number | string | null | undefined, decimals = false): string {
  return (decimals ? inr2 : inr0).format(Number(rupees) || 0);
}
