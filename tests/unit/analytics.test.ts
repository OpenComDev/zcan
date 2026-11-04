import { describe, expect, it } from "vitest";
import { EVENTS, PROPS, isEvent } from "@/lib/analytics-events";

describe("analytics events", () => {
  it("accepts only listed events", () => {
    expect(isEvent("pageview")).toBe(true);
    expect(isEvent("Link cleaned")).toBe(true);
    expect(isEvent("Anything else")).toBe(false);
    expect(isEvent(42)).toBe(false);
  });

  it("never lists properties that could carry personal data", () => {
    for (const p of PROPS) expect(["tool", "agent", "pair", "kind"]).toContain(p);
    expect(new Set(EVENTS).size).toBe(EVENTS.length);
  });
});
