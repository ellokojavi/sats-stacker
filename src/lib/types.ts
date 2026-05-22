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
}

export interface EtlStats {
  filesIngested: number;
  filesSkipped: number;
  duplicatesRemoved: number;
  total: number;
  byExchange: ExchangeStat[];
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
