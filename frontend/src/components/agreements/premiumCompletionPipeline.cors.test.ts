import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import type { PremiumFullDraftApiResult } from "./premiumFullDraftApi";
import { isPremiumFullDraftCorsBlockedResult } from "./premiumPostCheckoutApplyEligible";

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
            failure_kind: "cors" as const,
            retryable: false,
            error_code: "cors_blocked" as const,
            document_text: "" as const,
            attemptCount: 1,
          }),
  };
});

describe("runPremiumCompletion CORS blocked", () => {
  beforeEach(() => {
    h.mockResp = {
      ok: false,
      failure_kind: "cors",
      retryable: false,
      error_code: "cors_blocked",
      document_text: "",
      attemptCount: 1,
    };
  });

  it("does not establish server_full_draft or degraded local recovery on cors_blocked", async () => {
    const contract = resolveAgreementIntentContract(WEB_INTAKE);
    expect(contract.pro_strict).toBe(true);
    const out = await runPremiumCompletion({
      intakeText: WEB_INTAKE,
      originalUserIntakeRawForMerge: WEB_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-cors-1",
      premiumRequestIntakeFingerprint: "fp-cors",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });
    expect(out.premiumRenderSource).toBe("premium_full_draft_cors_blocked");
    expect(out.premiumFullDraftCorsBlocked).toBe(true);
    expect(out.premiumDegradedServerLocalRecovery).toBeFalsy();
    expect(out.premiumNetworkLocalRecovery).toBeFalsy();
    expect(out.winningPremiumBodyText).toBe("");
    expect(out.premiumRenderSource).not.toMatch(/server_full_draft/);
    expect(isPremiumFullDraftCorsBlockedResult(out)).toBe(true);
  });
});
