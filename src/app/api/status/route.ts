import { BackupError, backupOrderId, backupStatus } from "@/lib/changenow";
import { OneClickError, fetchStatus } from "@/lib/oneclick";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = url.searchParams.get("address")?.trim();
  const memo = url.searchParams.get("memo")?.trim() || undefined;
  if (!address) return Response.json({ message: "Missing deposit address." }, { status: 400 });
  if (address.length > 512 || (memo && memo.length > 128)) return Response.json({ message: "That isn't a valid deposit address." }, { status: 400 });

  // Orders on the backup route (ChangeNOW) carry their order reference: ?via=cn:<id>.
  const via = url.searchParams.get("via");
  if (via) {
    const id = backupOrderId(via);
    if (!id) return Response.json({ message: "That isn't a valid order reference." }, { status: 400 });
    try {
      const status = await backupStatus(id);
      // The reference must belong to this deposit address, so one order's link can't show another's details.
      if (status.quoteResponse.quote.depositAddress !== address)
        return Response.json({ message: "No order found for that deposit address." }, { status: 404 });
      return Response.json(status, { headers: { "cache-control": "no-store" } });
    } catch (err) {
      if (err instanceof BackupError && (err.status === 404 || err.status === 400))
        return Response.json({ message: "No order found for that deposit address." }, { status: 404 });
      return Response.json({ message: "Couldn't reach the swap provider. Retrying…" }, { status: 502 });
    }
  }

  try {
    return Response.json(await fetchStatus(address, memo), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof OneClickError && err.status === 404)
      return Response.json({ message: "No order found for that deposit address." }, { status: 404 });
    return Response.json({ message: "Couldn't reach the swap provider. Retrying…" }, { status: 502 });
  }
}
