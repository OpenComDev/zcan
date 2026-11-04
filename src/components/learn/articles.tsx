import type { ComponentType } from "react";
import { learn } from "@/i18n/learn";
import { MemoDiagram, ShieldStepsDiagram, ShieldedDiagram, UnifiedDiagram, ViewingKeyDiagram, WalletDiagram } from "./diagrams";

/**
 * Explainer text lives in src/i18n/learn.ts under `learn.<slug>.*`:
 * `title`, `summary`, body blocks (`p1`, `ol1`… as listed in `body`) and `take1`…`takeN`.
 * Body strings may use `**bold**`, `` `code` `` and `[label](https://…)` (see `Rich`).
 */
export type LearnBlock = { p: string } | { ol: string[] };

export type LearnArticle = {
  slug: string;
  n: string;
  /** English title/summary, for metadata. The UI renders the translated keys. */
  title: string;
  summary: string;
  minutes: number;
  Diagram: ComponentType;
  /** Key suffixes under `learn.<slug>.`, ≤200 words in English. */
  body: LearnBlock[];
  /** Number of `learn.<slug>.take{i}` keys. */
  takeaways: number;
  /** `k` is a `learn.src.*` key for a translated label; without it, `label` is the source's own title and stays as-is. */
  sources: { label: string; href: string; k?: string }[];
  cta?: { k: string; href: string };
};

const en = learn.en as Record<string, string>;
const meta = (slug: string) => ({ title: en[`${slug}.title`], summary: en[`${slug}.summary`] });
const paras = (n: number): LearnBlock[] => Array.from({ length: n }, (_, i) => ({ p: `p${i + 1}` }));

export const ARTICLES: LearnArticle[] = [
  {
    slug: "transparent-vs-shielded",
    n: "01",
    ...meta("transparent-vs-shielded"),
    minutes: 2,
    Diagram: ShieldedDiagram,
    body: paras(4),
    takeaways: 4,
    sources: [
      { label: en["src.shieldedVsTransparent"], k: "learn.src.shieldedVsTransparent", href: "https://z.cash/learn/what-is-the-difference-between-shielded-and-transparent-zcash/" },
      { label: en["src.addresses"], k: "learn.src.addresses", href: "https://zcash.readthedocs.io/en/latest/rtd_pages/addresses.html" },
      { label: en["src.shieldedPools"], k: "learn.src.shieldedPools", href: "https://zechub.wiki/using-zcash/shielded-pools" },
    ],
  },
  {
    slug: "viewing-keys",
    n: "02",
    ...meta("viewing-keys"),
    minutes: 2,
    Diagram: ViewingKeyDiagram,
    body: paras(4),
    takeaways: 4,
    sources: [
      { label: "Zodl — Explaining viewing keys", href: "https://zodl.com/explaining-viewing-keys/" },
      { label: "ZIP-310 — Security properties of Sapling viewing keys", href: "https://zips.z.cash/zip-0310" },
      { label: "ZIP-316 — Unified viewing keys", href: "https://zips.z.cash/zip-0316" },
    ],
  },
  {
    slug: "unified-addresses",
    n: "03",
    ...meta("unified-addresses"),
    minutes: 2,
    Diagram: UnifiedDiagram,
    body: paras(4),
    takeaways: 4,
    sources: [
      { label: en["src.unified"], k: "learn.src.unified", href: "https://z.cash/learn/what-are-zcash-unified-addresses/" },
      { label: "ZIP-316 — Unified addresses and viewing keys", href: "https://zips.z.cash/zip-0316" },
    ],
  },
  {
    slug: "choosing-a-wallet",
    n: "04",
    ...meta("choosing-a-wallet"),
    minutes: 2,
    Diagram: WalletDiagram,
    body: paras(4),
    takeaways: 4,
    sources: [
      { label: en["src.wallets"], k: "learn.src.wallets", href: "https://z.cash/ecosystem/?wallets=" },
      { label: "z.cash — What's the best Zcash wallet?", href: "https://z.cash/learn/whats-the-best-zcash-wallet/" },
      { label: en["src.zechubWallets"], k: "learn.src.zechubWallets", href: "https://zechub.wiki/wallets" },
      { label: en["src.zodl"], k: "learn.src.zodl", href: "https://zodl.com/" },
      { label: "Keystone", href: "https://keyst.one/" },
    ],
  },
  {
    slug: "shield-after-swap",
    n: "05",
    ...meta("shield-after-swap"),
    minutes: 2,
    Diagram: ShieldStepsDiagram,
    body: [{ p: "p1" }, { ol: ["ol1", "ol2", "ol3", "ol4", "ol5"] }, { p: "p2" }],
    takeaways: 4,
    sources: [
      { label: "z.cash — Useful tips when using Zcash", href: "https://z.cash/learn/useful-tips-when-using-zcash/" },
      { label: en["src.shieldedVsTransparent"], k: "learn.src.shieldedVsTransparent", href: "https://z.cash/learn/what-is-the-difference-between-shielded-and-transparent-zcash/" },
      { label: "ZIP-317 — Fees", href: "https://zips.z.cash/zip-0317" },
    ],
    cta: { k: "learn.cta.swap", href: "/" },
  },
  {
    slug: "memos",
    n: "06",
    ...meta("memos"),
    minutes: 1,
    Diagram: MemoDiagram,
    body: paras(4),
    takeaways: 4,
    sources: [
      { label: en["src.memos"], k: "learn.src.memos", href: "https://zcash.readthedocs.io/en/latest/rtd_pages/memos.html" },
      { label: "ZIP-302 — Standardized memo field format", href: "https://zips.z.cash/zip-0302" },
      { label: en["src.zechubMemos"], k: "learn.src.zechubMemos", href: "https://zechub.wiki/using-zcash/memos" },
    ],
  },
];

export const getArticle = (slug: string) => ARTICLES.find((a) => a.slug === slug);
