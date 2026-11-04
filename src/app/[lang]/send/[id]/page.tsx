import { Suspense } from "react";
import { T } from "@/lib/i18n";
import { BatchView } from "./batch-view";
import { privatePageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return privatePageMeta(params, "sendBatch");
}

export default function BatchPage() {
  return (
    <Suspense
      fallback={
        <div className="panel h-[480px] animate-pulse" aria-busy="true">
          <span className="sr-only">
            <T k="send.loadingBatch" />
          </span>
        </div>
      }
    >
      <BatchView />
    </Suspense>
  );
}
