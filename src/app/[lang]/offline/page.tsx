import { WifiOff } from "lucide-react";
import { Panel } from "@/components/hud/panel";
import { T } from "@/lib/i18n";
import { RetryButton } from "./retry-button";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/offline", "offline", { index: false });
}

export default function OfflinePage() {
  return (
    <div className="grid gap-3">
      <Panel title={<T k="misc.offline.connection" />} meta={<span><T k="status.offline" /></span>} marks bodyClassName="p-6 sm:p-10">
        <div className="mx-auto max-w-xl text-center">
          <WifiOff className="mx-auto text-accent" size={28} aria-hidden />
          <h1 className="mt-4 text-[18px] font-medium uppercase tracking-wider text-fg text-balance">
            <T k="misc.offline.title" />
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-muted text-pretty">
            <T k="misc.offline.body" />
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <RetryButton />
            {/* A plain link on purpose: a full page load lets the service worker serve its cached copy offline. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/tools"
              className="inline-flex h-10 items-center border border-line px-5 text-[12px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              <T k="misc.offline.tools" />
            </a>
          </div>
        </div>
      </Panel>
    </div>
  );
}
