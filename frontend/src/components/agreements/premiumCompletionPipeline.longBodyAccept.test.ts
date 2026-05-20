import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IRONCLAD_JOINT_ROLLOUT_INTAKE,
  IRONCLAD_PARTIES,
  buildIroncladPremiumFullDraftBody,
} from "../../../e2e/fixtures/ironcladFivePartyRollout";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";

function padToLen(core: string, minLen: number): string {
  let t = core;
  const clause = " The parties shall cooperate and perform obligations in good faith. ";
  while (t.length < minLen) t += clause;
  return t;
}

const h = vi.hoisted(() => ({
  mockResponses: [] as PremiumFullDraftResult[],
  callIndex: 0,
  forceValidateFail: false,
}));

vi.mock("./paidProCorpusAcceptance", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./paidProCorpusAcceptance")>();
  return {
    ...mod,
    validatePaidProOutput: (...args: Parameters<typeof mod.validatePaidProOutput>) => {
      if (h.forceValidateFail) {
        return { ok: false, reasons: ["premium_truth_gate_soft_fail_test"] };
      }
      return mod.validatePaidProOutput(...args);
    },
  };
});

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () => {
      const r = h.mockResponses[h.callIndex] ?? h.mockResponses[h.mockResponses.length - 1];
      h.callIndex += 1;
      return r
        ? Promise.resolve({ ok: true as const, result: r })
        : Promise.resolve({
            ok: false as const,
            failure_kind: "http" as const,
            retryable: false,
            error_code: "test_no_mock",
            document_text: "" as const,
            attemptCount: 0,
          });
    },
    postPremiumFullDraftOnce: () => {
      const r = h.mockResponses[h.callIndex] ?? h.mockResponses[h.mockResponses.length - 1];
      h.callIndex += 1;
      return r ? Promise.resolve(r) : Promise.reject(new Error("no_mock"));
    },
  };
});

function ironcladStructured(): ParsedDraftShape {
  return {
    title: "Joint AI Rollout",
    jurisdiction: "Texas",
    parties: IRONCLAD_PARTIES.map((name) => ({ name, role: "party" })),
    purpose: "Joint AI software rollout.",
    payment_terms: "$187,500 paid over six milestone payments.",
    duration: "24 months",
    due_date: null,
    effective_date: "Upon full execution",
    payment: { amount: 187_500, cadence: null, valid: true },
    agreement_family: "generic_business_agreement",
  };
}

describe("runPremiumCompletion long-body acceptance", () => {
  beforeEach(() => {
    clearFrozenPremiumSessionBodiesForTests();
    h.callIndex = 0;
    h.forceValidateFail = false;
    const longDoc = padToLen(buildIroncladPremiumFullDraftBody(), 27_000);
    const v = validatePaidProOutput({
      text: longDoc,
      rawIntake: IRONCLAD_JOINT_ROLLOUT_INTAKE,
      intentContract: null,
      draft: ironcladStructured(),
    });
    if (!v.ok) {
      throw new Error(`fixture should validate: ${v.reasons.join(",")}`);
    }
    h.mockResponses = [
      {
        title: "Joint AI Rollout Agreement",
        agreement_family: "software_web_dev",
        document_text: longDoc,
        key_terms_found: ["payment", "governing_law"],
        missing_material_info: ["Confirm data-processing exhibit list"],
        generation_outcome: "needs_details",
        schema_validation_reasons: ["Optional insurance certificate wording"],
      },
    ];
  });

  it("accepts 27k needs_details as server_full_draft without rejected_paid_corpus", async () => {
    const out = await runPremiumCompletion({
      intakeText: IRONCLAD_JOINT_ROLLOUT_INTAKE,
      originalUserIntakeRawForMerge: IRONCLAD_JOINT_ROLLOUT_INTAKE,
      structuredDraft: ironcladStructured(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-long-ironclad",
      premiumRequestIntakeFingerprint: "fp-long",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => ironcladStructured(),
    });
    expect(out.premiumRenderSource).not.toBe("rejected_paid_corpus");
    expect(out.premiumRenderSource).toMatch(/server_full_draft/);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThan(15_000);
    expect(out.premiumCompletionOutcome).toBe("authoritative_draft_complete_with_recommended_clarifications");
    expect(out.recipientCandidates).toHaveLength(5);
    expect(out.recipientCandidates.filter((c) => c.email.includes("@")).length).toBe(5);
  });

  it("soft validate failure still preserves long corpus (no 4k downgrade)", async () => {
    h.forceValidateFail = true;
    const out = await runPremiumCompletion({
      intakeText: IRONCLAD_JOINT_ROLLOUT_INTAKE,
      originalUserIntakeRawForMerge: IRONCLAD_JOINT_ROLLOUT_INTAKE,
      structuredDraft: ironcladStructured(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-soft-fail",
      premiumRequestIntakeFingerprint: "fp-soft",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => ironcladStructured(),
    });
    expect(out.premiumRenderSource).not.toBe("rejected_paid_corpus");
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThan(15_000);
    expect(out.premiumCompletionOutcome).toBe("authoritative_draft_complete_with_recommended_clarifications");
  });

  it("second shorter premium response cannot overwrite first accepted long body", async () => {
    const longDoc = padToLen(buildIroncladPremiumFullDraftBody(), 27_000);
    const shortDoc = "SHORT PREVIEW ".repeat(300).trim();
    h.mockResponses = [
      {
        title: "Joint AI Rollout Agreement",
        agreement_family: "software_web_dev",
        document_text: longDoc,
        key_terms_found: ["payment"],
        missing_material_info: [],
        generation_outcome: "needs_details",
      },
      {
        title: "Joint AI Rollout Agreement",
        agreement_family: "software_web_dev",
        document_text: shortDoc,
        key_terms_found: ["payment"],
        missing_material_info: [],
        generation_outcome: "ok",
      },
    ];
    const out = await runPremiumCompletion({
      intakeText: IRONCLAD_JOINT_ROLLOUT_INTAKE,
      originalUserIntakeRawForMerge: IRONCLAD_JOINT_ROLLOUT_INTAKE,
      structuredDraft: ironcladStructured(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-dup-req",
      premiumRequestIntakeFingerprint: "fp-dup",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => ironcladStructured(),
    });
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThan(15_000);
    expect(out.premiumRenderSource).not.toBe("fallback_preview");
  });
});
