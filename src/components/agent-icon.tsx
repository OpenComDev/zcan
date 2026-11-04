import { Eraser, KeyRound, LockKeyhole, MailWarning, Plane, Search, ShieldAlert, Trash2, WalletMinimal, type LucideIcon } from "lucide-react";
import type { AgentDef } from "@/lib/agents";

const ICONS: Record<AgentDef["icon"], LucideIcon> = {
  search: Search,
  "shield-alert": ShieldAlert,
  key: KeyRound,
  eraser: Eraser,
  trash: Trash2,
  lock: LockKeyhole,
  "mail-warning": MailWarning,
  wallet: WalletMinimal,
  plane: Plane,
};

/** Small crimson icon tile used on agent cards. */
export function AgentIcon({ icon, size = 40 }: { icon: AgentDef["icon"]; size?: number }) {
  const Icon = ICONS[icon];
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon size={size * 0.45} />
    </span>
  );
}
