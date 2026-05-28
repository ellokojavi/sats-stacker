export type DataSource = "demo" | "private" | "imported";

export type ViewMode = "demo" | "real";

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
