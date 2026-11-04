import { Panel } from "@/components/hud/panel";
import { Markets } from "@/components/markets";
import { T } from "@/lib/i18n";
import { AlertsPanel } from "./alerts-panel";
import { MarketChartPanel } from "./market-chart";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/markets", "markets");
}

export default function MarketsPage() {
  return (
    <div className="grid gap-3">
      <h1 className="sr-only">
        <T k="markets.h1" />
      </h1>
      <MarketChartPanel />
      <AlertsPanel />
      <Panel title={<T k="markets.pairs" />} meta={<span>NEAR Intents · <T k="markets.liveLower" /></span>} bodyClassName="p-0">
        <Markets />
      </Panel>
    </div>
  );
}
