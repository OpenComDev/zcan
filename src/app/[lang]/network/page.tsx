import Link from "@/components/locale-link";
import { NetworkDashboard } from "@/components/network/network-dashboard";
import { T } from "@/lib/i18n";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/network", "network");
}

export default function NetworkPage() {
  return (
    <div className="grid gap-3">
      <h1 className="sr-only">
        <T k="network.h1" />
      </h1>
      <NetworkDashboard />
      <p className="micro px-1 normal-case leading-relaxed tracking-normal">
        <T k="network.footnote" />{" "}
        <Link href="/learn/transparent-vs-shielded" className="text-accent underline-offset-2 hover:underline">
          <T k="network.footnoteLink" />
        </Link>
        <T k="network.footnoteEnd" />
      </p>
    </div>
  );
}
