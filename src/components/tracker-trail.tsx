"use client";

import { useCallback, useEffect, useRef } from "react";
import { TRACKERS, type Tracker } from "@/lib/link-clean";
import { useT } from "@/lib/i18n";
import { createLoop, createRedraw, watchActive } from "@/lib/perf/loop";
import { getPerf, usePerfTier, type PerfTier } from "@/lib/perf/tier";
import { hexToRgbTriplet, readToken, useResolvedTheme } from "@/lib/theme";

const NODES: Tracker[] = Object.values(TRACKERS);

/** Canvas colours as "r,g,b" triplets, read from the theme tokens at draw time. */
type Palette = { ink: string; accent: string; text: string; dim: string; label: string; glow: string };
function readPalette(el: Element): Palette {
  const tok = (name: string, fallback: string) => hexToRgbTriplet(readToken(name, el), fallback);
  const ink = tok("--fg", "255,255,255");
  const accent = tok("--accent", "255,45,85");
  const light = el.closest("[data-theme]")?.getAttribute("data-theme") === "light";
  return {
    ink,
    accent,
    text: tok("--text", "236,236,236"),
    dim: tok("--subtle", "120,120,128"),
    label: tok("--muted", "160,160,168"),
    // On paper a white bloom vanishes and a black one smudges: glow in the accent instead.
    glow: light ? accent : ink,
  };
}

/** Evenly spread points on a unit sphere (Fibonacci lattice). */
function fibonacci(n: number, offset = 0) {
  const pts: [number, number, number][] = [];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - ((i + 0.5) / n) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = g * i + offset;
    pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  return pts;
}

const NODE_POS = fibonacci(NODES.length, 0.6);
const SHELL = fibonacci(520);
const SHELL_LITE = fibonacci(300);

/** Per-tier budget: "lite" draws a sparser shell, smoother-but-cheaper rings and fewer packets at 30 fps. */
const TIERS = {
  full: { shell: SHELL, dot: 1, ringSteps: 96, spawn: 0.12, fps: 40 },
  lite: { shell: SHELL_LITE, dot: 1.15, ringSteps: 48, spawn: 0.24, fps: 30 },
  static: { shell: SHELL, dot: 1, ringSteps: 96, spawn: 0, fps: 0 },
} satisfies Record<PerfTier, unknown>;
/** Scene time for the still frame (satellites part-way round their rings). */
const STILL_T = 1.6;

/** Display name for a tracker: domains stay as-is, generic categories ("email tracking") are translated. */
export function useTrackerLabel() {
  const t = useT();
  return useCallback((tr: Tracker) => (tr.label.includes(".") ? tr.label : t(`tools.tracker.${tr.id}`)), [t]);
}

/**
 * "Every link leaves a trail" in 3D: tracker endpoints sit on a slowly rotating dotted sphere
 * around your link (the core). Trackers found in the pasted link light up and packets stream
 * out to them. Drag or use arrow keys to rotate.
 *
 * Runs only while on screen and the tab is visible; follows the shared performance tier
 * (src/lib/perf): "lite" on phones and slow devices, a labelled still with reduced motion.
 */
