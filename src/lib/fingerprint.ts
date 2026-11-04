/**
 * Browser fingerprint self-test. Every check runs locally and nothing is sent anywhere — the WebRTC probe uses
 * no STUN/TURN servers, so it only sees what the browser would hand to any page.
 *
 * "Bits" are rough rarity heuristics (how much a value narrows down who you are), not a lookup against a real
 * population dataset. Treat them as estimates.
 *
 * No display text lives here: signals, notes, bands and fixes are stable ids/codes plus raw values, and the UI
 * turns them into words in the reader's language.
 */

export type SignalId =
  | "ua"
  | "uach"
  | "platform"
  | "lang"
  | "tz"
  | "screen"
  | "window"
  | "hw"
  | "touch"
  | "prefs"
  | "display"
  | "canvas"
  | "webgl"
  | "audio"
  | "fonts"
  | "storage"
  | "webrtc";

export type Signal = {
  id: SignalId;
  /** Raw value (UA string, sizes, IPs…), shown as-is when there's no `code`. */
  value: string;
  /** Picks the display text for the value; `vars` holds what it needs. */
  code?: string;
  vars?: Record<string, string | number>;
  /** Estimated identifying information, in bits. */
  bits: number;
  /** "good" = protected/randomized, "bad" = leaking. */
  status?: "good" | "bad";
  /** Picks the explanation shown under the value. */
  note?: string;
};

export type FixId = "webrtc" | "browser" | "fonts" | "window" | "dnt" | "extensions" | "basics";
export type Fix = { id: FixId };

export type Level = 1 | 2 | 3 | 4;
/** 1 = low … 4 = very high. */
export type Band = { level: Level };

export type FingerprintReport = {
  signals: Signal[];
  /** Sum of all signal bits, discounted for overlap between signals. */
  bits: number;
  band: Band;
  /** Roughly how many browsers share this combination (1 in N). */
  oneIn: number;
  /** Hash of the stable signals — compare it across sessions or in a private window. */
  hash: string;
  fixes: Fix[];
};

/** `step` is the check about to run; absent before the first one and after the last. */
export type Progress = { done: number; total: number; step?: SignalId };

/** Adjacent signals overlap (GPU ↔ screen ↔ platform…), so the sum overstates. */
const OVERLAP = 0.75;
/** ~33 bits is enough to single out one person among everyone online. */
export const UNIQUE_BITS = 33;

/** 1 = common, 2 = uncommon, 3 = rare, 4 = very rare. */
export function rarity(bits: number): Level {
  if (bits < 2) return 1;
  if (bits < 4) return 2;
  if (bits < 7) return 3;
  return 4;
}

function band(bits: number): Band {
  if (bits < 14) return { level: 1 };
  if (bits < 22) return { level: 2 };
  if (bits < 30) return { level: 3 };
  return { level: 4 };
}

// ---------- helpers ----------

type UAData = {
  brands?: { brand: string; version: string }[];
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
};
type NavExtra = {
  deviceMemory?: number;
  globalPrivacyControl?: boolean;
  brave?: unknown;
  userAgentData?: UAData;
  doNotTrack?: string | null;
};

const nav = () => navigator as unknown as Navigator & NavExtra;

/** cyrb53 — small, fast, non-cryptographic string hash. */
export function hash(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

// ---------- individual checks ----------

function userAgent(): Signal {
  const ua = navigator.userAgent;
  const reducedChrome = /Chrome\/\d+\.0\.0\.0 /.test(ua) || /Chrome\/\d+\.0\.0\.0$/.test(ua);
  const firefox = /Firefox\/\d+\.0$/.test(ua);
  const safari = /Version\/[\d.]+ (?:Mobile\/\w+ )?Safari\/[\d.]+$/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);
  const extraBrand = /Edg\/|OPR\/|YaBrowser|SamsungBrowser|Vivaldi|UCBrowser/.test(ua);
  let bits = reducedChrome || firefox || safari ? 5 : 8.5;
  if (extraBrand) bits += 1.5;
  return {
    id: "ua",
    value: ua,
    code: ua ? undefined : "empty",
    bits,
    note: bits > 7 ? "uaRare" : "uaCommon",
  };
}

