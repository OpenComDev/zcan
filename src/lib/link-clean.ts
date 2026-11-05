/**
 * Link cleaner. Runs entirely in the browser — links are never opened or uploaded.
 * Strips tracking parameters, unwraps common redirect wrappers, and maps what it
 * removed to the tracker that would have received it.
 */

export type Tracker = { id: string; label: string };

export const TRACKERS = {
  ga: { id: "ga", label: "google-analytics.com" },
  gads: { id: "gads", label: "doubleclick.net" },
  fb: { id: "fb", label: "connect.facebook.net" },
  tiktok: { id: "tiktok", label: "analytics.tiktok.com" },
  ms: { id: "ms", label: "bat.bing.com" },
  twitter: { id: "twitter", label: "ads-twitter.com" },
  linkedin: { id: "linkedin", label: "px.ads.linkedin.com" },
  mail: { id: "mail", label: "email tracking" },
  session: { id: "session", label: "session id" },
  share: { id: "share", label: "share id" },
  ref: { id: "ref", label: "referral tag" },
  redirect: { id: "redirect", label: "redirect wrapper" },
} satisfies Record<string, Tracker>;

type Rule = { test: (key: string) => boolean; tracker: Tracker };

const exact = (tracker: Tracker, ...keys: string[]): Rule => {
  const set = new Set(keys.map((k) => k.toLowerCase()));
  return { test: (k) => set.has(k), tracker };
};
const prefix = (tracker: Tracker, ...prefixes: string[]): Rule => ({
  test: (k) => prefixes.some((p) => k.startsWith(p)),
  tracker,
});

const RULES: Rule[] = [
  prefix(TRACKERS.ga, "utm_", "_ga", "_gl"),
  exact(TRACKERS.gads, "gclid", "gclsrc", "dclid", "gbraid", "wbraid", "gad_source", "gad_campaignid", "srsltid"),
  exact(TRACKERS.fb, "fbclid", "fb_action_ids", "fb_action_types", "fb_ref", "fb_source", "mibextid"),
  exact(TRACKERS.tiktok, "ttclid", "_t", "_r", "is_from_webapp", "sender_device"),
  exact(TRACKERS.ms, "msclkid"),
  exact(TRACKERS.twitter, "twclid", "ref_src", "ref_url"),
  exact(TRACKERS.linkedin, "li_fat_id", "trk", "trkcampaign", "lipi"),
  exact(TRACKERS.mail, "mc_cid", "mc_eid", "_hsenc", "_hsmi", "hsctatracking", "mkt_tok", "vero_id", "vero_conv", "oly_anon_id", "oly_enc_id", "rb_clickid", "s_cid", "ml_subscriber", "ml_subscriber_hash", "_kx", "ck_subscriber_id"),
  exact(TRACKERS.share, "igshid", "igsh", "si", "feature", "pp", "share_id", "sharer", "smid"),
  exact(TRACKERS.session, "_branch_match_id", "_branch_referrer", "epik", "yclid", "spm", "scm", "pd_rd_r", "pd_rd_w", "pd_rd_wg", "pf_rd_p", "pf_rd_r", "pd_rd_i", "content-id", "psc", "qid", "sprefix", "crid", "dib", "dib_tag"),
  // Kept narrow on purpose: generic names like "src" or "cid" often carry real meaning.
  exact(TRACKERS.ref, "ref", "referrer", "ref_", "tag", "aff", "affiliate", "affid", "aff_id", "cmpid", "icid"),
];

// Parameters that look generic but carry meaning on specific hosts — keep them there.
const KEEP_ON_HOST: Record<string, string[]> = {
  "youtube.com": ["v", "t", "list", "index"],
  "youtu.be": ["t"],
  "google.com": ["q"],
};

const REDIRECT_PARAMS: { host: RegExp; path?: RegExp; param: string[] }[] = [
  { host: /(^|\.)safelinks\.protection\.outlook\.com$/, path: /^\/$/, param: ["url"] },
  { host: /^slack-redir\.net$/, path: /^\/link$/, param: ["url"] },
  { host: /(^|\.)google\.[a-z.]+$/, path: /^\/url$/, param: ["q", "url"] },
  { host: /^l\.(facebook|instagram)\.com$/, param: ["u"] },
  { host: /^lm\.facebook\.com$/, param: ["u"] },
  { host: /(^|\.)youtube\.com$/, path: /^\/redirect$/, param: ["q"] },
  { host: /^out\.reddit\.com$/, param: ["url"] },
  { host: /^(www\.)?linkedin\.com$/, path: /^\/redir\/redirect/, param: ["url"] },
  { host: /^href\.li$/, param: [] },
  { host: /^steamcommunity\.com$/, path: /^\/linkfilter/, param: ["url", "u"] },
  { host: /^click\.redditmail\.com$/, param: ["url"] },
];

