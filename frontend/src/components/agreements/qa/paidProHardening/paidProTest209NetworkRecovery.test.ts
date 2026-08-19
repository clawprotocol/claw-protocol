import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedDraftShape } from "../../intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "../../partyRoleIntake";
import { runPremiumCompletion } from "../../premiumCompletionPipeline";
import type { PremiumFullDraftApiResult } from "../../premiumFullDraftApi";
import { PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE } from "../../premiumNetworkRecoveryLocalDraft";
import { PREMIUM_USABLE_BODY_MIN_LEN } from "../../premiumPostCheckoutApplyEligible";
import { assessPaidProMutualConsultingProfessionalStructure } from "../../paidProMutualConsultingQualityFloor";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const TEST209_INTAKE = readFileSync(join(FIXTURE_DIR, "freeProQaTemplateATest209.intake.txt"), "utf8").trim();

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

const structured: ParsedDraftShape = {
  title: "Mutual Consulting Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: "Blue Canyon Analytics LLC", role: "Client" },
    { name: "Iron Vale Systems Inc.", role: "Service Provider" },
  ],
  purpose: "Consulting and implementation.",
  payment_terms: "$8,500 milestone.",
  duration: "12 months",
  due_date: null,
  effective_date: "As agreed",
  payment: emptyPayment,
  agreement_family: "services_agreement",
};

const h = vi.hoisted(() => ({
  mockResp: null as PremiumFullDraftApiResult | null,
}));

vi.mock("../../premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () =>
      Promise.resolve(
        h.mockResp ?? {
          ok: false as const,
          failure_kind: "network" as const,
          retryable: true,
          error_code: "network_error",
          document_text: "" as const,
          attemptCount: 2,
          browserErrorMessage: "Failed to fetch: net::ERR_CONNECTION_RESET",
        },
      ),
  };
});

describe("paidProHardening test209 network recovery", () => {
  beforeEach(() => {
    h.mockResp = {
      ok: false,
      failure_kind: "network",
      retryable: true,
      error_code: "network_error",
      document_text: "",
      attemptCount: 2,
      browserErrorMessage: "Failed to fetch: net::ERR_CONNECTION_RESET",
    };
  });

  it("ERR_CONNECTION_RESET yields local recovery Pro draft — not empty retryable-only", async () => {
    const out = await runPremiumCompletion({
      intakeText: TEST209_INTAKE,
      originalUserIntakeRawForMerge: TEST209_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test209",
      premiumRequestIntakeFingerprint: "fp-test209",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });

    expect(out.premiumNetworkRetryable).toBe(true);
    expect(out.premiumNetworkLocalRecovery).toBe(true);
    expect(out.premiumRenderSource).toBe(PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThanOrEqual(PREMIUM_USABLE_BODY_MIN_LEN);
    expect(out.proIntentGateMessage).toBeNull();
    expect(out.premiumRenderSource).not.toBe("rejected_paid_corpus");

    const structure = assessPaidProMutualConsultingProfessionalStructure({
      text: out.winningPremiumBodyText,
      rawIntake: TEST209_INTAKE,
      draft: structured,
    });
    // Same Template A AI/workflow intake as test207 — mutual-consulting applies gate is off;
    // recovery still must yield a professionally usable Pro body (ok remains vacuously true).
    expect(structure.applies).toBe(false);
    expect(structure.ok).toBe(true);
  });
});
