/** Privacy agent definitions shared by the UI and the API routes. */

export type AgentField = {
  name: string;
  label: string;
  placeholder: string;
  required?: boolean;
  multiline?: boolean;
  hint?: string;
  /** Renders a select with these choices instead of free text. The first one is the default. */
  options?: string[];
  /** Input type for single-line fields. Defaults to "text". */
  type?: "text" | "email";
  /** Identifies the user (emails, usernames…). Always replaced with a placeholder in shared training runs. */
  personal?: boolean;
  /** Longest accepted value in characters. Defaults to FIELD_MAX. */
  max?: number;
  /** Skip the 64-hex private-key check (raw email headers carry hex message IDs and hashes). */
  allowHex?: boolean;
};

export type AgentDef = {
  id:
    | "exposure-scout"
    | "breach-guide"
    | "access-auditor"
    | "data-broker-remover"
    | "account-cleanup"
    | "social-lockdown"
    | "phishing-check"
    | "wallet-hygiene"
    | "travel-privacy";
  name: string;
  tagline: string;
  description: string;
  icon: "search" | "shield-alert" | "key" | "eraser" | "trash" | "lock" | "mail-warning" | "wallet" | "plane";
  fields: AgentField[];
  /** Requires the user to confirm they're researching themselves. */
  consent?: string;
  usesWeb: boolean;
  /**
   * Whether a finished run may be shared (opt-in, anonymized) as a training example for Zcan's own model.
   * Off for agents whose results are inherently about a specific person.
   */
  trainable?: boolean;
  /** Web searches allowed per run (default 8). */
  maxSearches?: number;
  /** Hide "re-check on a schedule" (a re-run wouldn't change, and it would keep the pasted input stored). */
  noSchedule?: boolean;
};

