import { describe, expect, it } from "vitest";
import { buildRecipientFriendlyRedlineChips } from "./recipientFriendlyRedlineSummary";

describe("buildRecipientFriendlyRedlineChips", () => {
  it("returns payment and pause chips for typical recipient instruction", () => {
    const chips = buildRecipientFriendlyRedlineChips(
      "Change to Net 15 and pause work if payment is late.",
      ["payment_terms"],
    );
    expect(chips.some((c) => /payment terms/i.test(c))).toBe(true);
    expect(chips.some((c) => /timeline protections/i.test(c))).toBe(true);
  });
});
