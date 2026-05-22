export function formatUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
}

export function formatUsdShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
  if (abs >= 1000) return "$" + Math.round(n / 1000) + "K";
  return "$" + Math.round(n);
}

export function formatPct(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}

export function formatBtc(n: number): string {
  return n.toFixed(4) + " BTC";
}

export function formatDate(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
