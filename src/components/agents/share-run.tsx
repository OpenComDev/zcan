"use client";

import { Check, GraduationCap, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { useMemo, useState } from "react";
import { addContribution, useContributions, withdrawContribution } from "@/lib/contributions";
import { useT } from "@/lib/i18n";

type Offer = { draft: string; sig: string };
type Msg = { role: string; content?: string | null; tool_calls?: { function?: { name?: string; arguments?: string } }[] };

/** Readable view of exactly what would be shared — the same JSON the server signed. */
function useTranscript(draft: string) {
  return useMemo(() => {
    try {
      const d = JSON.parse(draft) as { plan: { messages: Msg[] }; run: { messages: Msg[] } };
      return { plan: d.plan.messages, run: d.run.messages };
    } catch {
      return null;
    }
  }, [draft]);
}

function Message({ m }: { m: Msg }) {
  const t = useT();
  const calls = (m.tool_calls ?? []).map((c) => {
    try {
      return String(JSON.parse(c.function?.arguments ?? "{}").query ?? "");
    } catch {
      return c.function?.arguments ?? "";
    }
  });
  const body = m.role === "tool" && m.content && m.content.length > 600 ? `${m.content.slice(0, 600)}…` : (m.content ?? "");
  return (
    <li className="border-t border-line py-3 first:border-t-0">
      <p className="micro mb-1.5">{t(`agents.share.role.${m.role}`)}</p>
      {calls.length > 0 && (
        <p className="mb-1.5 text-[12px] text-muted">
          {t("agents.share.searched")}: {calls.map((q) => `“${q}”`).join(", ")}
        </p>
      )}
      {body && <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-text/80">{body}</pre>}
    </li>
  );
}

/** "Help train Zcan's own model": opt-in, after the reader has seen the report. */
export function ShareRun({ offer, agentId }: { offer: Offer; agentId: string }) {
  const t = useT();
  const transcript = useTranscript(offer.draft);
  const contributions = useContributions();
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "dismissed" | "error">("idle");
  const [sharedId, setSharedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const shared = sharedId ? contributions.find((c) => c.id === sharedId) : undefined;

  if (!transcript || state === "dismissed") return null;

  const share = async () => {
    setState("sending");
    setMessage("");
    const res = await fetch("/api/training/contribute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft: offer.draft, sig: offer.sig, rating }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { id?: string; token?: string; code?: string; message?: string } | null;
    if (res?.ok && body?.id && body.token) {
      addContribution({ id: body.id, token: body.token, agentId, sharedAt: new Date().toISOString() });
      setSharedId(body.id);
      setState("idle");
      setMessage(t("agents.share.thanks"));
    } else {
      setState("error");
      const key = body?.code ? `agents.share.err.${body.code}` : "agents.share.err.network";
      const text = t(key);
      setMessage(text === key ? (body?.message ?? t("agents.share.err.network")) : text);
    }
  };

  const withdraw = async () => {
    if (!shared) return;
    setState("sending");
    const ok = await withdrawContribution(shared);
    setState(ok ? "idle" : "error");
    if (ok) setSharedId(null);
    setMessage(ok ? t("agents.share.withdrawn") : t("agents.share.err.withdraw"));
  };

  const busy = state === "sending";

  return (
    <section className="card-glow rounded-3xl p-5 sm:p-6" aria-labelledby="share-run-title">
      <h3 id="share-run-title" className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wider text-fg">
        <GraduationCap size={15} className="text-accent" aria-hidden /> {t("agents.share.title")}
      </h3>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">{t("agents.share.body")}</p>

      {shared ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-[13px] text-green">
            <Check size={15} aria-hidden /> {t("agents.share.done")}
          </span>
          <button
            type="button"
            onClick={withdraw}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 border border-line px-3.5 text-[12px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-60"
          >
            {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {t("agents.share.withdraw")}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label={t("agents.share.useful")}>
            <span className="mr-1 text-[12px] uppercase tracking-wider text-subtle">{t("agents.share.useful")}</span>
            {(["up", "down"] as const).map((r) => {
              const Icon = r === "up" ? ThumbsUp : ThumbsDown;
              const on = rating === r;
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setRating(on ? null : r)}
                  className={`inline-flex h-10 items-center gap-2 border px-3.5 text-[12px] uppercase tracking-wider transition-colors ${
                    on ? "border-accent/60 bg-accent/10 text-fg" : "border-line text-muted hover:border-line-strong hover:text-fg"
                  }`}
                >
                  <Icon size={14} aria-hidden /> {t(`agents.share.rate.${r}`)}
                </button>
              );
            })}
          </div>

          <details className="mt-4 border border-line">
            <summary className="cursor-pointer px-4 py-3 text-[12px] uppercase tracking-wider text-muted hover:text-fg">
              {t("agents.share.preview")}
            </summary>
            <div className="max-h-96 overflow-y-auto overscroll-contain border-t border-line px-4">
              <p className="pt-3 text-[12px] leading-relaxed text-subtle">{t("agents.share.systemNote")}</p>
              <p className="micro pt-3">{t("agents.share.planPart")}</p>
              <ol>
                {transcript.plan.slice(1).map((m, i) => (
                  <Message key={`p${i}`} m={m} />
                ))}
              </ol>
              <p className="micro border-t border-line-strong pt-3">{t("agents.share.runPart")}</p>
              <ol>
                {transcript.run.slice(1).map((m, i) => (
                  <Message key={`r${i}`} m={m} />
                ))}
              </ol>
            </div>
          </details>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={share} disabled={busy} className="btn-accent inline-flex h-10 items-center gap-2 px-4 text-[12px] uppercase tracking-wider disabled:opacity-60">
              {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {t("agents.share.cta")}
            </button>
            <button
              type="button"
              onClick={() => setState("dismissed")}
              className="inline-flex h-10 items-center px-3.5 text-[12px] uppercase tracking-wider text-muted hover:text-fg"
            >
              {t("agents.share.noThanks")}
            </button>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-subtle">{t("agents.share.fine")}</p>
        </>
      )}
      <p className={`mt-3 text-[13px] ${state === "error" ? "text-red" : "text-muted"}`} role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
