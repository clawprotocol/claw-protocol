import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  buildCheckoutPreflightAgreementPreviewText,
  clearPaidProCheckoutPreviewPreflightCache,
  readPaidProCheckoutPreviewPreflightCacheSize,
} from "./paidProCheckoutPreviewPreflightCache";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

const draft: ParsedDraftShape = {
  title: "Services Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: "Alpha LLC", role: "Client" },
    { name: "Beta Inc.", role: "Service Provider" },
  ],
  purpose: "Implementation services for workflow automation.",
  payment_terms: "$5,000 upon execution.",
  duration: "6 months",
  due_date: null,
  effective_date: "As agreed",
  payment: emptyPayment,
};

describe("paidProCheckoutPreviewPreflightCache", () => {
  it("dedupes identical checkout preflight preview for one session", () => {
    clearPaidProCheckoutPreviewPreflightCache();
    const ctx = {
      premiumGenerationCallReason: "checkout_completion" as const,
      sessionGenerationId: "sess-test-245",
      intakeFingerprint: "fp-245",
    };
    const a = buildCheckoutPreflightAgreementPreviewText(
      draft,
      { premiumDeliverablePreview: true, intakeText: "Alpha and Beta Delaware $5000" },
      ctx,
    );
    expect(readPaidProCheckoutPreviewPreflightCacheSize()).toBe(1);
    const b = buildCheckoutPreflightAgreementPreviewText(
      draft,
      { premiumDeliverablePreview: true, intakeText: "Alpha and Beta Delaware $5000" },
      ctx,
    );
    expect(b).toBe(a);
    expect(readPaidProCheckoutPreviewPreflightCacheSize()).toBe(1);
  });

  it("does not cache non-checkout paths", () => {
    clearPaidProCheckoutPreviewPreflightCache();
    buildCheckoutPreflightAgreementPreviewText(
      draft,
      { premiumDeliverablePreview: true },
      {
        premiumGenerationCallReason: "explicit_retry_pro_draft",
        sessionGenerationId: "sess-x",
        intakeFingerprint: "fp-x",
      },
    );
    expect(readPaidProCheckoutPreviewPreflightCacheSize()).toBe(0);
  });
});
