/**
 * Local, offline address detection and validation. Nothing here touches the network.
 *
 * Covers Zcash (transparent t1/t3, Sapling zs1, Unified u1 incl. receiver decoding, TEX),
 * Bitcoin (base58 + bech32/bech32m), EVM (EIP-55), Solana, NEAR, Tron, Litecoin, Dogecoin, XRP.
 */
import { getAddress, isAddress, sha256 } from "viem";

export type ChainId = "zcash" | "bitcoin" | "evm" | "solana" | "near" | "tron" | "litecoin" | "dogecoin" | "xrp";
export type Privacy = "shielded" | "transparent" | "public";
export type ChecksumState = "valid" | "invalid" | "none";
export type ActivitySource = "bitcoin" | "ethereum" | "zcash";

export type AddressInfo = {
  /** Trimmed input. */
  address: string;
  chainId: ChainId;
  chain: string;
  /** e.g. "Unified", "Sapling", "Transparent (P2PKH)". */
  type: string;
  /** Stable id for `type` (key of TYPE_NAMES), plus variables like {version}. */
  typeId: TypeId;
  typeVars?: Record<string, string | number>;
  /** Stable key for "same kind of address" comparisons, e.g. "zcash:shielded", "evm". */
  kind: string;
  privacy: Privacy;
  privacyNote: string;
  privacyNoteId: PrivacyNoteId;
  checksum: ChecksumState;
  /** Explains the checksum verdict (or why there is none). */
  checksumNote: string;
  checksumNoteId: ChecksumNoteId;
  /** Unified addresses: receivers found inside. */
  receivers?: string[];
  /** Unified addresses: receiver typecodes (0 P2PKH, 1 P2SH, 2 Sapling, 3 Orchard). */
  receiverCodes?: number[];
  /** EIP-55 form for EVM addresses. */
  normalized?: string;
  /** Which public explorer can report prior use, if any. */
  activity?: ActivitySource;
  notes?: string[];
  /** Stable ids for `notes`, same order. */
  noteIds?: NoteId[];
};

/* English display text, keyed by stable ids the UI can translate. */

export const TYPE_NAMES = {
  sapling: "Sapling",
  unified: "Unified",
  tex: "TEX (transparent-source only)",
  "t-p2pkh": "Transparent (P2PKH)",
  "t-p2sh": "Transparent (P2SH)",
  segwit: "SegWit",
  p2wsh: "Native SegWit (P2WSH)",
  p2wpkh: "Native SegWit (P2WPKH)",
  taproot: "Taproot (P2TR)",
  "segwit-v": "SegWit v{version}",
  account: "Account",
  implicit: "Implicit account",
  named: "Named account",
  "legacy-p2pkh": "Legacy (P2PKH)",
  "script-p2sh": "Script (P2SH)",
  legacy: "Legacy",
  classic: "Classic address",
} as const;
export type TypeId = keyof typeof TYPE_NAMES;

export const PRIVACY_NOTES = {
  public: "Public ledger — every payment to and from this address is visible to anyone, forever.",
  transparent:
    "Transparent — works like Bitcoin: both addresses and the amount are public on-chain. Send to a shielded address to keep it private.",
  shielded: "Shielded — sender, receiver and amount are encrypted on-chain. Only people with a viewing key can see them.",
  "unified-mixed":
    "Shielded when paid from a shielded wallet. It also carries a transparent receiver, so a transparent-only wallet would pay it publicly.",
  tex: "Transparent exchange address — it only accepts funds from transparent addresses, so the payment is fully public.",
} as const;
export type PrivacyNoteId = keyof typeof PRIVACY_NOTES;

export const CHECKSUM_NOTES = {
  valid: "Checksum matches.",
  invalid: "Checksum doesn't match — a character is wrong or missing.",
  none: "This format has no checksum.",
  "evm-length": "Wrong length — EVM addresses have exactly 40 hex characters after 0x.",
  "evm-one-case": "All one case, so no EIP-55 checksum is encoded. Compare with the checksummed form below.",
  "evm-valid": "EIP-55 mixed-case checksum matches.",
  "evm-invalid": "EIP-55 checksum doesn't match — the capitalisation is off, which usually means a typo.",
  "near-implicit": "Implicit accounts are a raw public key in hex — no checksum.",
  "near-named": "Named accounts are human-readable — no checksum. Double-check the spelling.",
  solana: "Solana addresses have no checksum — a typo still looks valid. Compare carefully.",
} as const;
export type ChecksumNoteId = keyof typeof CHECKSUM_NOTES;

