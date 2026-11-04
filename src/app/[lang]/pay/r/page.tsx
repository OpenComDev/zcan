import { Suspense } from "react";
import { PayerView } from "@/components/pay/payer-view";
import { T } from "@/lib/i18n";
import { privatePageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return privatePageMeta(params, "payR");
}

export default function PayRequestPage() {
  return (
    <Suspense
      fallback={
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]" aria-busy="true">
          <span className="sr-only">
            <T k="pay.loading" />
          </span>
          <div className="panel h-[420px] animate-pulse" />
          <div className="panel h-[420px] animate-pulse" />
        </div>
      }
    >
      <PayerView />
    </Suspense>
  );
}
