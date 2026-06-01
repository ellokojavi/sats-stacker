import type { NamedFile } from "@/lib/etl/pipeline";
import { ImportDropzone } from "./ImportDropzone";

/**
 * Shown when the app is in Real mode but no real data has been added yet.
 * Walks the user through importing their first set of exchange CSVs.
 */
export function RealModeEmptyState({
  onFiles,
  onBackToDemo,
}: {
  onFiles: (files: NamedFile[]) => void;
  onBackToDemo: () => void;
}) {
  return (
    <section className="rounded-xl border border-edge bg-panel p-6">
      <div className="mx-auto max-w-xl">
        <div className="text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-bitcoin/15 text-[20px] font-medium text-bitcoin">
            &#8383;
          </div>
          <h2 className="mt-3 text-[18px] font-medium text-ink">
            Add your exchange data
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            You&apos;re in <span className="text-ink">Real</span> mode. Drop your
            Bitcoin transaction exports below and the dashboard rebuilds from
            your actual holdings. Files are parsed right here in your browser —
            nothing is uploaded or saved to the repo.
          </p>
        </div>

        <div className="mt-5">
          <ImportDropzone onFiles={onFiles} mode="replace" />
        </div>

        <ol className="mt-4 space-y-1.5 text-[12px] text-muted">
          <li>1. Export your transaction history as CSV from each exchange you use.</li>
          <li>2. Drop the files above — Strike, Coinbase, Cash App and Swan are recognized automatically.</li>
          <li>3. Your dashboard appears, and your data is remembered on this device.</li>
        </ol>

        <p className="mt-4 text-[11px] text-faint">
          Prefer the filesystem? Drop CSVs into{" "}
          <code className="text-muted">data/private/</code> and restart the app.
          Or{" "}
          <button
            type="button"
            onClick={onBackToDemo}
            className="text-bitcoin hover:underline"
          >
            go back to demo data
          </button>
          .
        </p>
      </div>
    </section>
  );
}
