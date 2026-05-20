import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IRONCLAD_JOINT_ROLLOUT_INTAKE,
  IRONCLAD_PARTIES,
  buildIroncladPremiumFullDraftBody,
} from "../../../e2e/fixtures/ironcladFivePartyRollout";
import { extractAgreementParties } from "../../agreement/extractAgreementParties";
import { buildStarterAgreementPreviewForReview } from "../../components/agreements/agreementPreviewFromDraft";
import { enrichStarterPreviewPartiesFromIntake } from "../../components/agreements/starterOpeningPartyPreserve";
import type { ParsedDraftShape } from "../../components/agreements/intakeSmartDefaults";
import { runPremiumCompletion } from "../../components/agreements/premiumCompletionPipeline";
import { clearFrozenPremiumSessionBodiesForTests } from "../../components/agreements/premiumAcceptancePolicy";
import {
  applyPremiumExecutionNormalization,
  bodyHasManualSignatureFields,
} from "../../components/agreements/premiumExecutionNormalization";
import { buildPremiumRecipientCandidatesFromIntake } from "../../components/agreements/premiumAcceptancePolicy";
import { defaultIntakePartyRoleLabels } from "../../components/agreements/partyRoleIntake";
import type { PremiumFullDraftResult } from "../../components/agreements/premiumFullDraftApi";

function padToLen(core: string, minLen: number): string {
  let t = core;
  const clause = " The parties shall cooperate in good faith. ";
  while (t.length < minLen) t += clause;
  return t;
}

function ironcladDraft(): ParsedDraftShape {
  return enrichStarterPreviewPartiesFromIntake(
    {
      title: "Joint AI Rollout",
      jurisdiction: "Texas",
      purpose: "Joint AI software rollout.",
      payment_terms: "$187,500 paid over six milestone payments.",
      duration: "24 months",
      due_date: "",
      effective_date: "Upon full execution",
      payment: { amount: 187_500, cadence: null, valid: true },
      parties: IRONCLAD_PARTIES.map((name) => ({ name, role: "party" })),
      agreement_family: "generic_business_agreement",
    },
    IRONCLAD_JOINT_ROLLOUT_INTAKE,
  );
}

const h = vi.hoisted(() => ({
  mockFull: null as PremiumFullDraftResult | null,
}));

vi.mock("../../components/agreements/premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../components/agreements/premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () =>
      h.mockFull
        ? Promise.resolve({ ok: true as const, result: h.mockFull })
        : Promise.resolve({
            ok: false as const,
            failure_kind: "http" as const,
            retryable: false,
            error_code: "test_no_mock",
            document_text: "" as const,
            attemptCount: 0,
          }),
    postPremiumFullDraftOnce: () => (h.mockFull ? Promise.resolve(h.mockFull) : Promise.reject(new Error("no_mock"))),
  };
});

describe("productionPremiumReviewPath", () => {
  beforeEach(() => {
    clearFrozenPremiumSessionBodiesForTests();
    h.mockFull = {
      title: "Joint AI Rollout Agreement",
      agreement_family: "software_web_dev",
      document_text: padToLen(buildIroncladPremiumFullDraftBody(), 27_000),
      key_terms_found: ["payment"],
      missing_material_info: ["Confirm insurance wording"],
      generation_outcome: "needs_details",
    };
  });

  it("accepts long premium body and normalizes review corpus without manual signature fields", async () => {
    const out = await runPremiumCompletion({
      intakeText: IRONCLAD_JOINT_ROLLOUT_INTAKE,
      originalUserIntakeRawForMerge: IRONCLAD_JOINT_ROLLOUT_INTAKE,
      structuredDraft: ironcladDraft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-prod-review",
      premiumRequestIntakeFingerprint: "fp-prod",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => ironcladDraft(),
    });
    expect(out.premiumRenderSource).not.toBe("rejected_paid_corpus");
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThan(15_000);

    const normalized = applyPremiumExecutionNormalization(out.winningPremiumBodyText, { tier: "premium" });
    expect(bodyHasManualSignatureFields(normalized.text)).toBe(false);

    const signerNames = extractAgreementParties({
      parties: out.premiumDraft.parties,
      intakeText: IRONCLAD_JOINT_ROLLOUT_INTAKE,
      renderedText: normalized.text,
    });
    for (const full of IRONCLAD_PARTIES) {
      expect(signerNames).toContain(full);
    }

    const recipients = buildPremiumRecipientCandidatesFromIntake(
      IRONCLAD_PARTIES,
      IRONCLAD_JOINT_ROLLOUT_INTAKE,
    );
    expect(recipients).toHaveLength(5);
    expect(recipients.filter((c) => c.email.includes("@")).length).toBe(5);
    expect(recipients.filter((c) => c.role.length > 2).length).toBeGreaterThanOrEqual(4);
  });

  it("free starter path stays paragraph-spaced without paid-pro signature duplication in body", () => {
    const preview = buildStarterAgreementPreviewForReview(ironcladDraft(), {
      intakeText: IRONCLAD_JOINT_ROLLOUT_INTAKE,
    });
    expect(preview).toMatch(/\n\n1\.\s+/);
    expect(preview).not.toMatch(/SERVICES AGREEMENT This Agreement/i);
    const norm = applyPremiumExecutionNormalization(preview, { tier: "starter" });
    expect(bodyHasManualSignatureFields(norm.text)).toBe(false);
  });
});
