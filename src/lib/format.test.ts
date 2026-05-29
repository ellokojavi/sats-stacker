import { describe, expect, it } from "vitest";
import {
  formatBtcValue,
  formatSats,
  formatValue,
  usdToSats,
} from "./format";

describe("formatValue — unit-aware dollar formatter", () => {
  it("returns USD when unit is 'usd'", () => {
    expect(formatValue(1234, "usd", 100_000)).toBe("$1,234");
  });

  it("converts to sats when unit is 'sats' at the given price", () => {
    // $1,000 at $100,000/BTC = 0.01 BTC = 1,000,000 sats
    expect(formatValue(1_000, "sats", 100_000)).toBe("1,000,000 sats");
  });

  it("falls back to USD when no price is provided", () => {
    expect(formatValue(500, "sats", 0)).toBe("$500");
  });

  it("preserves negative sign through unit conversion", () => {
    expect(formatValue(-100, "sats", 100_000)).toBe("-100,000 sats");
  });
});

describe("formatBtcValue — unit-aware BTC quantity", () => {
  it("keeps BTC suffix in usd mode", () => {
    expect(formatBtcValue(0.12345, "usd")).toBe("0.1235 BTC");
  });

  it("converts to sats in sats mode", () => {
    expect(formatBtcValue(0.5, "sats")).toBe("50,000,000 sats");
  });
});

describe("formatSats / usdToSats — base conversions", () => {
  it("formats sats with thousands separators and suffix", () => {
    expect(formatSats(2_100_000_000_000)).toBe("2,100,000,000,000 sats");
  });

  it("usdToSats does the math at $100k", () => {
    // 1 BTC = $100,000 → $50,000 = 0.5 BTC = 50,000,000 sats
    expect(usdToSats(50_000, 100_000)).toBeCloseTo(50_000_000);
  });

  it("usdToSats returns 0 on a zero or negative price", () => {
    expect(usdToSats(1000, 0)).toBe(0);
    expect(usdToSats(1000, -1)).toBe(0);
  });
});
