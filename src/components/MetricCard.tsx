type Accent = "up" | "down" | "neutral";

export function MetricCard({
  label,
  value,
  accent = "neutral",
}: {
  label: string;
  value: string;
  accent?: Accent;
}) {
  const valueColor =
    accent === "up"
      ? "text-up"
      : accent === "down"
        ? "text-down"
        : "text-ink";

  return (
    <div className="rounded-lg bg-panel px-4 py-3">
      <div className="mb-1 text-xs text-muted">{label}</div>
      <div className={`font-mono text-xl font-medium ${valueColor}`}>
        {value}
      </div>
    </div>
  );
}
