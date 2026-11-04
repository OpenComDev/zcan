"use client";

import { BellRing, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n";

export type Toast = { id: string; title: string; body?: string };

const EMPTY: Toast[] = [];
const TTL = 15_000;
let toasts: Toast[] = EMPTY;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/** Show an in-app toast. It closes on its own after 15 s. */
export function pushToast(t: Omit<Toast, "id">) {
  const id = Math.random().toString(36).slice(2, 10);
  toasts = [...toasts, { ...t, id }].slice(-4);
  emit();
  setTimeout(() => dismissToast(id), TTL);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Polite live region with the current toasts. Always rendered so screen readers pick up new ones. */
export function AlertToasts() {
  const list = useSyncExternalStore(subscribe, () => toasts, () => EMPTY);
  const t = useT();
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 grid justify-items-end gap-2 sm:left-auto sm:w-[360px]"
    >
      {list.map((toast) => (
        <div key={toast.id} className="fade-up pointer-events-auto flex w-full items-start gap-3 border border-accent/50 bg-surface p-3 shadow-toast">
          <BellRing size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="break-words text-[13px] uppercase text-fg">{toast.title}</p>
            {toast.body && <p className="mt-1 break-words text-[12px] text-muted">{toast.body}</p>}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label={t("markets.dismissAlert")}
            className="-m-1 inline-flex size-8 shrink-0 items-center justify-center text-muted hover:bg-surface-3 hover:text-fg"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
