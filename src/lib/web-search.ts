import "server-only";

export type SearchResult = { title: string; url: string; content: string };

/** Web search for the agents (Tavily). Off unless TAVILY_API_KEY is set. */
export const webSearchEnabled = () => Boolean(process.env.TAVILY_API_KEY);

export async function webSearch(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const res = await fetch(`${process.env.TAVILY_BASE_URL || "https://api.tavily.com"}/search`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
    body: JSON.stringify({ query: query.slice(0, 400), max_results: 6, search_depth: "basic" }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const body = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
  return (body.results ?? [])
    .filter((r) => isWebUrl(r.url))
    .map((r) => ({ title: (r.title || r.url!).slice(0, 200), url: r.url!, content: (r.content ?? "").slice(0, 1200) }));
}

/**
 * Result URLs end up as links in the reader's browser (the sources list) and in the model's context,
 * so only plain, well-formed http(s) URLs are passed on.
 */
function isWebUrl(u: unknown): u is string {
  if (typeof u !== "string" || u.length > 2048) return false;
  try {
    const { protocol } = new URL(u);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}
