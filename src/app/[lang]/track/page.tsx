import { Panel } from "@/components/hud/panel";
import { Viewport } from "@/components/hud/viewport";
import { T } from "@/lib/i18n";
import { TrackForm } from "./track-form";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/track", "track");
}

export default function TrackPage() {
  return (
    <div className="grid gap-3 xl:grid-cols-[460px_minmax(0,1fr)]">
      <Panel title={<T k="order.track.title" />} marks bodyClassName="p-5">
        <h1 className="text-[13px] leading-relaxed text-muted">
          <T k="order.track.intro" />
        </h1>
        <div className="mt-5">
          <TrackForm />
        </div>
      </Panel>
      <Viewport className="h-[360px] xl:h-[520px]">
        <p className="absolute left-4 top-4 text-[12px] uppercase text-subtle">
          <T k="order.track.scanning" />
        </p>
      </Viewport>
    </div>
  );
}
