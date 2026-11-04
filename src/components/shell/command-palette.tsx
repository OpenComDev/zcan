"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftRight, Bot, CornerDownLeft, Radar, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useHistory } from "@/lib/history";
import { TONE_CLASS } from "@/lib/status";
import { useStatusMeta } from "@/lib/use-status";
import { formatAmount, isZec } from "@/lib/tokens";
import { useTokens } from "@/lib/use-tokens";
import { useLocalePath, useT } from "@/lib/i18n";
import { stripLocale } from "@/lib/locales";
import { SELECT_PAIR_EVENT } from "../exchange-widget";
import { ACTION_LINKS, AGENT_LINKS, NAV, TOOL_LINKS } from "./nav";

type Item = { id: string; group: string; label: string; hint?: string; href: string; icon: React.ElementType; tone?: string; /** English text, so English searches still match in other languages. */ en?: string };

/** ⌘K palette: jump to a view, start a swap from an asset, or reopen an order. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const lp = useLocalePath();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const { tokens } = useTokens();
  const history = useHistory();
  const listId = useId();
  const t = useT();
  const statusMeta = useStatusMeta();

  useEffect(() => {
    const d = dialogRef.current!;
    if (open && !d.open) {
      setQ("");
      setActive(0);
      d.showModal();
      inputRef.current?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase();
    // Falls back to the English text when a key has no translation yet.
    const tr = (key: string, fallback: string) => {
      const out = t(key);
      return out === key ? fallback : out;
    };
    const pages: Item[] = NAV.map((n) => ({
      id: `p:${n.href}`,
      group: t("shell.groupViews"),
      label: tr(`shell.nav.${n.id}`, n.label),
      hint: tr(`shell.hint.${n.id}`, n.hint),
      href: n.href,
      icon: n.icon,
      en: `${n.label} ${n.hint}`,
    }));
    const tools: Item[] = TOOL_LINKS.map((l) => ({
      id: `t:${l.href}`,
      group: t("shell.groupTools"),
      label: tr(`shell.tool.${l.id}`, l.label),
      hint: tr(`shell.toolHint.${l.id}`, l.hint),
      href: l.href,
      icon: l.icon,
      en: `${l.label} ${l.hint}`,
    }));
    const actions: Item[] = ACTION_LINKS.map((l) => ({
      id: `x:${l.href}:${l.id}`,
      group: t("shell.groupActions"),
      label: tr(`shell.action.${l.id}`, l.label),
      hint: tr(`shell.actionHint.${l.id}`, l.hint),
      href: l.href,
      icon: l.icon,
      en: `${l.label} ${l.hint}`,
    }));
    const agents: Item[] = AGENT_LINKS().map((a) => {
      const id = a.href.split("/").pop();
      return {
        id: `g:${a.href}`,
        group: t("shell.groupAgents"),
        label: tr(`agents.def.${id}.name`, a.label),
        hint: tr(`agents.def.${id}.tagline`, a.hint),
        href: a.href,
        icon: Bot,
        en: `${a.label} ${a.hint}`,
      };
    });
    const assets: Item[] = tokens
      .filter((tok) => !isZec(tok))
      .slice(0, needle ? 200 : 6)
      .map((tok) => ({
        id: `a:${tok.id}`,
        group: t("shell.groupSwap"),
        label: `${tok.symbol} → ZEC`,
        hint: tok.chainName,
        href: `/?from=${tok.symbol}.${tok.chain}&to=ZEC.zec`,
        icon: ArrowLeftRight,
      }));
    const orders: Item[] = history.slice(0, 8).map((h) => {
      const m = statusMeta(h.status);
      return {
        id: `o:${h.depositAddress}`,
        group: t("shell.orders"),
        label: `${formatAmount(h.amountIn)} ${h.fromSymbol} → ${h.toSymbol}`,
        hint: m.label,
        href: `/order/${encodeURIComponent(h.depositAddress)}${h.depositMemo ? `?memo=${encodeURIComponent(h.depositMemo)}` : ""}`,
        icon: Radar,
        tone: TONE_CLASS[m.tone],
      };
    });
    if (!needle) return [...pages, ...orders, ...assets];
    const all = [...pages, ...actions, ...tools, ...agents, ...orders, ...assets];
    return all.filter((i) => `${i.label} ${i.hint ?? ""} ${i.en ?? ""}`.toLowerCase().includes(needle)).slice(0, 40);
  }, [q, tokens, history, t, statusMeta]);

  const go = (item: Item) => {
    onClose();
    // Already on the swap view: retarget the form in place instead of navigating.
    if (item.href.startsWith("/?") && stripLocale(window.location.pathname).path === "/") {
      const p = new URLSearchParams(item.href.slice(2));
      window.dispatchEvent(new CustomEvent(SELECT_PAIR_EVENT, { detail: { from: p.get("from"), to: p.get("to") } }));
      return;
    }
    router.push(lp(item.href));
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      aria-label={t("shell.searchLabel")}
      className="mx-auto mt-[12vh] w-[calc(100%-32px)] max-w-[560px] overscroll-contain border border-line-strong bg-surface p-0 text-text shadow-modal backdrop:bg-scrim"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search size={16} className="text-subtle" aria-hidden />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && items[active]) {
              e.preventDefault();
              go(items[active]);
            }
          }}
          placeholder={t("shell.palettePlaceholder")}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          className="h-12 flex-1 bg-transparent text-base uppercase tracking-wide text-fg outline-none placeholder:text-subtle"
        />
        <kbd className="micro border border-line px-1.5 py-0.5">Esc</kbd>
      </div>
      <ul id={listId} role="listbox" aria-label={t("shell.results")} className="max-h-[52vh] overflow-y-auto overscroll-contain py-2">
        {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">{t("shell.noMatches")}</li>}
        {items.map((item, i) => {
          const showGroup = i === 0 || items[i - 1].group !== item.group;
          const Icon = item.icon;
          return (
            <li key={item.id} role="presentation">
              {showGroup && <p className="micro px-4 pb-1 pt-3">{item.group}</p>}
              <div
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onClick={() => go(item)}
                onMouseMove={() => active !== i && setActive(i)}
                className={`mx-2 flex cursor-pointer items-center gap-3 px-3 py-2.5 text-[13px] uppercase ${i === active ? "bg-surface-3 text-fg" : "text-muted"}`}
              >
                <Icon size={15} className={item.tone ?? "text-subtle"} aria-hidden />
                <span className="flex-1 truncate">{item.label}</span>
                {item.hint && <span className="micro truncate">{item.hint}</span>}
                {i === active && <CornerDownLeft size={13} className="text-subtle" aria-hidden />}
              </div>
            </li>
          );
        })}
      </ul>
    </dialog>
  );
}