async function clientHints(): Promise<Signal> {
  const data = nav().userAgentData;
  if (!data?.getHighEntropyValues) {
    return { id: "uach", value: "", code: "notExposed", bits: 0.5, note: "uachNone" };
  }
  const brands = (data.brands ?? []).filter((b) => !/Not.?A.?Brand/i.test(b.brand)).map((b) => `${b.brand} ${b.version}`);
  let detail = "";
  try {
    const hi = await data.getHighEntropyValues(["platformVersion", "architecture", "bitness", "model", "fullVersionList"]);
    detail = [hi.platformVersion && `${data.platform ?? ""} ${String(hi.platformVersion)}`.trim(), hi.architecture && `${String(hi.architecture)}${hi.bitness ? `-${String(hi.bitness)}` : ""}`, hi.model && String(hi.model)]
      .filter(Boolean)
      .join(" · ");
  } catch {
    // High-entropy hints refused — that's the protective outcome.
  }
  const value = [brands.join(", "), detail].filter(Boolean).join(" · ");
  return {
    id: "uach",
    value,
    code: value ? undefined : "present",
    bits: detail ? 3.5 : 1,
    note: detail ? "uachDetail" : undefined,
  };
}

function platform(): Signal {
  const p = navigator.platform;
  return { id: "platform", value: p, code: p ? undefined : "unknown", bits: /^(Win32|MacIntel|Linux x86_64|iPhone|iPad|Linux armv8l|Linux aarch64)$/.test(p) ? 1.5 : 3 };
}

function languages(): Signal {
  const langs = navigator.languages?.length ? [...navigator.languages] : [navigator.language];
  const first = langs[0] ?? "";
  let bits = first === "en-US" ? 2 : /^en\b/.test(first) ? 3 : 4;
  bits += Math.min(5, (langs.length - 1) * 1.5);
  return {
    id: "lang",
    value: langs.join(", "),
    code: langs.some(Boolean) ? undefined : "none",
    bits,
    note: langs.length > 1 ? "langMany" : undefined,
  };
}

const COMMON_TZ = new Set([
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Sao_Paulo", "America/Mexico_City",
  "Europe/London", "Europe/Berlin", "Europe/Paris", "Europe/Madrid", "Europe/Rome", "Europe/Moscow", "Europe/Istanbul",
  "Asia/Kolkata", "Asia/Calcutta", "Asia/Shanghai", "Asia/Tokyo", "Asia/Jakarta", "Asia/Manila", "Australia/Sydney",
]);

function timezone(): Signal {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const offset = -new Date().getTimezoneOffset() / 60;
  const off = `UTC${offset >= 0 ? "+" : "−"}${Math.abs(offset)}`;
  const utc = tz === "UTC" || tz === "Etc/UTC";
  return {
    id: "tz",
    value: utc ? "UTC" : tz ? `${tz} (${off})` : off,
    bits: utc ? 1.5 : COMMON_TZ.has(tz) ? 3.5 : 5.5,
    status: utc ? "good" : undefined,
    note: utc ? "tzUtc" : "tzRegion",
  };
}

const COMMON_SCREENS = new Set([
  "1920x1080", "1366x768", "1536x864", "1440x900", "1280x720", "1600x900", "2560x1440", "1280x800", "1280x1024", "1680x1050",
  "1512x982", "1470x956", "1728x1117", "1920x1200", "2560x1600", "3840x2160", "360x800", "390x844", "393x873", "412x915", "414x896", "375x812",
  "393x852", "430x932", "375x667", "428x926", "360x780", "768x1024", "820x1180", "1024x1366",
]);

