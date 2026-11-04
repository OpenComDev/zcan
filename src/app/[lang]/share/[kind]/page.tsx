import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, Fingerprint, ImageOff } from "lucide-react";
import Link from "@/components/locale-link";
import { Panel } from "@/components/hud/panel";
import { isLocale, type Locale } from "@/lib/locales";
import { SHARE_KINDS, isUnique, parseShare, shareQuery, type ShareResult } from "@/lib/share-results";
import { translate } from "@/lib/translate";

type Props = { params: Promise<{ lang: string; kind: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const TOOL = { fingerprint: "/tools/fingerprint", photo: "/tools#photo-cleaner" } as const;
const GUIDE = { fingerprint: "/guides/browser-fingerprint-test", photo: "/guides/remove-location-from-photos" } as const;

export function generateStaticParams() {
  return SHARE_KINDS.map((kind) => ({ kind }));
}

async function read(props: Props): Promise<{ locale: Locale; r: ShareResult | null }> {
  const [{ lang, kind }, sp] = await Promise.all([props.params, props.searchParams]);
  const q = { get: (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null) };
  return { locale: isLocale(lang) ? lang : "en", r: parseShare(kind, q) };
}

function title(r: ShareResult, locale: Locale) {
  const n = new Intl.NumberFormat(locale).format(r.n);
  if (r.kind === "fingerprint") return isUnique(r) ? translate(locale, "share.fp.titleUnique") : translate(locale, "share.fp.title", { n });
  return translate(locale, `share.photo.title.${r.n === 1 ? "one" : "other"}`, { n });
}

/** Share pages are for link previews, not search: never indexed. */
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale, r } = await read(props);
  if (!r) return { robots: { index: false } };
  const t = title(r, locale);
  const description = translate(locale, r.kind === "fingerprint" ? "share.fp.body" : "share.photo.body");
  const image = `/api/og/share?kind=${r.kind}&${shareQuery(r)}`;
  return {
    title: t,
    description,
    robots: { index: false, follow: true },
    alternates: {},
    openGraph: { title: t, description, images: [{ url: image, width: 1200, height: 630, alt: t }] },
    twitter: { card: "summary_large_image", title: t, description, images: [image] },
  };
}

export default function SharePage(props: Props) {
  return (
    <Suspense fallback={<div className="panel h-[360px] animate-pulse" aria-busy="true" />}>
      <ShareContent {...props} />
    </Suspense>
  );
}

async function ShareContent(props: Props) {
  const { locale, r } = await read(props);
  if (!r) notFound();
  const t = (k: string) => translate(locale, `share.${k}`);
  const Icon = r.kind === "fingerprint" ? Fingerprint : ImageOff;
  const key = r.kind === "fingerprint" ? "fp" : "photo";
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-3">
      <Panel title={t("eyebrow")} marks bodyClassName="p-6 sm:p-10">
        <Icon size={28} className="text-accent" aria-hidden />
        <h1 className="display mt-4 text-[30px] text-fg sm:text-[44px]" style={{ textWrap: "balance" }}>
          {title(r, locale)}
        </h1>
        {r.kind === "photo" && r.gps && <p className="mt-2 text-[16px] text-accent">{t("photo.gps")}</p>}
        <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-muted">{t(`${key}.body`)}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href={TOOL[r.kind]} className="btn-accent inline-flex h-11 items-center gap-2 px-5 text-[12px]">
            {t(`${key}.cta`)} <ArrowRight size={14} aria-hidden />
          </Link>
          <Link
            href={GUIDE[r.kind]}
            className="inline-flex h-11 items-center border border-line px-4 text-[12px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            {t("guide")}
          </Link>
        </div>
        <p className="micro mt-8 normal-case tracking-normal">{t("note")}</p>
      </Panel>
    </div>
  );
}
