"use client";

import { ALERTS_KEY, isAlert, resetAlerts, type Alert } from "@/lib/alerts";
import { resetBatches, type Batch } from "@/lib/batches";
import { resetHistory, type HistoryEntry } from "@/lib/history";
import { MEMORY_PREFIX, forgetProfile } from "@/lib/agent-memory";

/**
 * Export, encrypted backup, import and wipe for everything Zcan keeps in this browser
 * (every localStorage key that starts with "zcan:").
 *
 * One exception: the encrypted agent-memory profile (zcan:agent-memory…) is never exported or
 * imported. Its key is a non-extractable CryptoKey in this browser's IndexedDB, so the ciphertext
 * would be useless anywhere else. "Forget everything" still deletes it, key included.
 */

export const PREFIX = "zcan:";
export const HISTORY_KEY = "zcan:history:v1";
export const BATCHES_KEY = "zcan:batches:v1";
/** Fired after an import or wipe so views of raw storage can refresh. */
export const LOCAL_EVENT = "zcan:local";

const FORMAT = "zcan-backup";
const VERSION = 1;
const ITERATIONS = 600_000;
const AAD = new TextEncoder().encode(`${FORMAT}:v${VERSION}`);
const CAPS: Record<string, number> = { [HISTORY_KEY]: 50, [BATCHES_KEY]: 30, [ALERTS_KEY]: 50 };

export type PlainBackup = { format: typeof FORMAT; version: 1; exportedAt: string; data: Record<string, unknown> };
export type EncryptedBackup = {
  format: typeof FORMAT;
  version: 1;
  encrypted: true;
  exportedAt: string;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
  cipher: { name: "AES-GCM"; iv: string };
  ciphertext: string;
};

export type BackupErrorCode = "not-json" | "not-zcan" | "version" | "needs-passphrase" | "wrong-passphrase" | "no-crypto";

/** `key` is the UI message under `history.backupErr.*`; `message` stays English for logs. */
export class BackupError extends Error {
  readonly code: BackupErrorCode;
  readonly key: string;
  readonly vars?: Record<string, string | number>;
  constructor(message: string, code: BackupErrorCode, key: string, vars?: Record<string, string | number>) {
    super(message);
    this.code = code;
    this.key = key;
    this.vars = vars;
  }
}

/* ---------------- reading local data ---------------- */

function zcanKeys(store: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k?.startsWith(PREFIX)) keys.push(k);
  }
  return keys.sort();
}

const parse = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

/** Keys that stay in this browser: never exported, never imported. */
const deviceOnly = (k: string) => k.startsWith(MEMORY_PREFIX);

/** Every zcan: key in localStorage (except device-only ones), JSON-decoded where possible. */
export function collectLocal(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  try {
    for (const k of zcanKeys(localStorage)) if (!deviceOnly(k)) out[k] = parse(localStorage.getItem(k) ?? "");
  } catch {
    // Storage blocked — nothing to export.
  }
  return out;
}

/** A small, stable summary of local data for rendering ("key=bytes" joined). */
export function localSignature(): string {
  try {
    return zcanKeys(localStorage)
      .map((k) => `${k}=${localStorage.getItem(k)?.length ?? 0}`)
      .join("|");
  } catch {
    return "";
  }
}

/* ---------------- export ---------------- */

export function plainBackup(): PlainBackup {
  return { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), data: collectLocal() };
}

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  if (!globalThis.crypto?.subtle) throw new BackupError("Encryption needs a secure (https) page.", "no-crypto", "noCrypto");
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** PBKDF2-SHA-256 (600k iterations) → AES-256-GCM, random 16-byte salt and 12-byte IV. */
export async function encryptedBackup(passphrase: string): Promise<EncryptedBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const plain = new TextEncoder().encode(JSON.stringify(plainBackup()));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD }, key, plain);
  return {
    format: FORMAT,
    version: VERSION,
    encrypted: true,
    exportedAt: new Date().toISOString(),
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt: b64(salt) },
    cipher: { name: "AES-GCM", iv: b64(iv) },
    ciphertext: b64(ct),
  };
}

export function download(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const backupFilename = (encrypted: boolean) => `zcan-backup-${new Date().toISOString().slice(0, 10)}${encrypted ? ".encrypted" : ""}.json`;

/* ---------------- import ---------------- */

/** Parse a backup file's text. Returns the envelope; encrypted ones still need `openBackup`. */
export function readBackup(text: string): PlainBackup | EncryptedBackup {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new BackupError("That file isn't JSON. Pick a Zcan backup file.", "not-json", "notJson");
  }
  const o = obj as Partial<EncryptedBackup & PlainBackup> | null;
  if (!o || typeof o !== "object" || o.format !== FORMAT) throw new BackupError("That file isn't a Zcan backup.", "not-zcan", "notZcan");
  if (o.version !== VERSION) throw new BackupError(`This backup uses format version ${String(o.version)}, which this version of Zcan can't read.`, "version", "version", { v: String(o.version) });
  if (o.encrypted) {
    const ok =
      o.kdf?.name === "PBKDF2" &&
      o.kdf.hash === "SHA-256" &&
      typeof o.kdf.salt === "string" &&
      Number.isInteger(o.kdf.iterations) &&
      o.kdf.iterations >= 100_000 &&
      o.kdf.iterations <= 10_000_000 &&
      o.cipher?.name === "AES-GCM" &&
      typeof o.cipher.iv === "string" &&
      typeof o.ciphertext === "string";
    if (!ok) throw new BackupError("This encrypted backup is damaged or incomplete.", "not-zcan", "damaged");
    return o as EncryptedBackup;
  }
  if (!o.data || typeof o.data !== "object" || Array.isArray(o.data)) throw new BackupError("This backup has no data in it.", "not-zcan", "noData");
  return o as PlainBackup;
}

