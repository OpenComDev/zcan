"use client";

import { BarChart3, Bug } from "lucide-react";
import Link from "@/components/locale-link";
import { analyticsOn } from "@/lib/analytics";
import { useT } from "@/lib/i18n";
import { setReportingPrefs, useReportingPrefs } from "@/lib/reporting-prefs";
import { Switch } from "./sound-haptics-toggle";

/** Settings → Privacy: anonymous crash reports, and cookieless usage counts when analytics is set up. */
export function ReportingToggle() {
  const t = useT();
  const prefs = useReportingPrefs();
  return (
    <div role="group" aria-label={t("shell.settings.privacy")} className="grid gap-1">
      <Switch
        icon={<Bug size={14} aria-hidden />}
        label={t("prefs.reporting.crash")}
        hint={t("prefs.reporting.crashHint")}
        checked={prefs.crash}
        onChange={(crash) => setReportingPrefs({ crash })}
        on={t("prefs.feedback.on")}
        off={t("prefs.feedback.off")}
      />
      {analyticsOn() && (
        <Switch
          icon={<BarChart3 size={14} aria-hidden />}
          label={t("prefs.reporting.usage")}
          hint={t("prefs.reporting.usageHint")}
          checked={prefs.usage}
          onChange={(usage) => setReportingPrefs({ usage })}
          on={t("prefs.feedback.on")}
          off={t("prefs.feedback.off")}
        />
      )}
      <p className="micro min-w-0 px-1 pt-1">
        {t("prefs.reporting.note")} ·{" "}
        <Link href="/transparency" className="underline decoration-line-strong underline-offset-2 hover:text-fg">
          {t("shell.crumb.transparency")}
        </Link>
      </p>
    </div>
  );
}
