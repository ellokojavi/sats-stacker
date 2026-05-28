import type { ExchangeRow } from "@/lib/types";
import { formatUsd, formatPct } from "@/lib/format";
import { Panel } from "./Panel";

/**
 * Per-exchange breakdown table. On narrow viewports the 7-column layout
 * exceeds the available width, so the container scrolls horizontally and
 * the first column (exchange name) is sticky — the user can scroll right
 * to see ROI without losing their place.
 */
export function ExchangeBreakdown({ rows }: { rows: ExchangeRow[] }) {
  return (
    <Panel title="Per-exchange breakdown">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-muted">
              <th className="sticky left-0 z-10 bg-panel py-1.5 pr-3 text-left font-normal">
                Exchange
              </th>
              <th className="py-1.5 text-right font-normal">Buys</th>
              <th className="py-1.5 text-right font-normal">BTC</th>
              <th className="py-1.5 text-right font-normal">Invested</th>
              <th className="py-1.5 text-right font-normal">Value</th>
              <th className="py-1.5 text-right font-normal">Avg cost</th>
              <th className="py-1.5 text-right font-normal">ROI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.exchange} className="text-ink">
                <td className="sticky left-0 z-10 bg-panel py-1.5 pr-3 text-left">
                  {r.exchange}
                </td>
                <td className="py-1.5 text-right font-mono">{r.count}</td>
                <td className="py-1.5 text-right font-mono">
                  {r.btc.toFixed(4)}
                </td>
                <td className="py-1.5 text-right font-mono">
                  {formatUsd(r.invested)}
                </td>
                <td className="py-1.5 text-right font-mono">
                  {formatUsd(r.currentValue)}
                </td>
                <td className="py-1.5 text-right font-mono">
                  {formatUsd(r.avgCost)}
                </td>
                <td
                  className={`py-1.5 text-right font-mono ${r.roi >= 0 ? "text-up" : "text-down"}`}
                >
                  {formatPct(r.roi)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
