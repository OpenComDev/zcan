"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { createLoop, createRedraw, watchActive } from "@/lib/perf/loop";
import { getPerf, usePerfTier, type PerfTier } from "@/lib/perf/tier";

/* ------------------------------------------------------------------ */
/* World                                                              */
/* ------------------------------------------------------------------ */

const X_SPAN = 1.7; // half-width of the "home" area where nodes and convoys live
const DEPTH = 4.2; // depth of that home area
const VIEW_NEAR = -0.85; // slightly behind the camera: tall views look almost straight down
const VIEW_FAR = 9.5; // how far the rendered terrain reaches toward the horizon
const Z_PIVOT = 1.9; // camera orbits around this depth
const H_MAX = 0.95; // upper bound of height() (true max ≈ 0.88), used to cull whole rows/columns
const ACCENT = [255, 45, 85] as const;
/** Scene time for the still frame: radar sweep off to the side, convoys mid-channel. */
const STILL_T = 2.5;

/**
 * Per-tier budget. "lite" keeps the look (same palette, dot sizes, network) but samples the
 * terrain more coarsely into a 1× buffer that is scaled up, and runs fewer convoys and packets.
 * "static" renders one full-quality frame on demand.
 */
const TIERS = {
  full: { rows: 160, colDiv: 3.2, colMin: 120, colMax: 240, dot: 1, lowRes: false, convoys: 4, trail: 8, packets: 1, allLabels: true },
  lite: { rows: 100, colDiv: 4.2, colMin: 80, colMax: 150, dot: 1.15, lowRes: true, convoys: 2, trail: 6, packets: 0.5, allLabels: false },
  static: { rows: 160, colDiv: 3.2, colMin: 120, colMax: 240, dot: 1, lowRes: false, convoys: 4, trail: 8, packets: 0, allLabels: true },
} satisfies Record<PerfTier, unknown>;
const FPS = 30;

const channelX = (z: number) => 0.22 * Math.sin(z * 0.9) + 0.08 * Math.sin(z * 2.3 + 1);

/**
 * Terrain height, defined everywhere: a winding channel flanked by ridges, broad rolling
 * ranges for large-scale variety, and several noise octaves for fine detail.
 */
function height(x: number, z: number) {
  const d = Math.abs(x - channelX(z));
  const ridge = Math.min(1, Math.max(0, (d - 0.14) / 0.42));
  // seabed swell so the channel floor has texture too
  const floor = 0.03 * (0.6 + 0.4 * Math.sin(x * 9 + z * 4.3) * Math.sin(z * 2.1 - x * 3));
  // broad ranges so distant mountains differ from near ones
  const range = 0.75 + 0.35 * Math.sin(x * 0.9 + z * 0.37) * Math.sin(z * 0.52 - x * 0.61 + 0.8);
  const n =
    0.5 * Math.sin(x * 5.1 + z * 1.9) +
    0.28 * Math.sin(x * 11.3 - z * 3.7 + 1.2) +
    0.16 * Math.sin(x * 23 + z * 7.1) +
    0.1 * Math.sin(z * 13 - x * 4.3) +
    0.07 * Math.sin(x * 41 + z * 29 + 2.1) +
    0.05 * Math.sin(z * 37 - x * 53);
  return Math.max(0, ridge * ridge * (0.6 + 0.4 * n) * 0.75 * range + floor * (1 - ridge));
}

