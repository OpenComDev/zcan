"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n";

/**
 * "Install app" button. Chromium browsers fire `beforeinstallprompt`, which we hold on to and
 * replay on click. iOS has no such event, so there the button opens a short Add to Home Screen hint.
 * Renders nothing when the app is already installed or the browser can't install it.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type Kind = "none" | "prompt" | "ios";

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIOS() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function getKind(): Kind {
  if (installed || isStandalone()) return "none";
  if (deferred) return "prompt";
  return isIOS() ? "ios" : "none";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", cb);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", cb);
  };
}

export function useInstallKind(): Kind {
  return useSyncExternalStore(subscribe, getKind, () => "none");
}

export function InstallButton({ className = "" }: { className?: string }) {
  const t = useT();
  const kind = useInstallKind();
  const [hint, setHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const hintId = useId();

  useEffect(() => {
    if (!hint) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setHint(false);
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setHint(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [hint]);

  if (kind === "none") return null;

  const onClick = async () => {
    if (kind === "ios") {
      setHint((h) => !h);
      return;
    }
    const ev = deferred;
    if (!ev) return;
    setBusy(true);
    try {
      await ev.prompt();
      await ev.userChoice;
    } catch {
      // The prompt can only be shown once; fall through and hide the button.
    } finally {
      deferred = null;
      setBusy(false);
      emit();
    }
  };

  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-expanded={kind === "ios" ? hint : undefined}
        aria-controls={kind === "ios" ? hintId : undefined}
        className={`inline-flex h-9 min-w-9 items-center justify-center gap-2 border border-line px-2.5 text-[12px] font-medium uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-fg disabled:cursor-progress ${className}`}
      >
        <Download size={14} aria-hidden />
        <span className="sr-only sm:not-sr-only">{t("misc.install.button")}</span>
      </button>
      {kind === "ios" && hint && (
        <span
          id={hintId}
          role="note"
          className="absolute right-0 top-full z-50 mt-2 flex w-64 items-start gap-2 border border-line-strong bg-surface p-3 text-[12px] normal-case leading-relaxed tracking-normal text-muted shadow-pop"
        >
          <span className="min-w-0 flex-1">
            {t("misc.install.hint")
              .split(/(\{share\}|\{add\})/)
              .map((part, i) =>
                part === "{share}" ? (
                  <span key={i}>
                    <Share size={13} className="inline -translate-y-px text-fg" aria-hidden /> <span className="text-fg">{t("misc.install.share")}</span>
                  </span>
                ) : part === "{add}" ? (
                  <span key={i} className="text-fg">
                    {t("misc.install.add")}
                  </span>
                ) : (
                  part
                ),
              )}
          </span>
          <button
            type="button"
            onClick={() => setHint(false)}
            aria-label={t("misc.install.closeHint")}
            className="-m-1 inline-flex size-6 shrink-0 items-center justify-center text-subtle hover:text-fg"
          >
            <X size={14} aria-hidden />
          </button>
        </span>
      )}
    </span>
  );
}
