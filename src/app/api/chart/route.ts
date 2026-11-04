import { cacheLife } from "next/cache";
import { connection } from "next/server";

export type ZecChart = {
  points: [number, number][];
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
};

const CG = "https://api.coingecko.com/api/v3";

async function load(): Promise<ZecChart> {
  "use cache";
  cacheLife("minutes");
  const [chart, simple] = await Promise.all([
    fetch(`${CG}/coins/zcash/market_chart?vs_currency=usd&days=1`, { signal: AbortSignal.timeout(10_000) }).then((r) => {
      if (!r.ok) throw new Error(`chart ${r.status}`);
      return r.json() as Promise<{ prices: [number, number][] }>;
    }),
    fetch(`${CG}/simple/price?ids=zcash&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`, {
      signal: AbortSignal.timeout(10_000),
    }).then((r) => {
      if (!r.ok) throw new Error(`price ${r.status}`);
      return r.json() as Promise<{ zcash: { usd: number; usd_24h_change: number; usd_24h_vol: number; usd_market_cap: number } }>;
    }),
  ]);
  // ~288 five-minute samples; keep every other one, plenty for a sparkline.
  const points = chart.prices.filter((_, i, a) => i % 2 === 0 || i === a.length - 1);
  return {
    points,
    price: simple.zcash.usd,
    change24h: simple.zcash.usd_24h_change,
    volume24h: simple.zcash.usd_24h_vol,
    marketCap: simple.zcash.usd_market_cap,
  };
}

/** ZEC/USD over the last 24 h (CoinGecko), cached for a minute. */
export async function GET() {
  await connection();
  try {
    return Response.json(await load(), { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } });
  } catch {
    return Response.json({ message: "Price history is unavailable right now." }, { status: 502 });
  }
}
