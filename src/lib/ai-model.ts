/**
 * Who answers the privacy agents, as shown and disclosed across the site. Inlined at build time, so
 * redeploy after changing any of these.
 *
 * Two setups:
 * - An outside AI provider (DeepSeek by default; any OpenAI-compatible API via AI_BASE_URL). The name shown
 *   everywhere is the provider's: NEXT_PUBLIC_AI_PROVIDER, e.g. "Together AI". A brand name can't replace
 *   it, because the provider is who receives what people type.
 * - Zcan's own model (NEXT_PUBLIC_AI_SELF_HOSTED=true), e.g. an open-weights model served with vLLM on GPUs
 *   Zcan rents (deploy/model/). The brand (NEXT_PUBLIC_AI_MODEL_NAME, default "Zcan Privacy Model") is shown,
 *   and the GPU host (NEXT_PUBLIC_AI_HOST, e.g. "Modal") is listed on the Transparency page as infrastructure.
 */

const pub = (v: string | undefined) => v?.trim() || undefined;

/** The company behind AI_BASE_URL, derived at build time by next.config.ts (e.g. "DeepSeek", "Modal"). */
const ENDPOINT = pub(process.env.NEXT_PUBLIC_AI_ENDPOINT);

/** Endpoints run by AI companies: a model served there is theirs to run, so it can't be called self-hosted. */
const AI_COMPANIES = new Set(["DeepSeek", "OpenAI", "Together AI", "Fireworks AI", "OpenRouter", "Groq", "DeepInfra"]);

/**
 * Set NEXT_PUBLIC_AI_SELF_HOSTED=true only when the agents run on a model Zcan deploys itself. Ignored when
 * the endpoint belongs to an AI company, so the "own model" wording can't appear by mistake.
 */
export const AI_SELF_HOSTED = process.env.NEXT_PUBLIC_AI_SELF_HOSTED?.trim() === "true" && !(ENDPOINT && AI_COMPANIES.has(ENDPOINT));

/**
 * The outside AI company answering the agents (when not self-hosted): NEXT_PUBLIC_AI_PROVIDER, else the
 * company behind AI_BASE_URL (next.config.ts derives the label at build time), else DeepSeek.
 */
export const AI_PROVIDER = pub(process.env.NEXT_PUBLIC_AI_PROVIDER) ?? ENDPOINT ?? "DeepSeek";

/** Infrastructure company running Zcan's own model (self-hosted only), e.g. "Modal". Unset = Zcan's own hardware. */
export const AI_HOST = AI_SELF_HOSTED ? (pub(process.env.NEXT_PUBLIC_AI_HOST) ?? (ENDPOINT === "Modal" ? "Modal" : undefined)) : undefined;

/** The name shown wherever the UI says which model runs the agents ("Agents powered by …"). */
export const AI_MODEL_NAME = AI_SELF_HOSTED ? (pub(process.env.NEXT_PUBLIC_AI_MODEL_NAME) ?? "Zcan Privacy Model") : AI_PROVIDER;

const KNOWN_POLICIES: [RegExp, string][] = [
  [/deepseek/i, "https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html"],
];

/** Privacy policy (or homepage) of whoever receives agent inputs: the provider, or the GPU host. */
export const AI_RECIPIENT_POLICY: string | undefined = AI_SELF_HOSTED
  ? pub(process.env.NEXT_PUBLIC_AI_HOST_POLICY)
  : (pub(process.env.NEXT_PUBLIC_AI_PROVIDER_POLICY) ?? KNOWN_POLICIES.find(([re]) => re.test(AI_PROVIDER))?.[1]);
