import { describe, expect, it } from "vitest";
import { isIntentsAccount, referralTerms, splitFees } from "@/lib/referral";

describe("referral accounts", () => {
  it.each(["alice.near", "a-b_c.tg", "sub.alice.near", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"])("accepts %s", (v) => {
    expect(isIntentsAccount(v)).toBe(true);
  });
  it.each(["", "alice", "Alice.near", "alice..near", ".near", "alice.near.", "a".repeat(70) + ".near", "<script>.near", "alice near", 42])("rejects %j", (v) => {
    expect(isIntentsAccount(v)).toBe(false);
  });
});

describe("fee split", () => {
  const zcan = { recipient: "zcan.near", fee: 50 };
  const terms = referralTerms();

  it("defaults to 20% off and 20% to the referrer", () => {
    expect(terms).toEqual({ discount: 0.2, share: 0.2 });
    expect(splitFees(zcan, "alice.near", terms)).toEqual([
      { recipient: "zcan.near", fee: 30 },
      { recipient: "alice.near", fee: 10 },
    ]);
  });

  it("leaves the fee alone without a valid, different referrer", () => {
    expect(splitFees(zcan, undefined, terms)).toEqual([zcan]);
    expect(splitFees(zcan, "not valid", terms)).toEqual([zcan]);
    expect(splitFees(zcan, "zcan.near", terms)).toEqual([zcan]);
    expect(splitFees(undefined, "alice.near", terms)).toBeUndefined();
  });

  it("never pays out more than the visitor pays", () => {
    const t = referralTerms("0.9", "0.9");
    const fees = splitFees(zcan, "alice.near", t)!;
    expect(fees.reduce((s, f) => s + f.fee, 0)).toBeLessThanOrEqual(Math.floor(50 * 0.1));
    expect(splitFees({ recipient: "zcan.near", fee: 3 }, "alice.near", terms)).toEqual([{ recipient: "zcan.near", fee: 2 }]);
  });
});
