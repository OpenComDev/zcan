import { describe, expect, it } from "vitest";
import { parseChecklist, plainText } from "@/lib/agent-checklists";

describe("parseChecklist", () => {
  it("collects task items grouped under their heading", () => {
    const r = parseChecklist(["# Report", "## Do now", "- [ ] Turn on 2FA", "- [x] Change your password", "## Later", "- [ ] Freeze credit"].join("\n"));
    expect(r?.source).toBe("task");
    expect(r?.items.map((i) => [i.group, i.text])).toEqual([
      ["Do now", "Turn on 2FA"],
      ["Do now", "Change your password"],
      ["Later", "Freeze credit"],
    ]);
    expect(r?.items[0].line).toBe(3);
  });

  it("ignores task items inside code fences", () => {
    const r = parseChecklist(["```", "- [ ] not a step", "```", "- [ ] a step", "- [ ] another"].join("\n"));
    expect(r?.items.map((i) => i.text)).toEqual(["a step", "another"]);
  });

  it("falls back to the first numbered list", () => {
    const r = parseChecklist(["Intro", "", "1. First", "2. Second", "3. Third"].join("\n"));
    expect(r?.source).toBe("ordered");
    expect(r?.items).toHaveLength(3);
  });

  it("returns null when there are no steps", () => {
    expect(parseChecklist("Just a paragraph.\n\nAnd another.")).toBeNull();
  });
});

describe("plainText", () => {
  it("drops links and emphasis", () => {
    expect(plainText("Use **[Bitwarden](https://bitwarden.com)** now")).toBe("Use Bitwarden now");
  });
});
