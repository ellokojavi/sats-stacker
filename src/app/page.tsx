import {
  loadDemoLedger,
  loadPrivateLedger,
  loadPriceHistory,
} from "@/lib/data";
import { Dashboard } from "@/components/Dashboard";

export default function Page() {
  return (
    <Dashboard
      demoLedger={loadDemoLedger()}
      privateLedger={loadPrivateLedger()}
      priceHistory={loadPriceHistory()}
    />
  );
}
