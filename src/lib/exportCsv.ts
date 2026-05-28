import type { Transaction } from "./types";

/**
 * CSV export of the normalized ledger — the "master report" — for users who
 * want to pull the unified ETL output into their own bookkeeping. Schema
 * mirrors the in-app Transaction shape so it round-trips cleanly.
 */

const HEADER = [
  "id",
  "date",
  "exchange",
  "action",
  "btc",
  "usd",
  "fees",
] as const;

/** RFC-4180-style escape: wrap any field that contains comma, quote, or newline. */
function escapeField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/** Build a CSV string from a normalized ledger. */
export function buildLedgerCsv(transactions: Transaction[]): string {
  const lines: string[] = [HEADER.join(",")];
  for (const txn of transactions) {
    const row = [
      txn.id,
      txn.date,
      txn.source,
      txn.action,
      // Use full precision for BTC; round USD/fees to 2 decimals to match how
      // the dashboard renders them.
      Number.isFinite(txn.btc) ? txn.btc.toFixed(8).replace(/\.?0+$/, "") : "",
      Number.isFinite(txn.usd) ? txn.usd.toFixed(2) : "",
      Number.isFinite(txn.fees) ? txn.fees.toFixed(2) : "",
    ].map((cell) => escapeField(String(cell ?? "")));
    lines.push(row.join(","));
  }
  // Trailing newline so editors don't flag the file as missing one.
  return lines.join("\n") + "\n";
}

/** Trigger a browser download for the given text payload. */
export function downloadTextFile(
  filename: string,
  contents: string,
  mimeType = "text/csv;charset=utf-8",
): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  // Some browsers require the anchor to be in the DOM before click().
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke after a tick — Safari needs the URL alive while the download starts.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Filename helper: `sats-stacker_ledger_<source>_<YYYY-MM-DD>.csv`. */
export function ledgerFilename(source: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `sats-stacker_ledger_${source}_${today}.csv`;
}
