"use client";

import { useEffect, useRef } from "react";
import { feedback } from "./feedback";
import { updateHistoryStatus, useHistory } from "./history";
import { isFinal } from "./status";

const POLL_MS = 10_000;

/** Keeps statuses of this browser's active swaps fresh so the alert feed stays live. */
export function useOrderWatcher() {
  const history = useHistory();
  const active = history.filter((h) => !isFinal(h.status)).slice(0, 12);
  const key = active.map((a) => `${a.depositAddress}|${a.depositMemo ?? ""}|${a.via ?? ""}`).join(",");
  const seen = useRef<Map<string, string> | null>(null);

  // Sound/vibration (if turned on) when an order this tab saw in progress reaches a final status —
  // whether this watcher or the order page polled it. Orders already final on load stay quiet.
  useEffect(() => {
    const prev = seen.current;
    seen.current = new Map(history.map((h) => [h.depositAddress, h.status ?? ""]));
    if (!prev) return;
    const ended = history.filter((h) => isFinal(h.status) && prev.has(h.depositAddress) && !isFinal(prev.get(h.depositAddress)));
    if (ended.some((h) => h.status === "SUCCESS")) feedback("success");
    else if (ended.length) feedback("refund");
  }, [history]);

  useEffect(() => {
    // A backup import or "forget everything" replaces the list — re-seed instead of treating it as transitions.
    const reseed = () => {
      seen.current = null;
    };
    window.addEventListener("zcan:local", reseed);
    return () => window.removeEventListener("zcan:local", reseed);
  }, []);

  useEffect(() => {
    if (!key) return;
    const targets = key.split(",").map((k) => k.split("|"));
    let alive = true;
    const poll = async () => {
      if (document.hidden) return;
      for (const [address, memo, via] of targets) {
        try {
          const qs = new URLSearchParams({ address });
          if (memo) qs.set("memo", memo);
          if (via) qs.set("via", via);
          const res = await fetch(`/api/status?${qs}`, { cache: "no-store" });
          if (!alive) return;
          if (res.ok) updateHistoryStatus(address, (await res.json()).status);
        } catch {
          // Offline — try again next tick.
        }
      }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [key]);
}
