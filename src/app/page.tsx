import {
  loadDemoLedger,
  loadPrivateLedger,
  loadPriceHistory,
} from "@/lib/data";
import { Dashboard } from "@/components/Dashboard";

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";

/**
 * Fetch the live BTC price server-side. Next.js caches this fetch for 60s
 * (ISR), so reloads within that window are instant and still use a fresh price.
 * Falls back to the last bundled price point if the request fails.
 */
async function fetchServerPrice(fallback: number): Promise<number> {
  try {
    const res = await fetch(COINGECKO_URL, { next: { revalidate: 60 } });
    if (!res.ok) return fallback;
    const data = (await res.json()) as { bitcoin?: { usd?: number } };
    const p = data?.bitcoin?.usd;
    return typeof p === "number" && p > 0 ? p : fallback;
  } catch {
    return fallback;
  }
}

export default async function Page() {
  const priceHistory = loadPriceHistory();
  const bundled = priceHistory[priceHistory.length - 1];
  const serverPrice = await fetchServerPrice(bundled.price);

  return (
    <Dashboard
      demoLedger={loadDemoLedger()}
      privateLedger={loadPrivateLedger()}
      priceHistory={priceHistory}
      serverPrice={serverPrice}
    />
  );
}
