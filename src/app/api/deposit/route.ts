import { OneClickError, submitDepositTx } from "@/lib/oneclick";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const txHash = typeof body?.txHash === "string" ? body.txHash.trim() : "";
  const depositAddress = typeof body?.depositAddress === "string" ? body.depositAddress.trim() : "";
  const memo = typeof body?.memo === "string" ? body.memo.trim() : undefined;
  if (!txHash || !depositAddress) return Response.json({ message: "Enter a transaction hash." }, { status: 400 });
  if (txHash.length > 256 || depositAddress.length > 512 || (memo && memo.length > 128))
    return Response.json({ message: "That doesn't look like a transaction hash." }, { status: 400 });

  try {
    return Response.json(await submitDepositTx(txHash, depositAddress, memo));
  } catch (err) {
    const message = err instanceof OneClickError ? err.message : "Couldn't reach the swap provider.";
    return Response.json({ message }, { status: 400 });
  }
}
