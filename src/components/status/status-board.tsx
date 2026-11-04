"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Panel } from "@/components/hud/panel";
import { Sparkline } from "@/components/hud/sparkline";
import { useT, type Vars } from "@/lib/i18n";
import { useLivePrices, type LiveStatus } from "@/lib/live-prices";
import { useClock, useLatency } from "@/lib/telemetry";
import type { HealthCheck } from "@/app/api/health/route";
import { refreshHealth, useHealth } from "./health-store";
import { AI_MODEL_NAME } from "@/lib/ai-model";

type Tone = "ok" | "warn" | "bad" | "wait";

const DOT: Record<Tone, string> = { ok: "bg-green", warn: "bg-warn", bad: "bg-red", wait: "bg-subtle" };
const TEXT: Record<Tone, string> = { ok: "text-green", warn: "text-warn", bad: "text-red", wait: "text-subtle" };

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const ms = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function StatusDot({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[12px] uppercase tracking-wider ${TEXT[tone]}`}>
      <span className={`size-2 shrink-0 rounded-full ${DOT[tone]}`} aria-hidden />
      {label}
    </span>
  );
}

type Translate = (key: string, vars?: Vars) => string;

function checkTone(s: HealthCheck, t: Translate): { tone: Tone; label: string } {
  if (s.ok) return { tone: "ok", label: s.kind === "config" ? t("status.configured") : t("status.operational") };
  if (s.kind === "config") return { tone: s.optional ? "wait" : "warn", label: t("status.notConfigured") };
  return { tone: "bad", label: t("status.down") };
}

function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

const FEED: Record<LiveStatus, { tone: Tone; key: string }> = {
  idle: { tone: "wait", key: "status.notStarted" },
  connecting: { tone: "wait", key: "shell.connecting" },
  live: { tone: "ok", key: "common.live" },
  reconnecting: { tone: "warn", key: "shell.reconnecting" },
};

export function StatusBoard() {
  const t = useT();
  const health = useHealth();
  const { status: feed, ticks } = useLivePrices();
  const appLatency = useLatency();
  const now = useClock();
  const online = useOnline();

  const services = health.data?.services ?? [];
  const failing = services.filter((s) => !s.ok && !s.optional);
  const lastTick = Object.values(ticks).reduce((m, t) => Math.max(m, t.at), 0);
  const tickAge = lastTick && now !== null ? Math.max(0, now - Math.floor(lastTick / 1000)) : null;

  let overall: { tone: Tone; title: string; body: string };
  if (!health.data && health.error) overall = { tone: "bad", title: t("status.unavailable"), body: t(health.error) };
  else if (!health.data) overall = { tone: "wait", title: t("status.checking"), body: t("status.firstRound") };
  else if (failing.length === 0) overall = { tone: "ok", title: t("status.allOk"), body: t("status.allOkBody") };
  else
    overall = {
      tone: "warn",
      title: t("status.degraded"),
      body: t(failing.length === 1 ? "status.issuesOne" : "status.issuesMany", { services: failing.map((s) => s.service).join(", ") }),
    };

  return (
    <div className="grid gap-3">
      <Panel
        title={t("status.title")}
        marks
        meta={
          <button
            type="button"
            onClick={() => void refreshHealth()}
            disabled={health.checking}
            className="inline-flex h-7 items-center gap-1.5 border border-line px-2 uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-fg disabled:cursor-progress"
          >
            {health.checking ? <LoaderCircle size={12} className="animate-spin-slow" aria-hidden /> : <RefreshCw size={12} aria-hidden />}
            {t("status.checkNow")}
          </button>
        }
        bodyClassName="p-4 sm:p-6"
      >
        <div aria-live="polite" className="flex min-w-0 items-start gap-4">
          <span className={`mt-2 size-3 shrink-0 rounded-full ${DOT[overall.tone]} ${overall.tone === "ok" ? "pulse-dot" : ""}`} aria-hidden />
          <div className="min-w-0">
            <h1 className="text-[20px] font-medium uppercase tracking-wider text-fg text-balance sm:text-[24px]">{overall.title}</h1>
            <p className="mt-1 text-[13px] leading-relaxed text-muted text-pretty">{overall.body}</p>
            <p className="micro mt-3">
              {health.data ? t("status.lastChecked", { time: timeFmt.format(new Date(health.data.checkedAt)) }) : t("status.refreshes")}
              {health.data && health.error && <span className="text-warn"> · {t("status.latestFailed")}</span>}
            </p>
          </div>
        </div>
      </Panel>

      <Panel title={t("status.services")} meta={<span>{t("status.serverChecks")}</span>} bodyClassName="p-0">
        {services.length === 0 ? (
          <p className="micro hatch px-4 py-10 text-center">{health.error && !health.checking ? t("status.noResults") : t("status.checkingServices")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {services.map((s) => {
              const tone = checkTone(s, t);
              const hist = health.history[s.id] ?? [];
              return (
                <li key={s.id} className="grid min-w-0 gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] uppercase tracking-wide text-fg">{s.service}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <StatusDot tone={tone.tone} label={tone.label} />
                      <span className="min-w-0 break-words text-[12px] text-muted">{s.detail}</span>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-[12px] uppercase">
                    <div>
                      <dt className="micro">{t("shell.latency")}</dt>
                      <dd className="tabular mt-0.5 text-fg">{s.latencyMs != null ? `${ms.format(s.latencyMs)} ms` : "—"}</dd>
                    </div>
                    <div>
                      <dt className="micro">{t("status.checked")}</dt>
                      <dd className="tabular mt-0.5 text-fg">{timeFmt.format(new Date(s.checkedAt))}</dd>
                    </div>
                  </dl>
                  {s.kind === "probe" ? (
                    <Sparkline values={[...hist]} height={32} label={t("status.latencyLabel", { service: s.service })} />
                  ) : (
                    <span className="micro hidden sm:block">{t("status.notProbed")}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title={t("status.thisBrowser")} meta={<span>{t("status.onDevice")}</span>} bodyClassName="p-0">
        <ul className="divide-y divide-line">
          <BrowserRow
            name={t("status.network")}
            status={online ? { tone: "ok", label: t("status.online") } : { tone: "bad", label: t("status.offline") }}
            detail={online ? t("status.onlineDetail") : t("status.offlineDetail")}
          />
          <BrowserRow
            name={t("status.coinbaseFeed")}
            status={{ tone: FEED[feed].tone, label: t(FEED[feed].key) }}
            detail={tickAge !== null ? t("status.lastTick", { n: tickAge }) : t("status.realtime")}
          />
          <BrowserRow
            name={t("status.apiRoundTrip")}
            status={
              health.roundTrip === null
                ? { tone: "wait", label: t("status.measuring") }
                : health.roundTrip > 1500
                  ? { tone: "warn", label: t("status.slow") }
                  : { tone: "ok", label: t("status.normal") }
            }
            detail={t("status.lastApiCall", { value: appLatency !== null ? `${ms.format(appLatency)} ms` : "—" })}
            latency={health.roundTrip}
            history={health.history.app}
          />
        </ul>
      </Panel>

      <p className="micro normal-case leading-relaxed tracking-normal">
        {t("status.footnote", { model: AI_MODEL_NAME })}
      </p>
    </div>
  );
}

function BrowserRow({
  name,
  status,
  detail,
  latency,
  history,
}: {
  name: string;
  status: { tone: Tone; label: string };
  detail: string;
  latency?: number | null;
  history?: readonly number[];
}) {
  const t = useT();
  return (
    <li className="grid min-w-0 gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px] sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-[13px] uppercase tracking-wide text-fg">{name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusDot tone={status.tone} label={status.label} />
          <span className="tabular min-w-0 break-words text-[12px] text-muted">{detail}</span>
        </div>
      </div>
      <dl className="text-[12px] uppercase">
        {latency !== undefined && (
          <div>
            <dt className="micro">{t("status.roundTrip")}</dt>
            <dd className="tabular mt-0.5 text-fg">{latency != null ? `${ms.format(latency)} ms` : "—"}</dd>
          </div>
        )}
      </dl>
      {history ? <Sparkline values={[...history]} height={32} label={t("status.sessionLabel", { name })} /> : <span className="hidden sm:block" aria-hidden />}
    </li>
  );
}
