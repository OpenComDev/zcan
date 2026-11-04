/**
 * The only events and properties Zcan's analytics accepts. Shared by the browser (src/lib/analytics.ts)
 * and the proxy (/api/event), which drops anything not listed here.
 */
export const EVENTS = [
  "pageview",
  "Link cleaned",
  "Photo cleaned",
  "Document cleaned",
  "Address checked",
  "Password checked",
  "Fingerprint tested",
  "Swap quoted",
  "Swap started",
  "Payment request created",
  "Private send created",
  "Agent planned",
  "Agent run",
  "Result shared",
  "Referral link created",
] as const;

export type EventName = (typeof EVENTS)[number];

/** Coarse, non-identifying labels only (a tool or agent id, a pair like "BTC→ZEC"). Never amounts or addresses. */
export const PROPS = ["tool", "agent", "pair", "kind"] as const;
export type EventProps = Partial<Record<(typeof PROPS)[number], string>>;

export const isEvent = (v: unknown): v is EventName => typeof v === "string" && (EVENTS as readonly string[]).includes(v);

/** Which provider is switched on (NEXT_PUBLIC_ANALYTICS), or null when analytics is off. */
export function analyticsProvider(): "plausible" | "umami" | null {
  const v = process.env.NEXT_PUBLIC_ANALYTICS?.trim().toLowerCase();
  return v === "plausible" || v === "umami" ? v : null;
}
