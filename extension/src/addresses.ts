/**
 * "Does this look like a crypto address?" — shape only, no checksums. The guard compares the exact
 * string copied with the one pasted, so this only decides which copies and pastes to watch.
 */
const B58 = "[1-9A-HJ-NP-Za-km-z]";
const B32 = "[02-9ac-hj-np-z]";
const PATTERNS = [
  /^0x[a-fA-F0-9]{40}$/, // Ethereum and other EVM chains
  new RegExp(`^(bc1|tb1|ltc1)${B32}{11,71}$`), // Bitcoin / Litecoin bech32
  new RegExp(`^(u1|zs1|tex1)${B32}{38,}$`), // Zcash unified, Sapling, TEX
  new RegExp(`^[a-z]{2,12}1${B32}{38,90}$`), // other bech32 chains
  new RegExp(`^${B58}{25,44}$`), // Bitcoin legacy, Zcash t-addresses, Solana, Tron, XRP…
  /^[0-9a-f]{64}$/, // NEAR implicit accounts
];

export function looksLikeAddress(text: string): boolean {
  const s = text.trim();
  if (s.length < 25 || s.length > 260 || /\s/.test(s)) return false;
  // Base58 must mix letters and digits, so ordinary long words don't count.
  if (/^[A-Za-z]+$/.test(s) || /^\d+$/.test(s)) return false;
  return PATTERNS.some((re) => re.test(s));
}

/** Same first 4 and last 4 characters but not equal: the look-alike clipboard hijackers generate. */
export function isLookalike(a: string, b: string): boolean {
  return a !== b && a.length > 12 && b.length > 12 && a.slice(0, 4) === b.slice(0, 4) && a.slice(-4) === b.slice(-4);
}