function screenSignal(): Signal {
  const s = window.screen;
  const key = `${s.width}x${s.height}`;
  const dpr = Math.round(window.devicePixelRatio * 100) / 100;
  let bits = COMMON_SCREENS.has(key) ? 3.5 : 6;
  if (![1, 2, 3].includes(dpr)) bits += 1;
  if (s.colorDepth !== 24 && s.colorDepth !== 30) bits += 1;
  return {
    id: "screen",
    value: `${s.width} × ${s.height} · ${dpr}x · ${s.colorDepth}`,
    code: "screen",
    vars: { w: s.width, h: s.height, dpr, depth: s.colorDepth },
    bits,
    note: bits > 5 ? "screenRare" : undefined,
  };
}

function windowSize(): Signal {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const letterboxed = w > 0 && h > 0 && w % 100 === 0 && h % 100 === 0;
  return {
    id: "window",
    value: `${w} × ${h}`,
    bits: letterboxed ? 1 : 3,
    status: letterboxed ? "good" : undefined,
    note: letterboxed ? "windowLetterbox" : "windowSize",
  };
}

function hardware(): Signal {
  const cores = navigator.hardwareConcurrency;
  const mem = nav().deviceMemory;
  let bits = !cores ? 0.5 : cores === 8 || cores === 4 ? 2 : [2, 6, 10, 12, 16].includes(cores) ? 3 : 4.5;
  if (mem) bits += mem === 8 ? 1 : 2;
  return {
    id: "hw",
    value: `${cores || 0}/${mem || 0}`,
    code: "hw",
    vars: { cores: cores || 0, mem: mem || 0 },
    bits,
  };
}

function touch(): Signal {
  const n = navigator.maxTouchPoints ?? 0;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  return {
    id: "touch",
    value: `${n}${coarse ? "/coarse" : ""}`,
    code: n ? "touch" : "noTouch",
    vars: { n, coarse: coarse ? 1 : 0 },
    bits: n === 0 || n === 5 || n === 10 ? 1 : 3,
  };
}

function privacySignals(): Signal {
  const n = nav();
  const dnt = n.doNotTrack === "1" || (window as unknown as { doNotTrack?: string }).doNotTrack === "1";
  const gpc = n.globalPrivacyControl === true;
  const cookies = navigator.cookieEnabled;
  let bits = 0.5;
  if (dnt) bits += 1;
  if (gpc) bits += 0.5;
  if (!cookies) bits += 2;
  return {
    id: "prefs",
    value: `cookies=${+cookies} dnt=${+dnt} gpc=${+gpc}`,
    code: "prefs",
    vars: { cookies: +cookies, dnt: +dnt, gpc: +gpc },
    bits,
    note: dnt ? "dnt" : undefined,
  };
}

function displayPrefs(): Signal {
  const mq = (q: string) => window.matchMedia?.(q).matches ?? false;
  const dark = mq("(prefers-color-scheme: dark)");
  const reduced = mq("(prefers-reduced-motion: reduce)");
  const contrast = mq("(prefers-contrast: more)");
  const forced = mq("(forced-colors: active)");
  const bits = 1 + (reduced ? 1.5 : 0) + (contrast ? 2 : 0) + (forced ? 2.5 : 0);
  return {
    id: "display",
    value: `dark=${+dark} reduced=${+reduced} contrast=${+contrast} forced=${+forced}`,
    code: "display",
    vars: { dark: +dark, reduced: +reduced, contrast: +contrast, forced: +forced },
    bits,
  };
}