export const NOTES = {
  "evm-networks": "The same address works on Ethereum, Base, Arbitrum, BNB Chain and other EVM networks.",
  "ltc-3": "Older Litecoin wallets also used 3… addresses — check which network you're on.",
  "xrp-tag": "Exchanges often also need a destination tag — check you have it.",
} as const;
export type NoteId = keyof typeof NOTES;

const typeName = (id: TypeId, vars?: Record<string, string | number>) =>
  vars ? TYPE_NAMES[id].replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : TYPE_NAMES[id];
const withNotes = (ids: NoteId[]) => ({ notes: ids.map((id) => NOTES[id]), noteIds: ids });

/* ------------------------------------------------------------------ */
/* Base58                                                              */
/* ------------------------------------------------------------------ */

const B58_BTC = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B58_XRP = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";

function base58Decode(s: string, alphabet = B58_BTC): Uint8Array | null {
  if (!s) return null;
  const bytes: number[] = [];
  for (const ch of s) {
    let carry = alphabet.indexOf(ch);
    if (carry < 0) return null;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < s.length && s[i] === alphabet[0]; i++) bytes.push(0);
  return Uint8Array.from(bytes.reverse());
}

/** Decode base58check: returns the payload (version + body) when the 4-byte double-SHA256 checksum matches. */
function base58Check(s: string, alphabet = B58_BTC): { payload: Uint8Array; ok: boolean } | null {
  const raw = base58Decode(s, alphabet);
  if (!raw || raw.length < 5) return null;
  const payload = raw.slice(0, -4);
  const sum = sha256(sha256(payload, "bytes"), "bytes");
  const ok = raw.slice(-4).every((b, i) => b === sum[i]);
  return { payload, ok };
}

/* ------------------------------------------------------------------ */
/* Bech32 / Bech32m                                                    */
/* ------------------------------------------------------------------ */

const B32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_CONST = 1;
const BECH32M_CONST = 0x2bc830a3;

function polymod(values: number[]): number {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = (((chk & 0x1ffffff) << 5) ^ v) >>> 0;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk = (chk ^ G[i]) >>> 0;
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (const c of hrp) out.push(c.charCodeAt(0) >> 5);
  out.push(0);
  for (const c of hrp) out.push(c.charCodeAt(0) & 31);
  return out;
}

type Bech32Decoded = { hrp: string; words: number[]; variant: "bech32" | "bech32m" | null };

/** Decodes bech32/bech32m without the 90-char limit (Unified addresses are longer). variant=null → bad checksum. */
function bech32Decode(s: string): Bech32Decoded | null {
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return null;
  const str = s.toLowerCase();
  const pos = str.lastIndexOf("1");
  if (pos < 1 || pos + 7 > str.length) return null;
  const hrp = str.slice(0, pos);
  const words: number[] = [];
  for (const c of str.slice(pos + 1)) {
    const v = B32.indexOf(c);
    if (v < 0) return null;
    words.push(v);
  }
  const pm = polymod([...hrpExpand(hrp), ...words]);
  const variant = pm === BECH32_CONST ? "bech32" : pm === BECH32M_CONST ? "bech32m" : null;
  return { hrp, words: words.slice(0, -6), variant };
}

function convertBits(data: number[], from: number, to: number): Uint8Array | null {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const maxv = (1 << to) - 1;
  for (const v of data) {
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & maxv);
    }
    acc &= (1 << bits) - 1;
  }
  if (bits >= from || ((acc << (to - bits)) & maxv) !== 0) return null;
  return Uint8Array.from(out);
}

/* ------------------------------------------------------------------ */
/* BLAKE2b (for ZIP 316 F4Jumble)                                      */
/* ------------------------------------------------------------------ */

