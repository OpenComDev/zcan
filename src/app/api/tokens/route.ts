import { connection } from "next/server";
import { getTokens } from "@/lib/token-list";

export async function GET() {
  // Resolve at request time so builds never depend on the 1Click API being reachable.
  await connection();
  try {
    return Response.json(await getTokens(), {
      headers: { "cache-control": "public, max-age=30, stale-while-revalidate=60" },
    });
  } catch {
    return Response.json({ message: "Couldn't load the token list. Try again in a moment." }, { status: 502 });
  }
}
