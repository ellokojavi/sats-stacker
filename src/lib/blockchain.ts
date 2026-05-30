/**
 * Live Bitcoin network state — current block height + next-halving ETA.
 *
 * Data is fetched from mempool.space (no key, CORS-enabled, community-trusted).
 * If that endpoint fails, we fall back to blockstream.info which returns the
 * same shape for the tip-height call. Both are run-time fetches from the
 * client; nothing here writes to disk or hits a paid API.
 */

/** Blocks between halvings. Hardcoded by Bitcoin protocol. */
export const HALVING_INTERVAL = 210_000;

/** Conservative fallback when mempool.space's `timeAvg` is unavailable. */
const FALLBACK_BLOCK_TIME_MS = 10 * 60 * 1000;

const TIP_HEIGHT_PRIMARY = "https://mempool.space/api/blocks/tip/height";
const TIP_HEIGHT_FALLBACK = "https://blockstream.info/api/blocks/tip/height";
const DIFFICULTY_URL = "https://mempool.space/api/v1/difficulty-adjustment";

export type BlockchainStatus = {
  /** Current chain tip height. */
  height: number;
  /** Height of the next halving (multiple of HALVING_INTERVAL). */
  nextHalvingBlock: number;
  /** Blocks remaining until that halving. */
  blocksRemaining: number;
  /**
   * Average block time in milliseconds observed in the current difficulty
   * epoch. Falls back to 600,000 ms (10 min) when the API doesn't return one.
   */
  avgBlockTimeMs: number;
  /** Projected halving timestamp (Date). */
  etaDate: Date;
};

/**
 * Compute next-halving milestones from a known chain tip height and the
 * observed average block time. Pure function — easy to unit test.
 */
export function deriveHalvingStatus(
  height: number,
  avgBlockTimeMs: number,
  now: Date = new Date(),
): Omit<BlockchainStatus, "height" | "avgBlockTimeMs"> {
  const nextHalvingBlock =
    Math.ceil((height + 1) / HALVING_INTERVAL) * HALVING_INTERVAL;
  const blocksRemaining = nextHalvingBlock - height;
  const etaDate = new Date(now.getTime() + blocksRemaining * avgBlockTimeMs);
  return { nextHalvingBlock, blocksRemaining, etaDate };
}

async function fetchTipHeight(signal?: AbortSignal): Promise<number> {
  try {
    const res = await fetch(TIP_HEIGHT_PRIMARY, { cache: "no-store", signal });
    if (res.ok) {
      const txt = (await res.text()).trim();
      const n = Number(txt);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {
    /* fall through to fallback */
  }
  const res = await fetch(TIP_HEIGHT_FALLBACK, { cache: "no-store", signal });
  if (!res.ok) throw new Error(`tip-height fallback failed: ${res.status}`);
  const txt = (await res.text()).trim();
  const n = Number(txt);
  if (!Number.isFinite(n) || n <= 0) throw new Error("tip-height NaN");
  return n;
}

async function fetchAvgBlockTimeMs(signal?: AbortSignal): Promise<number> {
  try {
    const res = await fetch(DIFFICULTY_URL, { cache: "no-store", signal });
    if (!res.ok) return FALLBACK_BLOCK_TIME_MS;
    const data = await res.json();
    const t = Number(data?.timeAvg);
    // mempool.space returns ms; sanity-check the range so a future API change
    // doesn't make us claim halving is tomorrow.
    if (Number.isFinite(t) && t > 60_000 && t < 3_600_000) return t;
    return FALLBACK_BLOCK_TIME_MS;
  } catch {
    return FALLBACK_BLOCK_TIME_MS;
  }
}

/**
 * Fetch the live blockchain status. Throws if the tip height can't be reached
 * from either source; falls back silently for the block-time hint.
 */
export async function fetchBlockchainStatus(
  signal?: AbortSignal,
): Promise<BlockchainStatus> {
  const [height, avgBlockTimeMs] = await Promise.all([
    fetchTipHeight(signal),
    fetchAvgBlockTimeMs(signal),
  ]);
  const derived = deriveHalvingStatus(height, avgBlockTimeMs);
  return { height, avgBlockTimeMs, ...derived };
}
