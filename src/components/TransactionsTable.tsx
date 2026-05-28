"use client";

import { useMemo, useState } from "react";
import type { DataSource, Transaction } from "@/lib/types";
import { formatUsd, formatDateShort } from "@/lib/format";
import {
  buildLedgerCsv,
  downloadTextFile,
  ledgerFilename,
} from "@/lib/exportCsv";
import { Panel } from "./Panel";

type SortKey = "date" | "source" | "btc" | "usd" | "buyPrice";

const PAGE_SIZE = 25;

const COLUMNS: { key: SortKey; label: string; align: string }[] = [
  { key: "date", label: "Date", align: "text-left" },
  { key: "source", label: "Source", align: "text-left" },
  { key: "btc", label: "BTC", align: "text-right" },
  { key: "usd", label: "USD", align: "text-right" },
  { key: "buyPrice", label: "Buy price", align: "text-right" },
];

export function TransactionsTable({
  transactions,
  source,
}: {
  transactions: Transaction[];
  /**
   * The active ledger's source — used to name the downloaded CSV. Defaults
   * to "imported" so the component is still usable in isolation.
   */
  source?: DataSource;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [ascending, setAscending] = useState(false);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const rows = transactions.map((t) => ({
      ...t,
      buyPrice: t.btc > 0 ? t.usd / t.btc : 0,
    }));
    rows.sort((a, b) => {
      let cmp: number;
      if (sortKey === "source") cmp = a.source.localeCompare(b.source);
      else if (sortKey === "date") cmp = a.date.localeCompare(b.date);
      else cmp = (a[sortKey] as number) - (b[sortKey] as number);
      return ascending ? cmp : -cmp;
    });
    return rows;
  }, [transactions, sortKey, ascending]);

  const pageCount = Math.ceil(sorted.length / PAGE_SIZE);
  const visible = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function sortBy(key: SortKey) {
    if (key === sortKey) {
      setAscending(!ascending);
    } else {
      setSortKey(key);
      setAscending(false);
    }
    setPage(0);
  }

  function handleDownload() {
    const csv = buildLedgerCsv(transactions);
    downloadTextFile(ledgerFilename(source ?? "imported"), csv);
  }

  return (
    <Panel
      title={`Transactions (${transactions.length.toLocaleString()})`}
      legend={
        <button
          type="button"
          onClick={handleDownload}
          disabled={transactions.length === 0}
          title="Download the full normalized ledger as a CSV"
          className="ml-auto rounded border border-bitcoin/60 px-2.5 py-1 text-[11px] text-bitcoin hover:bg-bitcoin/10 disabled:opacity-50"
        >
          Export CSV
        </button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-muted">
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => sortBy(c.key)}
                  className={`${c.align} cursor-pointer select-none py-1.5 font-normal hover:text-ink`}
                >
                  {c.label}
                  {sortKey === c.key ? (ascending ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((t, i) => (
              <tr key={t.id || i} className="border-t border-edge text-ink">
                <td className="py-1.5 text-left font-mono">
                  {formatDateShort(t.date)}
                </td>
                <td className="py-1.5 text-left">{t.source}</td>
                <td className="py-1.5 text-right font-mono">
                  {t.btc.toFixed(8)}
                </td>
                <td className="py-1.5 text-right font-mono">
                  {formatUsd(t.usd)}
                </td>
                <td className="py-1.5 text-right font-mono">
                  {formatUsd(t.buyPrice)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
        <span>
          Showing {page * PAGE_SIZE + 1}–
          {Math.min((page + 1) * PAGE_SIZE, sorted.length)} of{" "}
          {sorted.length.toLocaleString()}
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage(page - 1)}
            disabled={page === 0}
            className="rounded border border-edge px-2 py-0.5 text-ink hover:bg-edge disabled:opacity-40"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setPage(page + 1)}
            disabled={page >= pageCount - 1}
            className="rounded border border-edge px-2 py-0.5 text-ink hover:bg-edge disabled:opacity-40"
          >
            Next
          </button>
        </span>
      </div>
    </Panel>
  );
}
