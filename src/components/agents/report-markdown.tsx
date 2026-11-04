"use client";

import { Check, Copy } from "lucide-react";
import { createContext, useContext, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { plainText, toggleItem, type Checklist, type ChecklistItem } from "@/lib/agent-checklists";
import { useT } from "@/lib/i18n";

type HastNode = { type?: string; tagName?: string; properties?: Record<string, unknown>; children?: HastNode[]; position?: { start?: { line?: number } } };

/** The `checked` state GFM gave a task item (its <input> sits first in the <li>, or first in its <p>). */
function gfmChecked(node: HastNode | undefined): boolean {
  for (const child of node?.children ?? []) {
    if (child.type !== "element") continue;
    if (child.tagName === "input") return Boolean(child.properties?.checked);
    if (child.tagName === "p") return gfmChecked(child);
    return false;
  }
  return false;
}

type Binding = { byLine: Map<number, ChecklistItem>; checklistId: string | null };
const BindingContext = createContext<Binding>({ byLine: new Map(), checklistId: null });

/** A list item: bound checklist steps get a real checkbox; other GFM task items a read-only box. */
function ListItem({ node, children, className, ...props }: ComponentProps<"li"> & ExtraProps) {
  const { byLine, checklistId } = useContext(BindingContext);
  const item = byLine.get((node as HastNode | undefined)?.position?.start?.line ?? -1);
  const isTask = typeof className === "string" && className.includes("task-list-item");
  if (!item && !isTask) {
    return (
      <li className={className} {...props}>
        {children}
      </li>
    );
  }
  return (
    <li className={`${className ?? ""} flex list-none! items-start gap-2.5`} {...props}>
      {item && checklistId ? (
        <input
          type="checkbox"
          checked={item.done}
          onChange={(e) => toggleItem(checklistId, item.id, e.target.checked)}
          aria-label={plainText(item.text)}
          className="mt-[0.2em] size-5 shrink-0 cursor-pointer accent-[var(--accent)]"
        />
      ) : (
        <input
          type="checkbox"
          checked={gfmChecked(node as HastNode)}
          disabled
          readOnly
          aria-hidden
          tabIndex={-1}
          className="mt-[0.2em] size-5 shrink-0 opacity-60 accent-[var(--accent)]"
        />
      )}
      <div className={`min-w-0 flex-1 [&>p]:m-0 ${item?.done ? "text-muted" : ""}`}>{children}</div>
    </li>
  );
}

/** Stable across renders, so ticking a box never remounts the list (and keyboard focus stays put). */
const COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
  // Never load images from a report: an injected image URL could carry the user's details to a third party
  // the moment the report renders (security review ZS-02). Show the address as text instead.
  img: ({ src, alt }) => (
    <span className="break-all text-muted">
      [{alt || "image"}: {typeof src === "string" ? src : ""}]
    </span>
  ),
  pre: ({ children }) => <CopyablePre>{children}</CopyablePre>,
  // GFM's own task checkboxes are disabled; ListItem draws ours instead.
  input: (props) => {
    if (props.type === "checkbox") return null;
    const rest = { ...props };
    delete rest.node;
    return <input {...rest} />;
  },
  li: ListItem,
};

/**
 * An agent report rendered from Markdown (GFM). With a `checklist`, every list item the checklist
 * was parsed from gets a real checkbox bound to it — matched by the item's source line, so it's
 * exact even with repeated wording. Other task items show a read-only box.
 */
export function ReportMarkdown({ report, checklist }: { report: string; checklist?: Checklist | null }) {
  const binding = useMemo<Binding>(
    () => ({ byLine: new Map((checklist?.items ?? []).map((it) => [it.line, it])), checklistId: checklist?.id ?? null }),
    [checklist],
  );
  return (
    <BindingContext.Provider value={binding}>
      <div className="report">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
          {report}
        </ReactMarkdown>
      </div>
    </BindingContext.Provider>
  );
}

/** Code block in a report (e.g. a drafted removal request) with its own copy button. */
function CopyablePre({ children }: { children: ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre
        ref={ref}
        className="overflow-x-auto whitespace-pre-wrap break-words border border-line bg-bg-2 p-4 pr-24 font-mono text-[13px] leading-relaxed text-text [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[13px]"
      >
        {children}
      </pre>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(ref.current?.innerText.trim() ?? "");
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {}
        }}
        className="absolute right-2 top-2 inline-flex h-8 items-center gap-1.5 border border-line-strong bg-surface px-2.5 font-mono text-[11px] uppercase tracking-wider text-fg hover:border-fg/40"
      >
        {copied ? <Check size={12} className="text-green" aria-hidden /> : <Copy size={12} aria-hidden />}
        <span aria-live="polite">{copied ? t("common.copied") : t("common.copy")}</span>
      </button>
    </div>
  );
}

/** Inline Markdown for a single checklist step (links and emphasis, no blocks). */
export function StepText({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      allowedElements={["a", "strong", "em", "code", "del"]}
      unwrapDisallowed
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer noopener" className="text-fg underline decoration-accent/60 underline-offset-2 [overflow-wrap:anywhere] hover:decoration-accent">
            {children}
          </a>
        ),
        strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
        code: ({ children }) => <code className="bg-surface-3 px-1 font-mono text-[0.9em]">{children}</code>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
