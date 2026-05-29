import { describe, expect, it } from "vitest";
import {
  computeYearly,
  computeHalvingCohorts,
  computeDataQuality,
} from "./analytics";
import type { PricePoint, Transaction } from "./types";

/** Tiny helper — build a Transaction with sane defaults. */
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

describe("computeYearly — annualized ROI per bucket", () => {
  it("doubles ≈ +100% annualized for a single buy held exactly 1 year", () => {
    // Bought 0.01 BTC for $50,000 on 2024-01-01; price now is $100,000 →
    // value $1,000.00, double the cost basis ($500). Held 1 year → +100% CAGR.
    const txns = [tx("2024-01-01", 500, 0.01)];
    const rows = computeYearly(txns, 100_000, "2025-01-01");
    const y2024 = rows.find((r) => r.year === "2024")!;
    expect(y2024).toBeDefined();
    expect(y2024.annualizedRoi).not.toBeNull();
    // Allow a small floating-point fudge.
    expect(Math.abs(y2024.annualizedRoi! - 100)).toBeLessThan(0.5);
  });

  it("returns null for buckets where the dollar-weighted holding period is < 30 days", () => {
    // Two buys made 10 days before the asOf date — too fresh to annualize
    // (the (1/yearsHeld) exponent would extrapolate noise into nonsense).
    const txns = [
      tx("2026-05-15", 100, 0.001),
      tx("2026-05-16", 100, 0.001),
    ];
    const rows = computeYearly(txns, 100_000, "2026-05-25");
    const y2026 = rows.find((r) => r.year === "2026")!;
    expect(y2026.annualizedRoi).toBeNull();
  });

  it("uses a dollar-weighted average days-held — equal-sized buys give the arithmetic mean", () => {
    // Two equal $100 buys 100 days apart → weighted average days held lands
    // between the two. Verify CAGR uses that average, not the latest or
    // earliest date.
    //   Buy A: 2024-01-01 ($100, 0.001 BTC) — 365 days held
    //   Buy B: 2024-04-10 ($100, 0.001 BTC) — 265 days held
    //   Avg days = (100·365 + 100·265) / 200 = 315 days ≈ 0.8624 years
    //   Total invested $200 → BTC 0.002 → value at $200k = $400 → 2× → CAGR
    //   = 2^(1/0.8624) − 1 ≈ 1.226 ≈ +122.6%
    const txns = [
      tx("2024-01-01", 100, 0.001),
      tx("2024-04-10", 100, 0.001),
    ];
    const rows = computeYearly(txns, 200_000, "2024-12-31");
    const y2024 = rows.find((r) => r.year === "2024")!;
    expect(y2024.annualizedRoi).not.toBeNull();
    // Expected: 2^(365.25/315) − 1 ≈ 122%; allow ±2pp for rounding.
    expect(Math.abs(y2024.annualizedRoi! - 122)).toBeLessThan(2);
  });

  it("Total row annualizes across all buys, weighted by USD", () => {
    const txns = [
      tx("2023-01-01", 1000, 0.05), // big older buy
      tx("2025-01-01", 100, 0.001), // small recent buy
    ];
    const rows = computeYearly(txns, 80_000, "2026-01-01");
    const total = rows.find((r) => r.year === "Total")!;
    expect(total.annualizedRoi).not.toBeNull();
    // Big buy dominates → avg days held closer to the 2023 buy (~1096 days)
    // than the 2025 buy (~366 days). With $1100 invested → 0.051 BTC →
    // value at $80k = $4080, the CAGR is well-defined and positive.
    expect(total.annualizedRoi! > 0).toBe(true);
  });
});

