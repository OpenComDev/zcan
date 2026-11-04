import { StatusBoard } from "@/components/status/status-board";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/status", "status");
}

export default function StatusPage() {
  return <StatusBoard />;
}
