/**
 * Search guides: one page per common question, each answered by a Zcan tool or agent.
 * Text lives in src/i18n/guides.ts under `guides.<slug>.*`. Slugs are the English search phrase and
 * stay the same in every language (/guides/…, /es/guides/…).
 */

/** Tools that are embedded right in the guide. */
export type EmbedTool = "link" | "photo" | "address" | "passwords" | "fingerprint" | "clipboard" | "documents";

export type Guide = {
  slug: string;
  steps: number;
  faqs: number;
  /** Embedded tool, or a link to the page that does the job (a tool page, an agent or the swap). */
  tool: { embed: EmbedTool; href: string } | { href: string; nameKey: string; agent?: boolean };
  related: string[];
};

export const GUIDES: Guide[] = [
  { slug: "remove-location-from-photos", steps: 3, faqs: 3, tool: { embed: "photo", href: "/tools#photo-cleaner" }, related: ["remove-metadata-from-pdf-and-word", "remove-tracking-from-links", "browser-fingerprint-test"] },
  { slug: "remove-tracking-from-links", steps: 3, faqs: 3, tool: { embed: "link", href: "/tools#link-cleaner" }, related: ["remove-location-from-photos", "browser-fingerprint-test", "is-this-email-phishing"] },
  { slug: "remove-metadata-from-pdf-and-word", steps: 3, faqs: 3, tool: { embed: "documents", href: "/tools/documents" }, related: ["remove-location-from-photos", "remove-tracking-from-links", "remove-yourself-from-people-search-sites"] },
  { slug: "check-if-password-was-leaked", steps: 3, faqs: 3, tool: { embed: "passwords", href: "/tools/passwords" }, related: ["is-my-email-in-a-data-breach", "is-this-email-phishing", "browser-fingerprint-test"] },
  { slug: "is-my-email-in-a-data-breach", steps: 3, faqs: 3, tool: { href: "/agents/breach-guide", nameKey: "agents.def.breach-guide.name", agent: true }, related: ["check-if-password-was-leaked", "is-this-email-phishing", "remove-yourself-from-people-search-sites"] },
  { slug: "buy-zcash-privately", steps: 3, faqs: 3, tool: { href: "/", nameKey: "shell.nav.swap" }, related: ["check-a-crypto-address", "clipboard-hijacker-protection", "remove-tracking-from-links"] },
  { slug: "check-a-crypto-address", steps: 3, faqs: 3, tool: { embed: "address", href: "/tools/address" }, related: ["clipboard-hijacker-protection", "buy-zcash-privately", "is-this-email-phishing"] },
  { slug: "clipboard-hijacker-protection", steps: 3, faqs: 3, tool: { embed: "clipboard", href: "/tools/clipboard" }, related: ["check-a-crypto-address", "buy-zcash-privately", "is-this-email-phishing"] },
  { slug: "browser-fingerprint-test", steps: 3, faqs: 3, tool: { embed: "fingerprint", href: "/tools/fingerprint" }, related: ["remove-tracking-from-links", "remove-location-from-photos", "check-if-password-was-leaked"] },
  { slug: "remove-yourself-from-people-search-sites", steps: 3, faqs: 3, tool: { href: "/agents/data-broker-remover", nameKey: "agents.def.data-broker-remover.name", agent: true }, related: ["is-my-email-in-a-data-breach", "remove-metadata-from-pdf-and-word", "is-this-email-phishing"] },
  { slug: "is-this-email-phishing", steps: 3, faqs: 3, tool: { href: "/agents/phishing-check", nameKey: "agents.def.phishing-check.name", agent: true }, related: ["is-my-email-in-a-data-breach", "check-if-password-was-leaked", "clipboard-hijacker-protection"] },
];

export const getGuide = (slug: string) => GUIDES.find((g) => g.slug === slug);
