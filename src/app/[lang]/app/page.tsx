import { Globe, Shield, SlidersHorizontal } from "lucide-react";
import { Panel } from "@/components/hud/panel";
import { PhoneMockup } from "@/components/phone-mockup";
import { T } from "@/lib/i18n";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/app", "app");
}

const FEATURES = [
  { id: "browser", icon: Globe },
  { id: "vpn", icon: Shield },
  { id: "tools", icon: SlidersHorizontal },
];

export default function AppPage() {
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Panel
        title={<T k="shell.nav.app" />}
        meta={
          <span className="text-accent">
            ● <T k="shell.hint.app" />
          </span>
        } marks bodyClassName="p-5 sm:p-7">
        <p className="eyebrow">
          <T k="shell.nav.app" />
        </p>
        <h1 className="mt-4 text-[34px] font-medium uppercase leading-[1.05] tracking-tight text-fg sm:text-[46px]">
          <T k="misc.app.headline" />
        </h1>
        <ul className="mt-8 divide-y divide-line border border-line">
          {FEATURES.map(({ id, icon: Icon }) => (
            <li key={id} className="flex gap-4 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center border border-line text-accent">
                <Icon size={16} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium uppercase tracking-wide text-fg">
                  <T k={`misc.app.${id}.title`} />
                </span>
                <span className="mt-1 block text-[13px] leading-relaxed text-muted">
                  <T k={`misc.app.${id}.body`} />
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="glow-pill mt-8 inline-flex h-11 items-center gap-3 px-5 text-[13px] font-medium uppercase tracking-[0.25em]">
          <span className="size-2 rounded-full bg-black/70 pulse-dot" aria-hidden /> <T k="shell.hint.app" />
        </p>
        <p className="micro mt-4 normal-case tracking-normal">
          <T k="misc.app.webToday" />
        </p>
      </Panel>
      <div className="dots relative flex min-h-[620px] items-center justify-center gap-6 overflow-hidden border border-line p-6">
        <PhoneMockup screen="browser" className="hidden sm:block sm:-rotate-2" />
        <PhoneMockup screen="tools" className="sm:mt-16 sm:rotate-2" />
        <span className="micro absolute left-4 top-4">
          <T k="misc.app.preview" /> · iOS
        </span>
      </div>
    </div>
  );
}
