"use client";

import type { CycleRow } from "@/lib/types";
import { formatUsd, formatPct, formatValue, formatBtcValue } from "@/lib/format";
import { useUnit } from "@/lib/unit";
import { Panel } from "./Panel";

/**
 * Bitcoin-native sibling of `YearlyTable`. Calendar years are a generic
 * Wall Street primitive; halving epochs are the cycle-defining events of
 * the network itself, and "what cycle did you buy in" is a more
 * meaningful question for a BTC-literate reviewer than "what year."
 */
export function HalvingCohorts({ rows }: { rows: CycleRow[] }) {
  const { unit, price } = useUnit();
  return (
    <Panel
      title="Halving-cycle cohorts"
      legend={
        <span
          className="text-[11px] text-faint"
          title="Buys grouped by Bitcoin halving epoch — the cycle-defining events of the network. Endpoints come from on-chain halving block timestamps. Epochs with no buys are omitted."
        >
          buys grouped by halving epoch
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-muted">
              <th className="py-1.5 text-left font-normal">Epoch</th>
              <th className="py-1.5 text-right font-normal">
                {unit === "sats" ? "sats" : "BTC"}
              </th>
              <th
                className="py-1.5 text-right font-normal"
                title="Average $/BTC paid in this epoch — always a USD price."
              >
                Avg buy
              </th>
              <th className="py-1.5 text-right font-normal">Invested</th>
              <th className="py-1.5 text-right font-normal">Value</th>
              <th className="py-1.5 text-right font-normal">P/L</th>
              <th className="py-1.5 text-right font-normal">ROI</th>
              <th
                className="py-1.5 text-right font-normal"
                title="Annualized return on capital invested in this epoch — CAGR derived from the dollar-weighted average days each buy has been held."
              >
                Annual ROI
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isTotal = r.label === "Total";
              return (
                <tr
                  key={r.label}
                  className={
                    isTotal
                      ? "border-t border-edge font-medium text-ink"
                      : "text-ink"
                  }
                >
                  <td className="py-1.5 text-left">{r.label}</td>
                  <td className="py-1.5 text-right font-mono">
                    {unit === "sats"
                      ? formatBtcValue(r.btc, "sats")
                      : r.btc.toFixed(4)}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {formatUsd(r.avgBuyPrice)}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {formatValue(r.usd, unit, price)}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {formatValue(r.currentValue, unit, price)}
                  </td>
                  <td
                    className={`py-1.5 text-right font-mono ${r.profit >= 0 ? "text-up" : "text-down"}`}
                  >
                    {formatValue(r.profit, unit, price)}
                  </td>
                  <td
                    className={`py-1.5 text-right font-mono ${r.roi >= 0 ? "text-up" : "text-down"}`}
                  >
                    {formatPct(r.roi)}
                  </td>
                  <td
                    className={`py-1.5 text-right font-mono ${
                      r.annualizedRoi == null
                        ? "text-faint"
                        : r.annualizedRoi >= 0
                          ? "text-up"
                          : "text-down"
                    }`}
                  >
                    {r.annualizedRoi == null ? "—" : formatPct(r.annualizedRoi)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
