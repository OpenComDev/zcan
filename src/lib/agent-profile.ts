/**
 * The agent memory profile: a fixed whitelist of short, optional details the user saves about
 * themselves so agents don't ask the same questions every run. Shared by the browser store
 * (src/lib/agent-memory.ts, encrypted on this device) and the API routes, which only ever accept
 * these keys, trimmed and capped.
 */

import { findSecret } from "./secret-guard";

export const PROFILE_FIELD_MAX = 120;
export const PROFILE_NOTES_MAX = 300;

/** Phone kinds the profile accepts. "" means not set. */
export const PHONE_KINDS = ["iPhone", "Android", "Other"] as const;

export type ProfileField = {
  key: ProfileKey;
  /** English label the server writes into the prompt. The UI uses `agentkit.mem.f.<key>`. */
  label: string;
  max: number;
  options?: readonly string[];
  multiline?: boolean;
};

export type ProfileKey =
  | "email"
  | "phone"
  | "phoneModel"
  | "computer"
  | "browsers"
  | "passwordManager"
  | "region"
  | "social"
  | "wallets"
  | "notes";

export type AgentProfile = Partial<Record<ProfileKey, string>>;

export const PROFILE_FIELDS: readonly ProfileField[] = [
  { key: "email", label: "Email provider(s)", max: PROFILE_FIELD_MAX },
  { key: "phone", label: "Phone", max: 20, options: PHONE_KINDS },
  { key: "phoneModel", label: "Phone model", max: PROFILE_FIELD_MAX },
  { key: "computer", label: "Computer OS", max: PROFILE_FIELD_MAX },
  { key: "browsers", label: "Browser(s)", max: PROFILE_FIELD_MAX },
  { key: "passwordManager", label: "Password manager", max: PROFILE_FIELD_MAX },
  { key: "region", label: "Country or region", max: PROFILE_FIELD_MAX },
  { key: "social", label: "Social platforms they use", max: PROFILE_FIELD_MAX },
  { key: "wallets", label: "Crypto wallets they use", max: PROFILE_FIELD_MAX },
  { key: "notes", label: "Anything else agents should know", max: PROFILE_NOTES_MAX, multiline: true },
];

/**
 * Keeps whitelisted keys only, as trimmed single-spaced strings within their caps (notes keep line
 * breaks). Choice fields only accept their options; values that look like crypto secrets are dropped.
 * Anything else is ignored. Returns null when empty.
 */
export function sanitizeProfile(raw: unknown): AgentProfile | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: AgentProfile = {};
  for (const f of PROFILE_FIELDS) {
    const v = src[f.key];
    if (typeof v !== "string") continue;
    let s = f.multiline ? v.replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n") : v.replace(/\s+/g, " ");
    s = s.trim().slice(0, f.max).trim();
    if (f.options && !f.options.includes(s)) continue;
    // Never keep or send anything that looks like a seed phrase or private key (the form refuses these first).
    if (findSecret(s)) continue;
    if (s) out[f.key] = s;
  }
  return Object.keys(out).length ? out : null;
}

export const isEmptyProfile = (p: AgentProfile | null | undefined) => !p || !Object.values(p).some((v) => v?.trim());

/** A few short, recognisable values for the "Using your saved profile: iPhone · Gmail · Bitwarden" line. */
export function profileHighlights(p: AgentProfile, max = 4): string[] {
  const phone = p.phoneModel || p.phone;
  // Everything is listed in a fixed order, so a profile with any field set always shows something.
  const picks = [phone, p.email, p.passwordManager, p.computer, p.browsers, p.region, p.social, p.wallets, p.notes];
  return picks
    .filter((v): v is string => Boolean(v))
    .map((v) => {
      const first = v.split(/[,;/\n]/)[0].trim();
      return first.length > 24 ? `${first.slice(0, 23)}…` : first;
    })
    .filter(Boolean)
    .slice(0, max);
}
