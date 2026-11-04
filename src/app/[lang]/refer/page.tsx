import { Gift, ShieldCheck } from "lucide-react";
import { Panel } from "@/components/hud/panel";
import { RefMaker } from "@/components/refer/ref-maker";
import { isLocale, type Locale } from "@/lib/locales";
import { pageMeta } from "@/lib/page-meta";
import { REF_DAYS, referralTerms } from "@/lib/referral";
import { translate } from "@/lib/translate";

type Props = { params: Promise<{ lang: string }> };

export function generateMetadata({ params }: Props) {
  return pageMeta(params, "/refer", "refer");
}

/** Read at build time: the same env vars the quote route uses (src/app/api/quote/route.ts). */
const FEE_BPS = Number(process.env.ZCAN_FEE_BPS ?? 0);
const ACTIVE = Boolean(process.env.ZCAN_FEE_RECIPIENT) && Number.isFinite(FEE_BPS) && FEE_BPS > 0;
const TERMS = referralTerms(process.env.ZCAN_REFERRAL_DISCOUNT, process.env.ZCAN_REFERRAL_SHARE);

export default async function ReferPage({ params }: Props) {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : "en";
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 });
  const vars = { days: REF_DAYS, discount: pct.format(TERMS.discount), share: pct.format(TERMS.share) };
  const t = (k: string, v: Record<string, string | number> = vars) => translate(locale, `refer.${k}`, v);
  const earn = Math.floor(FEE_BPS * TERMS.share) / 10_000;

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title={t("eyebrow")} marks bodyClassName="p-5 sm:p-7">
        <Gift size={26} className="text-accent" aria-hidden />
        <h1 className="display mt-4 text-[28px] text-fg sm:text-[38px]" style={{ textWrap: "balance" }}>
          {t("h1")}
        </h1>
        <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-muted">{t("lead")}</p>
        {ACTIVE ? (
          <>
            <p className="tag mt-5 inline-flex text-accent">{t("terms")}</p>
            <p className="micro mt-3 normal-case tracking-normal">
              {t("fine", { fee: pct.format(FEE_BPS / 10_000), earn: pct.format(earn) })}
            </p>
          </>
        ) : (
          <div className="mt-5 border border-warn/40 bg-warn/[0.06] p-4">
            <p className="text-[13px] font-medium text-fg">{t("off.title")}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{t("off.body")}</p>
          </div>
        )}
        <ol className="mt-6 grid gap-3">
          {[1, 2, 3, 4].map((n) => (
            <li key={n} className="flex gap-3 text-[14px] leading-relaxed text-text">
              <span className="tabular mt-0.5 inline-flex size-6 shrink-0 items-center justify-center border border-line text-[11px] text-accent">{n}</span>
              <span className="min-w-0">{t(`how.${n}`)}</span>
            </li>
          ))}
        </ol>
      </Panel>
      <div className="grid content-start gap-3">
        <Panel title={t("make.title")} bodyClassName="p-5 sm:p-6">
          <RefMaker />
        </Panel>
        <Panel title={t("private.title")} bodyClassName="p-5 sm:p-6">
          <p className="flex gap-3 text-[13px] leading-relaxed text-muted">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-green" aria-hidden />
            <span>{t("private.body")}</span>
          </p>
        </Panel>
      </div>
    </div>
  );
}
