import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  BellPlus,
  Bot,
  CircleHelp,
  DatabaseBackup,
  ClipboardCheck,
  Fingerprint,
  Gift,
  FileX2,
  GraduationCap,
  History,
  KeyRound,
  LifeBuoy,
  Mail,
  Network,
  QrCode,
  Radar,
  Repeat,
  ScanSearch,
  ScrollText,
  ShieldCheck,
  Shuffle,
  Smartphone,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { AGENTS, getAgent } from "@/lib/agents";

export type NavGroup = "Move" | "Watch" | "Protect" | "Learn";
/** `id` keys the translations: shell.nav.<id> and shell.hint.<id>. */
export type NavItem = { id: string; href: string; label: string; icon: LucideIcon; hint: string; group: NavGroup; tab?: boolean };

export const NAV_GROUPS: NavGroup[] = ["Move", "Watch", "Protect", "Learn"];

export const NAV: NavItem[] = [
  { id: "swap", href: "/", label: "Swap", icon: ArrowLeftRight, hint: "Any coin ↔ ZEC", group: "Move", tab: true },
  { id: "send", href: "/send", label: "Send", icon: Shuffle, hint: "Private multi-recipient send", group: "Move", tab: true },
  { id: "pay", href: "/pay", label: "Request", icon: QrCode, hint: "Payment request link", group: "Move" },
  { id: "history", href: "/history", label: "History", icon: History, hint: "Your swaps, on this device", group: "Move" },
  { id: "track", href: "/track", label: "Track", icon: Radar, hint: "Find an order", group: "Move" },
  { id: "markets", href: "/markets", label: "Markets", icon: BarChart3, hint: "Live rates & alerts", group: "Watch", tab: true },
  { id: "network", href: "/network", label: "Network", icon: Network, hint: "Zcash chain stats", group: "Watch" },
  { id: "status", href: "/status", label: "Status", icon: Activity, hint: "Service health", group: "Watch" },
  { id: "tools", href: "/tools", label: "Tools", icon: Wrench, hint: "On-device privacy tools", group: "Protect", tab: true },
  { id: "agents", href: "/agents", label: "Agents", icon: Bot, hint: "Privacy agents", group: "Protect", tab: true },
  { id: "learn", href: "/learn", label: "Learn", icon: GraduationCap, hint: "Zcash privacy explained", group: "Learn" },
  { id: "guides", href: "/guides", label: "Guides", icon: LifeBuoy, hint: "Quick answers, with the tool", group: "Learn" },
  { id: "docs", href: "/docs", label: "Docs", icon: BookOpen, hint: "How everything works", group: "Learn" },
  { id: "app", href: "/app", label: "iPhone app", icon: Smartphone, hint: "Dropping soon", group: "Learn" },
  { id: "help", href: "/help", label: "Help", icon: CircleHelp, hint: "FAQ", group: "Learn" },
];

/** Individual tools, searchable from the command palette. */
export const TOOL_LINKS: Omit<NavItem, "group">[] = [
  { id: "link-cleaner", href: "/tools#link-cleaner", label: "Link cleaner", icon: Wrench, hint: "Strip trackers from links" },
  { id: "photo-cleaner", href: "/tools#photo-cleaner", label: "Photo cleaner", icon: Wrench, hint: "Remove GPS & EXIF" },
  { id: "clipboard", href: "/tools/clipboard", label: "Clipboard guard", icon: ClipboardCheck, hint: "Catch swapped addresses" },
  { id: "address", href: "/tools/address", label: "Address checker", icon: ScanSearch, hint: "Chain, type & privacy" },
  { id: "passwords", href: "/tools/passwords", label: "Password check", icon: KeyRound, hint: "Breach check, k-anonymous" },
  { id: "documents", href: "/tools/documents", label: "Document cleaner", icon: FileX2, hint: "PDF & Office metadata" },
  { id: "fingerprint", href: "/tools/fingerprint", label: "Fingerprint test", icon: Fingerprint, hint: "How unique is your browser" },
  { id: "aliases", href: "/tools/aliases", label: "Email aliases", icon: Mail, hint: "Stop sharing your real email" },
];

