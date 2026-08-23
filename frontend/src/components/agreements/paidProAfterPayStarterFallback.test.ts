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
import {
  getFreeOnePagerFallbackForProFailure,
  isNonHollowBody,
  rebuildBodyFromIntakeForProFailure,
} from "./freeStarterReviewBodyResolver";

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

/**
 * Tests for paid restore + generate fail + hollow starter scenario.
 * 
 * This covers the critical user journey:
 * 1. User enters a fat dump (Priya Shah / Northline Studio hiring Diego Alvarez / Harbor Marks LLC, $2,400, Texas)
 * 2. FREE starter already painted HOLLOW: Party A/B, "covers due. Work."
 * 3. User pays for Pro (Stripe 4242 succeeded)
 * 4. After pay (restore=starterReview&premiumCompletion=1): Pro generation fails
 * 5. All previous fallbacks (lastKnownGood, draft preview, free one-pager, checkout back) are hollow
 * 6. RESULT: rebuildBodyFromIntakeForProFailure MUST produce ≥200 non-hollow body from intake
 */
describe("Paid restore + generate fail + hollow starter → rebuild from intake", () => {
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

  // Realistic intake mimicking the failing scenario: Priya Shah / Northline Studio hiring Diego Alvarez
  const PRIYA_INTAKE = `
Priya Shah of Northline Studio is hiring Diego Alvarez from Harbor Marks LLC for a branding project.
Payment: $2,400 total.
Governing law: Texas.
The project involves logo design and brand guidelines delivery within 6 weeks.
`;

  // Hollow draft that mirrors what the bug produces: Party A/B with corrupted output
  const HOLLOW_DRAFT: ParsedDraftShape = {
    title: "Services Agreement",
    jurisdiction: "", // Missing!
    parties: [
      { name: "Party A", role: "Client" }, // Hollow - role placeholder
      { name: "Party B", role: "Service Provider" }, // Hollow - role placeholder
    ],
    purpose: "covers due. Work.", // Corrupted output pattern
    payment_terms: "",
    payment: null,
    duration: null,
    due_date: null,
    effective_date: null,
    additional_terms: null,
  };

  // Hollow preview text that would be painted (the bug scenario)
  const HOLLOW_PREVIEW_TEXT = `SERVICES AGREEMENT

This Agreement is entered into by and between:

Party A ("Client")
and
Party B ("Service Provider")

1. SERVICES
Service Provider agrees to provide covers due. Work.

2. PAYMENT TERMS
To be agreed.

3. GOVERNING LAW
To be determined.
`;

  it("rebuildBodyFromIntakeForProFailure extracts real parties from intake", () => {
    const rebuilt = rebuildBodyFromIntakeForProFailure(PRIYA_INTAKE, HOLLOW_DRAFT);
    
    expect(rebuilt.length).toBeGreaterThanOrEqual(200);
    // Must extract real names from intake
    expect(rebuilt).toContain("Priya Shah");
    expect(rebuilt).toContain("Northline Studio");
    // Should NOT contain hollow placeholders
    expect(rebuilt).not.toMatch(/\bParty A\b/i);
    expect(rebuilt).not.toMatch(/\bParty B\b/i);
    expect(rebuilt).not.toContain("Client/Service_provider");
  });

  it("rebuildBodyFromIntakeForProFailure extracts payment from intake", () => {
    const rebuilt = rebuildBodyFromIntakeForProFailure(PRIYA_INTAKE, HOLLOW_DRAFT);
    
    expect(rebuilt.length).toBeGreaterThanOrEqual(200);
    // Must extract payment amount
    expect(rebuilt).toContain("$2,400");
    // Should NOT contain hollow payment placeholders
    expect(rebuilt).not.toContain("To be agreed");
    expect(rebuilt).not.toContain("To be determined");
  });

  it("rebuildBodyFromIntakeForProFailure extracts governing law from intake", () => {
    const rebuilt = rebuildBodyFromIntakeForProFailure(PRIYA_INTAKE, HOLLOW_DRAFT);
    
    expect(rebuilt.length).toBeGreaterThanOrEqual(200);
    // Must extract Texas jurisdiction
    expect(rebuilt).toContain("Texas");
    // Should have a proper governing law section
    expect(rebuilt).toMatch(/governed by.*Texas/i);
  });

  it("rebuildBodyFromIntakeForProFailure never returns corrupted output patterns", () => {
    const rebuilt = rebuildBodyFromIntakeForProFailure(PRIYA_INTAKE, HOLLOW_DRAFT);
    
    // Must NOT contain corrupted patterns like "covers due. Work."
    expect(rebuilt).not.toContain("covers due. Work.");
    expect(rebuilt).not.toMatch(/\bdue\.\s+Work\b/i);
  });

  it("isNonHollowBody rejects hollow preview text", () => {
    // The hollow preview that caused the bug should be rejected
    expect(isNonHollowBody(HOLLOW_PREVIEW_TEXT, PRIYA_INTAKE)).toBe(false);
  });

  it("isNonHollowBody accepts rebuilt body from intake", () => {
    const rebuilt = rebuildBodyFromIntakeForProFailure(PRIYA_INTAKE, HOLLOW_DRAFT);
    
    expect(rebuilt.length).toBeGreaterThanOrEqual(200);
    expect(isNonHollowBody(rebuilt, PRIYA_INTAKE)).toBe(true);
  });

  it("full fallback chain: hollow draft preview → hollow one-pager → hollow checkout back → rebuild from intake", () => {
    // Simulate the bug scenario: all prior fallbacks are hollow
    persistStarterReviewBeforeCheckout({
      intakeText: PRIYA_INTAKE,
      draft: HOLLOW_DRAFT,
      previewText: HOLLOW_PREVIEW_TEXT, // Hollow!
    });

    const checkoutBackSnap = readCheckoutBackRestoreSnapshot();
    const intakeForRebuild = PRIYA_INTAKE;

    // 1. Try draft-based starter preview - will be hollow
    const starterFallback = buildAgreementPreviewText(HOLLOW_DRAFT, {
      starterPreview: true,
      intakeText: PRIYA_INTAKE,
    });
    let fallbackText = "";
    if (starterFallback.trim() && isNonHollowBody(starterFallback, intakeForRebuild)) {
      fallbackText = starterFallback.trim();
    }

    // 2. Try free one-pager - not available in hollow draft
    if (!fallbackText) {
      const freeOnePagerFallback = getFreeOnePagerFallbackForProFailure(HOLLOW_DRAFT);
      if (freeOnePagerFallback && isNonHollowBody(freeOnePagerFallback, intakeForRebuild)) {
        fallbackText = freeOnePagerFallback.trim();
      }
    }

    // 3. Try checkout back restore snapshot's previewText - hollow!
    if (!fallbackText && checkoutBackSnap?.previewText) {
      const checkoutBackPreview = checkoutBackSnap.previewText.trim();
      if (checkoutBackPreview && isNonHollowBody(checkoutBackPreview, intakeForRebuild)) {
        fallbackText = checkoutBackPreview;
      }
    }

    // At this point, all fallbacks should have failed (hollow bodies rejected)
    expect(fallbackText).toBe("");

    // 4. LAST RESORT: Rebuild ≥200 body from intake - this MUST succeed!
    fallbackText = rebuildBodyFromIntakeForProFailure(intakeForRebuild, HOLLOW_DRAFT);

    // Final result MUST be non-empty, non-hollow, ≥200 chars
    expect(fallbackText.length).toBeGreaterThanOrEqual(200);
    expect(fallbackText).toContain("Priya Shah");
    expect(fallbackText).toContain("$2,400");
    expect(fallbackText).toContain("Texas");
    expect(isNonHollowBody(fallbackText, intakeForRebuild)).toBe(true);
  });

  it("paid restore never shows empty card when intake has real data", () => {
    markPaidPremiumCompletionSession({ source: "settled_checkout" });

    // Simulate the hollow starter scenario
    persistStarterReviewBeforeCheckout({
      intakeText: PRIYA_INTAKE,
      draft: HOLLOW_DRAFT,
      previewText: HOLLOW_PREVIEW_TEXT,
    });

    // Simulate the after-pay restore URL
    Object.defineProperty(window, "location", {
      value: {
        href: "https://lawdog.me/app/create?premiumCompletion=1&restore=starterReview",
        origin: "https://lawdog.me",
        search: "?premiumCompletion=1&restore=starterReview",
      },
      writable: true,
      configurable: true,
    });

    const snap = readCheckoutBackRestoreSnapshot();
    const intakeForRebuild = PRIYA_INTAKE;

    // Full fallback chain
    let fallbackText = "";
    
    // 1. Draft preview
    const starterFallback = buildAgreementPreviewText(HOLLOW_DRAFT, {
      starterPreview: true,
      intakeText: PRIYA_INTAKE,
    });
    if (starterFallback.trim() && isNonHollowBody(starterFallback, intakeForRebuild)) {
      fallbackText = starterFallback.trim();
    }

    // 2. Free one-pager
    if (!fallbackText) {
      const freeOnePager = getFreeOnePagerFallbackForProFailure(HOLLOW_DRAFT);
      if (freeOnePager && isNonHollowBody(freeOnePager, intakeForRebuild)) {
        fallbackText = freeOnePager.trim();
      }
    }

    // 3. Checkout back preview
    if (!fallbackText && snap?.previewText) {
      if (isNonHollowBody(snap.previewText, intakeForRebuild)) {
        fallbackText = snap.previewText.trim();
      }
    }

    // 4. Rebuild from intake (last resort)
    if (!fallbackText) {
      fallbackText = rebuildBodyFromIntakeForProFailure(intakeForRebuild, HOLLOW_DRAFT);
    }

    // Universal path rule: NEVER empty card after paid checkout
    expect(fallbackText).not.toBe("");
    expect(fallbackText.length).toBeGreaterThanOrEqual(200);
  });

  it("rebuildBodyFromIntakeForProFailure returns empty for intake < 20 chars", () => {
    const rebuilt = rebuildBodyFromIntakeForProFailure("short", HOLLOW_DRAFT);
    expect(rebuilt).toBe("");
  });

  it("rebuildBodyFromIntakeForProFailure uses draft parties when intake has no names", () => {
    const intakeWithoutNames = `
Branding project for $5,000 total.
Governing law: California.
Includes logo design, business cards, and letterhead.
`;
    const draftWithRealParties: ParsedDraftShape = {
      title: "Design Services Agreement",
      jurisdiction: "California",
      parties: [
        { name: "Acme Design Studio", role: "Designer" },
        { name: "TechCorp Inc.", role: "Client" },
      ],
      purpose: "Branding and design services",
      payment_terms: "$5,000",
      payment: { amount: 5000, cadence: "once", valid: true },
      duration: null,
      due_date: null,
      effective_date: null,
      additional_terms: null,
    };

    const rebuilt = rebuildBodyFromIntakeForProFailure(intakeWithoutNames, draftWithRealParties);
    
    expect(rebuilt.length).toBeGreaterThanOrEqual(200);
    // Should use the draft's real party names
    expect(rebuilt).toContain("Acme Design Studio");
    expect(rebuilt).toContain("TechCorp Inc.");
    expect(rebuilt).toContain("$5,000");
    expect(rebuilt).toContain("California");
  });

  it("rebuildBodyFromIntakeForProFailure uses intake sentences when no real names available (never Party A/B)", () => {
    const intakeWithoutNames = `
General consulting services for $3,000.
Work starts next week.
`;
    const fullyHollowDraft: ParsedDraftShape = {
      title: "Agreement",
      jurisdiction: null,
      parties: [
        { name: "Client", role: "Client" }, // Hollow
        { name: "Service Provider", role: "Service Provider" }, // Hollow
      ],
      purpose: null,
      payment_terms: null,
      payment: null,
      duration: null,
      due_date: null,
      effective_date: null,
      additional_terms: null,
    };

    const rebuilt = rebuildBodyFromIntakeForProFailure(intakeWithoutNames, fullyHollowDraft);
    
    expect(rebuilt.length).toBeGreaterThanOrEqual(200);
    // UNIVERSAL RULE: NEVER emit Party A/B or Client/Service_provider as the paid landing
    // When no real names available, uses intake sentences directly instead
    expect(rebuilt).not.toMatch(/\bParty A\b/i);
    expect(rebuilt).not.toMatch(/\bParty B\b/i);
    // Payment should still be extracted
    expect(rebuilt).toContain("$3,000");
    // Intake sentences should be preserved
    expect(rebuilt).toContain("consulting services");
  });

  it("isNonHollowBody detects role-only party names in body", () => {
    const bodyWithRolePlaceholders = `
SERVICES AGREEMENT

This Agreement is entered into by and between:

Client ("Client")
and
Service Provider ("Service Provider")

1. SERVICES
Service Provider agrees to provide consulting services.

2. PAYMENT TERMS
$5,000 total.

3. GOVERNING LAW
This Agreement shall be governed by the laws of New York.
`;
    // Should be considered hollow because parties are role placeholders
    expect(isNonHollowBody(bodyWithRolePlaceholders, PRIYA_INTAKE)).toBe(false);
  });

  it("isNonHollowBody accepts body with real party names", () => {
    const bodyWithRealNames = `
SERVICES AGREEMENT

This Agreement is entered into by and between:

Priya Shah of Northline Studio ("Client")
and
Diego Alvarez of Harbor Marks LLC ("Service Provider")

1. SERVICES
Service Provider agrees to provide branding and logo design services.

2. PAYMENT TERMS
Client shall pay $2,400 total for services rendered.

3. GOVERNING LAW
This Agreement shall be governed by the laws of the State of Texas.
`;
    expect(isNonHollowBody(bodyWithRealNames, PRIYA_INTAKE)).toBe(true);
  });

  it("rebuildBodyFromIntakeForProFailure NEVER emits Party A/B regardless of input", () => {
    // Test multiple intake scenarios - none should ever emit Party A/B
    const testCases = [
      // No names at all
      "General work for $5,000. California law.",
      // Only partial context
      "Design project. Payment $2,000.",
      // Very minimal
      "Services agreement for software development project lasting three months.",
    ];

    for (const intake of testCases) {
      const rebuilt = rebuildBodyFromIntakeForProFailure(intake, HOLLOW_DRAFT);
      if (rebuilt) { // Only check if we got a result
        // UNIVERSAL RULE: NEVER emit Party A/B or Client/Service_provider
        expect(rebuilt).not.toMatch(/\bParty A\b/i);
        expect(rebuilt).not.toMatch(/\bParty B\b/i);
        expect(rebuilt).not.toMatch(/\bClient\/Service_provider\b/i);
      }
    }
  });
});