// BigInt() calls instead of literals: the TS target predates ES2020.
const [N0, N1, N8, N16, N24, N32, N63, N64, NFF] = [0, 1, 8, 16, 24, 32, 63, 64, 255].map(BigInt);
const MASK64 = (N1 << N64) - N1;
const B2_IV = [
  BigInt("0x6a09e667f3bcc908"), BigInt("0xbb67ae8584caa73b"), BigInt("0x3c6ef372fe94f82b"), BigInt("0xa54ff53a5f1d36f1"),
  BigInt("0x510e527fade682d1"), BigInt("0x9b05688c2b3e6c1f"), BigInt("0x1f83d9abfb41bd6b"), BigInt("0x5be0cd19137e2179"),
];
const SIGMA = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
];

const rotr64 = (x: bigint, n: bigint) => ((x >> n) | (x << (N64 - n))) & MASK64;

function readU64LE(b: Uint8Array, off: number): bigint {
  let v = N0;
  for (let i = 7; i >= 0; i--) v = (v << N8) | BigInt(b[off + i] ?? 0);
  return v;
}

/** BLAKE2b with optional 16-byte personalization, unkeyed. Small and slow (BigInt) — fine for one address. */
export function blake2b(input: Uint8Array, outLen: number, personal?: Uint8Array): Uint8Array {
  const h = B2_IV.slice();
  h[0] ^= BigInt("0x01010000") ^ BigInt(outLen);
  if (personal) {
    const p = new Uint8Array(16);
    p.set(personal.slice(0, 16));
    h[6] ^= readU64LE(p, 0);
    h[7] ^= readU64LE(p, 8);
  }
  const blocks = Math.max(1, Math.ceil(input.length / 128));
  for (let bi = 0; bi < blocks; bi++) {
    const last = bi === blocks - 1;
    const block = new Uint8Array(128);
    block.set(input.subarray(bi * 128, bi * 128 + 128));
    const m = Array.from({ length: 16 }, (_, i) => readU64LE(block, i * 8));
    const t = BigInt(last ? input.length : (bi + 1) * 128);
    const v = [...h, ...B2_IV];
    v[12] ^= t & MASK64;
    v[13] ^= t >> N64;
    if (last) v[14] ^= MASK64;
    const G = (a: number, b: number, c: number, d: number, x: bigint, y: bigint) => {
      v[a] = (v[a] + v[b] + x) & MASK64;
      v[d] = rotr64(v[d] ^ v[a], N32);
      v[c] = (v[c] + v[d]) & MASK64;
      v[b] = rotr64(v[b] ^ v[c], N24);
      v[a] = (v[a] + v[b] + y) & MASK64;
      v[d] = rotr64(v[d] ^ v[a], N16);
      v[c] = (v[c] + v[d]) & MASK64;
      v[b] = rotr64(v[b] ^ v[c], N63);
    };
    for (let r = 0; r < 12; r++) {
      const s = SIGMA[r % 10];
      G(0, 4, 8, 12, m[s[0]], m[s[1]]);
      G(1, 5, 9, 13, m[s[2]], m[s[3]]);
      G(2, 6, 10, 14, m[s[4]], m[s[5]]);
      G(3, 7, 11, 15, m[s[6]], m[s[7]]);
      G(0, 5, 10, 15, m[s[8]], m[s[9]]);
      G(1, 6, 11, 12, m[s[10]], m[s[11]]);
      G(2, 7, 8, 13, m[s[12]], m[s[13]]);
      G(3, 4, 9, 14, m[s[14]], m[s[15]]);
    }
    for (let i = 0; i < 8; i++) h[i] ^= v[i] ^ v[i + 8];
  }
  const out = new Uint8Array(64);
  h.forEach((w, i) => {
    for (let j = 0; j < 8; j++) out[i * 8 + j] = Number((w >> BigInt(8 * j)) & NFF);
  });
  return out.slice(0, outLen);
}

/* ------------------------------------------------------------------ */
/* F4Jumble⁻¹ (ZIP 316)                                                */
/* ------------------------------------------------------------------ */

const enc = new TextEncoder();
const xor = (a: Uint8Array, b: Uint8Array) => a.map((x, i) => x ^ b[i]);

function f4H(i: number, u: Uint8Array, lL: number): Uint8Array {
  const p = new Uint8Array(16);
  p.set(enc.encode("UA_F4Jumble_H"));
  p[13] = i;
  return blake2b(u, lL, p);
}

