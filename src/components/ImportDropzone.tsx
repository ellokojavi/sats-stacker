"use client";

import { useEffect, useRef, useState } from "react";
import type { NamedFile } from "@/lib/etl/pipeline";

/**
 * Reusable drop zone that reads dropped CSV files into memory and hands the
 * raw NamedFile[] off to the parent. The parent decides whether to *append*
 * the new files to an existing pool or *replace* what's loaded — both call
 * paths run the same ETL downstream, so the contract here is intentionally
 * minimal.
 *
 * Two ingestion shapes are supported, so users can mirror however they keep
 * their exports on disk:
 *   • loose CSV files — drop or pick several at once;
 *   • whole folders — drop one or more folders (e.g. one per exchange, like
 *     the repo's own data/raw/ layout) and every .csv inside is walked
 *     recursively. A "Choose folder" button covers browsers/OSes where
 *     dragging a folder isn't convenient.
 *
 * Nested folders are flattened; each file's relative path (e.g.
 * "Coinbase/coinbase-transactions.csv") becomes its NamedFile name so files
 * with the same basename in different folders don't collide in the pool.
 *
 * The `mode` prop is presentational only (button copy + headline). It
 * doesn't change parsing behavior.
 */

const isCsv = (name: string) => /\.csv$/i.test(name);

/** A picked/dropped file plus the path we want to remember it under. */
interface PathedFile {
  path: string;
  file: File;
}

/** Read one FileSystemEntry into a flat list of files, recursing into dirs. */
function readEntry(
  entry: FileSystemEntry,
  prefix = "",
): Promise<PathedFile[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      (entry as FileSystemFileEntry).file(
        (file) => resolve([{ path: prefix + entry.name, file }]),
        () => resolve([]),
      );
    });
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const collected: PathedFile[] = [];
    return new Promise((resolve) => {
      // readEntries returns results in batches; keep calling until it's empty.
      const readBatch = () => {
        reader.readEntries(
          async (entries) => {
            if (entries.length === 0) {
              resolve(collected);
              return;
            }
            for (const child of entries) {
              const nested = await readEntry(
                child,
                `${prefix}${entry.name}/`,
              );
              collected.push(...nested);
            }
            readBatch();
          },
          () => resolve(collected),
        );
      };
      readBatch();
    });
  }
  return Promise.resolve([]);
}

async function toNamedFiles(pathed: PathedFile[]): Promise<NamedFile[]> {
  const csvs = pathed.filter((p) => isCsv(p.path));
  const named: NamedFile[] = [];
  for (const { path, file } of csvs) {
    named.push({ name: path, content: await file.text() });
  }
  return named;
}

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
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // A file <input> can't offer "files or a folder" in one native dialog
  // (webkitdirectory forces folder-only), so a single button opens a small
  // menu to pick which. Close it on outside-click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function emit(files: NamedFile[]) {
    if (files.length > 0) onFiles(files);
  }

  /** Loose FileList path (from the file/folder <input>s). */
  async function ingestList(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      const pathed: PathedFile[] = Array.from(list).map((file) => ({
        // webkitRelativePath is populated for folder picks; fall back to name.
        path: file.webkitRelativePath || file.name,
        file,
      }));
      emit(await toNamedFiles(pathed));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (folderInputRef.current) folderInputRef.current.value = "";
    }
  }

  /** Drop path — prefers the entry API so dropped folders are walked. */
  async function ingestDrop(dt: DataTransfer) {
    const items = Array.from(dt.items).filter(
      (item) => item.kind === "file",
    );
    const entries = items
      .map((item) => item.webkitGetAsEntry?.() ?? null)
      .filter((e): e is FileSystemEntry => e !== null);

    setBusy(true);
    try {
      if (entries.length > 0) {
        const nested = await Promise.all(entries.map((e) => readEntry(e)));
        emit(await toNamedFiles(nested.flat()));
        return;
      }
      // Older browsers with no entry API: fall back to the flat file list.
      await ingestList(dt.files);
    } finally {
      setBusy(false);
    }
  }

  const headline =
    mode === "append"
      ? "Drop more CSV files or folders to add them to your pool"
      : "Drop your exchange CSV exports — files or whole folders — here";

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
          void ingestDrop(e.dataTransfer);
        }}
        className={`flex flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center ${
          dragging ? "border-bitcoin bg-bitcoin/5" : "border-edge"
        }`}
      >
        <p className="text-[13px] text-ink">{headline}</p>
        <p className="mt-1 text-[11px] text-muted">
          Strike, Coinbase, Cash App, Swan — drop one folder per exchange, or
          several files at once
        </p>
        <div ref={menuRef} className="relative mt-3">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="rounded border border-edge px-3 py-1 text-[11px] text-ink hover:bg-edge disabled:opacity-50"
          >
            {busy ? "Reading…" : "Choose files or folder"}
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute left-1/2 z-20 mt-1 w-40 -translate-x-1/2 overflow-hidden rounded-md border border-edge bg-night text-[11px] shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  fileInputRef.current?.click();
                }}
                className="block w-full px-3 py-1.5 text-left text-ink hover:bg-edge"
              >
                Files…
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  folderInputRef.current?.click();
                }}
                className="block w-full px-3 py-1.5 text-left text-ink hover:bg-edge"
              >
                Folder…
              </button>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          className="hidden"
          onChange={(e) => void ingestList(e.target.files)}
        />
        {/* webkitdirectory turns this input into a folder picker. The prop is
            declared in src/types/webkitdirectory.d.ts. */}
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          webkitdirectory=""
          onChange={(e) => void ingestList(e.target.files)}
        />
      </div>
    </div>
  );
}
