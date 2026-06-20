import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  resolveCreateComplexityResumeHydration,
  type CreateComplexityResumeV1,
} from "./agreementCreateComplexityResume";
import { TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE } from "./starterTest384ThreePartyQuotedRoleRegression.test";

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: false };

function emptyPending(): ParsedDraftShape {
  return {
    title: "",
    jurisdiction: "",
    parties: [],
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: EMPTY_PAYMENT,
  };
}

function resume(
  overrides: Partial<CreateComplexityResumeV1> & Pick<CreateComplexityResumeV1, "resume_kind">,
): CreateComplexityResumeV1 {
  return {
    version: 1,
    rawIntake: TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE,
    pending: emptyPending(),
    awaitingProCheckout: false,
    savedAt: Date.now(),
    ...overrides,
  };
}

describe("resolveCreateComplexityResumeHydration", () => {
  it("restores multi_party_pro_gate without complexity choice pending", () => {
    const result = resolveCreateComplexityResumeHydration(
      resume({ resume_kind: "multi_party_pro_gate" }),
      TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE,
    );
    expect(result).toEqual({
      kind: "multi_party_pro_gate",
      rawIntake: TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE,
    });
  });

  it("restores complexity_choice_required only for complexity_gate resume kind", () => {
    const pending = { ...emptyPending(), agreement_family: "operating_agreement" as const };
    const result = resolveCreateComplexityResumeHydration(
      resume({ resume_kind: "complexity_gate", pending }),
      TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE,
    );
    expect(result).toEqual({
      kind: "complexity_choice_required",
      pending,
      rawIntake: TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE,
    });
  });

  it("returns none when stored intake does not match resume", () => {
    expect(
      resolveCreateComplexityResumeHydration(resume({ resume_kind: "multi_party_pro_gate" }), "different intake"),
    ).toEqual({ kind: "none" });
  });

  it("returns none for optional_full_upgrade resume kind", () => {
    expect(
      resolveCreateComplexityResumeHydration(
        resume({ resume_kind: "optional_full_upgrade" }),
        TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE,
      ),
    ).toEqual({ kind: "none" });
  });
});