describe("computeHalvingCohorts — bucketing by halving epoch", () => {
  it("buckets a buy into the epoch that contains its date", () => {
    // 2021-06-15 falls in Epoch 4 (2020-05-11 → 2024-04-19).
    const txns = [tx("2021-06-15", 1000, 0.025)];
    const rows = computeHalvingCohorts(txns, 80_000, "2026-05-29");
    // One epoch row + the Total row.
    expect(rows).toHaveLength(2);
    expect(rows[0].label).toBe("Epoch 4 (2020–2024)");
    expect(rows[0].btc).toBeCloseTo(0.025);
    expect(rows[0].usd).toBeCloseTo(1000);
  });

  it("treats halving day as the start of the new epoch (exclusive endDate)", () => {
    // Halving #3 fell on 2020-05-11 → that day belongs to Epoch 4, not Epoch 3.
    const txns = [tx("2020-05-11", 100, 0.01)];
    const rows = computeHalvingCohorts(txns, 50_000, "2024-01-01");
    const e4 = rows.find((r) => r.label.startsWith("Epoch 4"));
    const e3 = rows.find((r) => r.label.startsWith("Epoch 3"));
    expect(e4).toBeDefined();
    expect(e3).toBeUndefined();
  });

  it("omits epochs with no buys", () => {
    // Only one Epoch 4 buy → output is one epoch row + Total, no empty padding.
    const txns = [tx("2022-01-01", 100, 0.005)];
    const rows = computeHalvingCohorts(txns, 100_000, "2026-01-01");
    expect(rows.map((r) => r.label)).toEqual([
      "Epoch 4 (2020–2024)",
      "Total",
    ]);
  });

  it("sums BTC and USD across epochs into the Total row", () => {
    const txns = [
      tx("2017-03-01", 500, 0.5), // Epoch 3
      tx("2022-07-01", 1500, 0.05), // Epoch 4
    ];
    const rows = computeHalvingCohorts(txns, 100_000, "2026-01-01");
    const total = rows.find((r) => r.label === "Total")!;
    expect(total.btc).toBeCloseTo(0.55);
    expect(total.usd).toBeCloseTo(2000);
    expect(total.currentValue).toBeCloseTo(55_000);
    expect(total.profit).toBeCloseTo(53_000);
  });
});

describe("computeDataQuality — ETL anomaly detection", () => {
  // A small daily price series for tests.
  const prices: PricePoint[] = [
    { date: "2024-01-01", price: 40_000 },
    { date: "2024-01-08", price: 42_000 },
    { date: "2024-01-15", price: 45_000 },
  ];

  it("flags a transaction whose implied $/BTC diverges by > 5% from market", () => {
    // Buy on 2024-01-08 at market $42k → $420 / 0.01 BTC = $42k implied (no anomaly).
    // Buy on 2024-01-08 at $500 / 0.01 BTC = $50k implied → +19% vs market (flag).
    const txns: Transaction[] = [
      tx("2024-01-08", 420, 0.01),
      tx("2024-01-08", 500, 0.01),
    ];
    const dq = computeDataQuality(txns, prices);
    expect(dq.checkedCount).toBe(2);
    expect(dq.anomalyCount).toBe(1);
    expect(dq.anomalies[0].divergence).toBeGreaterThan(0.15);
  });

  it("uses the nearest price-day at or before the transaction date", () => {
    // Bundled series is weekly; a Wed buy snaps back to Mon's close.
    // 2024-01-10 (Wed) → uses 2024-01-08 ($42k). $420 / 0.01 = $42k → no flag.
    const txns: Transaction[] = [tx("2024-01-10", 420, 0.01)];
    const dq = computeDataQuality(txns, prices);
    expect(dq.anomalyCount).toBe(0);
    expect(dq.checkedCount).toBe(1);
  });

  it("counts pre-history transactions as unchecked, not anomalies", () => {
    // The earliest price-point is 2024-01-01; a buy before that has no
    // baseline to compare against → uncheckedCount += 1, not flagged.
    const txns: Transaction[] = [tx("2023-06-01", 100, 0.005)];
    const dq = computeDataQuality(txns, prices);
    expect(dq.checkedCount).toBe(0);
    expect(dq.uncheckedCount).toBe(1);
    expect(dq.anomalyCount).toBe(0);
  });

  it("returns worst offenders first, capped at topN", () => {
    // Three flagged rows, increasing divergence; topN=2 should return the
    // two biggest divergences, biggest first.
    const txns: Transaction[] = [
      tx("2024-01-01", 480, 0.01), // implied $48k vs $40k → +20%
      tx("2024-01-01", 600, 0.01), // implied $60k vs $40k → +50%
      tx("2024-01-01", 440, 0.01), // implied $44k vs $40k → +10%
    ];
    const dq = computeDataQuality(txns, prices, 0.05, 2);
    expect(dq.anomalyCount).toBe(3);
    expect(dq.anomalies).toHaveLength(2);
    expect(dq.anomalies[0].divergence).toBeCloseTo(0.5);
    expect(dq.anomalies[1].divergence).toBeCloseTo(0.2);
  });

  it("ignores zero-BTC or zero-USD rows (can't compute implied price)", () => {
    const txns: Transaction[] = [
      tx("2024-01-08", 0, 0.01),
      tx("2024-01-08", 100, 0),
    ];
    const dq = computeDataQuality(txns, prices);
    expect(dq.checkedCount).toBe(0);
    expect(dq.uncheckedCount).toBe(2);
    expect(dq.anomalyCount).toBe(0);
  });
});
