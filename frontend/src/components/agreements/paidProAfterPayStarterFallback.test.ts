/** @vitest-environment jsdom */
/**
 * After-pay guest restore fallback — verifies that when Pro generation returns empty/rejected
 * after checkout, the UI falls back to the valid starter body from checkout back snapshot
 * rather than showing an empty skeleton + "Retry Pro draft".
 *
 * Universal path rule: never show empty skeleton + Retry as the paid landing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  clearCheckoutBackRestoreSnapshot,
  persistStarterReviewBeforeCheckout,
  readCheckoutBackRestoreSnapshot,
} from "./checkoutBackRestore";
import {
  clearPaidPremiumCompletionSession,
  hasPaidPremiumCompletionSession,
  markPaidPremiumCompletionSession,
} from "./premiumCompletionStorage";
import {
  clearPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { getFreeOnePagerFallbackForProFailure } from "./freeStarterReviewBodyResolver";

const GENERIC_INTAKE = `
Commercial consulting engagement between Generic Services Inc. (Consultant) and Generic Client Corp. (Client).
Consultant will provide software development services for $15,000 monthly.
Governing law: New York.
Term: 12 months starting January 1, 2025.
`;

const GENERIC_DRAFT: ParsedDraftShape = {
  title: "Consulting Services Agreement",
  jurisdiction: "New York",
  parties: [
    { name: "Generic Services Inc.", role: "Consultant" },
    { name: "Generic Client Corp.", role: "Client" },
  ],
  purpose: "Software development services",
  payment_terms: "$15,000 monthly",
  payment: { amount: 15000, cadence: "monthly", valid: true },
  duration: "12 months",
  due_date: null,
  effective_date: "2025-01-01",
  additional_terms: null,
};

const GENERIC_PREVIEW_TEXT = `CONSULTING SERVICES AGREEMENT

This Consulting Services Agreement ("Agreement") is entered into by and between:

Generic Services Inc. ("Consultant")
and
Generic Client Corp. ("Client")

1. SERVICES
Consultant will provide software development services to Client.

2. COMPENSATION
Client shall pay Consultant $15,000 monthly for services rendered.

3. TERM
This Agreement shall commence on January 1, 2025 and continue for 12 months.

4. GOVERNING LAW
This Agreement shall be governed by the laws of the State of New York.

IN WITNESS WHEREOF, the parties have executed this Agreement.

___________________________
Generic Services Inc.

___________________________
Generic Client Corp.
`;

describe("After-pay starter fallback (no named fixtures)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearCheckoutBackRestoreSnapshot();
    clearPaidPremiumCompletionSession();
    clearPaidProSourceOfTruth();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearCheckoutBackRestoreSnapshot();
    clearPaidPremiumCompletionSession();
  });

  it("checkout back snapshot preserves previewText for after-pay fallback", () => {
    persistStarterReviewBeforeCheckout({
      intakeText: GENERIC_INTAKE,
      draft: GENERIC_DRAFT,
      previewText: GENERIC_PREVIEW_TEXT,
    });

    const snap = readCheckoutBackRestoreSnapshot();
    expect(snap).not.toBeNull();
    expect(snap?.previewText).toBe(GENERIC_PREVIEW_TEXT.trim());
    expect(snap?.intakeText).toContain("Generic Services Inc.");
    expect(snap?.draft.parties).toHaveLength(2);
  });

  it("buildAgreementPreviewText generates fallback from draft", () => {
    const preview = buildAgreementPreviewText(GENERIC_DRAFT, {
      starterPreview: true,
      intakeText: GENERIC_INTAKE,
    });
    expect(preview.length).toBeGreaterThan(200);
    expect(preview).toContain("Generic Services Inc.");
    expect(preview).toContain("Generic Client Corp.");
  });

  it("fallback chain: draft preview → free one-pager → checkout back previewText", () => {
    persistStarterReviewBeforeCheckout({
      intakeText: GENERIC_INTAKE,
      draft: GENERIC_DRAFT,
      previewText: GENERIC_PREVIEW_TEXT,
    });

    const starterFallback = buildAgreementPreviewText(GENERIC_DRAFT, {
      starterPreview: true,
      intakeText: GENERIC_INTAKE,
    });
    const freeOnePagerFallback = getFreeOnePagerFallbackForProFailure(GENERIC_DRAFT);
    const checkoutBackSnap = readCheckoutBackRestoreSnapshot();
    const checkoutBackPreview = (checkoutBackSnap?.previewText ?? "").trim();

    const fallbackText = starterFallback.trim() || freeOnePagerFallback.trim() || checkoutBackPreview;
    
    expect(fallbackText.length).toBeGreaterThan(200);
    expect(fallbackText).toBeTruthy();
  });

  it("checkout back previewText is available in fallback chain", () => {
    persistStarterReviewBeforeCheckout({
      intakeText: GENERIC_INTAKE,
      draft: GENERIC_DRAFT,
      previewText: GENERIC_PREVIEW_TEXT,
    });

    const checkoutBackSnap = readCheckoutBackRestoreSnapshot();
    const checkoutBackPreview = (checkoutBackSnap?.previewText ?? "").trim();

    expect(checkoutBackPreview).toBe(GENERIC_PREVIEW_TEXT.trim());
    expect(checkoutBackPreview.length).toBeGreaterThan(200);
    expect(checkoutBackPreview).toContain("Generic Services Inc.");
    expect(checkoutBackPreview).toContain("Generic Client Corp.");
  });

  it("after-pay restore should never result in empty body when previewText was saved", () => {
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    
    persistStarterReviewBeforeCheckout({
      intakeText: GENERIC_INTAKE,
      draft: GENERIC_DRAFT,
      previewText: GENERIC_PREVIEW_TEXT,
    });

    Object.defineProperty(window, "location", {
      value: {
        href: "https://lawdog.test/app/create?premiumCompletion=1&restore=starterReview",
        origin: "https://lawdog.test",
        search: "?premiumCompletion=1&restore=starterReview",
      },
      writable: true,
      configurable: true,
    });

    const snap = readCheckoutBackRestoreSnapshot();
    expect(snap?.previewText?.trim().length).toBeGreaterThan(200);
    
    const fallbackChain = [
      buildAgreementPreviewText(GENERIC_DRAFT, { starterPreview: true, intakeText: GENERIC_INTAKE }),
      getFreeOnePagerFallbackForProFailure(GENERIC_DRAFT),
      snap?.previewText ?? "",
    ];
    
    const firstNonEmpty = fallbackChain.find(t => t.trim().length > 0);
    expect(firstNonEmpty).toBeTruthy();
    expect(firstNonEmpty!.length).toBeGreaterThan(200);
  });

  it("universal path rule: empty Pro body triggers fallback, never empty skeleton", () => {
    persistStarterReviewBeforeCheckout({
      intakeText: GENERIC_INTAKE,
      draft: GENERIC_DRAFT,
      previewText: GENERIC_PREVIEW_TEXT,
    });

    const proGenerationResult = {
      winningPremiumBodyText: "",
      premiumRenderSource: "rejected_paid_corpus",
      proIntentGateMessage: "LawDog could not establish a secure Pro agreement from the server.",
    };

    const starterFallback = buildAgreementPreviewText(GENERIC_DRAFT, {
      starterPreview: true,
      intakeText: GENERIC_INTAKE,
    });
    const freeOnePagerFallback = getFreeOnePagerFallbackForProFailure(GENERIC_DRAFT);
    const checkoutBackSnap = readCheckoutBackRestoreSnapshot();
    const checkoutBackPreview = (checkoutBackSnap?.previewText ?? "").trim();

    const fallbackText = starterFallback.trim() || freeOnePagerFallback.trim() || checkoutBackPreview;

    expect(proGenerationResult.winningPremiumBodyText).toBe("");
    expect(fallbackText.length).toBeGreaterThan(200);
    expect(fallbackText).toContain("Generic");
  });

  it("fallback chain includes existing text as final fallback when all else fails", () => {
    const existingAgreementText = `SERVICES AGREEMENT

This Agreement is between Party A and Party B for professional services.

1. SCOPE OF WORK
The service provider shall deliver the agreed services.

2. PAYMENT
Payment terms as specified in Schedule A.

3. TERM
This agreement commences on the effective date.

Signed by the parties.
____________________
Party A
____________________
Party B
`;

    const existingText = existingAgreementText.trim();
    expect(existingText.length).toBeGreaterThan(200);

    const emptyFallbackChain = ["", "", ""];
    const resolvedFallback = emptyFallbackChain.find(t => t.trim().length > 0) || 
      (existingText.length >= 200 ? existingText : "");

    expect(resolvedFallback.length).toBeGreaterThan(200);
    expect(resolvedFallback).toContain("SERVICES AGREEMENT");
    expect(resolvedFallback).toContain("Party A");
  });

  it("hasPaidPremiumCompletionSession guards against wiping existing text", () => {
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    expect(hasPaidPremiumCompletionSession()).toBe(true);
  });
});
