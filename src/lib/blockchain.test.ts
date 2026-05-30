import { describe, it, expect } from "vitest";
import { deriveHalvingStatus, HALVING_INTERVAL } from "./blockchain";

describe("deriveHalvingStatus", () => {
  it("rounds the next halving up to the next 210,000-block multiple", () => {
    const { nextHalvingBlock, blocksRemaining } = deriveHalvingStatus(
      945_000,
      600_000,
    );
    expect(nextHalvingBlock).toBe(1_050_000);
    expect(blocksRemaining).toBe(105_000);
  });

  it("advances to the following halving when sitting exactly on a halving block", () => {
    // Block 840,000 was the 4th halving (April 2024). From that tip, the
    // *next* halving must be 1,050,000, not 840,000 itself.
    const { nextHalvingBlock, blocksRemaining } = deriveHalvingStatus(
      840_000,
      600_000,
    );
    expect(nextHalvingBlock).toBe(840_000 + HALVING_INTERVAL);
    expect(blocksRemaining).toBe(HALVING_INTERVAL);
  });

  it("projects ETA from remaining blocks and avg block time", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const { etaDate } = deriveHalvingStatus(1_049_990, 600_000, now);
    // 10 remaining blocks * 600s = 6000s = 100 min after `now`
    expect(etaDate.getTime() - now.getTime()).toBe(10 * 600_000);
  });
});
