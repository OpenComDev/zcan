import { describe, expect, it } from "vitest";
import { findSecret, findSecretField } from "@/lib/secret-guard";

// The standard BIP-39 test vector mnemonic (no funds; published everywhere).
const SEED12 = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("findSecret", () => {
  it("flags a 12-word seed phrase", () => {
    expect(findSecret(`my words are ${SEED12} please help`)).toBe("seed");
  });

  it("flags a seed phrase split over lines with numbers", () => {
    const numbered = SEED12.split(" ").map((w, i) => `${i + 1}. ${w}`).join("\n");
    expect(findSecret(numbered)).toBe("seed");
  });

  it("flags a seed phrase inside quotes or a JSON string", () => {
    expect(findSecret(`{"mnemonic":"${SEED12}"}`)).toBe("seed");
    expect(findSecret(`“${SEED12}.”`)).toBe("seed");
  });

  it("flags a raw 64-hex private key unless hex is allowed", () => {
    const hex = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    expect(findSecret(`key: ${hex}`)).toBe("hex");
    expect(findSecret(`Message-ID: ${hex}`, { allowHex: true })).toBeNull();
  });

  it("flags extended private keys", () => {
    expect(findSecret("xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi")).toBe("xprv");
  });

  it.each([
    "I use an iPhone and Gmail, and my password manager is Bitwarden.",
    "Should I move my coins to a new wallet after a breach?",
    "Send 1.5 ZEC to t1Rv4exT7bqhZqi2j7xz8bUHDMxwosrjADU please",
    "The quick brown fox jumps over the lazy dog again and again today",
  ])("passes ordinary text: %s", (text) => {
    expect(findSecret(text)).toBeNull();
  });
});

describe("findSecretField", () => {
  it("names the first field holding a secret", () => {
    expect(findSecretField({ topic: "hi", notes: SEED12 })).toBe("notes");
    expect(findSecretField({ topic: "hi", notes: undefined })).toBeNull();
  });
});
