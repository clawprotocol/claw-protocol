import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import type { PremiumFullDraftApiResult } from "./premiumFullDraftApi";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

const WEB_INTAKE = `
  SaaS website API work for CryptoSpaces.net. Client Anthem Blanchard, developer Sarah Collins, Oklahoma.
  $7,500 total. thirty days. May 1, 2026.
`.trim();

const structured: ParsedDraftShape = {
  title: "Web Development Agreement",
  jurisdiction: "Oklahoma",
  parties: [
    { name: "Client", role: "party" },
    { name: "Developer", role: "party" },
  ],
  purpose: "Software and web development.",
  payment_terms: "See intake.",
  duration: "12 months",
  due_date: null,
  effective_date: "As agreed",
  payment: emptyPayment,
  agreement_family: "services_agreement",
};

const h = vi.hoisted(() => ({
  mockResp: null as PremiumFullDraftApiResult | null,
}));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () =>
      h.mockResp
        ? Promise.resolve(h.mockResp)
        : Promise.resolve({
            ok: false as const,
            failure_kind: "network" as const,
            retryable: true,
            error_code: "network_changed" as const,
            document_text: "" as const,
            attemptCount: 2,
          }),
  };
});

describe("runPremiumCompletion network failures", () => {
  beforeEach(() => {
    h.mockResp = {
      ok: false,
      failure_kind: "network",
      retryable: true,
      error_code: "network_changed",
      document_text: "",
      attemptCount: 2,
    };
  });

  it("does not mark paid corpus rejected on transient network failure", async () => {
    const contract = resolveAgreementIntentContract(WEB_INTAKE);
    expect(contract.pro_strict).toBe(true);
    const out = await runPremiumCompletion({
      intakeText: WEB_INTAKE,
      originalUserIntakeRawForMerge: WEB_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-net-1",
      premiumRequestIntakeFingerprint: "fp-net",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });
    expect(out.premiumRenderSource).toBe("premium_network_retryable");
    expect(out.premiumNetworkRetryable).toBe(true);
    expect(out.proIntentGateMessage).toBeNull();
    expect(out.winningPremiumBodyText).toBe("");
    expect(out.premiumRenderSource).not.toBe("rejected_paid_corpus");
  });

  it("non-network API failure does not use premium_network_retryable (distinct from transient network)", async () => {
    h.mockResp = {
      ok: false,
      failure_kind: "exception",
      retryable: false,
      error_code: "premium_full_draft_failed",
      document_text: "",
      attemptCount: 2,
    };
    const out = await runPremiumCompletion({
      intakeText: WEB_INTAKE,
      originalUserIntakeRawForMerge: WEB_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-net-2",
      premiumRequestIntakeFingerprint: "fp-net2",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });
    expect(out.premiumRenderSource).not.toBe("premium_network_retryable");
    expect(out.premiumNetworkRetryable).toBeFalsy();
  });
});
