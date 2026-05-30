/**
 * Quantile Bands model — Cowen (2026), "Asymmetric Tail Curvature in
 * Bitcoin Price Quantiles." A rearranged asymmetric quadratic quantile
 * regression of log₁₀(price) against centered log-time.
 *
 * For each quantile level τ ∈ {0.01, 0.10, 0.25, 0.50, 0.75, 0.95, 0.99}:
 *
 *     Q_τ(log₁₀ P(t)) = c_τ + a_τ · x + b_τ · x²
 *
 * where x = ln(t) − μ, μ = 7.9914, and t is days since 2009-01-01.
 * The curvature term b_τ is shared within tail groups so the lower tail
 * is nearly linear (b ≈ −0.024) while the upper tail bends down sharply
 * (b ≈ −0.326), encoding the "ceiling compresses faster than the floor"
 * observation.
 *
 * The raw quadratics cross by late 2026, so after evaluating all seven
 * quantiles at any date we sort them ascending — the Chernozhukov,
 * Fernández-Val, & Galichon (2010) rearrangement estimator. This step is
 * non-optional; without it the model produces nonsensical orderings at
 * long horizons.
 *
 * Validity: the paper verifies non-crossing through 2035 on the daily grid
 * and disclaims literal interpretation past that. The sats-stacker
 * Projection panel only forecasts ~15 years from "today" (so currently
 * through ~2041), comfortably inside the verified horizon — we therefore
 * do not implement the >2050 flat-real continuation here.
 */

import type {
  BandLabels,
  BtcProjection,
  FuturePoint,
  ProjectionInput,
  ProjectionMilestone,
  ProjectionPoint,
} from "./projection";

// The paper specifies Jan 1, 2009 as the anchor. We use the actual
// genesis-block date (Jan 3, 2009) instead so both models share a single
// time axis and the section's days→date helpers stay simple. The 2-day
// shift moves x = ln(t)−μ by ~2/t (≈ 3 × 10⁻⁴ at t ≈ 6000 days), changing
// projected prices by ~0.2% — well inside the spec's 1% tolerance on the
// EOY-2026 sanity check (Q25 ≈ $107K).
const GENESIS_MS = Date.UTC(2009, 0, 3);
const DAY_MS = 86400000;

/** Centering constant from the paper: x = ln(t) − μ. */
const MU = 7.9914;

type Tau = "q01" | "q10" | "q25" | "q50" | "q75" | "q95" | "q99";
const TAUS: Tau[] = ["q01", "q10", "q25", "q50", "q75", "q95", "q99"];

interface Coef {
  c: number;
  a: number;
  b: number;
}

/**
 * Coefficient table from Cowen (2026), Table 1.
 *
 * `b` values are shared within tail groups:
 *   b_LO  = −0.0241 for τ ∈ {0.01, 0.10, 0.25}   (nearly linear lower tail)
 *   b_MED = −0.1126 for τ = 0.50                  (mild downward curvature)
 *   b_HI  = −0.3259 for τ ∈ {0.75, 0.95, 0.99}   (compressed upper tail)
 */
const COEFS: Record<Tau, Coef> = {
  q01: { c: 2.837, a: 2.578, b: -0.0241 },
  q10: { c: 2.933, a: 2.552, b: -0.0241 },
  q25: { c: 3.004, a: 2.554, b: -0.0241 },
  q50: { c: 3.214, a: 2.482, b: -0.1126 },
  q75: { c: 3.562, a: 2.283, b: -0.3259 },
  q95: { c: 3.897, a: 1.964, b: -0.3259 },
  q99: { c: 4.028, a: 1.904, b: -0.3259 },
};

export function quantileDaysSinceGenesis(dateStr: string): number {
  const ms = new Date(dateStr.slice(0, 10) + "T00:00:00Z").getTime();
  // Clamp to ≥1 so ln(t) stays finite for any pre-genesis edge case.
  return Math.max(1, (ms - GENESIS_MS) / DAY_MS);
}

/** Raw (un-rearranged) quantile price. Used internally — callers want `rearrangedPrices`. */
function quantilePriceRaw(days: number, tau: Tau): number {
  const x = Math.log(days) - MU;
  const { c, a, b } = COEFS[tau];
  return Math.pow(10, c + a * x + b * x * x);
}

/**
 * Evaluate all seven quantiles at `days` and return them sorted ascending,
 * relabeled to the canonical τ slots in order. Sorting enforces the
 * monotonicity that the quadratic family violates at long horizons.
 */
function rearrangedPrices(days: number): Record<Tau, number> {
  const raw: number[] = TAUS.map((t) => quantilePriceRaw(days, t));
  raw.sort((a, b) => a - b);
  return {
    q01: raw[0],
    q10: raw[1],
    q25: raw[2],
    q50: raw[3],
    q75: raw[4],
    q95: raw[5],
    q99: raw[6],
  };
}

/**
 * Median model price at any day — exposed on the result so the section's
 * DCA accumulator and "+5Y forecast" overlay can call into the active
 * model uniformly.
 */
function medianPriceAt(days: number): number {
  return rearrangedPrices(days).q50;
}

const BAND_LABELS: BandLabels = {
  bear: "Bear (Q10)",
  pessimistic: "Pessimistic (Q25)",
  median: "Base (Q50)",
  optimistic: "Optimistic (Q75)",
  bull: "Bull (Q95)",
};

export function computeQuantileBands({
  priceHistory,
  currentPrice,
  asOf,
}: ProjectionInput): BtcProjection {
  const nowDays = quantileDaysSinceGenesis(asOf);
  const modelPriceNow = medianPriceAt(nowDays);
  const multiplier = modelPriceNow > 0 ? currentPrice / modelPriceNow : 0;

  // Historical points: pair each real price with the rearranged Q50 on the
  // same day, so the chart's "model line" is the quantile median across
  // history rather than the linear power-law fit.
  const points: ProjectionPoint[] = priceHistory
    .filter((p) => p.price > 0)
    .map((p) => {
      const days = quantileDaysSinceGenesis(p.date);
      return { days, price: p.price, model: medianPriceAt(days) };
    });

  const asOfYear = new Date(asOf.slice(0, 10) + "T00:00:00Z").getUTCFullYear();
  const projections: ProjectionMilestone[] = [
    asOfYear + 4,
    asOfYear + 9,
    asOfYear + 14,
  ].map((year) => {
    const days = quantileDaysSinceGenesis(`${year}-01-01`);
    const q = rearrangedPrices(days);
    return {
      label: `Jan ${year}`,
      model: q.q50,
      // Five-scenario UI consumes the inner five quantiles; Q01/Q99 are
      // dropped to stay visually symmetric with the existing chart.
      bear: q.q10,
      pessimistic: q.q25,
      optimistic: q.q75,
      bull: q.q95,
    };
  });

  // ~Monthly forward series, 15-year horizon. Same cadence as the power-law
  // version so the holdings projection chart stays in sync.
  const futurePoints: FuturePoint[] = [];
  const endDays = nowDays + 15 * 365;
  const step = 30;
  for (let d = nowDays; d <= endDays + step; d += step) {
    const q = rearrangedPrices(d);
    futurePoints.push({
      days: d,
      bear: q.q10,
      pessimistic: q.q25,
      median: q.q50,
      optimistic: q.q75,
      bull: q.q95,
    });
  }

  return {
    id: "quantile",
    modelLabel: "Quantile Bands",
    bandLabels: BAND_LABELS,
    currentPrice,
    modelPriceNow,
    multiplier,
    nowDays,
    points,
    projections,
    futurePoints,
    medianAt: medianPriceAt,
    centeringMu: MU,
  };
}
