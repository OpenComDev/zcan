import { afterEach, describe, expect, it, vi } from "vitest";

/** ai-model.ts reads build-time env; load a fresh copy per scenario. */
async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const k of ["NEXT_PUBLIC_AI_SELF_HOSTED", "NEXT_PUBLIC_AI_PROVIDER", "NEXT_PUBLIC_AI_ENDPOINT", "NEXT_PUBLIC_AI_MODEL_NAME", "NEXT_PUBLIC_AI_HOST"]) vi.stubEnv(k, env[k] ?? "");
  return import("@/lib/ai-model");
}

afterEach(() => vi.unstubAllEnvs());

describe("who the site says answers the agents", () => {
  it("names DeepSeek by default, with its privacy policy", async () => {
    const m = await load({});
    expect(m.AI_MODEL_NAME).toBe("DeepSeek");
    expect(m.AI_RECIPIENT_POLICY).toContain("deepseek");
  });

  it("can't rebrand an outside provider", async () => {
    const m = await load({ NEXT_PUBLIC_AI_MODEL_NAME: "Zcan Privacy Model", NEXT_PUBLIC_AI_ENDPOINT: "DeepSeek" });
    expect(m.AI_SELF_HOSTED).toBe(false);
    expect(m.AI_MODEL_NAME).toBe("DeepSeek");
  });

  it("ignores the self-hosted flag on an AI company's endpoint", async () => {
    const m = await load({ NEXT_PUBLIC_AI_SELF_HOSTED: "true", NEXT_PUBLIC_AI_MODEL_NAME: "Zcan Privacy Model", NEXT_PUBLIC_AI_ENDPOINT: "Together AI" });
    expect(m.AI_SELF_HOSTED).toBe(false);
    expect(m.AI_MODEL_NAME).toBe("Together AI");
  });

  it("shows the brand for Zcan's own model and discloses Modal as the host", async () => {
    const m = await load({ NEXT_PUBLIC_AI_SELF_HOSTED: "true", NEXT_PUBLIC_AI_ENDPOINT: "Modal" });
    expect(m.AI_SELF_HOSTED).toBe(true);
    expect(m.AI_MODEL_NAME).toBe("Zcan Privacy Model");
    expect(m.AI_HOST).toBe("Modal");
  });
});
