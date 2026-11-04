"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Panel } from "@/components/hud/panel";
import { agentText, getAgent } from "@/lib/agents";
import { useContributions, withdrawContribution } from "@/lib/contributions";
import { useLocale, useT } from "@/lib/i18n";

/** Runs this browser shared as training data, each withdrawable. Hidden when there are none. */
export function ContributionsPanel() {
  const list = useContributions();
  const t = useT();
  const dateFmt = new Intl.DateTimeFormat(useLocale(), { dateStyle: "medium" });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  // Stay visible after the last withdrawal so the confirmation is still seen.
  if (list.length === 0 && !message) return null;

  const withdraw = async (id: string) => {
    const c = list.find((x) => x.id === id);
    if (!c) return;
    setBusy(id);
    const ok = await withdrawContribution(c);
    setBusy(null);
    setMessage(ok ? t("agents.share.withdrawn") : t("agents.share.err.withdraw"));
  };

  return (
    <Panel id="shared-runs" title={t("agents.share.panelTitle")} meta={<span className="tabular">{list.length}</span>} bodyClassName="p-0" className="scroll-mt-20">
      <p className="px-4 pt-4 text-[13px] leading-relaxed text-muted sm:px-5">{t("agents.share.panelBody")}</p>
      <ul className="mt-3 divide-y divide-line border-t border-line">
        {list.map((c) => {
          const agent = getAgent(c.agentId);
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <span className="min-w-0">
                <span className="block truncate text-[13px] uppercase text-text">{agent ? agentText(t, agent.id, "name", agent.name) : c.agentId}</span>
                <span className="tabular block text-[11px] text-subtle">{dateFmt.format(new Date(c.sharedAt))}</span>
              </span>
              <button
                type="button"
                onClick={() => withdraw(c.id)}
                disabled={busy === c.id}
                className="inline-flex h-9 items-center gap-2 border border-line px-3 text-[12px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-60"
              >
                {busy === c.id && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {t("agents.share.withdraw")}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="px-4 pb-3 text-[12px] text-muted sm:px-5" role="status" aria-live="polite">
        {message}
      </p>
    </Panel>
  );
}
