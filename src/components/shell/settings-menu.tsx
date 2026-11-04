"use client";

import { Settings2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ReportingToggle } from "@/components/prefs/reporting-toggle";
import { SoundHapticsToggle } from "@/components/prefs/sound-haptics-toggle";
import { PerfToggle } from "@/lib/perf/perf-toggle";
import { ThemeToggle } from "@/components/prefs/theme-toggle";
import { useT } from "@/lib/i18n";
import { LanguageMenu } from "./language-menu";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-3.5 first:border-t-0">
      <h3 className="micro mb-2.5">{title}</h3>
      {children}
    </section>
  );
}

/** The panel's contents; also rendered inline in the mobile menu. */
export function SettingsPanel() {
  const t = useT();
  return (
    <>
      <Section title={t("shell.settings.theme")}>
        <ThemeToggle heading={false} />
      </Section>
      <Section title={t("shell.settings.language")}>
        <LanguageMenu className="flex w-full [&>select]:w-full" />
      </Section>
      <Section title={t("shell.settings.effects")}>
        <PerfToggle heading={false} />
      </Section>
      <Section title={t("shell.settings.sound")}>
        <SoundHapticsToggle heading={false} />
      </Section>
      <Section title={t("shell.settings.privacy")}>
        <ReportingToggle />
      </Section>
    </>
  );
}

/** Gear button in the top bar opening a small, non-modal settings popover. */
export function SettingsMenu() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t("shell.settings.title")}
        className={`inline-flex size-9 items-center justify-center border transition-colors ${
          open ? "border-line-strong text-fg" : "border-line text-muted hover:border-line-strong hover:text-fg"
        }`}
      >
        <Settings2 size={15} aria-hidden />
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label={t("shell.settings.title")}
          className="fade-up absolute right-0 top-[calc(100%+8px)] z-50 max-h-[calc(100dvh-80px)] w-[300px] max-w-[calc(100vw-32px)] overflow-y-auto overscroll-contain border border-line-strong bg-surface shadow-pop"
        >
          <p className="panel-head">
            <span className="label">{t("shell.settings.title")}</span>
          </p>
          <SettingsPanel />
        </div>
      )}
    </div>
  );
}
