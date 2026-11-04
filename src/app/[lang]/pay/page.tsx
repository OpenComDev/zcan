import { Panel } from "@/components/hud/panel";
import { RequestForm } from "@/components/pay/request-form";
import { T } from "@/lib/i18n";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/pay", "pay");
}

const STEPS = ["1", "2", "3"];

export default function PayPage() {
  return (
    <div className="grid gap-3">
      <Panel title={<T k="pay.pageTitle" />} meta={<span><T k="pay.pageMeta" /></span>} marks bodyClassName="p-5 sm:p-7">
        <p className="eyebrow">
          <T k="pay.eyebrow" />
        </p>
        <h1 className="display mt-4 text-[30px] text-fg sm:text-[40px]">
          <T k="pay.h1Pre" />
          <span className="text-accent">
            <T k="pay.h1Accent" />
          </span>
          <T k="pay.h1Post" />
        </h1>
        <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-muted">
          <T k="pay.intro" />
        </p>
        <ol className="mt-6 grid gap-px border border-line bg-line sm:grid-cols-3">
          {STEPS.map((n) => (
            <li key={n} className="flex gap-3 bg-surface p-3 text-[13px] leading-relaxed text-muted">
              <span className="text-accent">0{n}</span>
              <span className="min-w-0">
                <T k={`pay.step.${n}`} />
              </span>
            </li>
          ))}
        </ol>
      </Panel>
      <RequestForm />
    </div>
  );
}
