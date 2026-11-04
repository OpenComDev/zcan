"use client";

import Link from "@/components/locale-link";
import { ArrowRight, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { AgentIcon } from "@/components/agent-icon";
import { Panel } from "@/components/hud/panel";
import { agentText, getAgent, type AgentDef } from "@/lib/agents";
import { useT } from "@/lib/i18n";

/** Agents whose runs can be shared as training data — the ones worth sending people to. */
const FEATURED: AgentDef["id"][] = ["wallet-hygiene", "breach-guide", "social-lockdown"];

// Dismissal is a per-browser convenience; if storage is blocked the card simply shows again.
const KEY = "zcan:agent-promo-dismissed:v1";
const EVENT = "zcan:agent-promo";
const readDismissed = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("zcan:local", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("zcan:local", cb);
  };
};
const dismiss = () => {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Not persisted — hidden for this page view only.
  }
  window.dispatchEvent(new Event(EVENT));
};

/** "Try a privacy agent": a small, dismissible pointer to the agents from the swap and tools pages. */
export function AgentPromo() {
  const t = useT();
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => false);
  if (dismissed) return null;

  return (
    <Panel
      title={t("agents.promo.title")}
      meta={
        <span className="flex items-center gap-3">
          <span className="hidden sm:inline">{t("agents.promo.meta")}</span>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("agents.promo.dismiss")}
            className="-my-2 -mr-2 inline-flex size-8 items-center justify-center text-subtle transition-colors hover:text-fg"
          >
            <X size={14} aria-hidden />
          </button>
        </span>
      }
      bodyClassName="p-0"
    >
      <p className="px-4 pt-4 text-[13px] leading-relaxed text-muted sm:px-5">{t("agents.promo.body")}</p>
      <ul className="mt-4 grid gap-px border-t border-line bg-line sm:grid-cols-3">
        {FEATURED.map((id) => {
          const agent = getAgent(id);
          if (!agent) return null;
          return (
            <li key={id} className="min-w-0 bg-surface">
              <Link href={`/agents/${id}`} className="group flex h-full items-start gap-3 p-4 transition-colors hover:bg-surface-2 sm:p-5">
                <AgentIcon icon={agent.icon} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] uppercase tracking-wide text-fg">{agentText(t, id, "name", agent.name)}</span>
                  <span className="mt-1 block text-[12px] leading-relaxed text-muted">{agentText(t, id, "tagline", agent.tagline)}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-[12px] uppercase tracking-wider text-accent">
                    {t("agents.promo.start")}
                    <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
