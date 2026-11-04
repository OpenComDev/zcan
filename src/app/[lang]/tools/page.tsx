import { ArrowUpRight, AtSign, ClipboardCheck, FileText, Fingerprint, KeyRound, ScanSearch, type LucideIcon } from "lucide-react";
import Link from "@/components/locale-link";
import { Panel } from "@/components/hud/panel";
import { LinkCleaner } from "@/components/link-cleaner";
import { PhotoCleaner } from "@/components/photo-cleaner";
import { T } from "@/lib/i18n";
import { AgentPromo } from "@/components/agents/agent-promo";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/tools", "tools");
}

// [format tag, i18n id]
const LEAKS = [
  ["GPS", "location"],
  ["EXIF", "taken"],
  ["EXIF", "camera"],
  ["XMP", "editing"],
  ["IPTC", "author"],
];

// `id` keys both the tool name (shell.tool.<id>) and its blurb (tools.more.<id>).
const MORE: { id: string; href: string; icon: LucideIcon; local: boolean }[] = [
  { id: "clipboard", href: "/tools/clipboard", icon: ClipboardCheck, local: true },
  { id: "address", href: "/tools/address", icon: ScanSearch, local: true },
  { id: "passwords", href: "/tools/passwords", icon: KeyRound, local: false },
  { id: "documents", href: "/tools/documents", icon: FileText, local: true },
  { id: "fingerprint", href: "/tools/fingerprint", icon: Fingerprint, local: true },
  { id: "aliases", href: "/tools/aliases", icon: AtSign, local: false },
];

export default function ToolsPage() {
  return (
    <div className="grid gap-3">
      <h1 className="sr-only">
        <T k="tools.hub.title" />
      </h1>
      <div id="link-cleaner" className="scroll-mt-20">
        <LinkCleaner />
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div id="photo-cleaner" className="min-w-0 scroll-mt-20">
          <PhotoCleaner />
        </div>
        <Panel
          title={<T k="tools.hub.leaks.title" />}
          meta={
            <span>
              <T k="tools.hub.leaks.meta" />
            </span>
          }
          marks
        >
          <p className="text-[13px] leading-relaxed text-muted">
            <T k="tools.hub.leaks.body" />
          </p>
          <ul className="mt-4 divide-y divide-line border border-line">
            {LEAKS.map(([tag, id]) => (
              <li key={id} className="flex items-center gap-3 px-3 py-2.5 text-[12px] uppercase">
                <span className="tag shrink-0 text-accent">{tag}</span>
                <span className="min-w-0 text-text">
                  <T k={`tools.hub.leak.${id}`} />
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <AgentPromo />

      <Panel
        id="more-tools"
        title={<T k="tools.hub.more.title" />}
        meta={
          <span>
            <T k="tools.hub.more.count" vars={{ n: MORE.length }} />
          </span>
        } bodyClassName="p-0" className="scroll-mt-20">
        <ul className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
          {MORE.map(({ id, href, icon: Icon, local }) => (
            <li key={href} className="min-w-0 bg-surface">
              <Link
                href={href}
                className="group flex h-full min-h-28 items-start gap-3 p-4 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 sm:p-5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center border border-line text-accent transition-colors group-hover:border-accent/50">
                  <Icon size={16} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 break-words text-[13px] font-medium uppercase tracking-wider text-fg">
                      <T k={`shell.tool.${id}`} />
                    </span>
                    {local && (
                      <span className="tag text-green">
                        <T k="common.onDevice" />
                      </span>
                    )}
                  </span>
                  <span className="mt-1.5 block text-[13px] leading-relaxed text-muted">
                    <T k={`tools.more.${id}`} />
                  </span>
                </span>
                <ArrowUpRight size={15} className="shrink-0 text-subtle transition-colors group-hover:text-fg" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
