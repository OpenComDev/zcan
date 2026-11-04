export type StatusTone = "wait" | "active" | "done" | "bad";

export const STATUS_META: Record<string, { label: string; short: string; tone: StatusTone; step: number }> = {
  PENDING_DEPOSIT: { label: "Awaiting deposit", short: "Wait", tone: "wait", step: 0 },
  KNOWN_DEPOSIT_TX: { label: "Deposit detected", short: "Live", tone: "active", step: 1 },
  INCOMPLETE_DEPOSIT: { label: "Incomplete deposit", short: "Warn", tone: "bad", step: 1 },
  PROCESSING: { label: "Exchanging", short: "Live", tone: "active", step: 2 },
  SUCCESS: { label: "Completed", short: "Done", tone: "done", step: 4 },
  REFUNDED: { label: "Refunded", short: "Refund", tone: "bad", step: 4 },
  FAILED: { label: "Failed", short: "Fail", tone: "bad", step: 4 },
};

export const statusMeta = (s?: string) =>
  (s && STATUS_META[s]) || { label: "Created", short: "Wait", tone: "wait" as const, step: 0 };

export const isFinal = (s?: string) => s === "SUCCESS" || s === "REFUNDED" || s === "FAILED";

/** Text color for `.tag` badges and status dots. */
export const TONE_CLASS: Record<StatusTone, string> = {
  wait: "text-accent",
  active: "text-info",
  done: "text-green",
  bad: "text-red",
};

export const TONE_BG: Record<StatusTone, string> = {
  wait: "bg-accent",
  active: "bg-info",
  done: "bg-green",
  bad: "bg-red",
};