function drawCanvas(): string | null {
  const c = document.createElement("canvas");
  c.width = 240;
  c.height = 60;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.textBaseline = "top";
  ctx.font = "14px 'Arial'";
  ctx.fillStyle = "#f60";
  ctx.fillRect(110, 1, 62, 20);
  ctx.fillStyle = "#069";
  ctx.fillText("Zcan fingerprint, 😃 Ω ≈ ∑", 2, 15);
  ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
  ctx.font = "18px serif";
  ctx.fillText("Cwm fjordbank glyphs vext quiz", 4, 34);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "rgb(255,0,255)";
  ctx.beginPath();
  ctx.arc(200, 30, 22, 0, Math.PI * 2);
  ctx.fill();
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let uniform = true;
  for (let i = 4; i < data.length; i += 4) {
    if (data[i] !== data[0] || data[i + 1] !== data[1] || data[i + 2] !== data[2] || data[i + 3] !== data[3]) {
      uniform = false;
      break;
    }
  }
  return uniform ? "" : c.toDataURL();
}

function canvas(): Signal {
  let a: string | null;
  let b: string | null;
  try {
    a = drawCanvas();
    b = drawCanvas();
  } catch {
    a = b = "";
  }
  if (a === null) return { id: "canvas", value: "", code: "unavailable", bits: 2, status: "good" };
  if (!a) return { id: "canvas", value: "", code: "blankImage", bits: 1.5, status: "good", note: "canvasBlocked" };
  if (a !== b) return { id: "canvas", value: "", code: "randomized", bits: 1, status: "good", note: "canvasNoise" };
  const brave = !!nav().brave;
  const h = hash(a).slice(0, 12);
  return {
    id: "canvas",
    value: h,
    code: "hash",
    vars: { hash: h },
    bits: brave ? 2.5 : 8,
    status: brave ? "good" : "bad",
    note: brave ? "canvasBrave" : "canvasStable",
  };
}

function webgl(): Signal {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl") ?? c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return { id: "webgl", value: "", code: "disabled", bits: 3, note: "webglOff" };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR));
    const renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const exts = gl.getSupportedExtensions()?.length ?? 0;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    const generic = /^(WebKit|Mozilla|Generic Renderer|WebKit WebGL)$/i.test(renderer) || !ext;
    const apple = /Apple (GPU|M\d)/i.test(renderer);
    const bits = generic ? 1.5 : apple ? 3.5 : 6.5;
    return {
      id: "webgl",
      value: `${vendor} · ${renderer} · ${exts}`,
      code: "gpu",
      vars: { vendor, renderer, n: exts },
      bits,
      status: generic ? "good" : undefined,
      note: generic ? "gpuMasked" : "gpuNamed",
    };
  } catch {
    return { id: "webgl", value: "", code: "unavailable", bits: 2 };
  }
}

type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

async function renderAudio(Ctor: OfflineCtor): Promise<number | null> {
  const ctx = new Ctor(1, 5000, 44100);
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = 10000;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -50;
  comp.knee.value = 40;
  comp.ratio.value = 12;
  comp.attack.value = 0;
  comp.release.value = 0.25;
  osc.connect(comp);
  comp.connect(ctx.destination);
  osc.start(0);
  const buf = await withTimeout(ctx.startRendering(), 2500, null);
  if (!buf) return null;
  const data = buf.getChannelData(0);
  let sum = 0;
  for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i]);
  return sum;
}

async function audio(): Promise<Signal> {
  const w = window as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  const Ctor = w.OfflineAudioContext ?? w.webkitOfflineAudioContext;
  if (!Ctor) return { id: "audio", value: "", code: "unavailable", bits: 1.5, status: "good" };
  try {
    const a = await renderAudio(Ctor);
    const b = await renderAudio(Ctor);
    if (a === null || b === null) return { id: "audio", value: "", code: "timedOut", bits: 1.5, status: "good" };
    if (a !== b) return { id: "audio", value: "", code: "randomized", bits: 1, status: "good" };
    const brave = !!nav().brave;
    const h = hash(a.toString()).slice(0, 12);
    return {
      id: "audio",
      value: h,
      code: "hash",
      vars: { hash: h },
      bits: brave ? 2 : 4.5,
      status: brave ? "good" : undefined,
      note: brave ? "audioBrave" : "audioStable",
    };
  } catch {
    return { id: "audio", value: "", code: "unavailable", bits: 1.5 };
  }
}

