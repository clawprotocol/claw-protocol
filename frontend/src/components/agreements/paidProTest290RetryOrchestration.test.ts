import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import {
  armExplicitPremiumGenerationRetry,
  clearPremiumGenerationCallAudit,
  readPremiumGenerationCallRecords,
} from "./paidProPremiumGenerationCallAudit";
import { runPremiumCompletion } from "./premiumCompletionPipeline";

const structured: ParsedDraftShape = {
  title: "Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: "Blue Canyon Analytics LLC", role: "Client" },
    { name: "Iron Vale Systems Inc.", role: "Service Provider" },
  ],
  purpose: "Services.",
  payment_terms: "$8,500",
  duration: "12 months",
  due_date: null,
  effective_date: "As agreed",
  payment: { amount: null, cadence: null, valid: false },
  agreement_family: "services_agreement",
};

const retryHttpCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  const mockFull = {
    title: "Agreement",
    agreement_family: "services_agreement",
    document_text: "x".repeat(4500),
    server_full_document_text: "x".repeat(4500),
    key_terms_found: [],
    missing_material_info: [],
    generation_outcome: "ok",
  };
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () => {
      retryHttpCalls.count += 1;
      return Promise.resolve({ ok: true as const, result: mockFull });
    },
  };
});

describe("Test290 retry orchestration", () => {
  beforeEach(() => {
    clearPremiumGenerationCallAudit();
    retryHttpCalls.count = 0;
  });

  it("retry after failure uses explicit_retry_pro_draft and fires a second real POST", async () => {
    const base = {
      intakeText: "Blue Canyon and Iron Vale $8,500 consulting",
      originalUserIntakeRawForMerge: "Blue Canyon and Iron Vale $8,500 consulting",
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test290-retry",
      premiumRequestIntakeFingerprint: "fp-test290",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
      premiumGenerationCallReason: "checkout_completion" as const,
    };
    await runPremiumCompletion(base);
    armExplicitPremiumGenerationRetry();
    await runPremiumCompletion({
      ...base,
      premiumGenerationCallReason: "explicit_retry_pro_draft",
    });
    const records = readPremiumGenerationCallRecords();
    expect(records.filter((r) => r.reason === "checkout_completion").length).toBe(1);
    expect(records.filter((r) => r.reason === "explicit_retry_pro_draft").length).toBe(1);
    expect(retryHttpCalls.count).toBe(2);
  });

  it("checkout retry without arming is duplicate-blocked (no second POST)", async () => {
    const base = {
      intakeText: "Blue Canyon and Iron Vale $8,500 consulting",
      originalUserIntakeRawForMerge: "Blue Canyon and Iron Vale $8,500 consulting",
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test290-dup",
      premiumRequestIntakeFingerprint: "fp-test290-dup",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
      premiumGenerationCallReason: "checkout_completion" as const,
    };
    await runPremiumCompletion(base);
    await runPremiumCompletion(base);
    expect(retryHttpCalls.count).toBe(1);
  });
});
