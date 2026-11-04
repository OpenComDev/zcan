"use client";

import { useRef, type ReactNode } from "react";
import { fitText } from "@/components/docs/svg-fit";
import { useT } from "@/lib/i18n";
import { useSvgPause } from "@/lib/perf/use-svg-pause";

/*
 * Animated explainer diagrams for /learn. Pure SVG + SMIL (client components only so labels can be translated).
 * Labels pass `max` (px in viewBox units) so longer translations shrink to fit instead of overflowing.
 * SMIL ignores CSS, so every animated group has a still twin: `motion-reduce:hidden` on the moving
 * version and `hidden motion-reduce:inline` on the static one.
 */

const MONO = "var(--font-plex-mono), monospace";
const ACCENT = "var(--accent)";
const TEXT = "var(--text)";
const MUTED = "var(--muted)";
const SURFACE = "var(--surface)";
const GREEN = "var(--green)";

/** Animations pause while the diagram is off screen or the tab is hidden. */
function Frame({ label, children, viewBox = "0 0 640 260" }: { label: string; children: ReactNode; viewBox?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useSvgPause(ref);
  return (
    <svg ref={ref} viewBox={viewBox} className="h-auto w-full" role="img" aria-label={label}>
      {children}
    </svg>
  );
}

/** Animated version normally; the still version when the user prefers reduced motion. */
function Motion({ moving, still }: { moving: ReactNode; still: ReactNode }) {
  return (
    <>
      <g className="motion-reduce:hidden">{moving}</g>
      <g className="hidden motion-reduce:inline">{still}</g>
    </>
  );
}

function T({
  x,
  y,
  children,
  size = 10,
  fill = TEXT,
  anchor = "middle",
  max,
}: {
  x: number;
  y: number;
  children: string;
  size?: number;
  fill?: string;
  anchor?: "start" | "middle" | "end";
  max?: number;
}) {
  const fit = max ? fitText(children, size, max) : { fontSize: size };
  return (
    <text x={x} y={y} fill={fill} fontFamily={MONO} textAnchor={anchor} {...fit}>
      {children}
    </text>
  );
}

function Node({ x, y, title, sub, hot = false, max = 120 }: { x: number; y: number; title: string; sub?: string; hot?: boolean; max?: number }) {
  return (
    <g>
      <rect x={x - 8} y={y - 8} width="16" height="16" transform={`rotate(45 ${x} ${y})`} fill={hot ? ACCENT : SURFACE} stroke="var(--fg)" />
      <T x={x} y={y - 20} size={10} max={max}>
        {title}
      </T>
      {sub && (
        <T x={x} y={y + 28} fill={MUTED} max={max}>
          {sub}
        </T>
      )}
    </g>
  );
}

/** Redaction bar standing in for ciphertext. */
function Redacted({ x, y, w }: { x: number; y: number; w: number }) {
  return <rect x={x} y={y - 8} width={w} height="9" fill="var(--border-strong)" />;
}

function Lock({ x, y, color = "var(--fg)" }: { x: number; y: number; color?: string }) {
  return (
    <g>
      <path d={`M${x - 3.5} ${y - 2} v-3 a3.5 3.5 0 0 1 7 0 v3`} fill="none" stroke={color} strokeWidth="1.2" />
      <rect x={x - 5} y={y - 2} width="10" height="7" fill={color} />
    </g>
  );
}

/* ── 01 · Transparent vs shielded ─────────────────────────────────────────── */

export function ShieldedDiagram() {
  const t = useT();
  const top = "M70 75 L290 75";
  const bottom = "M70 190 L290 190";
  const packet = (label: string, shielded: boolean) => (
    <g>
      <rect x="-30" y="-10" width="60" height="20" fill={shielded ? SURFACE : "var(--surface-2)"} stroke={shielded ? ACCENT : "var(--fg)"} strokeOpacity="0.8" />
      {shielded ? <Lock x={0} y={1} color={ACCENT} /> : <T x={0} y={4}>{label}</T>}
    </g>
  );
  return (
    <Frame label={t("learn.dg.shielded.aria")}>
      <T x={20} y={22} anchor="start" fill={MUTED} max={340}>
        {`${t("learn.dg.transparentCaps")} · t1… / t3…`}
      </T>
      <T x={20} y={140} anchor="start" fill={ACCENT} max={340}>
        {`${t("learn.dg.shieldedCaps")} · u1… / zs1…`}
      </T>
      <line x1="0" x2="640" y1="122" y2="122" stroke="var(--fg)" strokeOpacity="0.12" strokeDasharray="3 5" />

      <path d={top} stroke="var(--fg)" strokeOpacity="0.35" fill="none" />
      <path d={bottom} stroke={ACCENT} strokeOpacity="0.6" fill="none" />
      <Node x={70} y={75} title="ALICE" sub="t1…9fA" />
      <Node x={290} y={75} title="BOB" sub="t1…k2Q" />
      <Node x={70} y={190} title="ALICE" sub={t("learn.dg.shielded")} hot />
      <Node x={290} y={190} title="BOB" sub={t("learn.dg.shielded")} hot />

      <Motion
        moving={
          <>
            <g>
              {packet("2.50 ZEC", false)}
              <animateMotion dur="4s" repeatCount="indefinite" path={top} />
            </g>
            <g>
              {packet("", true)}
              <animateMotion dur="4s" begin="-0.5s" repeatCount="indefinite" path={bottom} />
            </g>
          </>
        }
        still={
          <>
            <g transform="translate(180 75)">{packet("2.50 ZEC", false)}</g>
            <g transform="translate(180 190)">{packet("", true)}</g>
          </>
        }
      />

      {/* public ledger */}
      <rect x="370" y="30" width="250" height="84" fill={SURFACE} stroke="var(--border-strong)" />
      <T x={382} y={46} anchor="start" fill={MUTED} max={230}>
        {t("learn.dg.chainPublic")}
      </T>
      {[
        ["from", "t1…9fA"],
        ["to", "t1…k2Q"],
        ["amount", "2.50 ZEC"],
      ].map(([k, v], i) => (
        <g key={k}>
          <T x={382} y={66 + i * 16} anchor="start" fill={MUTED} max={72}>
            {t(`learn.dg.${k}`)}
          </T>
          <T x={460} y={66 + i * 16} anchor="start">
            {v}
          </T>
        </g>
      ))}

      {/* shielded ledger */}
      <rect x="370" y="146" width="250" height="84" fill={SURFACE} stroke={ACCENT} strokeOpacity="0.5" />
      <T x={382} y={162} anchor="start" fill={MUTED} max={230}>
        {t("learn.dg.chainEncrypted")}
      </T>
      {["from", "to", "amount"].map((k, i) => (
        <g key={k}>
          <T x={382} y={182 + i * 16} anchor="start" fill={MUTED} max={72}>
            {t(`learn.dg.${k}`)}
          </T>
          <Redacted x={460} y={182 + i * 16} w={[96, 80, 64][i]} />
        </g>
      ))}
      <T x={606} y={214} anchor="end" fill={GREEN} max={100}>
        {`${t("learn.dg.proof")} ✓`}
      </T>
    </Frame>
  );
}

/* ── 02 · Viewing keys ────────────────────────────────────────────────────── */

export function ViewingKeyDiagram() {
  const t = useT();
  const path = "M200 110 C280 110 300 60 380 60";
  const rows = (
    <>
      <T x={402} y={78} anchor="start">
        + 1.20 ZEC
      </T>
      <T x={492} y={78} anchor="start" fill={MUTED} max={112}>
        {`${t("learn.dg.memoLower")}: INV-42`}
      </T>
      <T x={402} y={96} anchor="start">
        − 0.35 ZEC
      </T>
      <T x={492} y={96} anchor="start" fill={MUTED} max={112}>
        {`${t("learn.dg.memoLower")}: ${t("learn.dg.rent")}`}
      </T>
    </>
  );
  const key = (
    <g>
      <circle r="6" fill="none" stroke={ACCENT} strokeWidth="1.5" />
      <path d="M6 0 H20 M15 0 V5 M19 0 V4" stroke={ACCENT} strokeWidth="1.5" />
    </g>
  );
  return (
    <Frame label={t("learn.dg.viewing.aria")}>
      {/* wallet */}
      <rect x="30" y="50" width="170" height="130" fill={SURFACE} stroke="var(--fg)" strokeOpacity="0.6" />
      <T x={115} y={40} max={180}>
        {t("learn.dg.yourWallet")}
      </T>
      <rect x="46" y="70" width="138" height="38" fill="var(--surface-2)" stroke="var(--border-strong)" />
      <Lock x={62} y={90} />
      <T x={76} y={88} anchor="start" max={104}>
        {t("learn.dg.spendingKey")}
      </T>
      <T x={76} y={101} anchor="start" fill={MUTED} max={104}>
        {t("learn.dg.neverShared")}
      </T>
      <rect x="46" y="120" width="138" height="38" fill="var(--surface-2)" stroke={ACCENT} strokeOpacity="0.7" />
      <g transform="translate(56 139)">{key}</g>
      <T x={82} y={138} anchor="start" max={98}>
        {t("learn.dg.viewingKey")}
      </T>
      <T x={82} y={151} anchor="start" fill={MUTED} max={98}>
        {t("learn.dg.readOnly")}
      </T>

      <path d={path} stroke={ACCENT} strokeOpacity="0.5" strokeDasharray="3 5" fill="none" />
      <path d="M200 150 C280 150 300 190 380 190" stroke="var(--fg)" strokeOpacity="0.15" strokeDasharray="3 5" fill="none" />

      {/* auditor */}
      <rect x="390" y="40" width="220" height="70" fill={SURFACE} stroke={ACCENT} strokeOpacity="0.7" />
      <T x={500} y={30} max={250}>
        {t("learn.dg.auditor")}
      </T>
      <Motion
        moving={
          <>
            <g>
              {key}
              <animateMotion dur="4s" repeatCount="indefinite" path={path} keyPoints="0;1;1" keyTimes="0;0.45;1" calcMode="linear" />
              <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.45;0.5" dur="4s" repeatCount="indefinite" />
            </g>
            <g opacity="0">
              {rows}
              <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.45;0.55;0.92;1" dur="4s" repeatCount="indefinite" />
            </g>
          </>
        }
        still={rows}
      />

      {/* everyone else */}
      <rect x="390" y="160" width="220" height="60" fill={SURFACE} stroke="var(--border-strong)" />
      <T x={500} y={238} fill={MUTED} max={250}>
        {t("learn.dg.everyoneElse")}
      </T>
      <Redacted x={402} y={184} w={80} />
      <Redacted x={492} y={184} w={96} />
      <Redacted x={402} y={204} w={70} />
      <Redacted x={492} y={204} w={60} />

      <T x={115} y={210} fill={GREEN} max={210}>
        {t("learn.dg.canSee")}
      </T>
    </Frame>
  );
}

/* ── 03 · Unified addresses ───────────────────────────────────────────────── */

export function UnifiedDiagram() {
  const t = useT();
  const receivers = [
    { y: 60, label: "ORCHARD", sub: t("learn.dg.shieldedNewest"), color: ACCENT },
    { y: 130, label: "SAPLING", sub: t("learn.dg.shielded"), color: GREEN },
    { y: 200, label: t("learn.dg.transparentCaps"), sub: t("learn.dg.optionalPublic"), color: MUTED },
  ];
  const into = receivers.map((r) => `M170 ${r.y} C220 ${r.y} 220 130 270 130`);
  const pay = "M560 130 L420 130 C330 130 330 60 172 60";
  return (
    <Frame label={t("learn.dg.unified.aria")}>
      {receivers.map((r, i) => (
        <g key={r.y}>
          <rect x="30" y={r.y - 20} width="140" height="40" fill={SURFACE} stroke={r.color} strokeOpacity="0.8" />
          <T x={44} y={r.y - 3} anchor="start" max={120}>
            {r.label}
          </T>
          <T x={44} y={r.y + 11} anchor="start" fill={MUTED} max={120}>
            {r.sub}
          </T>
          <path d={into[i]} stroke="var(--fg)" strokeOpacity="0.2" fill="none" />
        </g>
      ))}
      <rect x="270" y="108" width="150" height="44" fill="var(--surface-2)" stroke="var(--fg)" strokeOpacity="0.8" />
      <T x={345} y={127} size={11}>
        u1qz8…7h4x
      </T>
      <T x={345} y={143} fill={MUTED} max={142}>
        {t("learn.dg.oneAddress")}
      </T>
      <T x={345} y={92} fill={MUTED} max={180}>
        {t("learn.dg.unifiedAddress")}
      </T>

      <path d={pay} stroke={ACCENT} strokeOpacity="0.45" strokeDasharray="3 5" fill="none" />
      <Node x={560} y={130} title={t("learn.dg.payerWallet")} sub={t("learn.dg.picksBest")} max={156} />

      <Motion
        moving={
          <>
            {into.map((p, i) => (
              <circle key={p} r="3" fill={receivers[i].color}>
                <animateMotion dur="2.4s" begin={`-${i * 0.4}s`} repeatCount="indefinite" path={p} />
              </circle>
            ))}
            <circle r="4" fill={ACCENT}>
              <animateMotion dur="4s" repeatCount="indefinite" path={pay} />
            </circle>
          </>
        }
        still={null}
      />
      <T x={330} y={240} fill={MUTED} max={620}>
        {t("learn.dg.unifiedNote")}
      </T>
    </Frame>
  );
}

/* ── 04 · Choosing a wallet ───────────────────────────────────────────────── */

export function WalletDiagram() {
  const t = useT();
  const shield = "M88 186 C88 160 130 160 130 120";
  return (
    <Frame label={t("learn.dg.wallet.aria")}>
      {/* phone */}
      <rect x="40" y="20" width="160" height="225" rx="14" fill={SURFACE} stroke="var(--fg)" strokeOpacity="0.6" />
      <rect x="100" y="28" width="40" height="5" rx="2.5" fill="var(--border-strong)" />
      <T x={120} y={58} fill={MUTED} max={140}>
        {t("learn.dg.balance")}
      </T>
      <T x={120} y={80} size={14}>
        12.40 ZEC
      </T>
      <rect x="58" y="100" width="124" height="34" fill="var(--surface-2)" stroke={ACCENT} strokeOpacity="0.8" />
      <Lock x={72} y={118} color={ACCENT} />
      <T x={86} y={121} anchor="start" max={92}>
        {`${t("learn.dg.shieldedCaps")} 12.30`}
      </T>
      <rect x="58" y="172" width="124" height="28" fill="var(--surface-2)" stroke="var(--border-strong)" />
      <T x={70} y={190} anchor="start" fill={MUTED} max={108}>
        {`${t("learn.dg.transparentCaps")} 0.10`}
      </T>
      <path d={shield} stroke={ACCENT} strokeOpacity="0.5" strokeDasharray="2 4" fill="none" />
      <T x={150} y={156} anchor="start" fill={ACCENT} max={62}>
        {t("learn.dg.shieldVerb")}
      </T>
      <T x={120} y={226} fill={GREEN} max={150}>
        {`● ${t("learn.dg.byDefault")}`}
      </T>

      {/* QR link */}
      <Motion
        moving={
          <path d="M220 130 L420 130" stroke="var(--fg)" strokeOpacity="0.35" strokeDasharray="4 6" fill="none">
            <animate attributeName="stroke-dashoffset" values="0;-20" dur="1s" repeatCount="indefinite" />
          </path>
        }
        still={<path d="M220 130 L420 130" stroke="var(--fg)" strokeOpacity="0.35" strokeDasharray="4 6" fill="none" />}
      />
      <T x={320} y={118} fill={MUTED} max={210}>
        {t("learn.dg.signQr")}
      </T>

      {/* hardware signer */}
      <rect x="430" y="40" width="150" height="190" rx="8" fill={SURFACE} stroke="var(--fg)" strokeOpacity="0.6" />
      <T x={505} y={30} fill={MUTED} max={180}>
        {t("learn.dg.hardware")}
      </T>
      {/* QR codes stay dark-on-white in both themes. */}
      <rect x="465" y="70" width="80" height="80" fill="#ffffff" />
      {Array.from({ length: 36 }, (_, i) => {
        const cx = i % 6;
        const cy = Math.floor(i / 6);
        const on = (cx * 7 + cy * 13 + cx * cy) % 3 !== 0;
        return on ? <rect key={i} x={469 + cx * 12} y={74 + cy * 12} width="10" height="10" fill="#0b0b0c" /> : null;
      })}
      <T x={505} y={180} max={140}>
        {t("learn.dg.offline")}
      </T>
      <T x={505} y={198} fill={MUTED} max={140}>
        {t("learn.dg.approve")}
      </T>

      <Motion
        moving={
          <circle r="4" fill={ACCENT}>
            <animateMotion dur="2.8s" repeatCount="indefinite" path={shield} />
          </circle>
        }
        still={null}
      />
    </Frame>
  );
}

/* ── 05 · Shield after a swap ─────────────────────────────────────────────── */

export function ShieldStepsDiagram() {
  const t = useT();
  const steps = [
    { x: 50, t: t("learn.dg.anyCoin"), s: "BTC, ETH, SOL…" },
    { x: 185, t: t("learn.dg.zcanSwap"), s: "NEAR Intents" },
    { x: 320, t: t("learn.dg.yourT1"), s: t("learn.dg.publicBalance") },
    { x: 455, t: t("learn.dg.shieldVerb"), s: t("learn.dg.oneTx") },
    { x: 590, t: t("learn.dg.shieldedCaps"), s: t("learn.dg.privateBalance") },
  ];
  const pub = "M50 120 L320 120";
  const priv = "M320 120 L590 120";
  return (
    <Frame label={t("learn.dg.steps.aria")}>
      <path d="M50 70 L50 62 L320 62 L320 70" stroke="var(--fg)" strokeOpacity="0.3" fill="none" />
      <T x={185} y={54} fill={MUTED} max={260}>
        {t("learn.dg.visible")}
      </T>
      <path d="M330 70 L330 62 L590 62 L590 70" stroke={ACCENT} strokeOpacity="0.6" fill="none" />
      <T x={460} y={54} fill={ACCENT} max={250}>
        {t("learn.dg.encryptedFrom")}
      </T>

      <path d={pub} stroke="var(--fg)" strokeOpacity="0.35" fill="none" />
      <path d={priv} stroke={ACCENT} strokeOpacity="0.7" fill="none" />
      {steps.map((s, i) => (
        <g key={s.x}>
          <Node x={s.x} y={120} title={s.t} sub={s.s} hot={i >= 3} max={i === 0 || i === 4 ? 98 : 126} />
          <circle cx={s.x} cy={195} r="10" fill={SURFACE} stroke={i >= 3 ? ACCENT : "var(--border-strong)"} />
          <T x={s.x} y={199}>
            {String(i + 1)}
          </T>
        </g>
      ))}
      <Motion
        moving={
          <>
            <circle r="4" fill="var(--fg)">
              <animateMotion dur="5s" repeatCount="indefinite" path={pub} keyPoints="0;1;1" keyTimes="0;0.5;1" calcMode="linear" />
            </circle>
            <g>
              <Lock x={0} y={0} color={ACCENT} />
              <animateMotion dur="5s" repeatCount="indefinite" path={priv} keyPoints="0;0;1" keyTimes="0;0.5;1" calcMode="linear" />
            </g>
          </>
        }
        still={
          <g transform="translate(455 104)">
            <Lock x={0} y={0} color={ACCENT} />
          </g>
        }
      />
      <T x={320} y={240} fill={MUTED} max={630}>
        {t("learn.dg.stepsNote")}
      </T>
    </Frame>
  );
}

/* ── 06 · Encrypted memos ─────────────────────────────────────────────────── */

export function MemoDiagram() {
  const t = useT();
  const path = "M70 95 L570 95";
  const envelope = (color: string) => (
    <g>
      <rect x="-14" y="-9" width="28" height="18" fill={SURFACE} stroke={color} />
      <path d="M-14 -9 L0 2 L14 -9" fill="none" stroke={color} />
    </g>
  );
  const plain = (
    <>
      <T x={470} y={160} anchor="start">
        INV-2041
      </T>
      <T x={470} y={176} anchor="start" fill={MUTED} max={142}>
        {t("learn.dg.thanks")}
      </T>
    </>
  );
  return (
    <Frame label={t("learn.dg.memo.aria")}>
      <path d={path} stroke={ACCENT} strokeOpacity="0.6" fill="none" />
      <Node x={70} y={95} title={t("learn.dg.you")} sub={t("learn.dg.writeMemo")} max={136} />
      <Node x={570} y={95} title={t("learn.dg.recipient")} sub={t("learn.dg.decrypts")} hot max={136} />

      {/* on-chain view */}
      <rect x="225" y="140" width="190" height="56" fill={SURFACE} stroke="var(--border-strong)" />
      <T x={320} y={130} fill={MUTED} max={200}>
        {t("learn.dg.onChain512")}
      </T>
      <T x={237} y={160} anchor="start" fill={MUTED} max={40}>
        {t("learn.dg.memoCaps")}
      </T>
      <Redacted x={280} y={160} w={120} />
      <Redacted x={237} y={180} w={163} />

      {/* recipient view */}
      <rect x="458" y="140" width="162" height="56" fill="var(--surface-2)" stroke={ACCENT} strokeOpacity="0.7" />
      <Motion
        moving={
          <>
            <g>
              {envelope(ACCENT)}
              <animateMotion dur="4s" repeatCount="indefinite" path={path} keyPoints="0;1;1" keyTimes="0;0.6;1" calcMode="linear" />
            </g>
            <g opacity="0">
              {plain}
              <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.6;0.66;0.95;1" dur="4s" repeatCount="indefinite" />
            </g>
          </>
        }
        still={
          <>
            <g transform="translate(320 95)">{envelope(ACCENT)}</g>
            {plain}
          </>
        }
      />

      {/* transparent */}
      <rect x="30" y="140" width="160" height="56" fill={SURFACE} stroke="var(--red)" strokeOpacity="0.5" strokeDasharray="3 4" />
      <T x={42} y={162} anchor="start" fill={MUTED} max={140}>
        {t("learn.dg.toT1")}
      </T>
      <T x={42} y={180} anchor="start" fill="var(--red)" max={140}>
        {`✕ ${t("learn.dg.noMemo")}`}
      </T>
      <T x={320} y={236} fill={MUTED} max={600}>
        {t("learn.dg.memoNote")}
      </T>
    </Frame>
  );
}
