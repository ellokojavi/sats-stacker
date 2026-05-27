import { describe, expect, it } from "vitest";
import {
  backwardWindowMs,
  backwardWindowDays,
  forwardWindowMs,
  forwardWindowDays,
} from "./dateRangePresets";

const DAY_MS = 86400000;
const GENESIS_MS = Date.UTC(2009, 0, 3);

describe("backwardWindowMs", () => {
  const latest = Date.UTC(2026, 4, 26); // 2026-05-26
  const earliest = Date.UTC(2011, 0, 1);

  it("returns null for ALL", () => {
    expect(backwardWindowMs("ALL", latest, earliest)).toBeNull();
  });

  it("computes 7D window ending at latest", () => {
    const w = backwardWindowMs("7D", latest, earliest);
    expect(w).not.toBeNull();
    expect(w![1]).toBe(latest);
    expect(latest - w![0]).toBe(7 * DAY_MS);
  });

  it("computes 1Y window of ~365 days", () => {
    const w = backwardWindowMs("1Y", latest, earliest);
    expect(w![1] - w![0]).toBe(365 * DAY_MS);
  });

  it("YTD anchors to Jan 1 of the latest year", () => {
    const w = backwardWindowMs("YTD", latest, earliest);
    expect(w![0]).toBe(Date.UTC(2026, 0, 1));
    expect(w![1]).toBe(latest);
  });

  it("clips to earliest when the window would extend further back", () => {
    const tightEarliest = latest - 100 * DAY_MS;
    const w = backwardWindowMs("1Y", latest, tightEarliest);
    expect(w![0]).toBe(tightEarliest);
  });
});

describe("backwardWindowDays", () => {
  const nowDays = Math.round((Date.UTC(2026, 4, 26) - GENESIS_MS) / DAY_MS);
  const firstDays = Math.round((Date.UTC(2011, 0, 1) - GENESIS_MS) / DAY_MS);

  it("returns null for ALL", () => {
    expect(backwardWindowDays("ALL", nowDays, firstDays)).toBeNull();
  });

  it("computes 7D window in day units", () => {
    const w = backwardWindowDays("7D", nowDays, firstDays);
    expect(w).toEqual([nowDays - 7, nowDays]);
  });

  it("computes 6M window of 182 days", () => {
    const w = backwardWindowDays("6M", nowDays, firstDays);
    expect(w![1] - w![0]).toBe(182);
  });

  it("YTD lands on Jan 1 of the latest year (in days)", () => {
    const w = backwardWindowDays("YTD", nowDays, firstDays);
    const jan1Days = (Date.UTC(2026, 0, 1) - GENESIS_MS) / DAY_MS;
    expect(w![0]).toBe(jan1Days);
  });
});

describe("forwardWindowMs", () => {
  const today = Date.UTC(2026, 4, 26);
  const farthest = today + 15 * 365 * DAY_MS;

  it("returns null for ALL", () => {
    expect(forwardWindowMs("ALL", today, farthest)).toBeNull();
  });

  it("computes 5Y window of 5*365 days", () => {
    const w = forwardWindowMs("5Y", today, farthest);
    expect(w![1] - w![0]).toBe(5 * 365 * DAY_MS);
  });

  it("clips to farthest when the window would overshoot", () => {
    const tight = today + 3 * 365 * DAY_MS;
    const w = forwardWindowMs("15Y", today, tight);
    expect(w![1]).toBe(tight);
  });
});

describe("forwardWindowDays", () => {
  const nowDays = 6000;
  const farthest = nowDays + 15 * 365;

  it("returns null for ALL", () => {
    expect(forwardWindowDays("ALL", nowDays, farthest)).toBeNull();
  });

  it("computes 1Y window of 365 days", () => {
    const w = forwardWindowDays("1Y", nowDays, farthest);
    expect(w).toEqual([nowDays, nowDays + 365]);
  });

  it("clips to farthest", () => {
    const w = forwardWindowDays("15Y", nowDays, nowDays + 1000);
    expect(w![1]).toBe(nowDays + 1000);
  });
});
