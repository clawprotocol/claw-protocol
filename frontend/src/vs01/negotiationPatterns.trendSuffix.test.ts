import { describe, expect, it } from "vitest";
import { negotiationRowTrendSuffix } from "./negotiationPatterns";
import type { AgreementVersionRecord } from "../agreement/agreementVersionStore";

describe("negotiationRowTrendSuffix", () => {
  const v = {
    id: "v1",
    created_at: new Date().toISOString(),
    created_by: "owner",
    instruction: "hi",
    label: "You",
    snapshot: {} as never,
    rendered_html: "",
    meta: {
      negotiation_memory: { posture: "firm", decision: "modified", changed_fields: [] },
    },
  } as unknown as AgreementVersionRecord;

  it("returns empty when patterns is nullish", () => {
    expect(negotiationRowTrendSuffix(v, null as never)).toBe("");
    expect(negotiationRowTrendSuffix(v, undefined as never)).toBe("");
  });

  it("does not throw when postureCounts is missing", () => {
    const broken = {
      totalNegotiationEvents: 5,
      postureCounts: undefined,
    } as never;
    expect(() => negotiationRowTrendSuffix(v, broken)).not.toThrow();
  });
});
