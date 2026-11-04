import { ImageResponse } from "next/og";
import { isUnique, parseShare } from "@/lib/share-results";

/**
 * Link-preview image for a shared result (1200×630). Built only from the rounded numbers in the query,
 * validated by parseShare. English text: the bundled image font covers Latin only.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const r = parseShare(q.get("kind") ?? "", q);
  if (!r) return new Response("Not found", { status: 404 });
  const n = new Intl.NumberFormat("en").format(r.n);
  const big = r.kind === "fingerprint" ? (isUnique(r) ? "Unique" : `1 in ${n}`) : n;
  const line =
    r.kind === "fingerprint"
      ? isUnique(r)
        ? "No other browser looks like this one. Websites can recognise it without cookies."
        : "is how rare this browser’s fingerprint is. Websites can recognise it without cookies."
      : `hidden ${r.n === 1 ? "detail" : "details"} removed from a photo${r.gps ? ", including where it was taken" : ""}.`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#050505", color: "#ffffff", padding: 72 }}>
        <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, color: "#9b9b9f" }}>{r.kind === "fingerprint" ? "FINGERPRINT TEST" : "PHOTO CLEANER"}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 150, fontWeight: 700, color: "#ff2d55", lineHeight: 1 }}>{big}</div>
          <div style={{ display: "flex", fontSize: 44, marginTop: 24, maxWidth: 1000, lineHeight: 1.25 }}>{line}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 30 }}>
          <div style={{ display: "flex", color: "#ffffff", fontWeight: 700 }}>[ZCAN]</div>
          <div style={{ display: "flex", color: "#9b9b9f" }}>zcan.dev · test yours</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "cache-control": "public, max-age=86400, immutable" } },
  );
}
