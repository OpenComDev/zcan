import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { backupOrderId, backupOrderRef, isBackupId, mapBackupStatus, toStatusResponse } = await import("@/lib/changenow");

describe("backup swap route (ChangeNOW)", () => {
  it("maps every ChangeNOW status to a 1Click status", () => {
    expect(mapBackupStatus("new")).toBe("PENDING_DEPOSIT");
    expect(mapBackupStatus("waiting")).toBe("PENDING_DEPOSIT");
    expect(mapBackupStatus("confirming")).toBe("KNOWN_DEPOSIT_TX");
    expect(mapBackupStatus("exchanging")).toBe("PROCESSING");
    expect(mapBackupStatus("sending")).toBe("PROCESSING");
    expect(mapBackupStatus("verifying")).toBe("PROCESSING");
    expect(mapBackupStatus("finished")).toBe("SUCCESS");
    expect(mapBackupStatus("refunded")).toBe("REFUNDED");
    expect(mapBackupStatus("failed")).toBe("FAILED");
    expect(mapBackupStatus("expired")).toBe("FAILED");
  });

  it("only accepts well-formed order references", () => {
    expect(backupOrderId(backupOrderRef("a1b2c3d4e5f6"))).toBe("a1b2c3d4e5f6");
    expect(backupOrderId("cn:../../etc")).toBeNull();
    expect(backupOrderId("cn:")).toBeNull();
    expect(backupOrderId("xx:a1b2c3d4e5f6")).toBeNull();
    expect(backupOrderId(null)).toBeNull();
    expect(isBackupId("cn:btc")).toBe(true);
    expect(isBackupId("nep141:btc.omft.near")).toBe(false);
  });

  it("reshapes a finished order into the status the order page reads", () => {
    const s = toStatusResponse({
      id: "a1b2c3d4e5f6",
      status: "finished",
      payinAddress: "bc1qdeposit",
      payoutAddress: "t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs",
      refundAddress: "bc1qrefund",
      fromCurrency: "btc",
      toCurrency: "zec",
      amountSend: 0.01,
      amountReceive: 0.6123,
      payinHash: "abc",
      payoutHash: "def",
      validUntil: "2026-11-02T18:00:00.000Z",
    });
    expect(s.status).toBe("SUCCESS");
    expect(s.quoteResponse.quoteRequest.originAsset).toBe("cn:btc");
    expect(s.quoteResponse.quoteRequest.destinationAsset).toBe("cn:zec");
    expect(s.quoteResponse.quote.depositAddress).toBe("bc1qdeposit");
    expect(s.quoteResponse.quote.amountIn).toBe("1000000");
    expect(s.quoteResponse.quote.amountOutFormatted).toBe("0.6123");
    expect(s.swapDetails.originChainTxHashes[0]).toEqual({ hash: "abc", explorerUrl: "https://mempool.space/tx/abc" });
    expect(s.swapDetails.destinationChainTxHashes[0].explorerUrl).toBe("https://mainnet.zcashexplorer.app/transactions/def");
    expect(s.provider.hold).toBe(false);
  });

  it("flags a compliance hold", () => {
    const s = toStatusResponse({ id: "a1b2c3d4e5f6", status: "verifying", fromCurrency: "btc", toCurrency: "zec" });
    expect(s.status).toBe("PROCESSING");
    expect(s.provider.hold).toBe(true);
  });
});
