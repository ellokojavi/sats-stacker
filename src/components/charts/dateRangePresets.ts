/**
 * Date-range preset config + window math shared by every time-series chart.
 *
 * Two flavours:
 *  - Backward presets (HoldingsChart, SubmarineChart, Power-Law historical):
 *    7D · 1M · 3M · 6M · YTD · 1Y · All — windows count back from the latest
 *    data point.
 *  - Forward presets (Stack projection): 1Y · 3Y · 5Y · 10Y · 15Y · All —
 *    windows count forward from today.
 */

export type BackwardPresetId = "7D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";
export type ForwardPresetId = "1Y" | "3Y" | "5Y" | "10Y" | "15Y" | "ALL";

export const BACKWARD_PRESETS: { id: BackwardPresetId; label: string }[] = [
  { id: "7D", label: "7D" },
  { id: "1M", label: "1M" },
  { id: "3M", label: "3M" },
  { id: "6M", label: "6M" },
  { id: "YTD", label: "YTD" },
  { id: "1Y", label: "1Y" },
  { id: "ALL", label: "All" },
];

export const FORWARD_PRESETS: { id: ForwardPresetId; label: string }[] = [
  { id: "1Y", label: "1Y" },
  { id: "3Y", label: "3Y" },
  { id: "5Y", label: "5Y" },
  { id: "10Y", label: "10Y" },
  { id: "15Y", label: "15Y" },
  { id: "ALL", label: "All" },
];

const DAY_MS = 86400000;
const GENESIS_MS = Date.UTC(2009, 0, 3);

/**
 * Compute a backward window in ms anchored to `latestMs`. `earliestMs` is the
 * earliest data point — windows that would extend further back are clipped to it
 * so the chart never shows blank space on the left.
 *
 * Returns null for "ALL" to mean "no clipping — use the full data range".
 */
export function backwardWindowMs(
  preset: BackwardPresetId,
  latestMs: number,
  earliestMs: number,
): [number, number] | null {
  if (preset === "ALL") return null;
  const end = latestMs;
  let start: number;
  switch (preset) {
    case "7D":
      start = end - 7 * DAY_MS;
      break;
    case "1M":
      start = end - 30 * DAY_MS;
      break;
    case "3M":
      start = end - 91 * DAY_MS;
      break;
    case "6M":
      start = end - 182 * DAY_MS;
      break;
    case "1Y":
      start = end - 365 * DAY_MS;
      break;
    case "YTD": {
      const d = new Date(end);
      start = Date.UTC(d.getUTCFullYear(), 0, 1);
      break;
    }
    default:
      return null;
  }
  if (start < earliestMs) start = earliestMs;
  if (start >= end) return null;
  return [start, end];
}

/**
 * Compute a forward window in ms anchored to `todayMs`. `farthestMs` is the
 * end of the projection — windows that would extend past it are clipped.
 *
 * Returns null for "ALL".
 */
export function forwardWindowMs(
  preset: ForwardPresetId,
  todayMs: number,
  farthestMs: number,
): [number, number] | null {
  if (preset === "ALL") return null;
  const start = todayMs;
  let end: number;
  switch (preset) {
    case "1Y":
      end = start + 365 * DAY_MS;
      break;
    case "3Y":
      end = start + 3 * 365 * DAY_MS;
      break;
    case "5Y":
      end = start + 5 * 365 * DAY_MS;
      break;
    case "10Y":
      end = start + 10 * 365 * DAY_MS;
      break;
    case "15Y":
      end = start + 15 * 365 * DAY_MS;
      break;
    default:
      return null;
  }
  if (end > farthestMs) end = farthestMs;
  if (end <= start) return null;
  return [start, end];
}

/**
 * Day-since-genesis version of `backwardWindowMs`, for the power-law charts
 * whose X axis is days since 2009-01-03.
 */
export function backwardWindowDays(
  preset: BackwardPresetId,
  latestDays: number,
  earliestDays: number,
): [number, number] | null {
  if (preset === "ALL") return null;
  const end = latestDays;
  let start: number;
  switch (preset) {
    case "7D":
      start = end - 7;
      break;
    case "1M":
      start = end - 30;
      break;
    case "3M":
      start = end - 91;
      break;
    case "6M":
      start = end - 182;
      break;
    case "1Y":
      start = end - 365;
      break;
    case "YTD": {
      const endDate = new Date(GENESIS_MS + end * DAY_MS);
      const jan1Ms = Date.UTC(endDate.getUTCFullYear(), 0, 1);
      start = (jan1Ms - GENESIS_MS) / DAY_MS;
      break;
    }
    default:
      return null;
  }
  if (start < earliestDays) start = earliestDays;
  if (start >= end) return null;
  return [start, end];
}

/**
 * Day-since-genesis version of `forwardWindowMs`, for the stack-projection chart.
 */
export function forwardWindowDays(
  preset: ForwardPresetId,
  todayDays: number,
  farthestDays: number,
): [number, number] | null {
  if (preset === "ALL") return null;
  const start = todayDays;
  let end: number;
  switch (preset) {
    case "1Y":
      end = start + 365;
      break;
    case "3Y":
      end = start + 3 * 365;
      break;
    case "5Y":
      end = start + 5 * 365;
      break;
    case "10Y":
      end = start + 10 * 365;
      break;
    case "15Y":
      end = start + 15 * 365;
      break;
    default:
      return null;
  }
  if (end > farthestDays) end = farthestDays;
  if (end <= start) return null;
  return [start, end];
}
