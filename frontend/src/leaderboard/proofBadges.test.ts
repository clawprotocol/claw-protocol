import { describe, expect, it } from "vitest";
import type { LawdogProofActivityV1 } from "./proofActivityStore";
import { deriveLaunchBadges } from "./proofBadges";

function act(partial: Partial<LawdogProofActivityV1>): LawdogProofActivityV1 {
  return {
    sent_agreement_ids: partial.sent_agreement_ids ?? [],
    finalized_agreement_ids: partial.finalized_agreement_ids ?? [],
    updated_at_ms: 0,
  };
}

describe("deriveLaunchBadges", () => {
  it("awards first_record on first send only", () => {
    expect(deriveLaunchBadges(act({ sent_agreement_ids: ["a"], finalized_agreement_ids: [] }))).toEqual([
      "first_record",
    ]);
  });

  it("awards closer at 3 finalized", () => {
    const ids = ["a", "b", "c"];
    expect(deriveLaunchBadges(act({ sent_agreement_ids: ids, finalized_agreement_ids: ids }))).toContain("closer");
  });

  it("awards proven at 3+ sent and 50%+ completion", () => {
    expect(
      deriveLaunchBadges(
        act({ sent_agreement_ids: ["a", "b", "c"], finalized_agreement_ids: ["a", "b"] })
      )
    ).toContain("proven");
  });

  it("does not award proven below 50% completion", () => {
    expect(
      deriveLaunchBadges(
        act({ sent_agreement_ids: ["a", "b", "c"], finalized_agreement_ids: ["a"] })
      )
    ).not.toContain("proven");
  });
});
