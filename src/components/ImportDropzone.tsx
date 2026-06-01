"use client";

import { useRef, useState } from "react";
import type { NamedFile } from "@/lib/etl/pipeline";

/**
 * Reusable drop zone that reads dropped CSV files into memory and hands the
 * raw NamedFile[] off to the parent. The parent decides whether to *append*
 * the new files to an existing pool or *replace* what's loaded — both call
 * paths run the same ETL downstream, so the contract here is intentionally
 * minimal.
 *
 * The `mode` prop is presentational only (button copy + headline). It
 * doesn't change parsing behavior.
 */
export function ImportDropzone({
  onFiles,
  mode = "replace",
}: {
  onFiles: (files: NamedFile[]) => void;
  /**
   * "append" — there's existing imported data; new files extend the pool.
   * "replace" — fresh import (empty state or destructive replace action).
   */
  mode?: "append" | "replace";
}) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function ingest(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      const files: NamedFile[] = [];
      for (const file of Array.from(list)) {
        files.push({ name: file.name, content: await file.text() });
      }
      onFiles(files);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const headline =
    mode === "append"
      ? "Drop another exchange CSV to add it to your pool"
      : "Drop your exchange CSV exports here";

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void ingest(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center ${
          dragging ? "border-bitcoin bg-bitcoin/5" : "border-edge"
        }`}
      >
        <p className="text-[13px] text-ink">{headline}</p>
        <p className="mt-1 text-[11px] text-muted">
          Strike, Coinbase, Cash App, Swan — drop several at once
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="mt-3 rounded border border-edge px-3 py-1 text-[11px] text-ink hover:bg-edge disabled:opacity-50"
        >
          {busy ? "Reading…" : "Choose files"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          className="hidden"
          onChange={(e) => void ingest(e.target.files)}
        />
      </div>
    </div>
  );
}
