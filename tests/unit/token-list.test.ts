import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawToken } from "@/lib/oneclick";
import type { Token } from "@/lib/tokens";

const upstream = vi.hoisted(() => ({
  primary: vi.fn<() => Promise<RawToken[]>>(),
  backup: vi.fn<() => Promise<Token[]>>(),
  cacheLife: vi.fn<(profile: string) => void>(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: upstream.cacheLife }));
vi.mock("@/lib/oneclick", () => ({ fetchTokens: upstream.primary }));
vi.mock("@/lib/changenow", () => ({ backupTokens: upstream.backup }));

import { getTokens } from "@/lib/token-list";

const network = vi.fn(() => { throw new Error("Unexpected network request in token-list unit test"); });
beforeEach(() => {
  upstream.primary.mockReset();
  upstream.backup.mockReset();
  upstream.cacheLife.mockReset();
  network.mockClear();
  vi.stubGlobal("fetch", network);
});
afterEach(() => {
  try { expect(network).not.toHaveBeenCalled(); }
  finally { vi.unstubAllGlobals(); }
});

const primaryToken: RawToken = {
  assetId: "demo-primary", blockchain: "eth", symbol: "DEMO", decimals: 18,
  price: 1, priceUpdatedAt: "2026-01-01T00:00:00Z",
};
const backup: Token[] = [{
  id: "cn:demo", aliases: [], symbol: "DEMO", chain: "eth", chainName: "Ethereum", decimals: 18, price: 1,
}];

describe("token-list upstream fallback", () => {
  it("returns primary tokens without calling the backup", async () => {
    upstream.primary.mockResolvedValue([primaryToken]);
    const result = await getTokens();
    expect(result).toMatchObject([{ id: "demo-primary", symbol: "DEMO", chain: "eth" }]);
    expect(upstream.primary).toHaveBeenCalledTimes(1);
    expect(upstream.backup).not.toHaveBeenCalled();
    // Cache policy is a mocked framework boundary here, not a claim about Next's runtime cache.
    expect(upstream.cacheLife).toHaveBeenCalledWith("minutes");
  });

  it("waits for primary failure, then returns the backup list", async () => {
    const order: string[] = [];
    let rejectPrimary!: (reason: Error) => void;
    upstream.primary.mockImplementation(() => {
      order.push("primary");
      return new Promise<RawToken[]>((_resolve, reject) => { rejectPrimary = reject; });
    });
    upstream.backup.mockImplementation(async () => { order.push("backup"); return backup; });
    const pending = getTokens();
    expect(order).toEqual(["primary"]);
    expect(upstream.backup).not.toHaveBeenCalled();
    rejectPrimary(new Error("primary unavailable"));
    await expect(pending).resolves.toEqual(backup);
    expect(order).toEqual(["primary", "backup"]);
    expect(upstream.primary).toHaveBeenCalledTimes(1);
    expect(upstream.backup).toHaveBeenCalledTimes(1);
  });

  it("preserves the original primary error when both sources fail", async () => {
    const primaryError = new Error("primary unavailable");
    upstream.primary.mockRejectedValue(primaryError);
    upstream.backup.mockRejectedValue(new Error("backup unavailable"));
    await expect(getTokens()).rejects.toBe(primaryError);
    expect(upstream.primary).toHaveBeenCalledTimes(1);
    expect(upstream.backup).toHaveBeenCalledTimes(1);
    expect(upstream.backup.mock.invocationCallOrder[0]).toBeGreaterThan(upstream.primary.mock.invocationCallOrder[0]);
  });

  it("preserves the primary error when the backup has no usable tokens", async () => {
    const primaryError = new Error("primary unavailable");
    upstream.primary.mockRejectedValue(primaryError);
    upstream.backup.mockResolvedValue([]);
    await expect(getTokens()).rejects.toBe(primaryError);
    expect(upstream.backup).toHaveBeenCalledTimes(1);
  });
});