export const AGENTS: AgentDef[] = [
  {
    id: "exposure-scout",
    name: "Exposure Scout",
    tagline: "Investigates what is exposed about you online.",
    description:
      "Searches the public web for traces of you — data-broker listings, old profiles, leaked details — and gives you a removal plan for each one.",
    icon: "search",
    usesWeb: true,
    consent: "I'm looking up myself, or I have this person's permission.",
    fields: [
      { name: "name", label: "Your full name", placeholder: "e.g. Alex Rivera…", required: true },
      { name: "usernames", label: "Usernames or handles", placeholder: "e.g. alexr, @arivera_dev…", hint: "Comma-separated. Optional." },
      { name: "location", label: "City or region", placeholder: "e.g. Austin, TX…", hint: "Helps tell you apart from people with the same name." },
      {
        name: "extra",
        label: "Anything else to check",
        placeholder: "Old employer, personal website, school…",
        multiline: true,
      },
    ],
  },
  {
    id: "breach-guide",
    name: "Breach Guide",
    tagline: "Explains breaches and the steps you can take.",
    description:
      "Tell it which service was breached or paste the notice you got. It looks up what actually leaked and walks you through what to do, in order.",
    icon: "shield-alert",
    usesWeb: true,
    trainable: true,
    fields: [
      {
        name: "breach",
        label: "Which service, or the notice you received",
        placeholder: "e.g. “I got an email saying my account was in a data breach…”",
        required: true,
        multiline: true,
      },
      { name: "exposed", label: "What you used that account for", placeholder: "e.g. Shopping, saved card, work login…" },
      { name: "reuse", label: "Did you reuse that password anywhere?", placeholder: "Yes / No / Not sure" },
    ],
  },
  {
    id: "access-auditor",
    name: "Access Auditor",
    tagline: "Reviews account access and permissions.",
    description:
      "List the accounts and devices you rely on. It builds a step-by-step audit of sessions, connected apps, recovery options and sharing — with where to find each setting.",
    icon: "key",
    usesWeb: true,
    trainable: true,
    fields: [
      {
        name: "accounts",
        label: "Accounts you use",
        placeholder: "e.g. Google, Apple ID, Instagram, GitHub, bank app…",
        required: true,
        multiline: true,
      },
      { name: "devices", label: "Devices", placeholder: "e.g. iPhone 15, Windows laptop, shared iPad…" },
      {
        name: "concern",
        label: "Anything specific worrying you?",
        placeholder: "e.g. Someone else might still be logged in…",
        multiline: true,
      },
    ],
  },
  {
    id: "data-broker-remover",
    name: "Data Broker Remover",
    tagline: "Finds your people-search listings and drafts the removals.",
    description:
      "Checks the big people-search and data-broker sites for listings of you, then gives you each site's official opt-out page, what it asks for, and a ready-to-send removal or GDPR erasure request. You send them — it never fills in forms for you.",
    icon: "eraser",
    usesWeb: true,
    maxSearches: 12,
    consent: "I'm removing my own listings, or I have this person's permission.",
    fields: [
      { name: "name", label: "Your full name", placeholder: "e.g. Alex Rivera…", required: true, hint: "Add maiden or other names you've used, comma-separated." },
      {
        name: "location",
        label: "City, region and country",
        placeholder: "e.g. Austin, TX, USA…",
        required: true,
        hint: "Decides which brokers and which privacy law (GDPR, CCPA…) apply.",
      },
      { name: "age", label: "Age range", placeholder: "e.g. 30–35…", hint: "Optional. Only used to tell you apart from same-name listings." },
      { name: "pastCities", label: "Past cities", placeholder: "e.g. Denver, CO; Leeds, UK…", hint: "Optional. Brokers often list old addresses." },
      {
        name: "emails",
        label: "Email for the requests",
        placeholder: "e.g. alex@example.com…",
        type: "email",
        hint: "Optional. Only written into the drafted requests — never searched.",
      },
    ],
  },
  {
    id: "account-cleanup",
    name: "Account Cleanup",
    tagline: "Finds forgotten accounts and how to delete or lock them.",
    description:
      "Helps you track down old accounts, then gives you the direct deletion page and steps for each service, how hard it is, and what to export first. Never enter passwords — it doesn't need them.",
    icon: "trash",
    usesWeb: true,
    trainable: true,
    maxSearches: 10,
    fields: [
      {
        name: "identifiers",
        personal: true,
        label: "Emails and usernames you've used",
        placeholder: "e.g. alex@gmail.com, old hotmail address, alexr99…",
        required: true,
        multiline: true,
        hint: "No passwords. These only tailor the advice — they're never searched.",
      },
      {
        name: "services",
        label: "Services you remember",
        placeholder: "e.g. MySpace, an old Yahoo account, Fitbit, Duolingo, a forum…",
        multiline: true,
        hint: "Optional. Leave empty to start with how to find them.",
      },
      {
        name: "goal",
        label: "Goal",
        placeholder: "",
        options: ["Delete what I don't use", "Keep them, but lock them down", "Mix — help me decide"],
      },
    ],
  },
  {
    id: "social-lockdown",
    name: "Social Media Lockdown",
    tagline: "A settings-by-settings privacy checklist for your socials.",
    description:
      "Pick your platforms and what you're worried about. It builds a checklist of the exact settings to change on each one, highest impact first — tagging, location, discoverability, ads, old posts and more.",
    icon: "lock",
    usesWeb: true,
    trainable: true,
    maxSearches: 10,
    fields: [
      {
        name: "platforms",
        label: "Platforms you use",
        placeholder: "e.g. Instagram, X, Facebook, TikTok, LinkedIn, Snapchat, Reddit, YouTube…",
        required: true,
        multiline: true,
      },
      {
        name: "concern",
        label: "Main concern",
        placeholder: "",
        options: ["General privacy", "Job hunting", "Someone is stalking or harassing me", "Starting a new job or role", "Other"],
      },
      {
        name: "visibility",
        label: "How visible do you want to be?",
        placeholder: "",
        options: ["Friends and followers only", "Public, but with minimal personal info", "As hard to find as possible"],
      },
      { name: "extra", label: "Anything else", placeholder: "e.g. I want to keep my LinkedIn public for recruiters…", multiline: true },
    ],
  },
  {
    id: "phishing-check",
    noSchedule: true,
    name: "Phishing Checker",
    tagline: "Tells you whether a suspicious email or message is a scam.",
    description:
      "Paste a message that feels off. It checks the sender, the links, the wording and what the message asks you to do, then gives you a verdict with its reasons and how to report it. It never opens the links.",
    icon: "mail-warning",
    usesWeb: true,
    // Pasted messages contain other people's names, addresses and details, so runs are never shared.
    trainable: false,
    maxSearches: 6,
    fields: [
      {
        name: "message",
        personal: true,
        label: "The suspicious message",
        placeholder: "Paste the email or text message here…",
        required: true,
        multiline: true,
        max: 4000,
        hint: "Remove your own account numbers, codes and passwords before pasting.",
      },
      {
        name: "sender",
        label: "Sender address or number",
        placeholder: "e.g. security@paypa1-support.com or +1 555 0100…",
        max: 300,
        hint: "Optional. The actual address, not just the name shown — tap or hover the name to see it.",
      },
      {
        name: "links",
        label: "Links in the message",
        placeholder: "e.g. https://paypal.com.account-check.io/login…",
        multiline: true,
        max: 1500,
        hint: "Optional. Copy them without opening: long-press or right-click the link, then Copy link.",
      },
      {
        name: "headers",
        personal: true,
        allowHex: true,
        label: "Email headers",
        placeholder: "Authentication-Results: spf=fail… dkim=none… dmarc=fail…",
        multiline: true,
        max: 4000,
        hint: "Optional, for emails. Gmail: ⋮ › Show original. Outlook: View › View message source. Apple Mail: View › Message › All Headers.",
      },
      {
        name: "clicked",
        label: "Have you clicked or entered anything?",
        placeholder: "",
        options: ["No", "I clicked a link", "I entered a password or code", "I opened an attachment", "I paid or sent money or crypto", "Not sure"],
      },
      {
        name: "region",
        label: "Your country",
        placeholder: "e.g. United Kingdom…",
        max: 300,
        hint: "Optional. Picks the right places to report it.",
      },
    ],
  },
  {
    id: "wallet-hygiene",
    name: "Wallet Hygiene Check",
    tagline: "A safety and privacy check-up for your crypto wallets.",
    description:
      "Tell it which wallets and coins you use and how you back them up. It gives you a scored checklist, riskiest first — seed backups, token approvals, drainer and poisoning scams, privacy and what happens to your coins if something happens to you.",
    icon: "wallet",
    usesWeb: true,
    trainable: true,
    maxSearches: 6,
    fields: [
      {
        name: "wallets",
        label: "Wallets and apps you use",
        placeholder: "e.g. MetaMask, Ledger, Zashi, Coinbase app…",
        required: true,
        multiline: true,
        hint: "Names only. Never paste a seed phrase, private key or wallet address — Zcan will never ask for them.",
      },
      { name: "coins", label: "Chains and coins", placeholder: "e.g. Bitcoin, Ethereum, Solana, Zcash, USDC…", max: 300 },
      {
        name: "backup",
        label: "How is your seed phrase backed up?",
        placeholder: "",
        options: ["Not sure", "Written on paper", "Metal plate", "Password manager", "Cloud notes or a photo", "Hardware wallet only"],
      },
      {
        name: "reuse",
        label: "Do you reuse the same address?",
        placeholder: "",
        options: ["Not sure", "Yes, I mostly use one address", "No, I use a new address each time"],
      },
      {
        name: "exchanges",
        label: "Do you use exchanges?",
        placeholder: "",
        options: ["Yes, with ID verification", "Yes, without ID verification", "No"],
      },
      {
        name: "worry",
        label: "Main worry",
        placeholder: "",
        options: ["All of it", "Theft and scams", "Privacy", "Losing access", "Inheritance and recovery"],
      },
      {
        name: "extra",
        personal: true,
        label: "Anything else",
        placeholder: "e.g. I signed something on a mint site last month and I'm not sure what it was…",
        multiline: true,
        hint: "Optional. No seed phrases, keys, passwords or addresses.",
      },
    ],
  },
  {
    id: "travel-privacy",
    name: "Travel Privacy Prep",
    tagline: "A privacy plan for your devices and data before a trip.",
    description:
      "Tell it where you're going and what you're bringing. It builds a checklist for before you go, the border, the trip itself and coming home — device searches, encryption, SIMs, Wi-Fi, payments, location and what to do if a device is lost or taken. It isn't legal advice.",
    icon: "plane",
    usesWeb: true,
    trainable: true,
    maxSearches: 8,
    fields: [
      {
        name: "destinations",
        label: "Where you're going",
        placeholder: "e.g. United States, with a stopover in the UAE…",
        required: true,
        max: 300,
        hint: "Include countries you're only passing through.",
      },
      { name: "devices", label: "Devices you're bringing", placeholder: "e.g. iPhone 15, work laptop (Windows), Kindle…", max: 300 },
      {
        name: "tripType",
        label: "Type of trip",
        placeholder: "",
        options: ["Holiday", "Work", "Crossing a border with strict device searches", "Journalism or activism", "Other"],
      },
      {
        name: "concerns",
        personal: true,
        label: "Anything you're worried about",
        placeholder: "e.g. My work laptop has client files on it…",
        multiline: true,
        hint: "Optional. Share only what you're comfortable with.",
      },
    ],
  },
];