export type CleanResult = {
  input: string;
  cleaned: string;
  removed: { key: string; value: string; tracker: Tracker }[];
  trackers: Tracker[];
  unwrapped: boolean;
};

export type LinkErrorCode = "empty" | "protocol" | "notFull" | "invalid";

/** `message` stays English; `code` lets the UI show a translated message. */
export class LinkError extends Error {
  code: LinkErrorCode;
  constructor(message: string, code: LinkErrorCode) {
    super(message);
    this.code = code;
  }
}

function parse(raw: string): URL {
  const s = raw.trim();
  if (!s) throw new LinkError("Paste a link to clean.", "empty");
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new LinkError("Only http and https links can be cleaned.", "protocol");
    if (!u.hostname.includes(".")) throw new LinkError("That doesn't look like a full link.", "notFull");
    return u;
  } catch (e) {
    if (e instanceof LinkError) throw e;
    throw new LinkError("That doesn't look like a valid link.", "invalid");
  }
}

function hostKeep(host: string): Set<string> {
  const h = host.replace(/^www\.|^m\./, "");
  for (const [k, v] of Object.entries(KEEP_ON_HOST)) if (h === k || h.endsWith(`.${k}`)) return new Set(v);
  return new Set();
}

export function cleanLink(raw: string): CleanResult {
  let url = parse(raw);
  const removed: CleanResult["removed"] = [];
  let unwrapped = false;

  // Unwrap redirect wrappers (up to 3 levels).
  for (let i = 0; i < 3; i++) {
    const rule = REDIRECT_PARAMS.find((r) => r.host.test(url.hostname) && (!r.path || r.path.test(url.pathname)));
    if (!rule) break;
    let target: string | null = null;
    if (rule.param.length === 0) target = decodeURIComponent(url.search.slice(1) || url.hash.slice(1));
    for (const p of rule.param) target ??= url.searchParams.get(p);
    if (!target) break;
    try {
      url = parse(target);
      unwrapped = true;
      removed.push({ key: "redirect", value: rule.host.source, tracker: TRACKERS.redirect });
    } catch {
      break;
    }
  }

  const keep = hostKeep(url.hostname);
  for (const key of [...url.searchParams.keys()]) {
    const k = key.toLowerCase();
    if (keep.has(k)) continue;
    const rule = RULES.find((r) => r.test(k));
    if (rule) {
      for (const value of url.searchParams.getAll(key)) removed.push({ key, value, tracker: rule.tracker });
      url.searchParams.delete(key);
    }
  }

  // Amazon: /ref=xyz path tails and long product slugs → canonical /dp/ID.
  if (/(^|\.)amazon\.[a-z.]+$/.test(url.hostname)) {
    const dp = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    const before = url.pathname;
    url.pathname = dp ? `/dp/${dp[1]}` : url.pathname.replace(/\/ref=[^/]*$/, "");
    if (url.pathname !== before) removed.push({ key: "ref=", value: before, tracker: TRACKERS.ref });
    // A canonical /dp/ link needs no query string at all.
    if (dp) {
      for (const [key, value] of url.searchParams) removed.push({ key, value, tracker: TRACKERS.session });
      url.search = "";
    }
  }

  // Text-fragment and tracking hashes.
  if (/^#(:~:|xtor=|utm_|at_)/.test(url.hash)) {
    removed.push({ key: "#", value: url.hash, tracker: TRACKERS.ga });
    url.hash = "";
  }

  const cleaned = url.toString().replace(/\?$/, "");
  const trackers = [...new Map(removed.map((r) => [r.tracker.id, r.tracker])).values()];
  return { input: raw.trim(), cleaned, removed, trackers, unwrapped };
}

export const SAMPLE_LINK =
  "https://shop.site/item?id=42&utm_source=newsletter&utm_campaign=fall_drop&fbclid=IwAR2xYz9&gclid=Cj0KCQjw&ttclid=E.C.P.Ct8&mc_eid=7a3f19&_ga=2.1182.99";
