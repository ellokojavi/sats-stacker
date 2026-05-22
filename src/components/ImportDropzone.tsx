"use client";

import { useRef, useState } from "react";
import { normalizeFiles, type NamedFile } from "@/lib/etl/pipeline";
import type { EtlResult } from "@/lib/types";

/**
 * Reusable drop zone that parses exchange CSVs entirely in the browser.
 * Used both in the real-mode empty state and the mode bar's replace control.
 */
export function ImportDropzone({
  onImport,
}: {
  onImport: (result: EtlResult) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function ingest(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const files: NamedFile[] = [];
      for (const file of Array.from(list)) {
        files.push({ name: file.name, content: await file.text() });
      }
      const result = normalizeFiles(files, "imported");
      if (result.stats.total === 0) {
        setMessage(
          "None of those files were recognized as Strike, Coinbase, Cash App, or Swan exports.",
        );
      } else {
        onImport(result);
      }
    } catch {
      setMessage("Something went wrong reading those files.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

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
        <p className="text-[13px] text-ink">
          Drop your exchange CSV exports here
        </p>
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
      {message && <p className="mt-2 text-[11px] text-down">{message}</p>}
    </div>
  );
}