function f4G(i: number, u: Uint8Array, lR: number): Uint8Array {
  const out = new Uint8Array(lR);
  for (let j = 0; j * 64 < lR; j++) {
    const p = new Uint8Array(16);
    p.set(enc.encode("UA_F4Jumble_G"));
    p[13] = i;
    p[14] = j & 0xff;
    p[15] = j >> 8;
    const chunk = blake2b(u, 64, p);
    out.set(chunk.subarray(0, Math.min(64, lR - j * 64)), j * 64);
  }
  return out;
}

export function f4jumbleInv(m: Uint8Array): Uint8Array {
  const lL = Math.min(64, Math.floor(m.length / 2));
  const lR = m.length - lL;
  const c = m.slice(0, lL);
  const d = m.slice(lL);
  const y = xor(c, f4H(1, d, lL));
  const x = xor(d, f4G(1, y, lR));
  const a = xor(y, f4H(0, x, lL));
  const b = xor(x, f4G(0, a, lR));
  const out = new Uint8Array(m.length);
  out.set(a);
  out.set(b, lL);
  return out;
}

const RECEIVER_NAMES: Record<number, string> = { 0: "Transparent (P2PKH)", 1: "Transparent (P2SH)", 2: "Sapling", 3: "Orchard" };

/** Returns receiver typecodes for a Unified address payload, or null if the encoding is invalid. */
function parseUnified(bytes: Uint8Array, hrp: string): number[] | null {
  if (bytes.length < 48) return null;
  const raw = f4jumbleInv(bytes);
  const pad = raw.slice(-16);
  const hrpBytes = enc.encode(hrp);
  for (let i = 0; i < 16; i++) if (pad[i] !== (hrpBytes[i] ?? 0)) return null;
  const body = raw.slice(0, -16);
  const codes: number[] = [];
  let i = 0;
  const readCompact = (): number | null => {
    const first = body[i++];
    if (first === undefined) return null;
    if (first < 0xfd) return first;
    if (first === 0xfd) {
      const v = body[i] | (body[i + 1] << 8);
      i += 2;
      return v;
    }
    if (first === 0xfe) {
      const v = (body[i] | (body[i + 1] << 8) | (body[i + 2] << 16)) + body[i + 3] * 0x1000000;
      i += 4;
      return v;
    }
    return null;
  };
  while (i < body.length) {
    const code = readCompact();
    const len = readCompact();
    if (code === null || len === null || i + len > body.length) return null;
    codes.push(code);
    i += len;
  }
  return codes.length ? codes : null;
}

/* ------------------------------------------------------------------ */
/* Detection                                                           */
/* ------------------------------------------------------------------ */

function zcash(address: string, typeId: TypeId, privacy: Privacy, noteId: PrivacyNoteId, checksum: ChecksumState, extra: Partial<AddressInfo> = {}): AddressInfo {
  const checksumNoteId: ChecksumNoteId = checksum === "valid" ? "valid" : "invalid";
  return {
    address,
    chainId: "zcash",
    chain: "Zcash",
    type: typeName(typeId),
    typeId,
    kind: `zcash:${privacy}`,
    privacy,
    privacyNote: PRIVACY_NOTES[noteId],
    privacyNoteId: noteId,
    checksum,
    checksumNote: CHECKSUM_NOTES[checksumNoteId],
    checksumNoteId,
    ...extra,
  };
}

function publicChain(
  address: string,
  chainId: ChainId,
  chain: string,
  typeId: TypeId,
  checksum: ChecksumState,
  checksumNoteId?: ChecksumNoteId,
  extra: Partial<AddressInfo> = {},
): AddressInfo {
  const noteId: ChecksumNoteId = checksumNoteId ?? checksum;
  return {
    address,
    chainId,
    chain,
    type: typeName(typeId, extra.typeVars),
    typeId,
    kind: chainId,
    privacy: "public",
    privacyNote: PRIVACY_NOTES.public,
    privacyNoteId: "public",
    checksum,
    checksumNote: CHECKSUM_NOTES[noteId],
    checksumNoteId: noteId,
    ...extra,
  };
}