const smooth = (a: number, b: number, v: number) => {
  const k = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Network nodes sit on ridge peaks; `zec` sits at the far end of the channel. */
const NODES: { id: string; label: string; x: number; z: number }[] = [
  { id: "bsc", label: "BNB", x: -0.42, z: 0.85 },
  { id: "xrp", label: "XRP", x: 0.46, z: 0.95 },
  { id: "btc", label: "BTC", x: -0.62, z: 1.55 },
  { id: "eth", label: "ETH", x: 0.68, z: 1.7 },
  { id: "sol", label: "SOL", x: -0.86, z: 2.3 },
  { id: "tron", label: "TRX", x: 0.9, z: 2.45 },
  { id: "base", label: "BASE", x: -0.66, z: 3.0 },
  { id: "arb", label: "ARB", x: 0.72, z: 3.15 },
  { id: "near", label: "NEAR", x: -0.98, z: 3.6 },
  { id: "doge", label: "DOGE", x: 1.0, z: 3.72 },
  { id: "zec", label: "ZEC", x: 0, z: 3.95 },
]

export type ViewportEvent = { id: number; at: number; text: string; tone?: "accent" | "muted" };
export type ViewportRoute = { fromChain?: string; fromLabel?: string; toChain?: string; toLabel?: string };

type Packet = { a: number; b: number; t: number; speed: number; route: boolean };
type Ring = { x: number; y: number; r: number; life: number; accent: boolean };

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * Interactive point-cloud "strait" with a live network overlay: chain nodes on the ridges,
 * a NEAR Intents hub at the reticle, packets flowing along edges, transit convoys up the
 * channel, a radar sweep and sonar pings. Drag to orbit, click to ping, arrows + Enter
 * from the keyboard.
 *
 * Performance: the loop runs only while the canvas is on screen and the tab is visible, at
 * ~30 fps, and follows the shared performance tier (src/lib/perf) — "lite" on phones and slow
 * devices, a single still frame with prefers-reduced-motion.
 */
export function Viewport({
  children,
  className = "",
  target = true,
  route,
  locked = false,
  events,
  onPing,
}: {
  children?: ReactNode;
  className?: string;
  target?: boolean;
  route?: ViewportRoute;
  locked?: boolean;
  events?: ViewportEvent[];
  onPing?: () => void;
}) {
  const t = useT();
  const tier = usePerfTier();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctrl = useRef<{ setTier: (tier: PerfTier) => void; changed: () => void } | null>(null);
  // Live props for the render loop without restarting it.
  const live = useRef({ route, locked, onPing });
  useEffect(() => {
    live.current = { route, locked, onPing };
    ctrl.current?.changed();
  }, [route, locked, onPing]);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    const font = getComputedStyle(document.body).fontFamily;

    // The hook value is the server snapshot during hydration; read the real tier directly.
    let tierNow: PerfTier = getPerf().tier;
    let cfg = TIERS[tierNow];
    let still = tierNow === "static";
    let active = true;

    let w = 0;
    let h = 0;
    let t = still ? STILL_T : 0;

    // camera
    let yaw = 0;
    let yawTarget = 0;
    let parX = 0;
    let parY = 0;
    // pointer
    const pointer = { x: -9999, y: -9999, inside: false, down: false, dragX: 0, moved: 0 };

    const packets: Packet[] = [];
    const rings: Ring[] = [];
    const nodePulse = new Float32Array(NODES.length);
    let spawnAmbient = 0;
    let spawnRoute = 0;
    let pulseIn = 0.9; // ambient pings on random nodes keep the scene alive

    const nodeIndex = (id?: string) => (id ? NODES.findIndex((n) => n.id === id) : -1);

    /** Endpoints of the user's route; chains not on the map borrow the first slot. */
    const endpoints = () => {
      const r = live.current.route;
      let a = nodeIndex(r?.fromChain);
      let b = nodeIndex(r?.toChain);
      if (r?.fromChain && a < 0) a = r.toChain === "zec" ? 0 : 1;
      if (r?.toChain && b < 0) b = r.fromChain === "zec" ? 0 : 1;
      return { a, b };
    };

    // Terrain is rasterised straight into a pixel buffer: tens of thousands of dots with
    // per-dot colour would be far too slow through the canvas 2D API. In "lite" the buffer is
    // 1× and gets scaled onto the (still high-DPI) canvas, so labels and lines stay crisp.
    let dpr = 1;
    let tdpr = 1; // terrain buffer scale
    let img: ImageData | null = null;
    let px32: Uint32Array | null = null;
    let lowCanvas: HTMLCanvasElement | null = null;
    let lowCtx: CanvasRenderingContext2D | null = null;
    const BG = 0xff060606; // ABGR (little-endian) for #060606

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      tdpr = cfg.lowRes ? Math.min(dpr, 1) : dpr;
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bw = Math.round(w * tdpr);
      const bh = Math.round(h * tdpr);
      if (tdpr !== dpr && bw && bh) {
        lowCanvas ??= document.createElement("canvas");
        lowCanvas.width = bw;
        lowCanvas.height = bh;
        lowCtx = lowCanvas.getContext("2d", { alpha: false });
      } else {
        lowCanvas = null;
        lowCtx = null;
      }
      img = bw && bh ? ctx.createImageData(bw, bh) : null;
      px32 = img ? new Uint32Array(img.data.buffer) : null;
      frame(0);
    };

    /** Additive square "dot" in CSS px into the pixel buffer. */
    const plot = (x: number, y: number, size: number, r: number, g: number, b: number, a: number) => {
      if (!img) return;
      const data = img.data;
      const dw = img.width;
      const dh = img.height;
      const sz = Math.max(1, Math.round(size * tdpr));
      const x0 = Math.round(x * tdpr);
      const y0 = Math.round(y * tdpr);
      const ra = r * a;
      const ga = g * a;
      const ba = b * a;
      for (let yy = y0; yy < y0 + sz; yy++) {
        if (yy < 0 || yy >= dh) continue;
        let i = (yy * dw + Math.max(0, x0)) * 4;
        for (let xx = Math.max(0, x0); xx < Math.min(dw, x0 + sz); xx++) {
          data[i] += ra;
          data[i + 1] += ga;
          data[i + 2] += ba;
          i += 4;
        }
      }
    };

    // ---- projection --------------------------------------------------
    const pitchBase = 0.78;
    const camH = 1.35;
    const camBack = 0.35;
    let cp = 0, sp = 0, cyw = 1, syw = 0, f = 1, cx = 0, cy = 0;
    const setupCamera = () => {
      const pitch = pitchBase + parY * 0.06;
      cp = Math.cos(pitch);
      sp = Math.sin(pitch);
      const yv = yaw + parX * 0.08;
      cyw = Math.cos(yv);
      syw = Math.sin(yv);
      f = Math.max(w * 0.85, h * 0.78); // tall panels zoom in a little rather than looking straight down
      cx = w / 2;
      cy = h * 0.42;
    };
    /** world → screen; returns depth (zv) or 0 when behind the camera */
    const out = { x: 0, y: 0, z: 0 };
    const project = (x: number, y: number, z: number) => {
      const zc = z - Z_PIVOT;
      const xr = x * cyw - zc * syw;
      const zr = x * syw + zc * cyw + Z_PIVOT;
      const dy = y - camH;
      const dz = zr + camBack;
      const yv = dy * cp + dz * sp;
      const zv = -dy * sp + dz * cp;
      if (zv <= 0.15) return 0;
      out.x = cx + (xr / zv) * f;
      out.y = cy - (yv / zv) * f;
      out.z = zv;
      return zv;
    };

    /** Already-rotated (view-frame) point → screen. */
    const projectView = (xr: number, y: number, zr: number) => {
      const dy = y - camH;
      const dz = zr + camBack;
      const yv = dy * cp + dz * sp;
      const zv = -dy * sp + dz * cp;
      if (zv <= 0.15) return 0;
      out.x = cx + (xr / zv) * f;
      out.y = cy - (yv / zv) * f;
      out.z = zv;
      return zv;
    };

    // ---- frame -------------------------------------------------------
    const frame = (dt: number) => {
      t += dt;
      // ease camera (a still frame jumps straight to the target: no motion)
      if (still) yaw = yawTarget;
      else yaw += (yawTarget - yaw) * Math.min(1, dt * 4);
      if (!pointer.down && !still) yawTarget += Math.sin(t * 0.07) * 0.0006; // slow idle drift
      setupCamera();

      px32?.fill(BG);

      const scroll = t * 0.05;
      const sweepX = -X_SPAN * 2.2 + ((t * 0.12) % 1) * X_SPAN * 4.4;
      const lensR = 110;
      const px0 = pointer.inside ? pointer.x : -9999;
      const py0 = pointer.inside ? pointer.y : -9999;
      const dotK = cfg.dot;

      // ---- terrain ----
      // The grid lives in the camera's frame (rows across the view frustum), and each dot
      // samples the world height under it after undoing the camera's yaw. So the landscape
      // always fills the frame, however far you orbit.
      const rows = cfg.rows;
      const cols = Math.round(Math.min(cfg.colMax, Math.max(cfg.colMin, w / cfg.colDiv)));
      for (let r = rows - 1; r >= 0; r--) {
        const u = r / (rows - 1);
        const zr = VIEW_NEAR + (VIEW_FAR - VIEW_NEAR) * Math.pow(u, 1.75);
        const dz = zr + camBack;
        const zvc = camH * sp + dz * cp;
        const halfX = Math.max(0.35, (w / 2 / f) * Math.max(zvc, 0.2) * 1.12 + 0.05);
        const fog = 1 - smooth(VIEW_FAR * 0.5, VIEW_FAR, zr);
        const zc = zr - Z_PIVOT;

        // Cull before sampling: screen y rises and depth falls monotonically with height, so the
        // row's ground (y = 0) and highest possible peak (H_MAX) bound every dot in it. Rows that
        // are entirely above/below the frame, and columns outside it, are skipped — most of the
        // far grid never reaches the screen. Pixel-identical to testing each dot.
        let c0 = 0;
        let c1 = cols - 1;
        const zvTop = (camH - H_MAX) * sp + dz * cp;
        if (zvTop > 0.15) {
          const zvGround = zvc; // y = 0
          const pyGround = cy - ((-camH * cp + dz * sp) / zvGround) * f;
          const pyTop = cy - (((H_MAX - camH) * cp + dz * sp) / zvTop) * f;
          if (pyTop > h + 4 || pyGround < -4) continue;
          const span = (2 * halfX) / (cols - 1);
          c0 = Math.max(0, Math.floor((-((cx + 4) * zvGround) / f + halfX) / span) - 1);
          c1 = Math.min(cols - 1, Math.ceil((((w + 4 - cx) * zvGround) / f + halfX) / span) + 1);
        }

        for (let c = c0; c <= c1; c++) {
          const xr = -halfX + (c / (cols - 1)) * 2 * halfX;
          // view → world (inverse yaw about the pivot)
          const xw = xr * cyw + zc * syw;
          const zw = -xr * syw + zc * cyw + Z_PIVOT;
          const y = height(xw, zw + scroll);
          if (!projectView(xr, y, zr)) continue;
          const px = out.x;
          let py = out.y;
          if (px < -4 || px > w + 4 || py < -4 || py > h + 4) continue;
          const near = Math.max(0, 1 - out.z / 4.6);
          // Low ground keeps a visible floor so the foreground never reads as empty.
          let a = Math.min(1, (0.16 + y * 1.6) * (0.3 + near * 1.1)) * (0.25 + 0.75 * fog);
          let red = 0;

          // radar sweep
          const sd = Math.abs(xw - sweepX);
          if (sd < 0.12) {
            const k = (1 - sd / 0.12) * fog;
            a = Math.min(1, a + k * 0.45);
            red = Math.max(red, k * 0.8);
          }
          // hover lens: lift + brighten under the pointer
          const ddx = px - px0;
          const ddy = py - py0;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < lensR * lensR) {
            const k = 1 - Math.sqrt(d2) / lensR;
            py -= k * k * 10;
            a = Math.min(1, a + k * 0.6);
          }
          // sonar rings
          for (let i = 0; i < rings.length; i++) {
            const g = rings[i];
            const rd = Math.abs(Math.hypot(px - g.x, py - g.y) - g.r);
            if (rd < 14) {
              const k = (1 - rd / 14) * g.life;
              a = Math.min(1, a + k * 0.8);
              if (g.accent) red = Math.max(red, k);
            }
          }
          if (a < 0.03) continue;
          const s = (0.55 + near * 1.7) * dotK;
          if (near > 0.5 && y > 0.12) {
            const o = 0.6 + near * 1.8;
            plot(px - o, py, s, 255, 40, 60, a * 0.5);
            plot(px + o, py, s, 40, 140, 255, a * 0.5);
          }
          if (red > 0.02) plot(px, py, s, 255, 236 - red * 191, 236 - red * 151, a);
          else plot(px, py, s, 236, 236, 236, a);
        }
      }
      if (img) {
        if (lowCtx && lowCanvas) {
          lowCtx.putImageData(img, 0, 0);
          // Nearest-neighbour keeps the dots square and crisp instead of smeared.
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(lowCanvas, 0, 0, w, h);
          ctx.imageSmoothingEnabled = true;
        } else ctx.putImageData(img, 0, 0);
      }
      ctx.globalCompositeOperation = "lighter";

      // ---- transit convoys up the channel ----
      const convoys = cfg.convoys;
      for (let k = 0; k < convoys; k++) {
        const phase = (t * 0.11 + k / convoys) % 1;
        const zw = 0.25 + phase * (DEPTH - 0.5);
        for (let trail = 0; trail < cfg.trail; trail++) {
          const zt = zw - trail * 0.035;
          if (zt < 0.1) break;
          const xt = channelX(zt + scroll);
          if (!project(xt, height(xt, zt + scroll) + 0.03, zt)) continue;
          const near = Math.max(0, 1 - out.z / (DEPTH * 0.9));
          const al = (1 - trail / cfg.trail) * (0.35 + near * 0.65) * Math.min(1, phase * 6) * Math.min(1, (1 - phase) * 6);
          ctx.fillStyle = `rgba(${ACCENT[0]},${ACCENT[1]},${ACCENT[2]},${al})`;
          const s = (trail === 0 ? 3 : 2) * (0.6 + near);
          ctx.fillRect(out.x - s / 2, out.y - s / 2, s, s);
        }
      }

      // ---- network ----
      ctx.globalCompositeOperation = "source-over";
      const pos: { x: number; y: number; ok: boolean; z: number }[] = NODES.map((n) => {
        const nx = n.id === "zec" ? channelX(n.z + scroll) : n.x;
        const ok = project(nx, height(nx, n.z + scroll) + 0.05, n.z) > 0 && out.x > -40 && out.x < w + 40 && out.y > -40 && out.y < h + 40;
        return { x: out.x, y: out.y, ok, z: out.z };
      });
      const hub = { x: cx, y: h / 2 };
      const { a: ra, b: rb } = endpoints();
      const isRoute = (i: number) => i === ra || i === rb;

      const ctrl = (ax: number, ay: number, bx: number, by: number) => {
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        return { x: mx, y: my - Math.hypot(bx - ax, by - ay) * 0.22 };
      };
      const bez = (a0: number, c0: number, b0: number, tt: number) => (1 - tt) * (1 - tt) * a0 + 2 * (1 - tt) * tt * c0 + tt * tt * b0;

      // edges node ↔ hub
      for (let i = 0; i < NODES.length; i++) {
        const p = pos[i];
        if (!p.ok) continue;
        const c = ctrl(p.x, p.y, hub.x, hub.y);
        const hot = isRoute(i);
        ctx.strokeStyle = hot ? `rgba(${ACCENT.join(",")},0.75)` : "rgba(255,255,255,0.16)";
        ctx.lineWidth = hot ? 1.4 : 1;
        ctx.setLineDash(hot ? [] : [2, 4]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo(c.x, c.y, hub.x, hub.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // packets
      if (!still) {
        spawnAmbient -= dt;
        spawnRoute -= dt;
        if (spawnAmbient <= 0) {
          spawnAmbient = (0.18 + Math.random() * 0.25) / cfg.packets;
          const n = Math.floor(Math.random() * NODES.length);
          const inbound = Math.random() < 0.6;
          packets.push({ a: inbound ? n : -1, b: inbound ? -1 : n, t: 0, speed: 0.45 + Math.random() * 0.5, route: false });
        }
        if (ra >= 0 && rb >= 0 && spawnRoute <= 0) {
          spawnRoute = 0.32;
          packets.push({ a: ra, b: -1, t: 0, speed: 0.75, route: true });
        }
        pulseIn -= dt;
        if (pulseIn <= 0) {
          pulseIn = 0.9;
          nodePulse[Math.floor(Math.random() * NODES.length)] = 1;
        }
      }
      for (let i = packets.length - 1; i >= 0; i--) {
        const pk = packets[i];
        pk.t += dt * pk.speed;
        const A = pk.a < 0 ? hub : pos[pk.a];
        const B = pk.b < 0 ? hub : pos[pk.b];
        if (pk.t >= 1) {
          packets.splice(i, 1);
          if (pk.b >= 0) nodePulse[pk.b] = 1;
          // route packets hop hub → destination
          if (pk.route && pk.b < 0 && rb >= 0) packets.push({ a: -1, b: rb, t: 0, speed: 0.75, route: true });
          continue;
        }
        if (("ok" in A && !A.ok) || ("ok" in B && !B.ok)) continue;
        const c = ctrl(A.x, A.y, B.x, B.y);
        const x = bez(A.x, c.x, B.x, pk.t);
        const y = bez(A.y, c.y, B.y, pk.t);
        if (pk.route) {
          ctx.fillStyle = `rgba(${ACCENT.join(",")},0.25)`;
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fillRect(x - 1, y - 1, 2, 2);
        }
      }

      // nodes + labels
      ctx.font = `500 10px ${font}`;
      ctx.textBaseline = "middle";
      for (let i = 0; i < NODES.length; i++) {
        const p = pos[i];
        if (!p.ok) continue;
        const hot = isRoute(i);
        nodePulse[i] = Math.max(0, nodePulse[i] - dt * 1.6);
        const pulse = nodePulse[i];
        if (pulse > 0) {
          ctx.strokeStyle = hot ? `rgba(${ACCENT.join(",")},${pulse})` : `rgba(255,255,255,${pulse * 0.6})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6 + (1 - pulse) * 16, 0, Math.PI * 2);
          ctx.stroke();
        }
        const s = hot ? 7 : 5;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = hot ? `rgb(${ACCENT.join(",")})` : "#0b0b0c";
        ctx.strokeStyle = hot ? "#fff" : "rgba(255,255,255,0.7)";
        ctx.lineWidth = 1;
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.strokeRect(-s / 2, -s / 2, s, s);
        ctx.restore();

        // Lite skips the far-side labels on small screens, where they would only crowd each other.
        if (!hot && !cfg.allLabels && NODES[i].id !== "zec" && NODES[i].z > 2.5) continue;
        let label = NODES[i].label;
        if (hot) {
          const r = live.current.route;
          if (i === ra && r?.fromLabel) label = r.fromLabel;
          if (i === rb && r?.toLabel) label = r.toLabel;
        }
        const right = p.x < cx;
        ctx.textAlign = right ? "right" : "left";
        ctx.fillStyle = hot ? "#fff" : "rgba(220,220,220,0.55)";
        ctx.fillText(label, p.x + (right ? -10 : 10), p.y);
      }

      // hub: rotating ticks around the reticle center
      const lockedNow = live.current.locked;
      ctx.save();
      ctx.translate(hub.x, hub.y);
      ctx.rotate(t * (lockedNow ? 0.9 : 0.25));
      ctx.strokeStyle = lockedNow ? `rgba(${ACCENT.join(",")},0.9)` : "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      const R = Math.min(w, h) * 0.13;
      ctx.beginPath();
      for (let k = 0; k < 24; k++) {
        const ang = (k / 24) * Math.PI * 2;
        const l = k % 6 === 0 ? 8 : 4;
        ctx.moveTo(Math.cos(ang) * R, Math.sin(ang) * R);
        ctx.lineTo(Math.cos(ang) * (R + l), Math.sin(ang) * (R + l));
      }
      ctx.stroke();
      ctx.restore();

      // rings
      for (let i = rings.length - 1; i >= 0; i--) {
        const g = rings[i];
        g.r += dt * 420;
        g.life -= dt * 0.75;
        if (g.life <= 0) {
          rings.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = g.accent ? `rgba(${ACCENT.join(",")},${g.life * 0.8})` : `rgba(255,255,255,${g.life * 0.5})`;
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // compass strip (follows yaw)
      const heading = ((((-yaw * 180) / Math.PI + 11) % 360) + 360) % 360;
      const stripW = Math.min(260, w * 0.5);
      const sx0 = cx - stripW / 2;
      const by = h - 46;
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.textAlign = "center";
      ctx.font = `400 12px ${font}`;
      const pxPerDeg = stripW / 50;
      for (let dgr = Math.floor(heading - 25); dgr <= heading + 25; dgr++) {
        if (dgr % 5) continue;
        const x = cx + (dgr - heading) * pxPerDeg;
        if (x < sx0 || x > sx0 + stripW) continue;
        const major = dgr % 10 === 0;
        ctx.beginPath();
        ctx.moveTo(x, by);
        ctx.lineTo(x, by - (major ? 9 : 5));
        ctx.stroke();
        if (major) ctx.fillText(String((((dgr / 10) % 36) + 36) % 36).padStart(2, "0"), x, by + 12);
      }
      ctx.fillStyle = `rgb(${ACCENT.join(",")})`;
      ctx.fillRect(cx - 0.5, by - 14, 1, 14);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(`↑ ${String(Math.round(heading)).padStart(3, "0")}°T`, cx, by + 30);
    };

    const loop = createLoop(frame, FPS);
    const redraw = createRedraw(() => frame(0));
    /** Repaint after input or a prop change when no loop will do it for us. */
    const poke = () => {
      if (still || !loop.running) redraw.request();
    };
    const sync = () => {
      loop.setProbe(tierNow === "full");
      if (active && !still) loop.start();
      else loop.stop();
    };

    // ---- interaction ----
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const ping = (x: number, y: number, accent = true) => {
      // A still frame shows a single settled ring instead of an expanding one.
      if (still) rings.length = 0;
      rings.push({ x, y, r: still ? 40 : 0, life: still ? 0.8 : 1, accent });
      live.current.onPing?.();
      poke();
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.inside = true;
      parX = (p.x / w - 0.5) * 2;
      parY = (p.y / h - 0.5) * 2;
      if (pointer.down) {
        const dx = e.clientX - pointer.dragX;
        pointer.dragX = e.clientX;
        pointer.moved += Math.abs(dx);
        yawTarget += dx * 0.005;
      }
      poke();
    };
    const onDown = (e: PointerEvent) => {
      pointer.down = true;
      pointer.dragX = e.clientX;
      pointer.moved = 0;
      wrap.setPointerCapture(e.pointerId);
    };
    const onUp = (e: PointerEvent) => {
      if (pointer.down && pointer.moved < 6) {
        const p = local(e);
        ping(p.x, p.y);
      }
      pointer.down = false;
    };
    const onLeave = () => {
      pointer.inside = false;
      parX = 0;
      parY = 0;
      poke();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") yawTarget -= 0.12;
      else if (e.key === "ArrowRight") yawTarget += 0.12;
      else if (e.key === "Enter" || e.key === " ") ping(w / 2, h / 2);
      else if (e.key === "0" || e.key === "Home") yawTarget = 0;
      else return;
      e.preventDefault();
      poke();
    };
    const onDbl = () => {
      yawTarget = 0;
      poke();
    };

    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointerup", onUp);
    wrap.addEventListener("pointercancel", onUp);
    wrap.addEventListener("pointerleave", onLeave);
    wrap.addEventListener("keydown", onKey);
    wrap.addEventListener("dblclick", onDbl);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const unwatch = watchActive(canvas, (on) => {
      active = on;
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
          // Freeze into the composed still: no in-flight packets, pulses or expanding rings.
          t = STILL_T;
          packets.length = 0;
          rings.length = 0;
          nodePulse.fill(0);
        }
        resize();
        sync();
      },
      changed: poke,
    };

    return () => {
      ctrl.current = null;
      loop.stop();
      redraw.cancel();
      unwatch();
      ro.disconnect();
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointercancel", onUp);
      wrap.removeEventListener("pointerleave", onLeave);
      wrap.removeEventListener("keydown", onKey);
      wrap.removeEventListener("dblclick", onDbl);
    };
  }, []);

  // Follow tier changes (Effects toggle, probe step-down, reduced-motion switch) without a restart.
  useEffect(() => {
    ctrl.current?.setTier(getPerf().tier);
  }, [tier]);

  return (
    <div
      ref={wrapRef}
      // Deliberately a dark "instrument window" in both themes: the terrain raster has a fixed BG.
      data-theme="dark"
      tabIndex={0}
      role="application"
      aria-roledescription={t("swap.vp.roleDesc")}
      aria-label={t("swap.vp.aria")}
      className={`group relative cursor-grab touch-pan-y select-none overflow-hidden border border-line bg-[#060606] outline-none contain-layout contain-paint focus-visible:border-accent active:cursor-grabbing ${className}`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden />

      {/* crosshair */}
      <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
        <line x1="50%" x2="50%" y1="0" y2="100%" stroke="#fff" strokeOpacity="0.07" />
        <line x1="0" x2="100%" y1="50%" y2="50%" stroke="#fff" strokeOpacity="0.07" />
      </svg>

      {target && (
        <div
          className={`pointer-events-none absolute left-1/2 top-1/2 h-[46%] w-[34%] min-w-[180px] -translate-x-1/2 -translate-y-1/2 transition-transform duration-500 ${
            locked ? "scale-[0.86]" : "animate-[reticle_4s_ease-in-out_infinite]"
          }`}
          aria-hidden
        >
          {(["left-0 top-0 border-l border-t", "right-0 top-0 border-r border-t", "left-0 bottom-0 border-l border-b", "right-0 bottom-0 border-r border-b"] as const).map(
            (pos) => (
              <span key={pos} className={`absolute size-[22%] max-h-12 max-w-16 transition-colors duration-500 ${locked ? "border-accent" : "border-fg/80"} ${pos}`} />
            ),
          )}
          <span className={`absolute -top-8 left-1/2 -translate-x-1/2 text-[18px] ${locked ? "text-accent" : "text-fg/90"}`}>N</span>
          {locked && <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] uppercase tracking-[0.2em] text-accent">{t("swap.vp.lockedTag")}</span>}
        </div>
      )}

      {/* depth scale */}
      <ul className="pointer-events-none absolute left-4 top-1/2 hidden -translate-y-1/2 space-y-8 text-[13px] text-fg/70 sm:block" aria-hidden>
        {["01", "00", "-01", "-02"].map((v, i) => (
          <li key={v} className="flex items-center gap-3">
            <span className="w-6 text-right">{v}</span>
            <span className="h-px w-4 bg-fg/60" />
            {i === 1 && <span className="text-fg/60">&lt;0</span>}
          </li>
        ))}
      </ul>

      {/* event log */}
      {events && events.length > 0 && (
        <ol className="pointer-events-none absolute right-4 top-16 hidden w-[min(320px,42%)] space-y-1 border-r border-accent/50 pr-3 text-right text-[11px] uppercase md:block" aria-live="polite">
          {events.slice(-6).map((e, i, arr) => (
            <li
              key={e.id}
              className={`fade-up truncate ${e.tone === "accent" ? "text-accent" : e.tone === "muted" ? "text-subtle" : "text-fg/80"}`}
              style={{ opacity: 0.35 + (0.65 * (i + 1)) / arr.length }}
            >
              <span className="tabular mr-2 text-subtle">{new Date(e.at).toLocaleTimeString(undefined, { hour12: false })}</span>
              {e.text}
            </li>
          ))}
        </ol>
      )}

      <p className="pointer-events-none absolute left-1/2 top-4 hidden -translate-x-1/2 text-[10px] uppercase tracking-[0.2em] text-fg/35 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:block">
        {t("swap.vp.hint")}
      </p>

      {children && <div className="pointer-events-none absolute inset-0">{children}</div>}
    </div>
  );
}
