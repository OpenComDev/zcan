import { Suspense } from "react";
import { OrderSkeleton, OrderView } from "./order-view";
import { privatePageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return privatePageMeta(params, "order");
}

export default function OrderPage() {
  return (
    <Suspense fallback={<OrderSkeleton />}>
      <OrderView />
    </Suspense>
  );
}
