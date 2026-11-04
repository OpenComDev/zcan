import { rateLimited } from "@/lib/agents-server";
import { deleteContribution, saveContribution, trainingEnabled, verifyDraft, type Rating } from "@/lib/training";

const OFF = { code: "trainingOff", message: "Sharing runs isn't switched on for this site." };

/** Share an anonymized run the reader has reviewed. Only drafts signed by this server are accepted. */
export async function POST(req: Request) {
  if (!trainingEnabled()) return Response.json(OFF, { status: 503 });
  if (rateLimited(req, "train", 20)) return Response.json({ code: "rateLimited", message: "Too many shares this hour. Try again later." }, { status: 429 });
  const body = await req.json().catch(() => null);
  const draft = verifyDraft(body?.draft, body?.sig);
  if (!draft) return Response.json({ code: "invalidDraft", message: "This run can't be shared — it may have expired. Run the agent again to share it." }, { status: 400 });
  const rating: Rating = body?.rating === "up" || body?.rating === "down" ? body.rating : null;
  try {
    const saved = await saveContribution(body.draft, draft, rating);
    if ("duplicate" in saved) return Response.json({ code: "duplicate", message: "This run was already shared." }, { status: 409 });
    return Response.json(saved);
  } catch {
    return Response.json({ code: "storeError", message: "Couldn't save right now. Try again." }, { status: 502 });
  }
}

/** Withdraw a shared run. Needs the token the browser received when sharing it. */
export async function DELETE(req: Request) {
  if (!trainingEnabled()) return Response.json(OFF, { status: 503 });
  const body = await req.json().catch(() => null);
  try {
    const ok = await deleteContribution(String(body?.id ?? ""), String(body?.token ?? ""));
    return ok ? Response.json({ ok: true }) : Response.json({ code: "forbidden", message: "That share can't be withdrawn from here." }, { status: 403 });
  } catch {
    return Response.json({ code: "storeError", message: "Couldn't withdraw right now. Try again." }, { status: 502 });
  }
}
