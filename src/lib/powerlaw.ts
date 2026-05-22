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
  price: number;
  model: number;
}

export interface PowerLawProjection {
  label: string;
  model: number;
}

export interface PowerLawResult {
  beta: number;
  intercept: number;
  r2: number;
  currentPrice: number;
  modelPriceNow: number;
  multiplier: number;
  nowDays: number;
  points: PowerLawPoint[];
  projections: PowerLawProjection[];
}

function daysSinceGenesis(dateStr: string): number {
  const ms = new Date(dateStr.slice(0, 10) + "T00:00:00Z").getTime();
  return Math.max(1, (ms - GENESIS_MS) / DAY_MS);
}

function modelPrice(days: number, intercept: number, beta: number): number {
  return Math.pow(10, intercept + beta * Math.log10(days));
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
    ssRes += (ys[i] - predicted) ** 2;
    ssTot += (ys[i] - meanY) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

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
  ].map((year) => ({
    label: `Jan ${year}`,
    model: modelPrice(daysSinceGenesis(`${year}-01-01`), intercept, beta),
  }));

  return {
    beta,
    intercept,
    r2,
    currentPrice,
    modelPriceNow,
    multiplier,
    nowDays,
    points,
    projections,
  };
}
