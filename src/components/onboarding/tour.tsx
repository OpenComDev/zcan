"use client";

import { Suspense, useEffect, useId, useRef, useSyncExternalStore } from "react";
import { useRoutePath, useT } from "@/lib/i18n";
import {
  TOUR_STEPS,
  beginTour,
  dismissTour,
  finishTour,
  hasPriorActivity,
  setTourStep,
  useTour,
  type TourStepId,
} from "@/lib/onboarding";

export { restartTour } from "@/lib/onboarding";

/** How long "/" must have been loaded before the tour may appear. */
const START_DELAY = 1500;
/** Viewport gutters and the gap between the target and the popover. */
const EDGE_X = 16;
const EDGE_Y = 12;
const GAP = 12;
const PAD = 6;

/**
 * First-visit coach-mark tour: Swap → Tools → Agents. Mount once in the app shell.
 * It starts only on "/", once the page is idle, for a first-time visitor, and never on top
 * of another open dialog. Esc, "Skip tour" or a click outside closes it for good.
 */
export function OnboardingTour() {
  return (
    <Suspense fallback={null}>
      <Tour />
    </Suspense>
  );
}

function Tour() {
  const onHome = useRoutePath() === "/";
  const s = useTour();
  const eligible = onHome && !s.running && !s.done && !s.dismissed;

  useEffect(() => {
    if (!eligible) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let idle: number | undefined;
    const go = () => {
      if (hasPriorActivity()) return; // Returning visitor with swaps on this device.
      if (otherDialogOpen()) {
        timer = setTimeout(go, 2000);
        return;
      }
      beginTour();
    };
    const schedule = () => {
      timer = setTimeout(() => {
        if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(go, { timeout: 3000 });
        else go();
      }, START_DELAY);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      window.removeEventListener("load", schedule);
      clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
    };
  }, [eligible]);

  if (!onHome || !s.running) return null;
  return <PausableTour step={s.step} />;
}

/* ---------- other dialogs: the tour steps aside while one is open ---------- */

const OTHER_DIALOG = 'dialog[open]:not([data-zcan-tour]), [role="dialog"][aria-modal="true"]:not([data-zcan-tour])';
const otherDialogOpen = () => document.querySelector(OTHER_DIALOG) !== null;

function subscribeDialogs(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open", "aria-modal"] });
  return () => mo.disconnect();
}

function PausableTour({ step }: { step: number }) {
  const blocked = useSyncExternalStore(subscribeDialogs, otherDialogOpen, () => true);
  return blocked ? null : <TourDialog step={step} />;
}

/* ---------- targets ---------- */

function findTarget(id: TourStepId): HTMLElement | null {
  if (id === "swap") return document.getElementById("exchange");
  // Desktop sidebar or mobile tab bar (or the open mobile menu) — whichever is visible.
  const links = document.querySelectorAll<HTMLElement>(`nav[aria-label] a[href="/${id}"]`);
  for (const a of links) {
    const r = a.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return a;
  }
  return null;
}

