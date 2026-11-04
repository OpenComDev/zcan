"use client";

import { useSyncExternalStore } from "react";
import { isEmptyProfile, sanitizeProfile, type AgentProfile } from "./agent-profile";

/**
 * Agent memory: an optional profile the user saves so agents don't ask the same questions every run.
 *
 * Encryption at rest, device-only:
 * - A random AES-256-GCM key is generated with WebCrypto as NON-EXTRACTABLE and kept in IndexedDB.
 *   IndexedDB stores CryptoKey objects by structured clone, which keeps them non-extractable: page
 *   code can encrypt and decrypt with the key but can never read or export its bytes.
 * - Only the ciphertext and IV go into localStorage (zcan:agent-memory:v1).
 * - If IndexedDB or WebCrypto isn't available (some private modes, insecure origins), nothing is
 *   written at all: the profile lives in memory for this page session only. Never plaintext.
 *
 * What this protects against: the profile sitting readable in browser storage, in Zcan backups, in
 * profile sync or in disk copies of localStorage. What it doesn't: anyone who can use this browser
 * profile, or malware on the device — they can ask the page to decrypt it.
 *
 * Backups leave this out on purpose (src/app/history/backup.ts): the ciphertext is useless anywhere
 * else because its key never leaves this browser. "Forget all local data" deletes both.
 */

export const MEMORY_KEY = "zcan:agent-memory:v1";
/** "off" when the user switched the profile off for runs. Not sensitive, so stored as-is. */
export const MEMORY_USE_KEY = "zcan:agent-memory:use";
/** Every localStorage key this feature owns starts with this. Backups skip it. */
export const MEMORY_PREFIX = "zcan:agent-memory";

const EVENT = "zcan:agent-memory";
const LOCAL_EVENT = "zcan:local";
const DB_NAME = "zcan-agent-memory";
const STORE = "keys";
const KEY_ID = "profile-key";
const AAD = new TextEncoder().encode("zcan-agent-memory:v1");

export type MemoryStatus = "loading" | "empty" | "ready" | "unavailable";
export type MemoryState = {
  status: MemoryStatus;
  /** Decrypted profile (or the session-only one when status is "unavailable"). */
  profile: AgentProfile | null;
  /** Use the profile in agent runs (default on). */
  useForRuns: boolean;
  /** A saved profile existed but couldn't be unlocked (its key was cleared), so it was removed. */
  lost?: boolean;
};

const SERVER: MemoryState = { status: "loading", profile: null, useForRuns: true };

let state: MemoryState = SERVER;
let started = false;
/** Session-only fallback when the device can't keep an encrypted copy. */
let sessionUse: boolean | null = null;

function emit(next: MemoryState) {
  state = next;
  window.dispatchEvent(new Event(EVENT));
}

function readUse(): boolean {
  if (sessionUse !== null) return sessionUse;
  try {
    return localStorage.getItem(MEMORY_USE_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Whether this browser can keep an encrypted copy at all (a cheap check; real failures are caught on save). */
function canPersist(): boolean {
  try {
    return typeof indexedDB !== "undefined" && Boolean(globalThis.crypto?.subtle) && window.isSecureContext !== false;
  } catch {
    return false;
  }
}

// ---------- IndexedDB key ----------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("blocked"));
  });
}

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result as T);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

async function getKey(create: boolean): Promise<CryptoKey | null> {
  const existing = await idb<CryptoKey | undefined>("readonly", (s) => s.get(KEY_ID));
  if (existing) return existing;
  if (!create) return null;
  // extractable: false — the key's bytes can never be read back out by page code.
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await idb("readwrite", (s) => s.put(key, KEY_ID));
  return key;
}

function deleteDb(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ---------- encoding ----------

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

type Sealed = { v: 1; iv: string; ct: string };

function readSealed(): Sealed | null {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<Sealed>;
    return o && o.v === 1 && typeof o.iv === "string" && typeof o.ct === "string" ? (o as Sealed) : null;
  } catch {
    return null;
  }
}

function removeSealed() {
  try {
    localStorage.removeItem(MEMORY_KEY);
  } catch {
    // Storage blocked — nothing there.
  }
}

