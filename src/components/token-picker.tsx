"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { formatUsd, isZec, type Token } from "@/lib/tokens";
import { TokenIcon } from "./token-icon";

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (t: Token) => void;
  tokens: Token[];
  selectedId?: string;
  title: string;
};

export function TokenPicker({ open, onClose, onSelect, tokens, selectedId, title }: Props) {
  const t = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const titleId = useId();

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      setQuery("");
      setActive(0);
      d.showModal();
      // Autofocus search only where a keyboard is likely.
      if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    // ZEC is always pinned first.
    const ordered = [...tokens.filter(isZec), ...tokens.filter((t) => !isZec(t))];
    if (!q) return ordered;
    return ordered.filter(
      (t) => t.symbol.toLowerCase().includes(q) || t.chainName.toLowerCase().includes(q) || t.contract?.toLowerCase() === q,
    );
  }, [tokens, query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (t: Token) => {
    onSelect(t);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      choose(results[active]);
    }
  };

  const quick = tokens.filter((t) => ["BTC:btc", "ETH:eth", "USDT:eth", "SOL:sol", "USDC:eth", "ZEC:zec"].includes(`${t.symbol}:${t.chain}`));

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      aria-labelledby={titleId}
      className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[85dvh] w-full max-w-[460px] overscroll-contain rounded-t-3xl border border-line bg-bg-2 p-0 text-text shadow-2xl backdrop:bg-scrim backdrop:backdrop-blur-sm sm:inset-0 sm:m-auto sm:h-[600px] sm:max-h-[85dvh] sm:rounded-3xl"
    >
      <div className="flex h-full max-h-[85dvh] flex-col sm:max-h-none">
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="inline-flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="px-5">
          <label className="flex h-12 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 focus-within:border-accent/60">
            <Search size={18} className="text-subtle" aria-hidden />
            <span className="sr-only">{t("swap.picker.search")}</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={t("swap.picker.placeholder")}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
              autoComplete="off"
              spellCheck={false}
              className="h-full w-full bg-transparent text-base text-fg outline-none placeholder:text-subtle"
            />
          </label>

          {!query && quick.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {quick.map((tk) => (
                <button
                  key={tk.id}
                  type="button"
                  onClick={() => choose(tk)}
                  className="inline-flex h-9 items-center gap-1.5 border border-line bg-surface px-2.5 pr-3 text-sm font-medium transition-colors hover:border-accent/50"
                >
                  <TokenIcon symbol={tk.symbol} size={20} />
                  {tk.symbol}
                  {tk.symbol.startsWith("USD") && <span className="text-xs text-subtle">{tk.chainName}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <ul ref={listRef} id={listId} role="listbox" aria-label={t("swap.picker.assets")} className="mt-3 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
          {results.length === 0 && <li className="px-3 py-10 text-center text-sm text-muted">{t("swap.picker.noMatch", { query })}</li>}
          {results.map((tk, i) => {
            const selected = tk.id === selectedId;
            return (
              <li
                key={tk.id}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={selected}
                onClick={() => choose(tk)}
                onMouseMove={() => active !== i && setActive(i)}
                className={`lazy-row flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${
                  i === active ? "bg-surface-2" : ""
                } ${selected ? "ring-1 ring-accent/50" : ""}`}
              >
                <TokenIcon symbol={tk.symbol} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-fg" translate="no">
                      {tk.symbol}
                    </span>
                    <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[11px] font-medium text-muted">{tk.chainName}</span>
                    {isZec(tk) && <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[11px] font-medium text-accent">{t("swap.picker.native")}</span>}
                  </span>
                </span>
                <span className="tabular text-sm text-muted">{formatUsd(tk.price)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </dialog>
  );
}
