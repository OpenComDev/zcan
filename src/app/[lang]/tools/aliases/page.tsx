import Link from "@/components/locale-link";
import { ArrowLeft } from "lucide-react";
import { T } from "@/lib/i18n";
import { AliasGuide } from "@/components/tools/alias-guide";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/tools/aliases", "aliases");
}

export default function AliasesPage() {
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
          <T k="tools2.alias.title" />
        </h1>
        <p className="max-w-2xl text-[13px] leading-relaxed text-muted">
          <T k="tools2.alias.intro" />
        </p>
      </header>
      <AliasGuide />
    </div>
  );
}
