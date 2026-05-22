import type { Transaction } from "../types";

/**
 * Per-exchange normalizers. Each exchange exports a different schema; these
 * functions map every one onto the standard Transaction shape. Ported from
 * the original BTC_ETL_Pipeline Jupyter notebook.
 */

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/** Strip currency symbols, commas and stray text, then parse to a number. */
export function cleanMoney(value: string | undefined): number {
  if (value == null) return 0;
  const n = parseFloat(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function pad2(value: string): string {
  return value.length < 2 ? "0" + value : value;
}

/** "Jan 01 2024 13:02:22" -> "2024-01-01 13:02:22" */
function parseStrikeDate(raw: string): string {
  const m = raw
    .trim()
    .match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return raw.trim();
  return `${m[3]}-${MONTHS[m[1]] ?? "01"}-${pad2(m[2])} ${pad2(m[4])}:${m[5]}:${m[6]}`;
}

/** Drop a trailing timezone label, e.g. "... UTC" or "... PST". */
function stripTzLabel(raw: string): string {
  return raw.replace(/\s*(UTC|PST|PDT|EST|EDT|CST|CDT)\s*$/i, "").trim();
}

/** Drop a trailing numeric offset, e.g. "2023-11-17 15:30:00+00". */
function stripTzOffset(raw: string): string {
  return raw.replace(/\s*[+-]\d{2}:?\d{0,2}\s*$/, "").trim();
}

export function normalizeStrike(rows: Record<string, string>[]): Transaction[] {
  return rows
    .filter((r) => (r["Transaction Type"] ?? "").trim() === "Purchase")
    .map((r) => ({
      id: (r["Reference"] ?? "").trim(),
      date: parseStrikeDate(r["Date & Time (UTC)"] ?? ""),
      source: "Strike",
      action: "BUY",
      btc: Math.abs(cleanMoney(r["Amount BTC"])),
      usd: Math.abs(cleanMoney(r["Amount USD"])),
      fees: Math.abs(cleanMoney(r["Fee USD"])),
    }));
}

const COINBASE_BUY_TYPES = new Set([
  "Buy",
  "Advanced Trade Buy",
  "Incentives Rewards Payout",
]);

export function normalizeCoinbase(rows: Record<string, string>[]): Transaction[] {
  return rows
    .filter(
      (r) =>
        (r["Asset"] ?? "").trim() === "BTC" &&
        COINBASE_BUY_TYPES.has((r["Transaction Type"] ?? "").trim()),
    )
    .map((r) => ({
      id: (r["ID"] ?? "").trim(),
      date: stripTzLabel(r["Timestamp"] ?? ""),
      source: "Coinbase",
      action: "BUY",
      btc: cleanMoney(r["Quantity Transacted"]),
      usd: cleanMoney(r["Total (inclusive of fees and/or spread)"]),
      fees: cleanMoney(r["Fees and/or Spread"]),
    }));
}

export function normalizeCashApp(rows: Record<string, string>[]): Transaction[] {
  return rows
    .filter(
      (r) =>
        (r["Transaction Type"] ?? "").trim() === "Bitcoin Buy" &&
        (r["Status"] ?? "").trim() === "COMPLETED" &&
        (r["Asset Type"] ?? "").trim() === "BTC",
    )
    .map((r) => ({
      id: (r["Transaction ID"] ?? "").trim(),
      date: stripTzLabel(r["Date"] ?? ""),
      source: "CashApp",
      action: "BUY",
      btc: Math.abs(cleanMoney(r["Asset Amount"])),
      usd: Math.abs(cleanMoney(r["Net Amount"])),
      fees: Math.abs(cleanMoney(r["Fee"])),
    }));
}

export function normalizeSwan(rows: Record<string, string>[]): Transaction[] {
  return rows
    .filter(
      (r) =>
        (r["Event"] ?? "").trim().toLowerCase() === "purchase" &&
        (r["Status"] ?? "").trim().toLowerCase() === "settled",
    )
    .map((r) => {
      const principal = cleanMoney(r["Total USD"]);
      const fees = cleanMoney(r["Fee USD"]);
      return {
        id: (r["Transaction ID"] ?? "").trim(),
        date: stripTzOffset(r["Date"] ?? ""),
        source: "Swan",
        action: "BUY",
        btc: cleanMoney(r["Unit Count"]),
        usd: principal + fees,
        fees,
      };
    });
}
