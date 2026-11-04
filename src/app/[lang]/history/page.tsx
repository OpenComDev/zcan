import { Suspense } from "react";
import { T } from "@/lib/i18n";
import { HistoryView } from "./history-view";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/history", "history", { index: false });
}

export default function HistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="panel h-[480px] animate-pulse" aria-busy="true">
          <span className="sr-only">
            <T k="history.loading" />
          </span>
        </div>
      }
    >
      <HistoryView />
    </Suspense>
  );
}
