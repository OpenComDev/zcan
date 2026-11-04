"use client";

import { useEffect } from "react";
import { alertValue, conditionMet, isArmed, markFired, setArmed, useAlerts, type Alert } from "@/lib/alerts";
import { feedback } from "@/lib/feedback";
import { useT } from "@/lib/i18n";
import { useLivePrices } from "@/lib/live-prices";
import { alertNow, alertTitle } from "./format";
import { notify } from "./notify";
import { AlertToasts, pushToast } from "./toast";

/** A repeating alert re-arms once the value is back past the threshold by this fraction. */
const HYSTERESIS = 0.003;

/**
 * Checks price/rate alerts against the live feed while this tab is open. Mount once in the app shell.
 * Renders only the (empty until needed) toast region; opens the price stream only when an alert is armed.
 */
export function AlertWatcher() {
  const alerts = useAlerts();
  const watching = alerts.some((a) => isArmed(a) || a.repeat);
  return (
    <>
      {watching && <Watch alerts={alerts} />}
      <AlertToasts />
    </>
  );
}

function Watch({ alerts }: { alerts: Alert[] }) {
  const { ticks } = useLivePrices();
  const t = useT();

  useEffect(() => {
    for (const a of alerts) {
      const v = alertValue(a, ticks);
      if (v == null) continue;
      if (a.repeat && a.armed === false) {
        const back = a.op === "above" ? v < a.value * (1 - HYSTERESIS) : v > a.value * (1 + HYSTERESIS);
        if (back) setArmed(a.id);
        continue;
      }
      if (!isArmed(a) || !conditionMet(a.op, v, a.value)) continue;
      if (!markFired(a.id, v)) continue;
      const title = alertTitle(a, t);
      const body = t("markets.notifyBody", { now: a.kind === "price" ? alertNow("price", v, t) : alertNow("rate", v, t, a.from, a.to) });
      const hidden = document.visibilityState === "hidden";
      if (!(hidden && notify(title, body, `zcan-alert-${a.id}`))) pushToast({ title, body });
      feedback("alert");
    }
  }, [alerts, ticks, t]);

  return null;
}