/** Quick actions, searchable from the command palette. */
export const ACTION_LINKS: Omit<NavItem, "group">[] = [
  { id: "alerts", href: "/markets#alerts", label: "Price alerts", icon: BellPlus, hint: "Get notified when ZEC crosses a level" },
  { id: "backup", href: "/history", label: "Back up / forget local data", icon: DatabaseBackup, hint: "Export, encrypted backup, wipe" },
  { id: "request", href: "/pay", label: "Request a payment", icon: QrCode, hint: "Link + QR for ZEC" },
  { id: "recurring", href: "/history#recurring", label: "Recurring buys", icon: Repeat, hint: "Reminders to buy ZEC on a schedule (DCA)" },
  { id: "halving", href: "/network", label: "Halving countdown", icon: Network, hint: "Next ZEC halving" },
  { id: "transparent-vs-shielded", href: "/learn/transparent-vs-shielded", label: "Transparent vs shielded", icon: GraduationCap, hint: "Learn · public vs private ZEC" },
  { id: "viewing-keys", href: "/learn/viewing-keys", label: "Viewing keys", icon: GraduationCap, hint: "Learn · selective disclosure" },
  { id: "unified-addresses", href: "/learn/unified-addresses", label: "Unified addresses", icon: GraduationCap, hint: "Learn · u1… explained" },
  { id: "choosing-a-wallet", href: "/learn/choosing-a-wallet", label: "Choosing a wallet", icon: GraduationCap, hint: "Learn · shielded-by-default wallets" },
  { id: "shield-after-swap", href: "/learn/shield-after-swap", label: "Shield after a swap", icon: GraduationCap, hint: "Learn · make swapped ZEC private" },
  { id: "memos", href: "/learn/memos", label: "Encrypted memos", icon: GraduationCap, hint: "Learn · private notes" },
  { id: "refer", href: "/refer", label: "Refer a friend", icon: Gift, hint: "Friends pay less, you earn on-chain" },
  { id: "security", href: "/security", label: "Security", icon: ShieldCheck, hint: "How Zcan protects you · report a vulnerability" },
  { id: "transparency", href: "/transparency", label: "Transparency", icon: ScrollText, hint: "What each feature sends, and to whom" },
];

export const AGENT_LINKS = () => AGENTS.map((a) => ({ href: `/agents/${a.id}`, label: a.name, hint: a.tagline }));

export const isActive = (href: string, pathname: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Translated text for a key, or the English fallback when the key has no entry anywhere. */
const tr = (t: Translate | undefined, key: string, fallback: string) => {
  if (!t) return fallback;
  const out = t(key);
  return out === key ? fallback : out;
};

/** "Zcan / Agents / Exposure Scout" */
export function crumbs(pathname: string, t?: Translate): string[] {
  const parts = pathname.split("/").filter(Boolean);
  const nav = (n: NavItem) => tr(t, `shell.nav.${n.id}`, n.label);
  if (parts.length === 0) return ["Zcan", nav(NAV[0])];
  const [first, second] = parts;
  if (first === "legal") return ["Zcan", tr(t, "shell.crumb.privacy", "Privacy Policy")];
  if (first === "support") return ["Zcan", tr(t, "shell.crumb.support", "Support")];
  if (first === "security") return ["Zcan", tr(t, "shell.crumb.security", "Security")];
  if (first === "transparency") return ["Zcan", tr(t, "shell.crumb.transparency", "Transparency")];
  if (first === "refer") return ["Zcan", tr(t, "shell.crumb.refer", "Refer a friend")];
  const hit = NAV.find((n) => n.href === `/${first}`);
  const section = hit ? nav(hit) : first === "order" ? tr(t, "shell.crumb.orders", "Orders") : first;
  const tool = first === "tools" && second ? TOOL_LINKS.find((l) => l.href === `/tools/${second}`) : undefined;
  const out = ["Zcan", section];
  if (second) {
    if (first === "agents") {
      const agent = getAgent(second);
      out.push(agent ? tr(t, `agents.def.${agent.id}.name`, agent.name) : second);
    } else if (tool) out.push(tr(t, `shell.tool.${tool.id}`, tool.label));
    else if (first === "pay") out.push(second === "r" ? tr(t, "shell.crumb.pay", "Pay") : second);
    else if (first === "learn") out.push(tr(t, `learn.${second}.title`, second.replace(/-/g, " ")));
    else if (first === "guides") out.push(tr(t, `guides.${second}.q`, second.replace(/-/g, " ")));
    else if (first === "send") out.push(`${tr(t, "shell.crumb.batch", "Batch")} ${second.slice(0, 6)}`);
    else if (first === "order") {
      const id = decodeURIComponent(second);
      out.push(id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id);
    } else out.push(second);
  }
  return out;
}
