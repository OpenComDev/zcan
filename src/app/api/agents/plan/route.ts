import { sharedLimited } from "@/lib/shared-limit";
import {
  NOT_CONFIGURED,
  PLAN_RESPONSE_FORMAT,
  PROVIDER_OPTIONS,
  PLAN_MODEL,
  apiErrorMessage,
  getClient,
  planPrompt,
  rateLimited,
  readInput,
  readPlan,
  signPlan,
  stripSignatures,
  systemPrompt,
} from "@/lib/agents-server";
import { webSearchEnabled } from "@/lib/web-search";

export const maxDuration = 60;

/** Step 1 of "it asks before it acts": the agent proposes a plan; nothing is searched yet. */
export async function POST(req: Request) {
  const client = getClient();
  if (!client) return Response.json({ code: "notConfigured", message: NOT_CONFIGURED }, { status: 503 });
  if (rateLimited(req, "plan", 20)) return Response.json({ code: "rateLimited", message: "You've hit the hourly limit. Try again later." }, { status: 429 });
  const shared = await sharedLimited(req, "plan", 20);
  if (shared === "daily") return Response.json({ code: "dailyCap", message: "The agents have reached today's limit. Try again tomorrow." }, { status: 429 });
  if (shared === "ip") return Response.json({ code: "rateLimited", message: "You've hit the hourly limit. Try again later." }, { status: 429 });

  const input = readInput(await req.json().catch(() => null));
  if ("error" in input) return Response.json({ code: input.code, message: input.error, field: input.field }, { status: 400 });
  const canSearch = input.agent.usesWeb && webSearchEnabled();

  try {
    const res = await client.chat.completions.create({
      model: PLAN_MODEL,
      max_tokens: 2000,
      response_format: PLAN_RESPONSE_FORMAT,
      messages: [
        { role: "system", content: systemPrompt(input.agent, input.locale) },
        { role: "user", content: planPrompt(input, canSearch) },
      ],
      ...PROVIDER_OPTIONS,
    });

    const choice = res.choices[0];
    if (choice?.finish_reason === "content_filter") {
      return Response.json({ code: "contentFilter", message: "The agent can't help with that request. Try rephrasing what you need." }, { status: 422 });
    }
    let plan = null;
    try {
      // The model's own output never carries signatures: anything it wrote in `sig` is dropped.
      const raw = readPlan(JSON.parse(choice?.message.content || "null"));
      plan = raw && signPlan(input, stripSignatures(raw));
    } catch {
      // Malformed JSON — handled below.
    }
    if (!plan) return Response.json({ code: "planFailed", message: "The agent couldn't draft a plan. Try again." }, { status: 502 });
    return Response.json({ ...plan, webSearch: canSearch });
  } catch (err) {
    const { code, message, status } = apiErrorMessage(err);
    return Response.json({ code, message }, { status });
  }
}
