import type { YearRow } from "@/lib/types";
import { formatUsd, formatPct } from "@/lib/format";
import { Panel } from "./Panel";

export function YearlyTable({ rows }: { rows: YearRow[] }) {
  return (
    <Panel title="Yearly performance">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-muted">
              <th className="py-1.5 text-left font-normal">Year</th>
              <th className="py-1.5 text-right font-normal">BTC</th>
              <th className="py-1.5 text-right font-normal">Avg buy</th>
              <th className="py-1.5 text-right font-normal">Invested</th>
              <th className="py-1.5 text-right font-normal">Value</th>
              <th className="py-1.5 text-right font-normal">P/L</th>
              <th className="py-1.5 text-right font-normal">ROI</th>
              <th
                className="py-1.5 text-right font-normal"
                title="Annualized return on capital invested in this year — CAGR derived from the dollar-weighted average days each buy has been held."
              >
                Annual ROI
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isTotal = r.year === "Total";
              return (
                <tr
                  key={r.year}
                  className={
                    isTotal
                      ? "border-t border-edge font-medium text-ink"
                      : "text-ink"
                  }
                >
                  <td className="py-1.5 text-left">{r.year}</td>
                  <td className="py-1.5 text-right font-mono">
                    {r.btc.toFixed(4)}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {formatUsd(r.avgBuyPrice)}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {formatUsd(r.usd)}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {formatUsd(r.currentValue)}
                  </td>
                  <td
                    className={`py-1.5 text-right font-mono ${r.profit >= 0 ? "text-up" : "text-down"}`}
                  >
                    {formatUsd(r.profit)}
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
