"use client";

import { CloudOff, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n";

/**
 * Proof that a tool works on this device: a "works offline" badge, the live connection state,
 * and a count of the network requests the page made while the tool ran.
 *
 * Counting uses the browser's own Resource Timing records (a PerformanceObserver, plus the buffered
 * entries as a fallback). Every http(s) request this page starts inside the window is counted, including
 * ones the tool didn't cause, so the number can only err on the high side. Two kinds are kept apart:
 * - Zcan's own content-hashed code files (/_next/static/…), e.g. a lazily loaded module: app code coming in, not data going out.
 * - everything else, listed by host so the reader can see where it went.
 * blob: and data: URLs never leave the device and aren't counted. WebSocket traffic isn't reported by the
 * browser, which is why the badge counts requests rather than claiming "no traffic at all".
 */

/** Requests that start this soon after the work finishes still count, to catch anything it set off. */
const SETTLE_MS = 300;

export type ProofPhase = "read" | "clean";

export type ProofRun =
  | { state: "counting"; phase: ProofPhase }
  | { state: "done"; phase: ProofPhase; requests: number; hosts: string[]; appFiles: number }
  | { state: "unsupported"; phase: ProofPhase };

type Span = { t0: number; phase: ProofPhase; seen: Map<string, PerformanceResourceTiming>; observer: PerformanceObserver | null; id: number };

const supported = () => typeof performance !== "undefined" && typeof performance.getEntriesByType === "function";

const key = (e: PerformanceResourceTiming) => `${e.name}@${e.startTime}`;

function classify(entries: PerformanceResourceTiming[]) {
  let appFiles = 0;
  const hosts = new Set<string>();
  let requests = 0;
  for (const e of entries) {
    let url: URL;
    try {
      url = new URL(e.name, location.href);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    if (url.origin === location.origin && url.pathname.startsWith("/_next/static/")) {
      appFiles++;
      continue;
    }
    requests++;
    hosts.add(url.origin === location.origin ? url.pathname : url.host);
  }
  return { requests, hosts: [...hosts], appFiles };
}

/**
 * `const proof = useLocalProof(); proof.start("clean"); …work…; proof.end();`
 * Show the result with `<LocalProof run={proof.run} tool="link" />`.
 */
export function useLocalProof() {
  const [run, setRun] = useState<ProofRun | null>(null);
  const current = useRef<Span | null>(null);
  const counter = useRef(0);
  useEffect(
    () => () => {
      current.current?.observer?.disconnect();
      counter.current++;
    },
    [],
  );

  const start = useCallback((phase: ProofPhase = "clean") => {
    current.current?.observer?.disconnect();
    const id = ++counter.current;
    if (!supported()) {
      current.current = null;
      setRun({ state: "unsupported", phase });
      return;
    }
    const w: Span = { t0: performance.now(), phase, seen: new Map(), observer: null, id };
    try {
      w.observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries() as PerformanceResourceTiming[]) if (e.startTime >= w.t0) w.seen.set(key(e), e);
      });
      w.observer.observe({ type: "resource" });
    } catch {
      w.observer = null; // Older browsers: the buffered entries below still work.
    }
    current.current = w;
    setRun({ state: "counting", phase });
  }, []);

  const end = useCallback(() => {
    const w = current.current;
    if (!w) return;
    const t1 = performance.now();
    setTimeout(() => {
      // A newer run took over; it reports its own numbers.
      if (counter.current !== w.id) return;
      for (const e of (w.observer?.takeRecords() ?? []) as PerformanceResourceTiming[]) w.seen.set(key(e), e);
      w.observer?.disconnect();
      for (const e of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
        if (e.startTime >= w.t0) w.seen.set(key(e), e);
      }
      const inWindow = [...w.seen.values()].filter((e) => e.startTime >= w.t0 && e.startTime <= t1 + SETTLE_MS);
      current.current = null;
      setRun({ state: "done", phase: w.phase, ...classify(inWindow) });
    }, SETTLE_MS);
  }, []);

  const reset = useCallback(() => {
    current.current?.observer?.disconnect();
    current.current = null;
    counter.current++;
    setRun(null);
  }, []);

  return { run, start, end, reset };
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/** Small strip at the bottom of a cleaner. `tool` picks the "try it" hint. */
export function LocalProof({ run, tool }: { run: ProofRun | null; tool: "link" | "photo" | "doc" }) {
  const t = useT();
  const online = useOnline();

  let line: { text: string; tone: string };
  if (!run) line = { text: t("trust.proof.idle"), tone: "text-subtle" };
  else if (run.state === "unsupported") line = { text: t("trust.proof.unsupported"), tone: "text-subtle" };
  else if (run.state === "counting") line = { text: t("trust.proof.counting"), tone: "text-subtle" };
  else {
    const parts = [t(run.phase === "read" ? "trust.proof.result.read" : "trust.proof.result.clean", { n: run.requests })];
    if (run.hosts.length) parts.push(t("trust.proof.to", { hosts: run.hosts.join(", ") }));
    if (run.appFiles) parts.push(t(run.appFiles === 1 ? "trust.proof.appFiles.one" : "trust.proof.appFiles.other", { n: run.appFiles }));
    line = { text: parts.join(" · "), tone: run.requests === 0 ? "text-green" : "text-warn" };
  }

  return (
    <div role="group" aria-label={t("trust.proof.label")} className="mt-5 border-t border-line pt-3 text-[12px] leading-relaxed">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="tag shrink-0 gap-1 text-green">
          <CloudOff size={11} aria-hidden />
          {t("trust.proof.badge")}
        </span>
        <span className={`inline-flex min-w-0 items-center gap-1.5 ${online ? "text-muted" : "text-green"}`}>
          {online ? <Wifi size={13} className="shrink-0" aria-hidden /> : <WifiOff size={13} className="shrink-0" aria-hidden />}
          <span className="min-w-0">{online ? t(`trust.proof.try.${tool}`) : t("trust.proof.offline")}</span>
        </span>
      </div>
      <p aria-live="polite" className={`tabular mt-1.5 min-w-0 break-words ${line.tone}`}>
        {line.text}
      </p>
    </div>
  );
}
