import type { ReactNode } from "react";

export function Panel({
  title,
  legend,
  children,
}: {
  title: string;
  legend?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-edge bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <h2 className="text-[13px] font-medium text-ink">{title}</h2>
        {legend}
      </div>
      {children}
    </section>
  );
}
