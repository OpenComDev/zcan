import "server-only";
import { cacheLife } from "next/cache";
import { backupTokens } from "./changenow";
import { fetchTokens } from "./oneclick";
import { POPULAR, chainName, type Token } from "./tokens";

/**
 * Supported tokens. From NEAR Intents 1Click; while 1Click is unreachable, from the backup route
 * (ChangeNOW, when configured) — those tokens have "cn:" ids, which send quotes and orders there.
 */
export async function getTokens(): Promise<Token[]> {
  try {
    return await oneClickTokens();
  } catch (err) {
    const backup = await backupTokens().catch(() => []);
    if (backup.length) return backup;
    throw err;
  }
}

/** 1Click's tokens, normalized and sorted (popular first). Cached for a minute. */
async function oneClickTokens(): Promise<Token[]> {
  "use cache";
  cacheLife("minutes");

  const raw = await fetchTokens();
  const byKey = new Map<string, Token>();
  const tokens: Token[] = [];
  for (const t of raw) {
    if (!t.price) continue;
    // The same asset can be listed under several id formats (e.g. "BTC" and "BTC(OMNI)");
    // keep the first per symbol+chain and remember the others as aliases.
    const symbol = t.symbol.replace(/\(.*\)$/, "");
    const key = `${symbol}:${t.blockchain}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.aliases.push(t.assetId);
      continue;
    }
    const token: Token = {
      id: t.assetId,
      aliases: [],
      symbol,
      chain: t.blockchain,
      chainName: chainName(t.blockchain),
      decimals: t.decimals,
      price: t.price,
      contract: t.contractAddress,
    };
    byKey.set(key, token);
    tokens.push(token);
  }

  const rank = (t: Token) => {
    const i = POPULAR.indexOf(`${t.symbol}:${t.chain}`);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return tokens.sort((a, b) => rank(a) - rank(b) || a.symbol.localeCompare(b.symbol) || a.chainName.localeCompare(b.chainName));
}
