import { describe, expect, it } from "vitest";
import { computeYearly } from "./analytics";
import type { Transaction } from "./types";

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
