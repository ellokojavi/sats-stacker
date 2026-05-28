import type { EtlStats } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { Panel } from "./Panel";

/**
 * Reassurance view shown after a CSV import (and in Settings while data is
 * loaded). Instead of a one-liner like "X transactions imported", it surfaces
 * the *provenance* of the data: which exchange each file mapped to, how many
 * transactions came from it, and the date window those transactions cover.
 */

function timeframe(first: string | null, last: string | null): string {
  if (!first || !last) return "—";
  if (first.slice(0, 10) === last.slice(0, 10)) return formatDate(first);
  return `${formatDate(first)} – ${formatDate(last)}`;
}

function daysBetween(first: string, last: string): number {
  const a = new Date(first.slice(0, 10) + "T00:00:00Z").getTime();
  const b = new Date(last.slice(0, 10) + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function ImportSummary({
  stats,
  title = "Import summary",
  intro,
  onRemoveFile,
  onClearUnrecognized,
}: {
  stats: EtlStats;
  title?: string;
  /** Optional one-line context shown above the headline stats. */
  intro?: string;
  /**
   * When provided, the "By file" table shows an X button on unrecognized
   * rows. The handler is called with the row's index in `stats.files`.
   */
  onRemoveFile?: (index: number) => void;
  /**
   * When provided alongside `onRemoveFile`, shows a "Clear unrecognized"
   * button at the top of the "By file" section. Only enabled when at least
   * one unrecognized row exists.
   */
  onClearUnrecognized?: () => void;
}) {
  const hasUnrecognized = stats.files.some((f) => !f.recognized);
  const range = timeframe(stats.firstDate, stats.lastDate);
  const spanDays =
    stats.firstDate && stats.lastDate
      ? daysBetween(stats.firstDate, stats.lastDate)
      : 0;
  const spanLabel =
    spanDays >= 365
      ? `${(spanDays / 365).toFixed(1)} years`
      : spanDays > 0
        ? `${spanDays} days`
        : "—";

  return (
    <Panel title={title}>
      {intro && <p className="mb-3 text-[12px] text-muted">{intro}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Transactions" value={stats.total.toLocaleString()} />
        <Stat
          label="Sources"
          value={`${stats.byExchange.length} exchange${stats.byExchange.length === 1 ? "" : "s"}`}
        />
        <Stat
          label="Files"
          value={
            stats.filesSkipped > 0
              ? `${stats.filesIngested} (+${stats.filesSkipped} skipped)`
              : `${stats.filesIngested}`
          }
        />
        <Stat label="Date span" value={spanLabel} />
      </div>

      <p className="mt-3 text-[11px] text-faint">
        Earliest <span className="text-muted">{stats.firstDate ? formatDate(stats.firstDate) : "—"}</span>
        {"  →  "}
        Latest <span className="text-muted">{stats.lastDate ? formatDate(stats.lastDate) : "—"}</span>
        {stats.duplicatesRemoved > 0 && (
          <>
            {" · "}
            {stats.duplicatesRemoved} duplicate{stats.duplicatesRemoved === 1 ? "" : "s"} removed
          </>
        )}
      </p>

      {stats.byExchange.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-[11px] uppercase tracking-wider text-muted">
            By exchange
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-muted">
                  <th className="py-1.5 text-left font-normal">Exchange</th>
                  <th className="py-1.5 text-right font-normal">Files</th>
                  <th className="py-1.5 text-right font-normal">Transactions</th>
                  <th className="py-1.5 text-right font-normal">Timeframe</th>
                </tr>
              </thead>
              <tbody>
                {stats.byExchange.map((row) => (
                  <tr key={row.exchange} className="text-ink">
                    <td className="py-1.5 text-left">{row.exchange}</td>
                    <td className="py-1.5 text-right font-mono">{row.files}</td>
                    <td className="py-1.5 text-right font-mono">
                      {row.transactions.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right font-mono text-muted">
                      {timeframe(row.firstDate, row.lastDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {stats.files.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] uppercase tracking-wider text-muted">
              By file
            </h3>
            {onRemoveFile && onClearUnrecognized && hasUnrecognized && (
              <button
                type="button"
                onClick={onClearUnrecognized}
                className="rounded border border-edge px-2 py-0.5 text-[11px] text-muted hover:border-down/60 hover:text-down"
              >
                Clear unrecognized
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-muted">
                  <th className="py-1.5 text-left font-normal">File</th>
                  <th className="py-1.5 text-left font-normal">Detected as</th>
                  <th className="py-1.5 text-right font-normal">Transactions</th>
                  <th className="py-1.5 text-right font-normal">Timeframe</th>
                  {onRemoveFile && (
                    <th className="py-1.5 text-right font-normal w-8" aria-label="actions" />
                  )}
                </tr>
              </thead>
              <tbody>
                {stats.files.map((file, idx) => (
                  <tr
                    key={`${file.fileName}-${idx}`}
                    className={file.recognized ? "text-ink" : "text-faint"}
                  >
                    <td
                      className="py-1.5 text-left font-mono"
                      title={file.fileName}
                    >
                      <span className="block max-w-[260px] truncate align-middle">
                        {file.fileName}
                      </span>
                    </td>
                    <td className="py-1.5 text-left">
                      {file.recognized ? (
                        <span className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-ink">
                          {file.exchange}
                        </span>
                      ) : (
                        <span className="rounded border border-down/40 px-1.5 py-0.5 text-[11px] text-down">
                          Unrecognized
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {file.recognized ? file.transactions.toLocaleString() : "—"}
                    </td>
                    <td className="py-1.5 text-right font-mono text-muted">
                      {file.recognized
                        ? timeframe(file.firstDate, file.lastDate)
                        : "—"}
                    </td>
                    {onRemoveFile && (
                      <td className="py-1.5 text-right">
                        {!file.recognized ? (
                          <button
                            type="button"
                            onClick={() => onRemoveFile(idx)}
                            title={`Remove ${file.fileName} from the import list`}
                            aria-label={`Remove ${file.fileName}`}
                            className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-muted hover:border-down/60 hover:text-down"
                          >
                            ✕
                          </button>
                        ) : null}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-edge bg-night/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[14px] text-ink">{value}</div>
    </div>
  );
}
