import type { PricePoint } from "./types";

/**
 * Bitcoin power-law model. Bitcoin's price has historically tracked a power
 * law of time since the genesis block (2009-01-03): a straight line in
 * log-log space. This fits that line to the price history by least squares.
 */

const GENESIS_MS = Date.UTC(2009, 0, 3);
const DAY_MS = 86400000;

export interface PowerLawPoint {
  days: number;
  /**
   * Actual closing price. Optional so the chart can stitch in model-only
   * forecast points whose `price` is undefined — that breaks the orange
   * actual-price line at "today" while the dashed model line keeps going.
   */
  price?: number;
  model: number;
}

/**
 * A forward projection at a specific milestone date, including bear/base/bull
 * scenarios derived from the ±1σ and ±2σ bands of the log residuals.
 */
export interface PowerLawProjection {
  label: string;
  /** Median model price */
  model: number;
  /** +1σ scenario */
  optimistic: number;
  /** +2σ scenario */
  bull: number;
  /** −1σ scenario */
  pessimistic: number;
  /** −2σ scenario */
  bear: number;
}

/**
 * A single point in the future price projection series (monthly cadence).
 * All values are BTC prices — multiply by totalBtc to get portfolio value.
 */
export interface FuturePoint {
  /** Days since the 2009-01-03 genesis block */
  days: number;
  /** −2σ scenario price */
  bear: number;
  /** −1σ scenario price */
  pessimistic: number;
  /** Median model price */
  median: number;
  /** +1σ scenario price */
  optimistic: number;
  /** +2σ scenario price */
  bull: number;
}

export interface PowerLawResult {
  beta: number;
  intercept: number;
  r2: number;
  /** Std dev of log10 residuals — used to derive the ±1σ / ±2σ scenario bands */
  sigma: number;
  currentPrice: number;
  modelPriceNow: number;
  multiplier: number;
  nowDays: number;
  points: PowerLawPoint[];
  projections: PowerLawProjection[];
  /** Monthly BTC price projections from today to +15 years (all 5 scenarios) */
  futurePoints: FuturePoint[];
}

export function daysSinceGenesis(dateStr: string): number {
  const ms = new Date(dateStr.slice(0, 10) + "T00:00:00Z").getTime();
  return Math.max(1, (ms - GENESIS_MS) / DAY_MS);
}

/**
 * Compute the power-law model price for a given number of days since genesis.
 * An optional sigmaOffset (in log10 units) shifts the result up or down —
 * pass ±sigma or ±2*sigma to get the scenario bands.
 */
export function modelPrice(
  days: number,
  intercept: number,
  beta: number,
  sigmaOffset = 0,
): number {
  return Math.pow(10, intercept + beta * Math.log10(days) + sigmaOffset);
}

export function computePowerLaw(
  priceHistory: PricePoint[],
  currentPrice: number,
  asOf: string,
): PowerLawResult {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const point of priceHistory) {
    if (point.price > 0) {
      xs.push(Math.log10(daysSinceGenesis(point.date)));
      ys.push(Math.log10(point.price));
    }
  }

  const n = xs.length || 1;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - meanX;
    sxx += dx * dx;
    sxy += dx * (ys[i] - meanY);
  }
  const beta = sxx > 0 ? sxy / sxx : 0;
  const intercept = meanY - beta * meanX;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < xs.length; i++) {
    const predicted = intercept + beta * xs[i];
    const res = ys[i] - predicted;
    ssRes += res * res;
    ssTot += (ys[i] - meanY) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  // Unbiased std dev of log10 residuals (denominator n−2 for regression)
  const sigma = xs.length > 2 ? Math.sqrt(ssRes / (xs.length - 2)) : 0;

  const nowDays = daysSinceGenesis(asOf);
  const modelPriceNow = modelPrice(nowDays, intercept, beta);
  const multiplier = modelPriceNow > 0 ? currentPrice / modelPriceNow : 0;

  const points: PowerLawPoint[] = priceHistory
    .filter((p) => p.price > 0)
    .map((p) => {
      const days = daysSinceGenesis(p.date);
      return { days, price: p.price, model: modelPrice(days, intercept, beta) };
    });

  const asOfYear = new Date(asOf.slice(0, 10) + "T00:00:00Z").getUTCFullYear();
  const projections: PowerLawProjection[] = [
    asOfYear + 4,
    asOfYear + 9,
    asOfYear + 14,
  ].map((year) => {
    const days = daysSinceGenesis(`${year}-01-01`);
    return {
      label: `Jan ${year}`,
      model: modelPrice(days, intercept, beta),
      optimistic: modelPrice(days, intercept, beta, sigma),
      bull: modelPrice(days, intercept, beta, 2 * sigma),
      pessimistic: modelPrice(days, intercept, beta, -sigma),
      bear: modelPrice(days, intercept, beta, -2 * sigma),
    };
  });

  // Monthly future projections from today to +15 years
  const futurePoints: FuturePoint[] = [];
  const endDays = nowDays + 15 * 365;
  const step = 30; // ~monthly
  for (let d = nowDays; d <= endDays + step; d += step) {
    futurePoints.push({
      days: d,
      bear: modelPrice(d, intercept, beta, -2 * sigma),
      pessimistic: modelPrice(d, intercept, beta, -sigma),
      median: modelPrice(d, intercept, beta),
      optimistic: modelPrice(d, intercept, beta, sigma),
      bull: modelPrice(d, intercept, beta, 2 * sigma),
    });
  }

  return {
    beta,
    intercept,
    r2,
    sigma,
    currentPrice,
    modelPriceNow,
    multiplier,
    nowDays,
    points,
    projections,
    futurePoints,
  };
}
