import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import {
  armExplicitPremiumGenerationRetry,
  assertAtMostOneCheckoutPremiumGenerationCall,
  clearPremiumGenerationCallAudit,
  readPremiumGenerationCallRecords,
} from "./paidProPremiumGenerationCallAudit";

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

const mockFull: PremiumFullDraftResult = {
  title: "Agreement",
  agreement_family: "services_agreement",
  document_text: "x".repeat(4500),
  server_full_document_text: "x".repeat(4500),
  key_terms_found: [],
  missing_material_info: [],
  generation_outcome: "ok",
};

const h = vi.hoisted(() => ({ calls: 0 }));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () => {
      h.calls += 1;
      return Promise.resolve({ ok: true as const, result: mockFull });
    },
    postPremiumFullDraftOnce: () => {
      h.calls += 1;
      return Promise.resolve(mockFull);
    },
  };
});

describe("paidProPremiumGenerationCallAudit", () => {
  beforeEach(() => {
    clearPremiumGenerationCallAudit();
    h.calls = 0;
  });

  it("blocks a second checkout_completion premium-full-draft call in one session", async () => {
    const base = {
      intakeText: "Blue Canyon and Iron Vale $8,500 consulting",
      originalUserIntakeRawForMerge: "Blue Canyon and Iron Vale $8,500 consulting",
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-dup-checkout",
      premiumRequestIntakeFingerprint: "fp-dup",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
      premiumGenerationCallReason: "checkout_completion" as const,
    };
    await runPremiumCompletion(base);
    await runPremiumCompletion(base);
    expect(h.calls).toBe(1);
    expect(readPremiumGenerationCallRecords().filter((r) => r.reason === "checkout_completion").length).toBe(1);
    expect(() => assertAtMostOneCheckoutPremiumGenerationCall()).not.toThrow();
  });

  it("allows explicit retry after arming", async () => {
    const base = {
      intakeText: "Blue Canyon and Iron Vale $8,500 consulting",
      originalUserIntakeRawForMerge: "Blue Canyon and Iron Vale $8,500 consulting",
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-retry-arm",
      premiumRequestIntakeFingerprint: "fp-retry",
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
    expect(h.calls).toBe(2);
  });
});