export const PROBE_FONTS = [
  "Arial", "Arial Black", "Calibri", "Cambria", "Candara", "Comic Sans MS", "Consolas", "Constantia", "Corbel", "Courier New",
  "Franklin Gothic Medium", "Garamond", "Georgia", "Gill Sans", "Helvetica", "Helvetica Neue", "Impact", "Lucida Console",
  "Lucida Grande", "Menlo", "Monaco", "Palatino", "Segoe UI", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana",
  "Ubuntu", "DejaVu Sans", "Liberation Sans", "Noto Sans", "Roboto", "Cantarell", "Avenir", "Futura", "Optima",
];

function fonts(): Signal {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return { id: "fonts", value: "", code: "unavailable", bits: 1 };
  const text = "mmmmmmmmmmlli WWW 1234567890 @#&";
  const bases = ["monospace", "serif", "sans-serif"];
  const width = (font: string) => {
    ctx.font = `72px ${font}`;
    return ctx.measureText(text).width;
  };
  const base = bases.map(width);
  const found = PROBE_FONTS.filter((f) => bases.some((b, i) => width(`"${f}", ${b}`) !== base[i]));
  return {
    id: "fonts",
    value: found.join(", "),
    code: found.length ? "fonts" : "fontsNone",
    vars: { n: found.length, total: PROBE_FONTS.length, list: found.join(", ") },
    bits: Math.min(7.5, 1.5 + found.length * 0.25),
    status: found.length <= 4 ? "good" : undefined,
    note: found.length <= 4 ? "fontsFew" : "fontsMany",
  };
}

async function storage(): Promise<Signal> {
  const ok = (fn: () => void) => {
    try {
      fn();
      return true;
    } catch {
      return false;
    }
  };
  const local = ok(() => {
    localStorage.setItem("zcan:fp-probe", "1");
    localStorage.removeItem("zcan:fp-probe");
  });
  const session = ok(() => {
    sessionStorage.setItem("zcan:fp-probe", "1");
    sessionStorage.removeItem("zcan:fp-probe");
  });
  const idb = ok(() => {
    if (!window.indexedDB) throw new Error();
  });
  let quota: number | undefined;
  try {
    quota = (await withTimeout(navigator.storage?.estimate?.() ?? Promise.resolve(undefined), 1500, undefined))?.quota;
  } catch {
    quota = undefined;
  }
  return {
    id: "storage",
    value: `local=${+local} session=${+session} idb=${+idb} quota=${quota ? Math.round(quota / 1e9) : 0}`,
    code: "storage",
    /** quota in bytes, 0 when unknown. */
    vars: { local: +local, session: +session, idb: +idb, quota: quota ?? 0 },
    bits: (quota ? 2.5 : 1) + (local && session && idb ? 0 : 1.5),
    note: quota ? "quota" : undefined,
  };
}

const PRIVATE_IP = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|127\.|f[cd][0-9a-f]{2}:|fe80:|::1$)/i;

async function webrtc(): Promise<Signal> {
  const RTC = window.RTCPeerConnection;
  if (!RTC) return { id: "webrtc", value: "", code: "rtcDisabled", bits: 1.5, status: "good", note: "rtcOff" };
  const addresses = new Set<string>();
  let mdns = false;
  let pc: RTCPeerConnection;
  try {
    // No ICE servers: nothing leaves this device, we only see the host candidates the browser offers.
    pc = new RTC({ iceServers: [] });
  } catch {
    return { id: "webrtc", value: "", code: "rtcBlocked", bits: 1.5, status: "good" };
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 2500);
    pc.onicecandidate = (e) => {
      if (!e.candidate) return finish();
      const addr = e.candidate.address ?? e.candidate.candidate.split(" ")[4];
      if (!addr) return;
      if (addr.endsWith(".local")) mdns = true;
      else addresses.add(addr);
    };
    pc.createDataChannel("probe");
    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .catch(finish);
  });
  pc.close();
  const ips = [...addresses];
  const publicIps = ips.filter((ip) => !PRIVATE_IP.test(ip));
  if (publicIps.length) {
    return { id: "webrtc", value: publicIps.join(", "), code: "rtcPublic", vars: { ips: publicIps.join(", ") }, bits: 8, status: "bad", note: "rtcPublic" };
  }
  if (ips.length) {
    return { id: "webrtc", value: ips.join(", "), code: "rtcLocal", vars: { ips: ips.join(", ") }, bits: 4, status: "bad", note: "rtcLocal" };
  }
  return { id: "webrtc", value: "", code: mdns ? "rtcMdns" : "rtcNone", bits: 0.5, status: "good", note: "rtcHidden" };
}

