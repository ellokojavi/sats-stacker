"use client";

import type { ReactNode } from "react";

/**
 * Compact preset-button row shown above every zoomable chart.
 *
 * Visual language matches the existing DCA selector in ProjectionSection:
 * bitcoin-orange pill for the active preset, dark night-grey pills for the
 * others. A "Reset" link appears whenever the chart is in a custom (drag-
 * selected) zoom so the user can get back to full range without hunting.
 *
 * `extras` is an optional slot that renders to the right of the preset buttons
 * (and the Reset link) but before the drag-hint — used for chart-specific
 * toggles like the Projection chart's +5Y forecast pill.
 */

export type PresetOption = { id: string; label: string };

export function DateRangeControls({
  presets,
  activePreset,
  onPreset,
  onReset,
  showResetHint = true,
  extras,
}: {
  presets: ReadonlyArray<PresetOption>;
  /** Currently highlighted preset id, or null when the user dragged a custom range. */
  activePreset: string | null;
  /** Called when a preset button is clicked. */
  onPreset: (id: string) => void;
  /** Called when the "Reset" link is clicked. */
  onReset: () => void;
  /** Show the "Drag to zoom · double-click to reset" hint on the right. */
  showResetHint?: boolean;
  /** Chart-specific extra controls rendered inline with the preset row. */
  extras?: ReactNode;
}) {
  const isCustom = activePreset === null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <div className="flex flex-wrap items-center gap-1">
        {presets.map((p) => {
          const isActive = activePreset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPreset(p.id)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                isActive
                  ? "bg-bitcoin text-night"
                  : "bg-night text-muted hover:text-ink"
              }`}
              aria-pressed={isActive}
            >
              {p.label}
            </button>
          );
        })}
        {isCustom && (
          <button
            type="button"
            onClick={onReset}
            className="ml-1 rounded px-2 py-0.5 text-[11px] font-medium text-bitcoin hover:underline"
            title="Reset zoom"
          >
            Reset
          </button>
        )}
      </div>
      {extras && <div className="flex items-center gap-1.5">{extras}</div>}
      {showResetHint && (
        <span className="ml-auto text-[10px] text-faint">
          Drag to zoom · double-click to reset
        </span>
      )}
    </div>
  );
}
