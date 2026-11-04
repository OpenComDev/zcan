import { describe, expect, it } from "vitest";
import { isLookalike, looksLikeAddress } from "../../extension/src/addresses";

describe("extension address detection", () => {
  it.each([
    "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
    "t1Rv4exT7bqhZqi2j7xz8bUHDMxwosrjADU",
    "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV",
    "u1l8xunezsvhq8fgzfl7404m450nwnd76zshscn6nfys7vyz2ywyh4cc5daaq0c7q2su5lqfh23sp7fkf3kt27ve5948mzpfdvckzaect2jtte308mkwlycj2u0eac077wu70vqcetkxf",
  ])("recognises %s", (a) => expect(looksLikeAddress(a)).toBe(true));

  it.each(["hello world", "https://example.com/x", "Supercalifragilisticexpialidocious", "12345678901234567890123456", "short"])(
    "ignores %j",
    (a) => expect(looksLikeAddress(a)).toBe(false),
  );

  it("spots look-alikes", () => {
    expect(isLookalike("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "0x1111111111111111111111111111111111111111")).toBe(false);
    expect(isLookalike("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "0xd8dA9999999999999999999999999999999A6045")).toBe(true);
    expect(isLookalike("abc", "abc")).toBe(false);
  });
});
