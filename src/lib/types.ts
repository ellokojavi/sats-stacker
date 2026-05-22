export interface Transaction {
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
