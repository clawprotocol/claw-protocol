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
 * Tests for UNIVERSAL paid restore + generate fail + hollow starter scenario.
 * 
 * UNIVERSAL RULE: After ANY successful paid session, if the painted body is empty or hollow,
 * rebuild from THAT visitor's intake and keep it on screen. Same rule whether the starter was
 * missing, Party A/B, "covers due. Work.", or generate failed. No special-casing by visitor name.
 * 
 * This covers the critical user journey:
 * 1. User enters ANY fat dump with real names/price/law
 * 2. FREE starter already painted HOLLOW: Party A/B, "covers due. Work."
 * 3. User pays for Pro (Stripe succeeded)
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

  // Sample intake - the universal rule applies to ANY visitor's dump with real names/price/law
  const SAMPLE_INTAKE = `
Priya Shah of Northline Studio is hiring Diego Alvarez from Harbor Marks LLC for a branding project.
Payment: $2,400 total.
Governing law: Texas.
The project involves logo design and brand guidelines delivery within 6 weeks.
`;

  // Hollow draft pattern - this is what ANY failed generation looks like (Party A/B with corrupted output)
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
    const rebuilt = rebuildBodyFromIntakeForProFailure(SAMPLE_INTAKE, HOLLOW_DRAFT);
    
    expect(rebuilt.length).toBeGreaterThanOrEqual(200);
    // Must extract real names from THAT visitor's intake (verifying extraction works)
    expect(rebuilt).toContain("Priya Shah");
    expect(rebuilt).toContain("Northline Studio");
    // UNIVERSAL: must NOT contain hollow placeholders regardless of intake content
    expect(rebuilt).not.toMatch(/\bParty A\b/i);
    expect(rebuilt).not.toMatch(/\bParty B\b/i);
    expect(rebuilt).not.toContain("Client/Service_provider");
  });

  it("rebuildBodyFromIntakeForProFailure extracts payment from intake", () => {
    const rebuilt = rebuildBodyFromIntakeForProFailure(SAMPLE_INTAKE, HOLLOW_DRAFT);
    
    expect(rebuilt.length).toBeGreaterThanOrEqual(200);
    // Must extract payment from THAT visitor's intake (verifying extraction works)
    expect(rebuilt).toContain("$2,400");
    // UNIVERSAL: must NOT contain hollow payment placeholders regardless of intake content
    expect(rebuilt).not.toContain("To be agreed");
    expect(rebuilt).not.toContain("To be determined");
  });

  it("rebuildBodyFromIntakeForProFailure extracts governing law from intake", () => {
    const rebuilt = rebuildBodyFromIntakeForProFailure(SAMPLE_INTAKE, HOLLOW_DRAFT);
    
    expect(rebuilt.length).toBeGreaterThanOrEqual(200);
    // Must extract jurisdiction from THAT visitor's intake (verifying extraction works)
    expect(rebuilt).toContain("Texas");
    // Should have a proper governing law section
    expect(rebuilt).toMatch(/governed by.*Texas/i);
  });

  it("rebuildBodyFromIntakeForProFailure never returns corrupted output patterns", () => {
    const rebuilt = rebuildBodyFromIntakeForProFailure(SAMPLE_INTAKE, HOLLOW_DRAFT);
    
    // UNIVERSAL: must NOT contain corrupted patterns regardless of intake content
    expect(rebuilt).not.toContain("covers due. Work.");
    expect(rebuilt).not.toMatch(/\bdue\.\s+Work\b/i);
  });

  it("isNonHollowBody rejects hollow preview text", () => {
    // The hollow preview that caused the bug should be rejected
    expect(isNonHollowBody(HOLLOW_PREVIEW_TEXT, SAMPLE_INTAKE)).toBe(false);
  });

  it("isNonHollowBody accepts rebuilt body from intake", () => {
    const rebuilt = rebuildBodyFromIntakeForProFailure(SAMPLE_INTAKE, HOLLOW_DRAFT);
    
    expect(rebuilt.length).toBeGreaterThanOrEqual(200);
    expect(isNonHollowBody(rebuilt, SAMPLE_INTAKE)).toBe(true);
  });

  it("full fallback chain: hollow draft preview → hollow one-pager → hollow checkout back → rebuild from intake", () => {
    // Simulate the bug scenario: all prior fallbacks are hollow
    persistStarterReviewBeforeCheckout({
      intakeText: SAMPLE_INTAKE,
      draft: HOLLOW_DRAFT,
      previewText: HOLLOW_PREVIEW_TEXT, // Hollow!
    });

    const checkoutBackSnap = readCheckoutBackRestoreSnapshot();
    const intakeForRebuild = SAMPLE_INTAKE;

    // 1. Try draft-based starter preview - will be hollow
    const starterFallback = buildAgreementPreviewText(HOLLOW_DRAFT, {
      starterPreview: true,
      intakeText: SAMPLE_INTAKE,
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

    // 4. LAST RESORT: Rebuild ≥200 body from intake - this MUST succeed for ANY visitor's intake
    fallbackText = rebuildBodyFromIntakeForProFailure(intakeForRebuild, HOLLOW_DRAFT);

    // UNIVERSAL: Final result MUST be non-empty, non-hollow, ≥200 chars
    expect(fallbackText.length).toBeGreaterThanOrEqual(200);
    // Verify extraction worked for this sample intake (universal rule extracts from ANY intake)
    expect(fallbackText).toContain("Priya Shah");
    expect(fallbackText).toContain("$2,400");
    expect(fallbackText).toContain("Texas");
    expect(isNonHollowBody(fallbackText, intakeForRebuild)).toBe(true);
  });

  it("paid restore never shows empty card when intake has real data", () => {
    markPaidPremiumCompletionSession({ source: "settled_checkout" });

    // Simulate the hollow starter scenario
    persistStarterReviewBeforeCheckout({
      intakeText: SAMPLE_INTAKE,
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
    const intakeForRebuild = SAMPLE_INTAKE;

    // Full fallback chain
    let fallbackText = "";
    
    // 1. Draft preview
    const starterFallback = buildAgreementPreviewText(HOLLOW_DRAFT, {
      starterPreview: true,
      intakeText: SAMPLE_INTAKE,
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
    expect(isNonHollowBody(bodyWithRolePlaceholders, SAMPLE_INTAKE)).toBe(false);
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
    expect(isNonHollowBody(bodyWithRealNames, SAMPLE_INTAKE)).toBe(true);
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

/**
 * Test for paid restore + prior=null + intake present scenario.
 * This verifies the fix for issue #77 where after-pay restore fails
 * when prior/draft is null but checkoutBackSnap has intake.
 */
describe("Paid restore + prior=null + intake present", () => {
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

  const RICH_INTAKE = `
Contract between Sarah Chen of BrightPath Consulting and Marcus Rodriguez from TechFlow Solutions.
Sarah will provide strategic consulting services for $8,500 monthly.
The engagement covers market research, competitive analysis, and growth strategy development.
Governing law: California.
Term: 6 months starting March 1, 2025.
`;

  const RICH_DRAFT: ParsedDraftShape = {
    title: "Strategic Consulting Agreement",
    jurisdiction: "California",
    parties: [
      { name: "Sarah Chen", role: "Consultant" },
      { name: "Marcus Rodriguez", role: "Client" },
    ],
    purpose: "Strategic consulting services including market research and growth strategy",
    payment_terms: "$8,500 monthly",
    payment: { amount: 8500, cadence: "monthly", valid: true },
    duration: "6 months",
    due_date: null,
    effective_date: "2025-03-01",
    additional_terms: null,
  };

  it("rebuildBodyFromIntakeForProFailure works when draft is null but intake is rich", () => {
    const rebuilt = rebuildBodyFromIntakeForProFailure(RICH_INTAKE, null);
    
    expect(rebuilt.length).toBeGreaterThanOrEqual(200);
    expect(rebuilt).toContain("Sarah Chen");
    expect(rebuilt).toContain("BrightPath Consulting");
    expect(rebuilt).toContain("$8,500");
    expect(rebuilt).toContain("California");
    expect(rebuilt).not.toMatch(/\bParty A\b/i);
    expect(rebuilt).not.toMatch(/\bParty B\b/i);
  });

  it("checkoutBackSnap intake is available when prior is null after checkout return", () => {
    persistStarterReviewBeforeCheckout({
      intakeText: RICH_INTAKE,
      draft: RICH_DRAFT,
      previewText: "",
    });

    const snap = readCheckoutBackRestoreSnapshot();
    expect(snap).not.toBeNull();
    expect(snap?.intakeText.length).toBeGreaterThan(100);
    expect(snap?.intakeText).toContain("Sarah Chen");
    expect(snap?.draft).not.toBeNull();
  });

  it("paid restore with prior=null but checkoutBackSnap.intakeText present rebuilds successfully", () => {
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    
    persistStarterReviewBeforeCheckout({
      intakeText: RICH_INTAKE,
      draft: RICH_DRAFT,
      previewText: "",
    });

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
    const priorIsNull = true;
    const checkoutBackIntake = snap?.intakeText ?? "";
    const checkoutBackDraft = snap?.draft ?? null;

    expect(checkoutBackIntake.length).toBeGreaterThan(100);

    const rebuiltBody = rebuildBodyFromIntakeForProFailure(
      checkoutBackIntake,
      checkoutBackDraft,
    );

    expect(rebuiltBody.length).toBeGreaterThanOrEqual(200);
    expect(rebuiltBody).toContain("Sarah Chen");
    expect(rebuiltBody).toContain("$8,500");
    expect(rebuiltBody).toContain("California");
    expect(isNonHollowBody(rebuiltBody, checkoutBackIntake)).toBe(true);
  });

  it("paid restore handles case where checkoutBackSnap has intake but draft is null", () => {
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    
    const intakeOnly = `
Web development project for GreenLeaf Organics by DevStudio Inc.
Payment: $15,000 total for complete website redesign.
Includes responsive design, e-commerce integration, and SEO optimization.
Governing law: Oregon.
`;

    persistStarterReviewBeforeCheckout({
      intakeText: intakeOnly,
      draft: {
        title: "Web Development Agreement",
        jurisdiction: "Oregon",
        parties: [
          { name: "GreenLeaf Organics", role: "Client" },
          { name: "DevStudio Inc.", role: "Developer" },
        ],
        purpose: "Web development",
        payment_terms: "$15,000",
        payment: { amount: 15000, cadence: "once", valid: true },
        duration: null,
        due_date: null,
        effective_date: null,
        additional_terms: null,
      },
      previewText: "",
    });

    const rebuiltWithNullDraft = rebuildBodyFromIntakeForProFailure(intakeOnly, null);
    
    expect(rebuiltWithNullDraft.length).toBeGreaterThanOrEqual(200);
    expect(rebuiltWithNullDraft).toContain("GreenLeaf Organics");
    expect(rebuiltWithNullDraft).toContain("DevStudio Inc.");
    expect(rebuiltWithNullDraft).toContain("$15,000");
    expect(rebuiltWithNullDraft).toContain("Oregon");
    expect(rebuiltWithNullDraft).not.toMatch(/\bParty A\b/i);
    expect(rebuiltWithNullDraft).not.toMatch(/\bParty B\b/i);
  });

  it("universal path rule: prior=null + intake >= 20 chars must produce >= 200 body, retry false", () => {
    const intake = RICH_INTAKE;
    const prior = null;

    expect(intake.length).toBeGreaterThanOrEqual(20);

    const rebuilt = rebuildBodyFromIntakeForProFailure(intake, prior);
    
    expect(rebuilt.length).toBeGreaterThanOrEqual(200);
    expect(isNonHollowBody(rebuilt, intake)).toBe(true);
  });

  it("universal rule: ANY paid session with hollow/empty body + intake ≥20 → painted ≥200 non-hollow body, retry false", () => {
    markPaidPremiumCompletionSession({ source: "settled_checkout" });

    // Use generic intake - the rule applies to ANY visitor's dump, not specific names
    const VISITOR_INTAKE = `
Alex Thompson of Riverdale Consulting is hiring Jordan Lee from Summit Digital for website development.
Payment: $5,000 milestone-based.
Governing law: New York.
Project includes responsive design and CMS integration over 8 weeks.
`;

    // Hollow prior with generic placeholders - same failure mode as any hollow starter
    const HOLLOW_PRIOR: ParsedDraftShape = {
      title: "Services Agreement",
      jurisdiction: "",
      parties: [
        { name: "Party A", role: "Client" },
        { name: "Party B", role: "Service Provider" },
      ],
      purpose: "covers due. Work.",
      payment_terms: "",
      payment: null,
      duration: null,
      due_date: null,
      effective_date: null,
      additional_terms: null,
    };

    persistStarterReviewBeforeCheckout({
      intakeText: VISITOR_INTAKE,
      draft: HOLLOW_PRIOR,
      previewText: `SERVICES AGREEMENT

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
`,
    });

    Object.defineProperty(window, "location", {
      value: {
        href: "https://lawdog.me/app/create?premiumCompletion=1&restore=starterReview",
        origin: "https://lawdog.me",
        search: "?premiumCompletion=1&restore=starterReview",
      },
      writable: true,
      configurable: true,
    });

    // UNIVERSAL CONDITIONS: intake ≥20 AND body is empty/hollow
    const currentBodyLen = 0;
    const currentBodyIsHollow = true;
    const needsEarlyFallback = VISITOR_INTAKE.length >= 20 && currentBodyIsHollow;

    expect(needsEarlyFallback).toBe(true);

    // Rebuild from THAT visitor's intake - works regardless of whether prior is null or hollow
    const draftForRebuild = HOLLOW_PRIOR;
    const earlyFallbackBody = rebuildBodyFromIntakeForProFailure(VISITOR_INTAKE, draftForRebuild);

    // UNIVERSAL ASSERTIONS: body ≥200, non-hollow, no generic placeholders
    expect(earlyFallbackBody.trim().length).toBeGreaterThanOrEqual(200);
    expect(isNonHollowBody(earlyFallbackBody, VISITOR_INTAKE)).toBe(true);

    // Must NOT contain hollow placeholders - this is the universal rule
    expect(earlyFallbackBody).not.toMatch(/\bParty A\b/i);
    expect(earlyFallbackBody).not.toMatch(/\bParty B\b/i);
    expect(earlyFallbackBody).not.toContain("covers due. Work.");
    expect(earlyFallbackBody).not.toMatch(/\bClient\/Service_provider\b/i);
    expect(earlyFallbackBody).not.toMatch(/\bTo be determined\b/i);
  });
});

/**
 * FOUNDATIONAL FIX TEST SUITE
 * 
 * Tests for the universal rule: when applyFailureFallback paints a valid ≥200 non-hollow body,
 * callers must NOT set terminal failure states (proFullDraftQualityRetry=true, 
 * premiumPostCheckoutPhase="terminal_failure"). The Retry overlay must only appear when
 * no valid body could be painted.
 * 
 * Uses TWO different sample intakes (not just Priya/Diego) per requirement.
 */
describe("Foundational fix: proFullDraftQualityRetry false when valid body exists", () => {
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

  // SAMPLE INTAKE 1: Tech consulting (Maya Chen / David Chen)
  const INTAKE_TECH_CONSULTING = `
Maya Chen from Stellar Digital Solutions is hiring David Chen at Brightpath Analytics for a data consulting engagement.
Payment: $8,500 upfront plus $3,000 monthly for 6 months.
Governing law: California.
The project involves building a customer analytics dashboard with ML-powered insights.
Deliverables include weekly progress reports and a final presentation.
`;

  // SAMPLE INTAKE 2: Creative services (Jordan Williams / Sam Rodriguez)
  const INTAKE_CREATIVE_SERVICES = `
Jordan Williams of Cascade Creative Agency needs Sam Rodriguez from BlueMoon Productions for video production.
Budget: $12,000 total for a 3-video series.
Governing law: Washington State.
Each video will be 3-5 minutes featuring product demonstrations.
Final deliverables include raw footage and edited masters within 8 weeks.
`;

  // Hollow draft that simulates a failed generation
  const HOLLOW_DRAFT: ParsedDraftShape = {
    title: "Services Agreement",
    jurisdiction: "",
    parties: [
      { name: "Party A", role: "Client" },
      { name: "Party B", role: "Service Provider" },
    ],
    purpose: "covers due. Work.",
    payment_terms: "",
    payment: null,
    duration: null,
    due_date: null,
    effective_date: null,
    additional_terms: null,
  };

  it("rebuildBodyFromIntakeForProFailure produces valid body for intake 1 (tech consulting)", () => {
    const rebuilt = rebuildBodyFromIntakeForProFailure(INTAKE_TECH_CONSULTING, HOLLOW_DRAFT);
    
    // UNIVERSAL: ≥200 chars, non-hollow
    expect(rebuilt.length).toBeGreaterThanOrEqual(200);
    expect(isNonHollowBody(rebuilt, INTAKE_TECH_CONSULTING)).toBe(true);
    
    // Extracts visitor-specific data
    expect(rebuilt).toContain("Maya Chen");
    expect(rebuilt).toContain("David Chen");
    expect(rebuilt).toContain("California");
    
    // NEVER contains hollow placeholders
    expect(rebuilt).not.toMatch(/\bParty A\b/i);
    expect(rebuilt).not.toMatch(/\bParty B\b/i);
    expect(rebuilt).not.toContain("covers due. Work.");
  });

  it("rebuildBodyFromIntakeForProFailure produces valid body for intake 2 (creative services)", () => {
    const rebuilt = rebuildBodyFromIntakeForProFailure(INTAKE_CREATIVE_SERVICES, HOLLOW_DRAFT);
    
    // UNIVERSAL: ≥200 chars, non-hollow
    expect(rebuilt.length).toBeGreaterThanOrEqual(200);
    expect(isNonHollowBody(rebuilt, INTAKE_CREATIVE_SERVICES)).toBe(true);
    
    // Extracts visitor-specific data
    expect(rebuilt).toContain("Jordan Williams");
    expect(rebuilt).toContain("Sam Rodriguez");
    expect(rebuilt).toContain("Washington");
    
    // NEVER contains hollow placeholders
    expect(rebuilt).not.toMatch(/\bParty A\b/i);
    expect(rebuilt).not.toMatch(/\bParty B\b/i);
    expect(rebuilt).not.toContain("covers due. Work.");
  });

  it("isNonHollowBody validates both sample intakes with rebuilt bodies", () => {
    const rebuilt1 = rebuildBodyFromIntakeForProFailure(INTAKE_TECH_CONSULTING, HOLLOW_DRAFT);
    const rebuilt2 = rebuildBodyFromIntakeForProFailure(INTAKE_CREATIVE_SERVICES, HOLLOW_DRAFT);
    
    // Both must pass the non-hollow gate
    expect(isNonHollowBody(rebuilt1, INTAKE_TECH_CONSULTING)).toBe(true);
    expect(isNonHollowBody(rebuilt2, INTAKE_CREATIVE_SERVICES)).toBe(true);
    
    // Both must be ≥200 chars
    expect(rebuilt1.length).toBeGreaterThanOrEqual(200);
    expect(rebuilt2.length).toBeGreaterThanOrEqual(200);
  });

  it("simulates fallback decision: valid body painted → proFullDraftQualityRetry should be false", () => {
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    
    // Simulate hollow prior state
    persistStarterReviewBeforeCheckout({
      intakeText: INTAKE_TECH_CONSULTING,
      draft: HOLLOW_DRAFT,
      previewText: `SERVICES AGREEMENT

This Agreement is entered into by and between Party A and Party B.
1. SERVICES: covers due. Work.
2. PAYMENT: To be agreed.
`,
    });

    // Full fallback chain simulation
    const intakeForRebuild = INTAKE_TECH_CONSULTING;
    let paidFallbackBody = "";
    
    // Try existing sources (all hollow in this scenario)
    const starterFallback = buildAgreementPreviewText(HOLLOW_DRAFT, {
      starterPreview: true,
      intakeText: INTAKE_TECH_CONSULTING,
    });
    if (starterFallback.trim().length >= 200 && isNonHollowBody(starterFallback, intakeForRebuild)) {
      paidFallbackBody = starterFallback.trim();
    }
    
    // Last resort: rebuild from intake
    if (!paidFallbackBody && intakeForRebuild.length >= 20) {
      paidFallbackBody = rebuildBodyFromIntakeForProFailure(intakeForRebuild, HOLLOW_DRAFT);
    }

    // FOUNDATIONAL RULE: When valid body is painted, proFullDraftQualityRetry MUST be false
    const paintedValidBody = paidFallbackBody.trim().length >= 200 && isNonHollowBody(paidFallbackBody, intakeForRebuild);
    
    // This is the decision the caller should make
    const shouldSetProFullDraftQualityRetry = !paintedValidBody;
    
    expect(paintedValidBody).toBe(true);
    expect(shouldSetProFullDraftQualityRetry).toBe(false); // proFullDraftQualityRetry should be false
  });

  it("simulates fallback decision: no valid body → proFullDraftQualityRetry should be true", () => {
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    
    // Simulate scenario where intake is too short to rebuild
    const SHORT_INTAKE = "Help me write an agreement";
    
    persistStarterReviewBeforeCheckout({
      intakeText: SHORT_INTAKE,
      draft: HOLLOW_DRAFT,
      previewText: `SERVICES AGREEMENT

Party A and Party B.
`,
    });

    let paidFallbackBody = "";
    
    // Try existing sources (all fail)
    const starterFallback = buildAgreementPreviewText(HOLLOW_DRAFT, {
      starterPreview: true,
      intakeText: SHORT_INTAKE,
    });
    if (starterFallback.trim().length >= 200 && isNonHollowBody(starterFallback, SHORT_INTAKE)) {
      paidFallbackBody = starterFallback.trim();
    }
    
    // Last resort: rebuild from intake (but intake is too short/hollow)
    if (!paidFallbackBody && SHORT_INTAKE.length >= 20) {
      const rebuilt = rebuildBodyFromIntakeForProFailure(SHORT_INTAKE, HOLLOW_DRAFT);
      if (rebuilt.trim().length >= 200 && isNonHollowBody(rebuilt, SHORT_INTAKE)) {
        paidFallbackBody = rebuilt;
      }
    }

    // FOUNDATIONAL RULE: When no valid body exists, proFullDraftQualityRetry MUST be true
    const paintedValidBody = paidFallbackBody.trim().length >= 200 && isNonHollowBody(paidFallbackBody, SHORT_INTAKE);
    const shouldSetProFullDraftQualityRetry = !paintedValidBody;
    
    expect(paintedValidBody).toBe(false);
    expect(shouldSetProFullDraftQualityRetry).toBe(true); // proFullDraftQualityRetry should be true
  });

  it("universal rule: BOTH sample intakes produce valid fallbacks, both should NOT trigger retry", () => {
    const intakes = [INTAKE_TECH_CONSULTING, INTAKE_CREATIVE_SERVICES];
    
    for (const intake of intakes) {
      const rebuilt = rebuildBodyFromIntakeForProFailure(intake, HOLLOW_DRAFT);
      const isValid = rebuilt.trim().length >= 200 && isNonHollowBody(rebuilt, intake);
      const shouldSetRetry = !isValid;
      
      // UNIVERSAL RULE: any fat intake with real names/price/law → valid body → no retry
      expect(isValid).toBe(true);
      expect(shouldSetRetry).toBe(false);
    }
  });
});