export const getAgent = (id: string) => AGENTS.find((a) => a.id === id);

/**
 * UI text for part of an agent definition in the active language, via `agents.def.<id>.<path>`
 * (e.g. "name", "field.name.label", "field.goal.option.<value>"). Falls back to the English source.
 */
export function agentText(t: (key: string) => string, id: string, path: string, fallback: string): string {
  const key = `agents.def.${id}.${path}`;
  const out = t(key);
  return out === key ? fallback : out;
}

/** `sig` is the server's signature (see signPlan in agents-server): it proves Zcan's model wrote the step. */
export type PlanStep = { id: string; title: string; detail: string; kind: "search" | "analyze" | "write"; sig?: string };
export type AgentPlan = { summary: string; steps: PlanStep[]; caveat: string | null; sig?: string };

/** Events streamed from /api/agents/run as newline-delimited JSON. */
export type RunEvent =
  /** `code` lets the client show its own translation; `text` is the English fallback. */
  | { t: "status"; text: string; code?: string }
  | { t: "search"; query: string }
  | { t: "source"; url: string; title: string }
  | { t: "text"; text: string }
  /** Discard report text streamed so far (the model wrote before deciding to search). */
  | { t: "reset" }
  | { t: "done" }
  /** Offered only for shareable agents when training collection is on: an anonymized, signed draft the reader may choose to share. */
  | { t: "contribution"; draft: string; sig: string }
  | { t: "error"; message: string; code?: string };

export const FIELD_MAX = 600;

/** Languages the agents can write plans and reports in (same codes as the UI languages). */
export const AGENT_LOCALES = ["en", "es", "pt", "tr", "ru", "zh"] as const;
export type AgentLocale = (typeof AGENT_LOCALES)[number];
export const readLocale = (v: unknown): AgentLocale => ((AGENT_LOCALES as readonly unknown[]).includes(v) ? (v as AgentLocale) : "en");

/** Longest value accepted for a field. */
export const fieldMax = (field: AgentField) => field.max ?? FIELD_MAX;

/**
 * Runs that may be offered for sharing as training data — never ones about stalking or harassment,
 * or trips for journalism or activism.
 */
export const isTrainable = (agent: AgentDef, values: Record<string, string>) =>
  Boolean(agent.trainable) &&
  !(agent.id === "social-lockdown" && /stalk|harass/i.test(values.concern ?? "")) &&
  !(agent.id === "travel-privacy" && /journalis|activis/i.test(values.tripType ?? ""));
