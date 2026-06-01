import type { Transaction, PricePoint, Snapshot, HoldingsPoint } from "./types";

/** Compute the headline portfolio metrics shown in the snapshot cards. */
export function computeSnapshot(
  txns: Transaction[],
  currentPrice: number,
  lastUpdated: string,
): Snapshot {
  const totalBtc = txns.reduce((sum, t) => sum + t.btc, 0);
  const totalInvested = txns.reduce((sum, t) => sum + t.usd, 0);
  const currentValue = totalBtc * currentPrice;
  const netPL = currentValue - totalInvested;
  const totalRoi = totalInvested > 0 ? (netPL / totalInvested) * 100 : 0;
  const avgCostBasis = totalBtc > 0 ? totalInvested / totalBtc : 0;
  const breakEvenDist =
    avgCostBasis > 0 ? ((currentPrice - avgCostBasis) / avgCostBasis) * 100 : 0;
  const dates = txns.map((t) => t.date).sort();

  return {
    totalBtc,
    totalInvested,
    currentValue,
    netPL,
    totalRoi,
    avgCostBasis,
    breakEvenDist,
    currentPrice,
    txCount: txns.length,
    firstDate: dates[0] ?? "",
    lastUpdated,
  };
}

/**
 * Build the "HODLings value over time" series: for each price-history date,
 * the cumulative BTC held valued at that date's price.
 *
 * The series spans the *full* bundled price history (not just from the first
 * buy onward). Pre-stack points keep their real BTC price but report
 * portfolioValue / invested / btcStack = 0 because no buys have happened
 * yet. This lets the chart show the BTC-price line across the whole Bitcoin
 * era with the portfolio joining the curve at the user's first buy — and
 * lets a "Stack" preset zoom to just the stacking era while "All" stays
 * meaningful as the full history.
 *
 * The bundled price history ends a few days in the past and its final value
 * is static. When a live price is available, the most recent point is
 * restated at that price so the chart's right edge agrees with the header
 * and the snapshot KPIs (which are all driven by the live price).
 */
export function computeHoldingsSeries(
  txns: Transaction[],
  prices: PricePoint[],
  currentPrice?: number,
): HoldingsPoint[] {
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));

  let idx = 0;
  let cumBtc = 0;
  let cumUsd = 0;
  const series: HoldingsPoint[] = [];

  for (const point of prices) {
    while (idx < sorted.length && sorted[idx].date.slice(0, 10) <= point.date) {
      cumBtc += sorted[idx].btc;
      cumUsd += sorted[idx].usd;
      idx += 1;
    }
    series.push({
      date: point.date,
      portfolioValue: cumBtc * point.price,
      btcPrice: point.price,
      invested: cumUsd,
      btcStack: cumBtc,
    });
  }

  if (currentPrice && currentPrice > 0 && series.length > 0) {
    const last = series[series.length - 1];
    series[series.length - 1] = {
      ...last,
      btcPrice: currentPrice,
      portfolioValue: cumBtc * currentPrice,
    };
  }
  return series;
}
