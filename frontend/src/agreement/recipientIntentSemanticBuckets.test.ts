import { describe, expect, it } from "vitest";
import type { RecipientInstructionIntent, RecipientInstructionIntentCategory } from "./recipientInstructionIntents";
import { buildIntentSemanticBucketRows } from "./recipientIntentSemanticBuckets";

function intent(
  id: string,
  category: RecipientInstructionIntentCategory,
  status: RecipientInstructionIntent["status"],
): RecipientInstructionIntent {
  return {
    id,
    category,
    originalText: "",
    normalizedIntent: "x",
    status,
  };
}

describe("buildIntentSemanticBucketRows", () => {
  it("aggregates payment and scope intents into calm bucket rows", () => {
    const rows = buildIntentSemanticBucketRows([
      intent("1", "payment_timing", "applied"),
      intent("2", "late_fee", "pending"),
      intent("3", "scope_change_management", "applied"),
    ]);
    const pay = rows.find((r) => r.key === "payment_terms");
    const scope = rows.find((r) => r.key === "scope_deliverables");
    expect(pay?.applied).toBe(1);
    expect(pay?.pending).toBe(1);
    expect(scope?.applied).toBe(1);
    expect(rows.length).toBeLessThanOrEqual(8);
  });
});
