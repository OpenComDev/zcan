"use client";

import { Play, Vibrate, Volume2 } from "lucide-react";
import { useId, useSyncExternalStore, type ReactNode } from "react";
import { canVibrate, feedback, setFeedbackPrefs, useFeedbackPrefs } from "@/lib/feedback";
import { useT } from "@/lib/i18n";

const noop = () => () => {};

/** "Sound effects" and "Vibration" switches (both off by default) with a Preview button. */
export function SoundHapticsToggle({ heading = true }: { heading?: boolean }) {
  const t = useT();
  const prefs = useFeedbackPrefs();
  // Assume support on the server so the "not supported" note never flashes in on hydration.
  const vibrates = useSyncExternalStore(noop, canVibrate, () => true);
  const headId = useId();
  const noteId = useId();

  return (
    <div role="group" aria-labelledby={heading ? headId : undefined} aria-label={heading ? undefined : t("prefs.feedback.title")} className="grid gap-1">
      {heading && (
        <h3 id={headId} className="label px-1 pb-1">
          {t("prefs.feedback.title")}
        </h3>
      )}
      <Switch
        icon={<Volume2 size={14} aria-hidden />}
        label={t("prefs.feedback.sound")}
        hint={t("prefs.feedback.soundHint")}
        checked={prefs.sound}
        onChange={(sound) => {
          setFeedbackPrefs({ sound });
          // The click is a user gesture: a confirming blip also unlocks audio for later sounds.
          if (sound) feedback("tap", { sound: true, haptics: false });
        }}
        on={t("prefs.feedback.on")}
        off={t("prefs.feedback.off")}
      />
      <Switch
        icon={<Vibrate size={14} aria-hidden />}
        label={t("prefs.feedback.haptics")}
        hint={vibrates ? t("prefs.feedback.hapticsHint") : t("prefs.feedback.noVibrate")}
        hintId={vibrates ? undefined : noteId}
        checked={vibrates && prefs.haptics}
        disabled={!vibrates}
        onChange={(haptics) => {
          setFeedbackPrefs({ haptics });
          if (haptics) feedback("tap", { sound: false, haptics: true });
        }}
        on={t("prefs.feedback.on")}
        off={t("prefs.feedback.off")}
      />
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-1 pt-1">
        <p className="micro min-w-0">{t("prefs.feedback.note")}</p>
        <button
          type="button"
          onClick={() => feedback("success", { sound: true, haptics: vibrates })}
          aria-label={t("prefs.feedback.previewLabel")}
          className="inline-flex h-8 shrink-0 touch-manipulation items-center gap-1.5 border border-line px-2.5 text-[11px] uppercase tracking-wider text-muted transition-colors duration-150 hover:border-line-strong hover:text-text focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Play size={11} aria-hidden /> {t("prefs.feedback.preview")}
        </button>
      </div>
    </div>
  );
}

/** A labelled on/off switch row, shared by the settings panel. */
export function Switch({
  icon,
  label,
  hint,
  hintId,
  checked,
  disabled,
  onChange,
  on,
  off,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  hintId?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  on: string;
  off: string;
}) {
  const id = useId();
  const descId = hintId ?? `${id}-hint`;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      aria-labelledby={`${id}-label`}
      aria-describedby={descId}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className="group flex min-h-11 w-full min-w-0 touch-manipulation items-center gap-3 px-1 py-2 text-left transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent aria-disabled:cursor-not-allowed"
    >
      <span className={`shrink-0 ${checked ? "text-accent" : "text-subtle"}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span id={`${id}-label`} className={`block text-[12px] font-medium uppercase tracking-wider ${disabled ? "text-subtle" : "text-text"}`}>
          {label}
        </span>
        <span id={descId} className="block text-[11px] text-subtle">
          {hint}
        </span>
      </span>
      <span className="micro hidden shrink-0 tabular sm:inline" aria-hidden>
        {checked ? on : off}
      </span>
      <span
        aria-hidden
        className={`relative h-5 w-9 shrink-0 border transition-colors duration-200 ${
          checked ? "border-accent bg-accent/20" : "border-line-strong bg-surface-3"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 size-3.5 transition-transform duration-200 motion-reduce:transition-none ${
            checked ? "translate-x-4 bg-accent" : "bg-muted"
          }`}
        />
      </span>
    </button>
  );
}
