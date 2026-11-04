"use client";

import { probing, sampleFrame } from "./tier";

/**
 * Watches whether `el` is (nearly) on screen and the tab is in the foreground, and calls
 * `onChange` whenever that flips. Starts as active so the first frame paints straight away;
 * the observer corrects it a moment later. Returns a cleanup function.
 */
export function watchActive(el: Element, onChange: (active: boolean) => void, rootMargin = "160px 0px"): () => void {
  let inView = true;
  let shown = document.visibilityState !== "hidden";
  let active = inView && shown;
  const update = () => {
    const next = inView && shown;
    if (next === active) return;
    active = next;
    onChange(active);
  };
  const io =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          (entries) => {
            inView = entries[entries.length - 1].isIntersecting;
            update();
          },
          { rootMargin },
        );
  io?.observe(el);
  const onVis = () => {
    shown = document.visibilityState !== "hidden";
    update();
  };
  document.addEventListener("visibilitychange", onVis);
  return () => {
    io?.disconnect();
    document.removeEventListener("visibilitychange", onVis);
  };
}

export type Loop = {
  start: () => void;
  stop: () => void;
  setFps: (fps: number) => void;
  /** Feed the frame-time probe (only while it wants samples). */
  setProbe: (on: boolean) => void;
  readonly running: boolean;
};

/**
 * A requestAnimationFrame loop capped to `fps`, calling `step(dt)` with dt in seconds (≤ 0.1 s, so
 * a resume never jumps). Stopping cancels the rAF entirely — no idle wake-ups while paused.
 */
export function createLoop(step: (dt: number) => void, fps: number): Loop {
  let raf = 0;
  let last = 0;
  let prevTick = 0;
  let minGap = 1000 / fps;
  let probe = false;
  let running = false;

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const interval = prevTick ? now - prevTick : 0;
    prevTick = now;
    const elapsed = now - last;
    // A few ms of slack so a 60 Hz display lands on every 2nd vsync for 30 fps instead of drifting to every 3rd.
    if (elapsed < minGap - 4) {
      if (probe && probing()) sampleFrame(interval, 0);
      return;
    }
    last = now;
    const t0 = performance.now();
    step(Math.min(0.1, elapsed / 1000));
    if (probe && probing()) sampleFrame(interval, performance.now() - t0);
  };

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      prevTick = 0;
      raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    setFps(next) {
      minGap = 1000 / next;
    },
    setProbe(on) {
      probe = on;
    },
    get running() {
      return running;
    },
  };
}

/** Coalesces on-demand redraws (resize, drag, prop changes while still) into one per animation frame. */
export function createRedraw(draw: () => void) {
  let raf = 0;
  return {
    request() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        draw();
      });
    },
    cancel() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
