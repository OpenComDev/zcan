import Link from "@/components/locale-link";
import { ArrowLeft } from "lucide-react";
import { T } from "@/lib/i18n";
import { Panel } from "@/components/hud/panel";
import { DocumentCleaner } from "@/components/tools/document-cleaner";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/tools/documents", "documents");
}

/** Format tag + what it leaks (`tools2.doc.leak.<id>`). "all" has a translated tag. */
const LEAKS = ["pdf", "xmp", "docx", "xlsx", "pptx", "all"] as const;

export default function DocumentsPage() {
  return (
    <div className="grid gap-3">
      <header className="grid gap-2">
        <Link
          href="/tools"
          className="inline-flex h-8 w-fit items-center gap-1.5 text-[12px] uppercase tracking-wider text-muted transition-colors hover:text-fg"
        >
          <ArrowLeft size={14} aria-hidden /> <T k="shell.nav.tools" />
        </Link>
        <h1 className="display text-[26px] text-fg sm:text-[32px]">
          <T k="tools2.doc.title" />
        </h1>
      </header>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <DocumentCleaner />
        <Panel title={<T k="tools2.doc.leaks.title" />} meta={<T k="tools2.doc.leaks.meta" />} marks className="self-start">
          <p className="text-[13px] leading-relaxed text-muted">
            <T k="tools2.doc.leaks.intro" />
          </p>
          <ul className="mt-4 divide-y divide-line border border-line">
            {LEAKS.map((id) => (
              <li key={id} className="flex items-center gap-3 px-3 py-2.5 text-[12px] uppercase">
                <span className="tag min-w-12 shrink-0 justify-center text-accent">{id === "all" ? <T k="tools2.doc.leakTagAll" /> : id.toUpperCase()}</span>
                <span className="min-w-0 text-text">
                  <T k={`tools2.doc.leak.${id}`} />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] leading-relaxed text-subtle">
            <T k="tools2.doc.leaks.tip" />
          </p>
        </Panel>
      </div>
    </div>
  );
}
