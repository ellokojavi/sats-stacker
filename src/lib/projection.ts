/**
 * Shared projection-model contract. Both the Power Law and Quantile Bands
 * models compute a forward BTC price trajectory; the UI section consumes
 * this common shape so it can swap models behind a toggle without branching
 * its own rendering logic.
 *
 * Power-law–specific fields (β, intercept, σ, R²) are optional — the
 * Quantile Bands model leaves them undefined and exposes its own metadata
 * via the `metadata` map.
 */

import type { PricePoint } from "./types";

export type ProjectionModelId = "powerlaw" | "quantile";

export interface ProjectionPoint {
  /** Days since the model's genesis anchor (Jan 3 2009 for power-law, Jan 1 2009 for quantile). */
  days: number;
  /**
   * Historical closing price. Optional so model-only forecast points (no
   * actual price yet) can be appended without breaking the actual-price
   * line — Recharts will skip undefined values.
   */
  price?: number;
  /** Model's central / median price at this day. */
  model: number;
}

/**
 * Forward fair-value milestone — same five-scenario shape across both models.
 * For Power Law the bands are ±σ / ±2σ around the regression line; for
 * Quantile Bands they are Q10 / Q25 / Q50 / Q75 / Q95 of the rearranged
 * conditional quantile estimates.
 */
export interface ProjectionMilestone {
  label: string;
  /** Central / median scenario. */
  model: number;
  /** +1σ (power-law) or Q75 (quantile). */
  optimistic: number;
  /** +2σ (power-law) or Q95 (quantile). */
  bull: number;
  /** −1σ (power-law) or Q25 (quantile). */
  pessimistic: number;
  /** −2σ (power-law) or Q10 (quantile). */
  bear: number;
}

/**
 * One point in the dense future-price series used by the holdings projection
 * chart. Monthly cadence, ~15 years horizon from "today".
 */
export interface FuturePoint {
  days: number;
  bear: number;
  pessimistic: number;
  median: number;
  optimistic: number;
  bull: number;
}

export interface BandLabels {
  bear: string;
  pessimistic: string;
  median: string;
  optimistic: string;
  bull: string;
}

/**
 * The common projection result both models produce. Components depend on
 * this; powerlaw.ts and quantileBands.ts each fulfill it.
 */
export interface BtcProjection {
  id: ProjectionModelId;
  /** Short label for the section header, e.g. "Power Law" or "Quantile Bands". */
  modelLabel: string;
  /** Display label for each band, model-aware (σ vs Q). */
  bandLabels: BandLabels;
  currentPrice: number;
  /** Central / median model price at `nowDays`. */
  modelPriceNow: number;
  /** currentPrice / modelPriceNow. */
  multiplier: number;
  /** Days since each model's own genesis anchor for `asOf`. */
  nowDays: number;
  /** Historical points (with optional actual price) for the log-log chart. */
  points: ProjectionPoint[];
  /** Forward fair-value milestones for the cards/table. */
  projections: ProjectionMilestone[];
  /** ~15-year monthly forward series for the holdings projection chart. */
  futurePoints: FuturePoint[];
  /**
   * Model's median price at an arbitrary day. Used by the DCA accumulator
   * and the "+5Y forecast" overlay so they don't need to know which model
   * is active.
   */
  medianAt: (days: number) => number;

  // ── Power-law–specific (undefined for quantile) ──────────────────────────
  beta?: number;
  intercept?: number;
  sigma?: number;
  r2?: number;

  // ── Quantile-specific (undefined for power-law) ──────────────────────────
  /**
   * Centering constant μ from the Cowen (2026) paper: x = ln(t) − μ.
   * Kept on the result so the assumption strip can echo it.
   */
  centeringMu?: number;
}

export interface ProjectionInput {
  priceHistory: PricePoint[];
  currentPrice: number;
  /** ISO date string — anchors "today" for forward projections. */
  asOf: string;
}