// ---------- run ----------

type Step = { id: SignalId; run: () => Signal | Promise<Signal> };

const STEPS: Step[] = [
  { id: "ua", run: userAgent },
  { id: "uach", run: clientHints },
  { id: "platform", run: platform },
  { id: "lang", run: languages },
  { id: "tz", run: timezone },
  { id: "screen", run: screenSignal },
  { id: "window", run: windowSize },
  { id: "hw", run: hardware },
  { id: "touch", run: touch },
  { id: "prefs", run: privacySignals },
  { id: "display", run: displayPrefs },
  { id: "canvas", run: canvas },
  { id: "webgl", run: webgl },
  { id: "audio", run: audio },
  { id: "fonts", run: fonts },
  { id: "storage", run: storage },
  { id: "webrtc", run: webrtc },
];

export const STEP_COUNT = STEPS.length;

/** Signals that change with window size or network aren't part of the stable hash. */
const VOLATILE = new Set(["window", "webrtc"]);

function fixesFor(by: Map<string, Signal>): Fix[] {
  const fixes: Fix[] = [];
  const webrtcSignal = by.get("webrtc");
  if (webrtcSignal?.status === "bad") fixes.push({ id: "webrtc" });
  const stable = ["canvas", "audio", "webgl"].some((id) => {
    const s = by.get(id);
    return s && s.status !== "good" && s.bits >= 4;
  });
  if (stable) fixes.push({ id: "browser" });
  const fontSignal = by.get("fonts");
  if (fontSignal && fontSignal.bits >= 5) fixes.push({ id: "fonts" });
  if (by.get("window")?.status !== "good") fixes.push({ id: "window" });
  if (by.get("prefs")?.vars?.dnt) fixes.push({ id: "dnt" });
  fixes.push({ id: "extensions" }, { id: "basics" });
  return fixes;
}

export async function runFingerprint(onProgress?: (p: Progress) => void): Promise<FingerprintReport> {
  const signals: Signal[] = [];
  for (const [i, step] of STEPS.entries()) {
    onProgress?.({ done: i, total: STEPS.length, step: step.id });
    // Yield so the progress can paint between checks.
    await new Promise((r) => setTimeout(r, 30));
    try {
      signals.push(await step.run());
    } catch {
      signals.push({ id: step.id, value: "", code: "failed", bits: 0 });
    }
  }
  onProgress?.({ done: STEPS.length, total: STEPS.length });

  const raw = signals.reduce((sum, s) => sum + s.bits, 0);
  const bits = Math.round(raw * OVERLAP * 10) / 10;
  const by = new Map(signals.map((s) => [s.id, s]));
  return {
    signals,
    bits,
    band: band(bits),
    oneIn: Math.min(ONE_IN_MAX, 2 ** bits),
    hash: hash(
      signals
        .filter((s) => !VOLATILE.has(s.id))
        .map((s) => `${s.id}=${s.code ?? ""}:${s.value}`)
        .join("|"),
    ).slice(0, 12),
    fixes: fixesFor(by),
  };
}

/** At or above this, `oneIn` means "likely unique". */
export const ONE_IN_MAX = 8e9;