function detectBech32(s: string): AddressInfo | null {
  const lower = s.toLowerCase();
  const prefix = /^(u|zs|tex|bc|ltc)1/.exec(lower)?.[1];
  if (!prefix) return null;
  const d = bech32Decode(s);
  const bad = !d || d.hrp !== prefix || d.variant === null;

  if (prefix === "zs") {
    const bytes = !bad && d.variant === "bech32" ? convertBits(d.words, 5, 8) : null;
    return zcash(s, "sapling", "shielded", "shielded", bytes?.length === 43 ? "valid" : "invalid");
  }
  if (prefix === "u") {
    const bytes = !bad && d.variant === "bech32m" ? convertBits(d.words, 5, 8) : null;
    const codes = bytes ? parseUnified(bytes, "u") : null;
    if (!codes) return zcash(s, "unified", "shielded", "shielded", "invalid");
    const receivers = codes.map((c) => RECEIVER_NAMES[c] ?? `Unknown (type ${c})`);
    const hasShielded = codes.some((c) => c === 2 || c === 3);
    const hasT = codes.some((c) => c === 0 || c === 1);
    const note: PrivacyNoteId = hasShielded ? (hasT ? "unified-mixed" : "shielded") : "transparent";
    return zcash(s, "unified", hasShielded ? "shielded" : "transparent", note, "valid", { receivers, receiverCodes: codes });
  }
  if (prefix === "tex") {
    const bytes = !bad && d.variant === "bech32m" ? convertBits(d.words, 5, 8) : null;
    return zcash(s, "tex", "transparent", "tex", bytes?.length === 20 ? "valid" : "invalid");
  }

  const chainId: ChainId = prefix === "bc" ? "bitcoin" : "litecoin";
  const chain = prefix === "bc" ? "Bitcoin" : "Litecoin";
  if (bad) return publicChain(s, chainId, chain, "segwit", "invalid");
  const version = d.words[0];
  const program = convertBits(d.words.slice(1), 5, 8);
  const okVariant = version === 0 ? d.variant === "bech32" : d.variant === "bech32m";
  const okLen = !!program && program.length >= 2 && program.length <= 40 && (version !== 0 || program.length === 20 || program.length === 32);
  const valid = version <= 16 && okVariant && okLen;
  const typeId: TypeId = version === 0 ? (program?.length === 32 ? "p2wsh" : "p2wpkh") : version === 1 ? "taproot" : "segwit-v";
  const extra: Partial<AddressInfo> = {
    ...(typeId === "segwit-v" ? { typeVars: { version } } : {}),
    ...(chainId === "bitcoin" && valid ? { activity: "bitcoin" as const } : {}),
  };
  return publicChain(s, chainId, chain, typeId, valid ? "valid" : "invalid", undefined, extra);
}

function detectEvm(s: string): AddressInfo | null {
  if (!/^0x[0-9a-fA-F]*$/.test(s)) return null;
  if (s.length !== 42) {
    return publicChain(s, "evm", "EVM (Ethereum & compatible)", "account", "invalid", "evm-length");
  }
  const body = s.slice(2);
  const normalized = getAddress(s.toLowerCase());
  const extra = { normalized, activity: "ethereum" as const, ...withNotes(["evm-networks"]) };
  if (body === body.toLowerCase() || body === body.toUpperCase()) {
    return publicChain(s, "evm", "EVM (Ethereum & compatible)", "account", "none", "evm-one-case", extra);
  }
  const ok = isAddress(s, { strict: true });
  return publicChain(
    s,
    "evm",
    "EVM (Ethereum & compatible)",
    "account",
    ok ? "valid" : "invalid",
    ok ? "evm-valid" : "evm-invalid",
    extra,
  );
}

const NEAR_NAMED = /^(([a-z\d]+[-_])*[a-z\d]+\.)+(near|tg)$/;

function detectNear(s: string): AddressInfo | null {
  if (/^[0-9a-f]{64}$/.test(s)) {
    return publicChain(s, "near", "NEAR", "implicit", "none", "near-implicit");
  }
  if (s.length >= 2 && s.length <= 64 && NEAR_NAMED.test(s)) {
    return publicChain(s, "near", "NEAR", "named", "none", "near-named");
  }
  return null;
}