export function TrackerTrail({ active }: { active?: Set<string>; cleaned?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const t = useT();
  const tier = usePerfTier();
  const theme = useResolvedTheme();
  const labelOf = useTrackerLabel();
  const activeRef = useRef(active);
  const labelsRef = useRef<string[]>(NODES.map((n) => n.label));
  const ctrl = useRef<{ setTier: (tier: PerfTier) => void; changed: () => void; retheme: () => void } | null>(null);
  useEffect(() => {
    activeRef.current = active;
    ctrl.current?.changed();
  }, [active]);
  useEffect(() => {
    labelsRef.current = NODES.map(labelOf);
    ctrl.current?.changed();
  }, [labelOf]);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const font = getComputedStyle(document.body).fontFamily;
    let pal = readPalette(wrap);
    // The hook value is the server snapshot during hydration; read the real tier directly.
    let tierNow: PerfTier = getPerf().tier;
    let cfg = TIERS[tierNow];
    let still = tierNow === "static";
    let onScreen = true;
    let w = 0;
    let h = 0;
    let t = still ? STILL_T : 0;
    let yaw = 0.4;
    let pitch = -0.25;
    let vy = 0;
    let vp = 0;
    const drag = { on: false, x: 0, y: 0 };
    const packets: { node: number; t: number; speed: number }[] = [];
    let spawn = 0;
    let glow: { key: string; g: CanvasGradient } | null = null;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      frame(0);
    };

    // Rotation terms are computed once per frame instead of per point.
    let cY = 1, sY = 0, cP = 1, sP = 0;
    const rx = { x: 0, y: 0, z: 0 };
    const rot = (p: readonly [number, number, number]) => {
      const x1 = p[0] * cY - p[2] * sY;
      const z1 = p[0] * sY + p[2] * cY;
      rx.x = x1;
      rx.y = p[1] * cP - z1 * sP;
      rx.z = p[1] * sP + z1 * cP;
      return rx;
    };

    const frame = (dt: number) => {
      t += dt;
      if (!drag.on) {
        yaw += (still ? 0 : 0.18 * dt) + vy;
        pitch += vp;
        vy *= 0.92;
        vp *= 0.92;
      }
      pitch = Math.max(-1.1, Math.min(1.1, pitch));
      cY = Math.cos(yaw);
      sY = Math.sin(yaw);
      cP = Math.cos(pitch);
      sP = Math.sin(pitch);

      const R = Math.min(w * 0.36, h * 0.4);
      const cx = w / 2;
      const cy = h / 2;
      const persp = 3.2;
      const proj = (p: { x: number; y: number; z: number }, r = R) => {
        const s = persp / (persp - p.z);
        return { x: cx + p.x * r * s, y: cy + p.y * r * s, s, z: p.z };
      };
      const act = activeRef.current;
      const isOn = (i: number) => !act || act.has(NODES[i].id);

      ctx.clearRect(0, 0, w, h);

      // dotted shell — one fill colour, per-dot opacity via globalAlpha (no colour-string parsing per dot)
      ctx.fillStyle = `rgb(${pal.text})`;
      for (const p of cfg.shell) {
        const q = rot(p);
        const s = persp / (persp - q.z); // perspective scale
        const sx = cx + q.x * R * s;
        const sy = cy + q.y * R * s;
        ctx.globalAlpha = 0.05 + (q.z + 1) * 0.12;
        const size = (0.6 + (q.z + 1) * 0.5) * cfg.dot;
        ctx.fillRect(sx, sy, size, size);
      }
      ctx.globalAlpha = 1;
      // orbit rings
      const steps = cfg.ringSteps;
      for (const [tilt, rr, spd] of [[0.5, 1.18, 0.25], [-0.9, 1.32, -0.18]] as const) {
        const st = Math.sin(tilt);
        const ct = Math.cos(tilt);
        ctx.beginPath();
        for (let k = 0; k <= steps; k++) {
          const a = (k / steps) * Math.PI * 2;
          const q = proj(rot([Math.cos(a) * rr, Math.sin(a) * rr * st, Math.sin(a) * rr * ct]));
          if (k === 0) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
        }
        ctx.strokeStyle = `rgba(${pal.ink},0.08)`;
        ctx.lineWidth = 1;
        ctx.stroke();
        // satellite on the ring
        const a = t * spd * 2;
        const q = proj(rot([Math.cos(a) * rr, Math.sin(a) * rr * st, Math.sin(a) * rr * ct]));
        ctx.fillStyle = `rgba(${pal.ink},0.8)`;
        ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3);
      }

      // nodes sorted back to front
      const nodes = NODE_POS.map((p, i) => ({ i, q: proj(rot(p)) })).sort((a, b) => a.q.z - b.q.z);

      // core glow (the gradient only changes with size)
      const glowKey = `${cx},${cy},${R},${pal.glow}`;
      if (glow?.key !== glowKey) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.32);
        g.addColorStop(0, `rgba(${pal.glow},0.95)`);
        g.addColorStop(0.25, `rgba(${pal.glow},0.35)`);
        g.addColorStop(1, `rgba(${pal.glow},0)`);
        glow = { key: glowKey, g };
      }

      // edges
      for (const { i, q } of nodes) {
        const on = isOn(i);
        ctx.strokeStyle = on ? `rgba(${pal.accent},${0.25 + (q.z + 1) * 0.3})` : `rgba(${pal.ink},0.07)`;
        ctx.lineWidth = on ? 1.2 : 1;
        ctx.setLineDash(on ? [] : [2, 5]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      ctx.fillStyle = glow.g;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgb(${pal.ink})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 7 + Math.sin(t * 3) * 1, 0, Math.PI * 2);
      ctx.fill();

      // packets: data leaving your link toward trackers
      if (!still) {
        spawn -= dt;
        if (spawn <= 0) {
          spawn = cfg.spawn;
          const candidates = NODES.map((_, i) => i).filter(isOn);
          if (candidates.length) packets.push({ node: candidates[Math.floor(Math.random() * candidates.length)], t: 0, speed: 0.6 + Math.random() * 0.5 });
        }
      }
      for (let k = packets.length - 1; k >= 0; k--) {
        const pk = packets[k];
        pk.t += dt * pk.speed;
        if (pk.t >= 1 || !isOn(pk.node)) {
          packets.splice(k, 1);
          continue;
        }
        const q = proj(rot(NODE_POS[pk.node]));
        const x = cx + (q.x - cx) * pk.t;
        const y = cy + (q.y - cy) * pk.t;
        ctx.fillStyle = `rgba(${pal.ink},0.95)`;
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }

      // node markers + labels
      ctx.font = `500 12px ${font}`;
      ctx.textBaseline = "middle";
      for (const { i, q } of nodes) {
        const on = isOn(i);
        const front = (q.z + 1) / 2; // 0 back … 1 front
        const r = (on ? 5 : 3.5) * q.s;
        if (on) {
          ctx.fillStyle = `rgba(${pal.accent},${0.15 + front * 0.15})`;
          ctx.beginPath();
          ctx.arc(q.x, q.y, r * 2.6 + Math.sin(t * 4 + i) * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = on ? `rgba(${pal.accent},${0.55 + front * 0.45})` : `rgba(${pal.dim},${0.4 + front * 0.4})`;
        ctx.beginPath();
        ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
        ctx.fill();
        if (on || front > 0.55) {
          const left = q.x < cx;
          ctx.textAlign = left ? "right" : "left";
          ctx.fillStyle = on ? `rgba(${pal.text},${0.45 + front * 0.55})` : `rgba(${pal.label},${front * 0.6})`;
          ctx.fillText(labelsRef.current[i] ?? NODES[i].label, q.x + (left ? -12 : 12), q.y);
        }
      }
    };

    const loop = createLoop(frame, cfg.fps || 30);
    const redraw = createRedraw(() => frame(0));
    const poke = () => {
      if (still || !loop.running) redraw.request();
    };
    const sync = () => {
      loop.setFps(cfg.fps || 30);
      loop.setProbe(tierNow === "full");
      if (onScreen && !still) loop.start();
      else loop.stop();
    };

    const onDown = (e: PointerEvent) => {
      drag.on = true;
      drag.x = e.clientX;
      drag.y = e.clientY;
      wrap.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag.on) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      yaw += dx * 0.008;
      pitch += dy * 0.006;
      vy = dx * 0.0015;
      vp = dy * 0.001;
      if (still) vy = vp = 0; // no inertia in the still version
      poke();
    };
    const onUp = () => (drag.on = false);
    const onKey = (e: KeyboardEvent) => {
      const step = 0.15;
      if (e.key === "ArrowLeft") yaw -= step;
      else if (e.key === "ArrowRight") yaw += step;
      else if (e.key === "ArrowUp") pitch -= step;
      else if (e.key === "ArrowDown") pitch += step;
      else return;
      e.preventDefault();
      poke();
    };
    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerup", onUp);
    wrap.addEventListener("pointercancel", onUp);
    wrap.addEventListener("keydown", onKey);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const unwatch = watchActive(canvas, (on) => {
      onScreen = on;
      sync();
    });
    resize();
    sync();

    ctrl.current = {
      setTier(next) {
        if (next === tierNow) return;
        const wasStill = still;
        tierNow = next;
        cfg = TIERS[next];
        still = next === "static";
        if (still && !wasStill) {
          t = STILL_T;
          packets.length = 0;
          vy = vp = 0;
        }
        sync();
        poke();
      },
      changed: poke,
      retheme() {
        pal = readPalette(wrap);
        poke();
      },
    };

    return () => {
      ctrl.current = null;
      loop.stop();
      redraw.cancel();
      unwatch();
      ro.disconnect();
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointercancel", onUp);
      wrap.removeEventListener("keydown", onKey);
    };
  }, []);

  // Re-read the canvas colours when the theme flips (ThemeSync has already updated <html>).
  useEffect(() => {
    ctrl.current?.retheme();
  }, [theme]);

  // Follow tier changes (Effects toggle, probe step-down, reduced-motion switch) without a restart.
  useEffect(() => {
    ctrl.current?.setTier(getPerf().tier);
  }, [tier]);

  const count = active ? active.size : NODES.length;
  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      role="img"
      aria-label={
        active
          ? t(count === 1 ? "tools.trail.aria.found.one" : "tools.trail.aria.found.other", {
              n: count,
              list: NODES.filter((n) => active.has(n.id)).map(labelOf).join(", ") || t("tools.trail.aria.none"),
            })
          : t("tools.trail.aria.default")
      }
      className="relative h-[340px] w-full cursor-grab touch-pan-y select-none outline-none contain-layout focus-visible:ring-1 focus-visible:ring-accent active:cursor-grabbing sm:h-[420px]"
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden />
      <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.2em] text-subtle">{t("tools.trail.drag")}</p>
    </div>
  );
}