function bringIntoView(id: TourStepId, el: HTMLElement) {
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  if (id === "swap") {
    // Top of the swap panel near the top of the screen, below the sticky header.
    if (r.top < 64 || r.top > vh * 0.45) el.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
  } else {
    // Scrolls the sidebar if the link is clipped; a no-op for the fixed tab bar.
    el.scrollIntoView({ block: "nearest", behavior: smooth ? "smooth" : "auto" });
  }
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/* ---------- the dialog ---------- */

function TourDialog({ step }: { step: number }) {
  const t = useT();
  const uid = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const id = TOUR_STEPS[step];
  const total = TOUR_STEPS.length;
  const last = step === total - 1;
  const titleId = `${uid}-title`;
  const bodyId = `${uid}-body`;

  // Open as a modal dialog (focus moves in, the page is inert); give focus back on close.
  useEffect(() => {
    const d = dialogRef.current!;
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!d.open) d.showModal();
    nextRef.current?.focus();
    return () => {
      const a = document.activeElement;
      const ours = !a || a === document.body || d.contains(a);
      if (d.open) d.close();
      if (ours && prev?.isConnected) prev.focus({ preventScroll: true });
    };
  }, []);

  // Follow the target: spotlight cut-out, popover above/below, arrow pointing at it.
  useEffect(() => {
    const pop = popRef.current!;
    const spot = spotRef.current!;
    const arrow = arrowRef.current!;
    let target = findTarget(id);
    if (target) bringIntoView(id, target);
    let raf = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;

    const place = () => {
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const w = pop.offsetWidth;
      const h = pop.offsetHeight;
      if (!target?.isConnected) target = findTarget(id);
      const r = target?.getBoundingClientRect();
      const top = r ? Math.max(r.top - PAD, 0) : 0;
      const bottom = r ? Math.min(r.bottom + PAD, vh) : 0;
      const left = r ? Math.max(r.left - PAD, 0) : 0;
      const right = r ? Math.min(r.right + PAD, vw) : 0;

      if (!r || r.width === 0 || bottom - top <= 0 || right - left <= 0) {
        // Target missing (still rendering) or scrolled away: dim everything, centre the popover.
        spot.style.transform = `translate(${vw / 2}px, ${vh / 2}px)`;
        spot.style.width = spot.style.height = "0px";
        spot.dataset.empty = "true";
        pop.dataset.side = "none";
        pop.style.transform = `translate(${Math.round((vw - w) / 2)}px, ${Math.round((vh - h) / 2)}px)`;
        if (!r && tries++ < 20) retry = setTimeout(schedule, 150);
        return;
      }

      spot.dataset.empty = "false";
      spot.style.transform = `translate(${left}px, ${top}px)`;
      spot.style.width = `${right - left}px`;
      spot.style.height = `${bottom - top}px`;

      let side: "below" | "above" | "over";
      let y: number;
      if (vh - bottom - GAP - EDGE_Y >= h) {
        side = "below";
        y = bottom + GAP;
      } else if (top - GAP - EDGE_Y >= h) {
        side = "above";
        y = top - GAP - h;
      } else {
        // Target taller than the room around it (e.g. the swap panel on a phone): sit over its lower part.
        side = "over";
        y = vh - h - EDGE_Y;
      }
      y = clamp(y, EDGE_Y, vh - h - EDGE_Y);
      const cx = (left + right) / 2;
      const x = clamp(cx - w / 2, EDGE_X, vw - w - EDGE_X);
      pop.dataset.side = side;
      pop.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      arrow.style.left = `${clamp(cx - x, 16, w - 16)}px`;
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };

    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(pop);
    if (target) ro.observe(target);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(retry);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
      ro.disconnect();
    };
  }, [id]);

  const next = () => (last ? finishTour() : setTourStep(step + 1));
  const back = () => {
    if (step === 0) return;
    setTourStep(step - 1);
    // "Back" disappears on step 1 — keep focus inside the dialog.
    if (step - 1 === 0) nextRef.current?.focus();
  };

  return (
    <dialog
      ref={dialogRef}
      data-zcan-tour=""
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(e) => {
        e.preventDefault();
        dismissTour();
      }}
      onClick={(e) => e.target === dialogRef.current && dismissTour()}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") next();
        else if (e.key === "ArrowLeft") back();
      }}
      className="fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden border-0 bg-transparent p-0 text-text backdrop:bg-transparent"
    >
      {/* Dimmed page with a cut-out around the target. Purely visual; clicks land on the dialog and close the tour. */}
      <div
        ref={spotRef}
        aria-hidden
        data-empty="true"
        className="pointer-events-none fixed left-0 top-0 rounded-[3px] outline outline-1 outline-accent/70 data-[empty=true]:outline-0"
        style={{ boxShadow: "0 0 0 200vmax var(--scrim)", width: 0, height: 0 }}
      />

      <div
        ref={popRef}
        data-side="none"
        className="group fixed left-0 top-0 w-[min(340px,calc(100vw-32px))]"
        style={{ transform: "translate(-200vw, 0)" }}
      >
        <span
          ref={arrowRef}
          aria-hidden
          className="absolute -ml-[5px] size-[10px] rotate-45 border border-line-strong bg-surface group-data-[side=above]:-bottom-[5px] group-data-[side=below]:-top-[5px] group-data-[side=below]:border-accent group-data-[side=none]:hidden group-data-[side=over]:hidden"
        />
        <div className="fade-up relative border border-t-2 border-line-strong border-t-accent bg-surface shadow-modal">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
            <p className="eyebrow">{t("onboarding.eyebrow")}</p>
            <p className="micro tabular">
              <span aria-hidden>
                {step + 1}/{total}
              </span>
              <span className="sr-only">{t("onboarding.stepOf", { n: step + 1, total })}</span>
            </p>
          </div>

          <div aria-live="polite" className="px-4 pt-3.5">
            <div key={id} className="fade-up">
              <h2 id={titleId} className="text-[14px] font-medium uppercase tracking-wider text-text">
                {t(`onboarding.${id}.title`)}
              </h2>
              <p id={bodyId} className="mt-1.5 text-[13px] leading-relaxed text-muted">
                {t(`onboarding.${id}.body`)}
              </p>
            </div>
          </div>

          <div className="flex gap-1 px-4 pt-3.5" aria-hidden>
            {TOUR_STEPS.map((s, i) => (
              <span key={s} className={`h-0.5 flex-1 ${i <= step ? "bg-accent" : "bg-line-strong"}`} />
            ))}
          </div>

          <div className="flex items-center gap-2 px-4 pb-4 pt-3">
            <button
              type="button"
              onClick={dismissTour}
              className="-ml-2 mr-auto inline-flex h-10 items-center px-2 text-[11px] uppercase tracking-wider text-subtle transition-colors hover:text-text sm:h-9"
            >
              {t("onboarding.skip")}
            </button>
            {step > 0 && (
              <button
                type="button"
                onClick={back}
                className="inline-flex h-10 items-center border border-line px-3 text-[12px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-text sm:h-9"
              >
                {t("onboarding.back")}
              </button>
            )}
            <button ref={nextRef} type="button" onClick={next} className="btn-accent inline-flex h-10 items-center px-4 text-[12px] sm:h-9">
              {last ? t("onboarding.done") : t("onboarding.next")}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