function detectBase58(s: string): AddressInfo | null {
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(s)) return null;

  // Zcash transparent: 2-byte version.
  if (/^t[13]/.test(s) && s.length === 35) {
    const r = base58Check(s);
    const v = r && r.payload.length === 22 ? (r.payload[0] << 8) | r.payload[1] : -1;
    const type: TypeId = s[1] === "1" ? "t-p2pkh" : "t-p2sh";
    const ok = !!r?.ok && (v === 0x1cb8 || v === 0x1cbd);
    return zcash(s, type, "transparent", "transparent", ok ? "valid" : "invalid", ok ? { activity: "zcash" } : {});
  }

  const r = s.length >= 25 && s.length <= 36 ? base58Check(s) : null;
  if (r?.ok && r.payload.length === 21) {
    switch (r.payload[0]) {
      case 0x00:
        return publicChain(s, "bitcoin", "Bitcoin", "legacy-p2pkh", "valid", undefined, { activity: "bitcoin" });
      case 0x05:
        return publicChain(s, "bitcoin", "Bitcoin", "script-p2sh", "valid", undefined, { activity: "bitcoin", ...withNotes(["ltc-3"]) });
      case 0x30:
        return publicChain(s, "litecoin", "Litecoin", "legacy-p2pkh", "valid");
      case 0x32:
        return publicChain(s, "litecoin", "Litecoin", "script-p2sh", "valid");
      case 0x1e:
        return publicChain(s, "dogecoin", "Dogecoin", "legacy-p2pkh", "valid");
      case 0x16:
        return publicChain(s, "dogecoin", "Dogecoin", "script-p2sh", "valid");
      case 0x41:
        return publicChain(s, "tron", "Tron", "account", "valid");
    }
  }

  // Solana: any 32-byte base58 value (ed25519 public key). No checksum.
  if (s.length >= 32 && s.length <= 44 && base58Decode(s)?.length === 32) {
    return publicChain(s, "solana", "Solana", "account", "none", "solana");
  }

  // Shaped like a known format but the checksum failed.
  if (r && !r.ok) {
    if (/^[13]/.test(s)) return publicChain(s, "bitcoin", "Bitcoin", s[0] === "1" ? "legacy-p2pkh" : "script-p2sh", "invalid");
    if (/^T/.test(s) && s.length === 34) return publicChain(s, "tron", "Tron", "account", "invalid");
    if (/^[LM]/.test(s)) return publicChain(s, "litecoin", "Litecoin", "legacy", "invalid");
    if (/^D/.test(s)) return publicChain(s, "dogecoin", "Dogecoin", "legacy", "invalid");
  }
  return null;
}

function detectXrp(s: string): AddressInfo | null {
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(s)) return null;
  const r = base58Check(s, B58_XRP);
  if (!r) return null;
  const ok = r.ok && r.payload.length === 21 && r.payload[0] === 0;
  // A failed XRP decode might still be a Solana key starting with "r" — let base58 detection try.
  if (!ok && s.length > 35) return null;
  return publicChain(s, "xrp", "XRP Ledger", "classic", ok ? "valid" : "invalid", undefined, withNotes(["xrp-tag"]));
}

/** Detects chain and type for an address. Returns null when nothing matches. Pure and synchronous. */
export function checkAddress(raw: string): AddressInfo | null {
  const s = raw.trim();
  if (!s || s.length > 1000 || /\s/.test(s)) return null;
  const xrp = detectXrp(s);
  if (xrp?.checksum === "valid") return xrp;
  return detectBech32(s) ?? detectEvm(s) ?? detectNear(s) ?? detectBase58(s) ?? xrp;
}

/** Sample addresses for the "try one" buttons. All are well-known / test-vector addresses. */
export const SAMPLE_ADDRESSES: { id: string; label: string; address: string }[] = [
  {
    id: "zcash",
    label: "Zcash unified",
    address:
      "u1l8xunezsvhq8fgzfl7404m450nwnd76zshscn6nfys7vyz2ywyh4cc5daaq0c7q2su5lqfh23sp7fkf3kt27ve5948mzpfdvckzaect2jtte308mkwlycj2u0eac077wu70vqcetkxf",
  },
  { id: "bitcoin", label: "Bitcoin", address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" },
  { id: "ethereum", label: "Ethereum", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
];
