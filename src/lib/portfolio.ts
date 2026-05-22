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
 * the cumulative BTC held up to that date valued at that date's price.
 */
export function computeHoldingsSeries(
  txns: Transaction[],
  prices: PricePoint[],
): HoldingsPoint[] {
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
  let idx = 0;
  let cumBtc = 0;
  let cumUsd = 0;

  return prices.map((point) => {
    while (idx < sorted.length && sorted[idx].date.slice(0, 10) <= point.date) {
      cumBtc += sorted[idx].btc;
      cumUsd += sorted[idx].usd;
      idx += 1;
    }
    return {
      date: point.date,
      portfolioValue: cumBtc * point.price,
      btcPrice: point.price,
      invested: cumUsd,
    };
  });
}
