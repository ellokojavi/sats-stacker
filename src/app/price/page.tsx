import type { Metadata } from "next";
import { LivePrice } from "@/components/LivePrice";

export const metadata: Metadata = {
  title: "Live BTC price — sats-stacker",
  description: "The live Bitcoin price, via CoinGecko.",
};

export default function PricePage() {
  return <LivePrice />;
}
