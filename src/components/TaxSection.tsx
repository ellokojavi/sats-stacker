"use client";

import { useMemo, useState } from "react";
import type { Lot } from "@/lib/types";
import {
  simulateSale,
  summarizeHoldings,
  type CostBasisMethod,
} from "@/lib/tax";
import { formatUsd, formatBtc, formatDateShort } from "@/lib/format";
import { Panel } from "./Panel";
import { MetricCard } from "./MetricCard";

const METHODS: CostBasisMethod[] = ["FIFO", "LIFO", "HIFO"];

const METHOD_NOTE: Record<CostBasisMethod, string> = {
  FIFO: "First in, first out — the oldest lots are sold first. The IRS default.",
  LIFO: "Last in, first out — the newest lots are sold first.",
  HIFO: "Highest in, first out — the most expensive lots are sold first, which minimizes the taxable gain.",
};

const MAX_ROWS = 10;

export function TaxSection({
  lots,
  currentPrice,
}: {
  lots: Lot[];
  currentPrice: number;
}) {
  const totalBtc = useMemo(
    () => lots.reduce((sum, l) => sum + l.btc, 0),
    [lots],
  );
  const summary = useMemo(() => summarizeHoldings(lots), [lots]);

  const [method, setMethod] = useState<CostBasisMethod>("FIFO");
  const [sellBtc, setSellBtc] = useState(
    () => Math.round(totalBtc * 0.25 * 1e8) / 1e8,
  );
  const effectiveSell = Math.min(sellBtc, totalBtc);

  const result = useMemo(
    () => simulateSale(lots, effectiveSell, currentPrice, method),
    [lots, effectiveSell, currentPrice, method],
  );
  const comparison = useMemo(
    () =>
      METHODS.map((m) => ({
        method: m,
        gain: simulateSale(lots, effectiveSell, currentPrice, m).gain,
      })),
    [lots, effectiveSell, currentPrice],
  );

  const ltPct = totalBtc > 0 ? (summary.longTermBtc / totalBtc) * 100 : 0;

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-faint">
        Informational cost-basis estimates — not tax advice. Holding periods
        assume US-style rules: lots held more than one year are long-term.
        Consult a tax professional before filing.
      </p>

      <Panel title="Holding-period breakdown">
        <div className="mb-3 flex h-6 w-full overflow-hidden rounded">
          <div style={{ width: `${ltPct}%` }} className="bg-up" />
          <div style={{ width: `${100 - ltPct}%` }} className="bg-bitcoin" />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <MetricCard
            label="Long-term BTC (>1yr)"
            value={formatBtc(summary.longTermBtc)}
          />
          <MetricCard
            label="Long-term unrealized"
            value={formatUsd(summary.longTermUnrealized)}
            accent={summary.longTermUnrealized >= 0 ? "up" : "down"}
          />
          <MetricCard
            label="Short-term BTC (≤1yr)"
            value={formatBtc(summary.shortTermBtc)}
          />
          <MetricCard
            label="Short-term unrealized"
            value={formatUsd(summary.shortTermUnrealized)}
            accent={summary.shortTermUnrealized >= 0 ? "up" : "down"}
          />
        </div>
      </Panel>

      <Panel title="Sell simulator — estimated capital gain">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-md border border-edge p-0.5"
            role="group"
            aria-label="Cost-basis method"
          >
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`rounded px-3 py-1 text-[11px] ${
                  method === m
                    ? "bg-bitcoin/20 text-bitcoin"
                    : "text-muted hover:text-ink"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted">{METHOD_NOTE[method]}</span>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-[11px] text-muted">Sell</span>
          <input
            type="range"
            min={0}
            max={totalBtc}
            step={totalBtc > 0 ? totalBtc / 200 : 0.01}
            value={effectiveSell}
            onChange={(e) => setSellBtc(Number(e.target.value))}
            className="flex-1 accent-bitcoin"
            aria-label="BTC to sell"
          />
          <span className="w-44 text-right font-mono text-[12px] text-ink">
            {effectiveSell.toFixed(4)} BTC · {formatUsd(result.proceeds)}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <MetricCard label="Proceeds" value={formatUsd(result.proceeds)} />
          <MetricCard label="Cost basis" value={formatUsd(result.costBasis)} />
          <MetricCard
            label="Capital gain"
            value={formatUsd(result.gain)}
            accent={result.gain >= 0 ? "up" : "down"}
          />
          <MetricCard
            label="Long-term gain"
            value={formatUsd(result.longTermGain)}
            accent={result.longTermGain >= 0 ? "up" : "down"}
          />
          <MetricCard
            label="Short-term gain"
            value={formatUsd(result.shortTermGain)}
            accent={result.shortTermGain >= 0 ? "up" : "down"}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-edge pt-3 text-[11px]">
          <span className="text-muted">Gain by method:</span>
          {comparison.map((c) => (
            <span
              key={c.method}
              className={c.method === method ? "text-ink" : "text-muted"}
            >
              {c.method}{" "}
              <span className="font-mono">{formatUsd(c.gain)}</span>
            </span>
          ))}
        </div>
      </Panel>

      <Panel
        title={`Lots consumed by this sale — ${method} · ${result.matches.length}`}
      >
        {result.matches.length === 0 ? (
          <p className="text-[12px] text-muted">
            Move the slider above to simulate a sale.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-muted">
                  <th className="py-1.5 text-left font-normal">Acquired</th>
                  <th className="py-1.5 text-left font-normal">Source</th>
                  <th className="py-1.5 text-right font-normal">BTC sold</th>
                  <th className="py-1.5 text-right font-normal">Cost basis</th>
                  <th className="py-1.5 text-right font-normal">Gain</th>
                  <th className="py-1.5 text-right font-normal">Term</th>
                </tr>
              </thead>
              <tbody>
                {result.matches.slice(0, MAX_ROWS).map((m, i) => (
                  <tr
                    key={m.lotId || i}
                    className="border-t border-edge text-ink"
                  >
                    <td className="py-1.5 text-left font-mono">
                      {formatDateShort(m.lotDate)}
                    </td>
                    <td className="py-1.5 text-left">{m.source}</td>
                    <td className="py-1.5 text-right font-mono">
                      {m.btc.toFixed(8)}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {formatUsd(m.costBasis)}
                    </td>
                    <td
                      className={`py-1.5 text-right font-mono ${m.gain >= 0 ? "text-up" : "text-down"}`}
                    >
                      {formatUsd(m.gain)}
                    </td>
                    <td className="py-1.5 text-right">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] ${
                          m.longTerm
                            ? "bg-up/15 text-up"
                            : "bg-bitcoin/15 text-bitcoin"
                        }`}
                      >
                        {m.longTerm ? "long" : "short"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.matches.length > MAX_ROWS && (
              <p className="mt-2 text-[11px] text-faint">
                + {result.matches.length - MAX_ROWS} more lots consumed by this
                sale.
              </p>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
