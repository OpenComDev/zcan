import Link from "@/components/locale-link";
import { T } from "@/lib/i18n";

/** Shown for unknown addresses in every language (see [...rest]/page.tsx). */
export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 px-4 py-16 sm:py-24">
      <p className="eyebrow">404</p>
      <h1 className="text-2xl font-semibold text-balance text-fg">
        <T k="misc.notFound.title" />
      </h1>
      <p className="text-[14px] text-muted">
        <T k="misc.notFound.body" />
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link href="/" className="btn-accent inline-flex h-10 items-center px-4 text-[12px]">
          <T k="misc.notFound.home" />
        </Link>
        <Link
          href="/tools"
          className="inline-flex h-10 items-center border border-line px-4 text-[12px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          <T k="misc.notFound.tools" />
        </Link>
      </div>
    </div>
  );
}
