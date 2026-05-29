export type DataSource = "demo" | "private" | "imported";

export type ViewMode = "demo" | "real";

/**
 * Denomination unit for dollar-valued figures across the dashboard.
 *
 *   • "usd"  — show as US dollars (default; what every component used to do)
 *   • "sats" — convert via the current BTC price into satoshis (1 BTC = 100M sats)
 *
 * Pure BTC quantities (stack size, per-buy BTC) always render in BTC and
 * are unaffected by this toggle.
 */
export type Unit = "usd" | "sats";

export interface Transaction {
  id: string;
  date: string;
  source: string;
  action: string;
  btc: number;
  usd: number;
  fees: number;
}

export interface PricePoint {
  date: string;
  price: number;
}

export interface ExchangeStat {
  exchange: string;
  transactions: number;
  files: number;
  /** ISO date of the earliest transaction from this exchange, or null. */
  firstDate: string | null;
  /** ISO date of the latest transaction from this exchange, or null. */
  lastDate: string | null;
}

/** Per-file ingestion record — what got pulled in, from where, and across what window. */
export interface FileImport {
  fileName: string;
  /** Detected exchange name, or null if the file's header didn't match any known exporter. */
  exchange: string | null;
  /** Recognized status: true if the file's schema matched a known exchange. */
  recognized: boolean;
  /** Rows kept after normalization (post duplicate-drop) — 0 for unrecognized files. */
  transactions: number;
  /** Duplicate rows removed while merging this file into its exchange bucket. */
  duplicatesRemoved: number;
  /** Earliest transaction date in this file, ISO. Null for unrecognized files. */
  firstDate: string | null;
  /** Latest transaction date in this file, ISO. Null for unrecognized files. */
  lastDate: string | null;
}

export interface EtlStats {
  filesIngested: number;
  filesSkipped: number;
  duplicatesRemoved: number;
  total: number;
  byExchange: ExchangeStat[];
  /** Per-file ingestion detail. Recognized + skipped files, in input order. */
  files: FileImport[];
  /** Earliest transaction date across the whole ledger, ISO. Null for an empty ledger. */
  firstDate: string | null;
  /** Latest transaction date across the whole ledger, ISO. Null for an empty ledger. */
  lastDate: string | null;
  /** UTC timestamp (ISO) of when this normalization ran — useful for the Settings view. */
  importedAt: string;
}

export interface EtlResult {
  transactions: Transaction[];
  stats: EtlStats;
  source: DataSource;
}

export interface Snapshot {
  totalBtc: number;
  totalInvested: number;
  currentValue: number;
  netPL: number;
  totalRoi: number;
  avgCostBasis: number;
  breakEvenDist: number;
  currentPrice: number;
  txCount: number;
  firstDate: string;
  lastUpdated: string;
}

export interface HoldingsPoint {
  date: string;
  portfolioValue: number;
  btcPrice: number;
  invested: number;
}

/** A single buy, valued against the current price. */
export interface Lot {
  id: string;
  date: string;
  source: string;
  btc: number;
  usd: number;
  buyPrice: number;
  currentValue: number;
  profit: number;
  roi: number;
  daysHeld: number;
  annualizedRoi: number | null;
}

export interface YearRow {
  year: string;
  btc: number;
  usd: number;
  avgBuyPrice: number;
  currentValue: number;
  profit: number;
  roi: number;
  /**
   * CAGR for this year's buys, computed against the dollar-weighted average
   * days held. Null when the bucket is too recent (< 30 days held on average)
   * for annualization to be meaningful — early-year buys have wild
   * extrapolations.
   */
  annualizedRoi: number | null;
}

/**
 * A bitcoin-native bucketing of buys by halving epoch. Speaks the language
 * of the audience the dashboard implicitly addresses — "what cycle did you
 * buy in" is the real question, not "what year."
 */
export interface CycleRow {
  /** Display label, e.g. "Epoch 3 (2016–2020)" or "Total". */
  label: string;
  /** ISO date the epoch starts, or null on the Total row. */
  startDate: string | null;
  /** ISO date the epoch ends (exclusive), or null on the Total row. */
  endDate: string | null;
  btc: number;
  usd: number;
  avgBuyPrice: number;
  currentValue: number;
  profit: number;
  roi: number;
  annualizedRoi: number | null;
}

/**
 * ETL data-quality summary. Lights up the Settings → Import summary with a
 * "we transformed *and* verified" story.
 */
export interface DataQualitySummary {
  /** Transactions whose implied $/BTC diverges from market price by > anomalyPctThreshold. */
  anomalyCount: number;
  /** Threshold used (0.05 = 5%). */
  anomalyPctThreshold: number;
  /** Total transactions checked (excludes rows we couldn't price-check). */
  checkedCount: number;
  /** Transactions we couldn't price-check (no price-history point near the date). */
  uncheckedCount: number;
  /**
   * Up to N worst-offender rows for display. Sorted by absolute divergence
   * descending.
   */
  anomalies: AnomalyRow[];
}

export interface AnomalyRow {
  id: string;
  date: string;
  source: string;
  btc: number;
  usd: number;
  /** Buy's implied $/BTC. */
  impliedPrice: number;
  /** Market $/BTC on that date, from the bundled price history. */
  marketPrice: number;
  /** (implied − market) / market. Signed. */
  divergence: number;
}

export interface TierRow {
  label: string;
  count: number;
  invested: number;
  pctOfCapital: number;
}

export interface CagrResult {
  tiers: TierRow[];
  weightedCagr: number;
  sp500: number;
  mag7: number;
}

export interface ExchangeRow {
  exchange: string;
  count: number;
  btc: number;
  invested: number;
  currentValue: number;
  profit: number;
  roi: number;
  avgCost: number;
}