// ---------- loading ----------

async function load() {
  const useForRuns = readUse();
  // Keep a session-only profile across re-loads triggered by other events.
  if (state.status === "unavailable" && state.profile) return emit({ ...state, useForRuns });
  const sealed = readSealed();
  if (!sealed) return emit({ status: canPersist() ? "empty" : "unavailable", profile: null, useForRuns });
  if (!canPersist()) return emit({ status: "unavailable", profile: null, useForRuns });
  let key: CryptoKey | null;
  try {
    key = await getKey(false);
  } catch {
    // IndexedDB failed to open. Leave the saved copy alone; it may open next time.
    return emit({ status: "unavailable", profile: null, useForRuns });
  }
  try {
    if (!key) throw new Error("no key");
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(sealed.iv), additionalData: AAD }, key, unb64(sealed.ct));
    const profile = sanitizeProfile(JSON.parse(new TextDecoder().decode(plain)));
    emit(profile ? { status: "ready", profile, useForRuns } : { status: "empty", profile: null, useForRuns });
  } catch {
    // The key is gone (site data partly cleared) or the ciphertext was changed: it can never be read again.
    removeSealed();
    emit({ status: "empty", profile: null, useForRuns, lost: true });
  }
}

function subscribe(cb: () => void) {
  if (!started) {
    started = true;
    void load();
  }
  const reload = () => void load();
  const onStorage = (e: StorageEvent) => {
    if (e.key === MEMORY_KEY || e.key === MEMORY_USE_KEY || e.key === null) reload();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  window.addEventListener(LOCAL_EVENT, reload);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LOCAL_EVENT, reload);
  };
}

export function useAgentMemory(): MemoryState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER,
  );
}

/** The profile to send with a run right now, or null (none saved, or switched off). */
export function profileForRuns(): AgentProfile | null {
  return state.useForRuns && !isEmptyProfile(state.profile) ? state.profile : null;
}

// ---------- writes ----------

export type SaveResult = { ok: true; persisted: boolean } | { ok: false };

/**
 * Encrypts and saves the profile. An empty profile forgets it. When the device can't keep an
 * encrypted copy, the profile is kept for this session only (`persisted: false`) — never in plaintext.
 */
export async function saveProfile(input: AgentProfile): Promise<SaveResult> {
  const profile = sanitizeProfile(input);
  if (!profile) {
    await forgetProfile();
    return { ok: true, persisted: true };
  }
  const useForRuns = readUse();
  if (canPersist()) {
    try {
      const key = await getKey(true);
      if (!key) throw new Error("no key");
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD }, key, new TextEncoder().encode(JSON.stringify(profile)));
      const sealed: Sealed = { v: 1, iv: b64(iv), ct: b64(ct) };
      localStorage.setItem(MEMORY_KEY, JSON.stringify(sealed));
      emit({ status: "ready", profile, useForRuns });
      return { ok: true, persisted: true };
    } catch {
      // Fall through to session-only. Don't leave a half-written copy behind.
      removeSealed();
    }
  }
  emit({ status: "unavailable", profile, useForRuns });
  return { ok: true, persisted: false };
}

/** Deletes the ciphertext and the IndexedDB key (and any session-only copy). */
export async function forgetProfile(): Promise<void> {
  removeSealed();
  try {
    localStorage.removeItem(MEMORY_USE_KEY);
  } catch {
    // Storage blocked.
  }
  sessionUse = null;
  state = { status: canPersist() ? "empty" : "unavailable", profile: null, useForRuns: true };
  if (typeof indexedDB !== "undefined") await deleteDb();
  emit({ ...state });
}

/** Turns using the profile in agent runs on or off. */
export function setUseForRuns(on: boolean) {
  try {
    if (on) localStorage.removeItem(MEMORY_USE_KEY);
    else localStorage.setItem(MEMORY_USE_KEY, "off");
    sessionUse = null;
  } catch {
    sessionUse = on;
  }
  emit({ ...state, useForRuns: on });
}

/** Clears the "couldn't be unlocked" notice once it has been seen. */
export function dismissLost() {
  if (state.lost) emit({ ...state, lost: false });
}