export const isEncrypted = (b: PlainBackup | EncryptedBackup): b is EncryptedBackup => "encrypted" in b && b.encrypted === true;

/** Decrypt an encrypted envelope; plain ones pass through. */
export async function openBackup(b: PlainBackup | EncryptedBackup, passphrase?: string): Promise<PlainBackup> {
  if (!isEncrypted(b)) return b;
  if (!passphrase) throw new BackupError("This backup is encrypted. Enter its passphrase.", "needs-passphrase", "needsPass");
  let plain: ArrayBuffer;
  try {
    const key = await deriveKey(passphrase, unb64(b.kdf.salt), b.kdf.iterations);
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(b.cipher.iv), additionalData: AAD }, key, unb64(b.ciphertext));
  } catch (e) {
    if (e instanceof BackupError) throw e;
    throw new BackupError("Wrong passphrase, or the file was changed after export.", "wrong-passphrase", "wrongPass");
  }
  return readBackup(new TextDecoder().decode(plain)) as PlainBackup;
}

const isEntry = (x: unknown): x is HistoryEntry => {
  const e = x as Record<string, unknown> | null;
  return (
    !!e &&
    typeof e === "object" &&
    ["depositAddress", "createdAt", "fromSymbol", "fromChain", "toSymbol", "toChain", "amountIn", "amountOut"].every((k) => typeof e[k] === "string")
  );
};

const isBatch = (x: unknown): x is Batch => {
  const b = x as Record<string, unknown> | null;
  return (
    !!b &&
    typeof b === "object" &&
    ["id", "createdAt", "fromSymbol", "fromChain", "toSymbol", "toChain"].every((k) => typeof b[k] === "string") &&
    Array.isArray(b.legs) &&
    b.legs.every((l) => !!l && typeof (l as BatchLegLike).depositAddress === "string")
  );
};
type BatchLegLike = { depositAddress?: unknown };

const newestFirst = (a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt);

function mergeBy<T>(local: T[], incoming: T[], id: (t: T) => string): { merged: T[]; added: number } {
  const seen = new Set(local.map(id));
  const fresh = incoming.filter((t) => {
    const k = id(t);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { merged: [...local, ...fresh], added: fresh.length };
}

export type ImportResult = { swaps: number; batches: number; alerts: number; other: number; dropped: number };

/**
 * Merge a backup into this browser. Existing entries win on conflicts; swaps de-dup by deposit
 * address, batches and alerts by id. Lists are capped like the stores cap them (newest kept).
 */
export function mergeBackup(b: PlainBackup): ImportResult {
  const res: ImportResult = { swaps: 0, batches: 0, alerts: 0, other: 0, dropped: 0 };
  const local = collectLocal();
  const asList = (v: unknown) => (Array.isArray(v) ? v : []);

  for (const [key, value] of Object.entries(b.data)) {
    if (!key.startsWith(PREFIX) || deviceOnly(key)) continue;
    let next: unknown;
    if (key === HISTORY_KEY || key === BATCHES_KEY || key === ALERTS_KEY) {
      const guard = key === HISTORY_KEY ? isEntry : key === BATCHES_KEY ? isBatch : isAlert;
      const id = (t: HistoryEntry | Batch | Alert) => ("depositAddress" in t ? t.depositAddress : t.id);
      const { merged, added } = mergeBy(asList(local[key]).filter(guard), asList(value).filter(guard), id);
      if (!added) continue;
      const sorted = (merged as { createdAt: string }[]).sort(newestFirst);
      const cap = CAPS[key];
      next = sorted.slice(0, cap);
      res.dropped += Math.max(0, sorted.length - cap);
      if (key === HISTORY_KEY) res.swaps += added;
      else if (key === BATCHES_KEY) res.batches += added;
      else res.alerts += added;
    } else if (!(key in local)) {
      next = value;
      res.other++;
    } else if (Array.isArray(local[key]) && Array.isArray(value)) {
      const id = (t: unknown) => (t && typeof t === "object" && typeof (t as { id?: unknown }).id === "string" ? (t as { id: string }).id : JSON.stringify(t));
      const { merged, added } = mergeBy(local[key] as unknown[], value, id);
      if (!added) continue;
      next = merged;
      res.other++;
    } else continue;
    try {
      localStorage.setItem(key, typeof next === "string" ? next : JSON.stringify(next));
    } catch {
      // Quota or blocked storage — skip this key.
    }
  }
  refreshStores();
  return res;
}

/* ---------------- wipe ---------------- */

/**
 * Remove every zcan: key from localStorage and sessionStorage (and the agent-memory key in IndexedDB), and the
 * language cookie, then reset the in-memory stores.
 */
export function forgetEverything() {
  // The agent-memory profile: ciphertext, settings and its IndexedDB key.
  void forgetProfile();
  try {
    document.cookie = "zcan-locale=; path=/; max-age=0";
  } catch {
    // Cookies blocked — nothing stored.
  }
  for (const store of [localStorage, sessionStorage]) {
    try {
      for (const k of zcanKeys(store)) store.removeItem(k);
    } catch {
      // Storage blocked — nothing stored there.
    }
  }
  refreshStores();
}

function refreshStores() {
  resetHistory();
  resetBatches();
  resetAlerts();
  window.dispatchEvent(new Event(LOCAL_EVENT));
}
