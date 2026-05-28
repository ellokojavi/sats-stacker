import { describe, expect, it } from "vitest";
import { simulateAllStrategies, STRATEGIES } from "./whatif";
import type { PricePoint, Transaction } from "./types";

function tx(date: string, usd: number, btc: number): Transaction {
  return {
    id: `${date}-${usd}`,
    date,
    source: "Test",
    action: "buy",
    btc,
    usd,
    fees: 0,
  };
}

/**
 * Build a daily price series from a list of (date, price) anchors.
 * Linear-in-log interpolation between anchors so we don't need to hand-write
 * 365 values when a test only cares about a few inflection points.
 */
function pricesFrom(
  start: string,
  end: string,
  anchors: Array<[string, number]>,
): PricePoint[] {
  const DAY_MS = 86400000;
  const startMs = new Date(start + "T00:00:00Z").getTime();
  const endMs = new Date(end + "T00:00:00Z").getTime();
  const anchored = anchors
    .map(([d, p]) => [new Date(d + "T00:00:00Z").getTime(), p] as const)
    .sort((a, b) => a[0] - b[0]);
  const series: PricePoint[] = [];
  for (let t = startMs; t <= endMs; t += DAY_MS) {
    // Find bracketing anchors.
    let lo = anchored[0];
    let hi = anchored[anchored.length - 1];
    for (let i = 0; i < anchored.length; i++) {
      if (anchored[i][0] <= t) lo = anchored[i];
      if (anchored[i][0] >= t) {
        hi = anchored[i];
        break;
      }
    }
    let price: number;
    if (lo[0] === hi[0] || t <= lo[0]) price = lo[1];
    else if (t >= hi[0]) price = hi[1];
    else {
      const frac = (t - lo[0]) / (hi[0] - lo[0]);
      price = Math.exp(
        Math.log(lo[1]) + frac * (Math.log(hi[1]) - Math.log(lo[1])),
      );
    }
    series.push({ date: new Date(t).toISOString().slice(0, 10), price });
  }
  return series;
}

describe("simulateAllStrategies", () => {
  it("deploys exactly the same total USD across every strategy", () => {
    const txns = [
      tx("2022-01-01", 1000, 0.02),
      tx("2023-01-01", 1000, 0.04),
      tx("2024-01-01", 1000, 0.02),
    ];
    const prices = pricesFrom("2022-01-01", "2026-01-01", [
      ["2022-01-01", 50000],
      ["2023-01-01", 25000],
      ["2024-01-01", 50000],
      ["2026-01-01", 100000],
    ]);

    const results = simulateAllStrategies({
      txns,
      prices,
      currentPrice: 100000,
      asOf: "2026-01-01",
    });

    const actual = results.find((r) => r.strategyId === "actual")!;
    expect(actual.totalInvested).toBeCloseTo(3000, 2);
    // Every other strategy should deploy within $1 of the same budget — small
    // rounding from cadence math is OK.
    for (const r of results) {
      if (r.strategyId === "actual") continue;
      // Skip oracle if window has 0 monthly lows (won't happen here, just defensive).
      if (r.buys.length === 0) continue;
      expect(Math.abs(r.totalInvested - 3000)).toBeLessThan(1.5);
    }
  });

  it("lump-sum doubles when price doubles between the buy day and today", () => {
    const txns = [tx("2024-01-01", 5000, 0.1)]; // 5000 USD at $50k → 0.1 BTC
    const prices = pricesFrom("2024-01-01", "2025-01-01", [
      ["2024-01-01", 50000],
      ["2025-01-01", 100000],
    ]);

    const [actual, lumpSum] = simulateAllStrategies({
      txns,
      prices,
      currentPrice: 100000,
      asOf: "2025-01-01",
    });

    // Single buy, price exactly doubled — actual + lumpSum should both land at $10k.
    expect(actual.finalValue).toBeCloseTo(10_000, 0);
    expect(lumpSum.finalValue).toBeCloseTo(10_000, 0);
    // CAGR ≈ 100% over 1 year (allow ±1pp for fractional-year drift).
    expect(actual.cagr).not.toBeNull();
    expect(Math.abs(actual.cagr! - 100)).toBeLessThan(1);
  });

  it("weekly DCA produces ~52 buys per year of window", () => {
    const txns = [
      tx("2023-01-01", 0.01, 0.0000001), // small marker buy on day 0
      tx("2024-01-01", 999.99, 0.01), // bulk on day 365
    ];
    const prices = pricesFrom("2023-01-01", "2024-01-01", [
      ["2023-01-01", 50000],
      ["2024-01-01", 50000],
    ]);

    const results = simulateAllStrategies({
      txns,
      prices,
      currentPrice: 50000,
      asOf: "2024-01-01",
    });
    const weekly = results.find((r) => r.strategyId === "weekly")!;
    // Window is exactly 365 days, step 7 → ceil(365/7) + 1 ≈ 53 buys.
    expect(weekly.buys.length).toBeGreaterThanOrEqual(52);
    expect(weekly.buys.length).toBeLessThanOrEqual(54);
  });

  it("hindsight oracle is the unbeatable upper bound", () => {
    // V-shaped price chart: starts at $50k, dips to $20k in the middle, ends at $80k.
    // Oracle should buy at the bottom each month → best possible BTC stack.
    const txns = [
      tx("2023-01-01", 600, 0.012),
      tx("2024-01-01", 600, 0.0075),
      tx("2025-01-01", 600, 0.0075),
    ];
    const prices = pricesFrom("2023-01-01", "2025-06-01", [
      ["2023-01-01", 50000],
      ["2024-01-01", 20000],
      ["2025-01-01", 60000],
      ["2025-06-01", 80000],
    ]);
    const results = simulateAllStrategies({
      txns,
      prices,
      currentPrice: 80000,
      asOf: "2025-06-01",
    });
    const oracle = results.find((r) => r.strategyId === "oracle")!;
    // Oracle's final BTC should be at least as high as every other strategy
    // (modulo small rounding) since it bought at every monthly low.
    for (const r of results) {
      if (r.strategyId === "oracle") continue;
      if (r.totalBtc === 0) continue;
      expect(oracle.totalBtc + 1e-6).toBeGreaterThanOrEqual(r.totalBtc);
    }
  });

  it("halving strategy falls back to lump-sum when no halvings are in window", () => {
    // Window 2021–2023 contains NO halvings (between May 2020 and Apr 2024).
    const txns = [tx("2021-06-01", 1000, 0.02)];
    const prices = pricesFrom("2021-06-01", "2023-06-01", [
      ["2021-06-01", 50000],
      ["2023-06-01", 25000],
    ]);
    const results = simulateAllStrategies({
      txns,
      prices,
      currentPrice: 25000,
      asOf: "2023-06-01",
    });
    const halving = results.find((r) => r.strategyId === "halving")!;
    expect(halving.buys).toHaveLength(1);
    expect(halving.buys[0].date).toBe("2021-06-01");
  });

  it("returns every strategy in the canonical STRATEGIES order", () => {
    const txns = [tx("2024-01-01", 1000, 0.02)];
    const prices = pricesFrom("2024-01-01", "2024-06-01", [
      ["2024-01-01", 50000],
      ["2024-06-01", 60000],
    ]);
    const results = simulateAllStrategies({
      txns,
      prices,
      currentPrice: 60000,
      asOf: "2024-06-01",
    });
    const ids = results.map((r) => r.strategyId);
    expect(ids).toEqual(STRATEGIES.map((s) => s.id));
  });
});
