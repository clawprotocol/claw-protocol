/**
 * Free one-pager direct paint tests.
 *
 * Regression tests for the Maya Chen / Diego Alvarez launch-blocking bug:
 * - Verifies that when `free_document_text` is present and validation is "ok",
 *   the resolver paints that body directly instead of building from structured fields.
 * - Verifies validation failure detection and Pro redirect recommendation.
 * - Verifies that visitor words (names, price, term, law) are preserved.
 */
import { describe, expect, it } from "vitest";
import {
  getFreeOnePagerFallbackForProFailure,
  isFreeOnePagerValid,
  resolveFreeStarterReviewBody,
  shouldRedirectFreeToProForValidation,
} from "./freeStarterReviewBodyResolver";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: true };

function emptyDraft(): ParsedDraftShape {
  return {
    title: "",
    jurisdiction: "",
    parties: [],
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: EMPTY_PAYMENT,
  };
}

const MAYA_DIEGO_INTAKE =
  "Maya Chen of Northline Studio hires Diego Alvarez of Harbor Marks LLC to design a logo and brand kit for $2,400 due on signing. Work runs 30 days starting August 22, 2026. Governing law is Texas.";

const MAYA_DIEGO_VALID_FREE_DOC = `SERVICES AGREEMENT

This Agreement is entered into by and between Maya Chen of Northline Studio and Diego Alvarez of Harbor Marks LLC.

1. Scope of Services
Diego Alvarez of Harbor Marks LLC will design a logo and brand kit for Maya Chen of Northline Studio.

2. Payment Terms
$2,400 due on signing.

3. Term
Work runs 30 days starting August 22, 2026.

4. Governing Law
This Agreement is governed by the laws of the State of Texas.`;

const BROKEN_FREE_DOC_PARTY_AB = `BUSINESS AGREEMENT

This Agreement is entered into by and between Party A and Party B.

1. Scope
This agreement covers due. Work.

2. Payment Terms
$2,000 upon completion.

3. Term
February 2026.

4. Governing Law
TBD.`;

describe("free one-pager validation", () => {
  it("shouldRedirectFreeToProForValidation returns false for 'ok'", () => {
    expect(shouldRedirectFreeToProForValidation("ok")).toBe(false);
  });

  it("shouldRedirectFreeToProForValidation returns true for 'missing_parties'", () => {
    expect(shouldRedirectFreeToProForValidation("missing_parties")).toBe(true);
  });

  it("shouldRedirectFreeToProForValidation returns true for 'missing_tenets'", () => {
    expect(shouldRedirectFreeToProForValidation("missing_tenets")).toBe(true);
  });

  it("shouldRedirectFreeToProForValidation returns true for 'incomplete_sentences'", () => {
    expect(shouldRedirectFreeToProForValidation("incomplete_sentences")).toBe(true);
  });

  it("shouldRedirectFreeToProForValidation returns true for 'generation_failed'", () => {
    expect(shouldRedirectFreeToProForValidation("generation_failed")).toBe(true);
  });

  it("shouldRedirectFreeToProForValidation returns false for null/undefined", () => {
    expect(shouldRedirectFreeToProForValidation(null)).toBe(false);
    expect(shouldRedirectFreeToProForValidation(undefined)).toBe(false);
    expect(shouldRedirectFreeToProForValidation("")).toBe(false);
  });

  it("isFreeOnePagerValid returns true for valid doc + ok validation", () => {
    expect(isFreeOnePagerValid(MAYA_DIEGO_VALID_FREE_DOC, "ok")).toBe(true);
  });

  it("isFreeOnePagerValid returns false for short doc", () => {
    expect(isFreeOnePagerValid("short", "ok")).toBe(false);
  });

  it("isFreeOnePagerValid returns false for non-ok validation", () => {
    expect(isFreeOnePagerValid(MAYA_DIEGO_VALID_FREE_DOC, "missing_parties")).toBe(false);
  });
});

describe("resolveFreeStarterReviewBody with free_document_text", () => {
  it("uses free_document_text directly when validation is 'ok'", () => {
    const draft: ParsedDraftShape = {
      ...emptyDraft(),
      title: "Services Agreement",
      parties: [
        { name: "Maya Chen", role: "client" },
        { name: "Diego Alvarez", role: "service_provider" },
      ],
      purpose: "design a logo",
      payment_terms: "$2,400",
      jurisdiction: "Texas",
      free_document_text: MAYA_DIEGO_VALID_FREE_DOC,
      free_document_validation: "ok",
    };

    const result = resolveFreeStarterReviewBody({
      draft,
      rawIntake: MAYA_DIEGO_INTAKE,
    });

    // Should use the direct OpenAI body
    expect(result.source).toBe("free_openai_direct");
    // Body should contain the actual names, not Party A/B
    expect(result.body).toContain("Maya Chen");
    expect(result.body).toContain("Diego Alvarez");
    expect(result.body).toContain("Harbor Marks LLC");
    // Should preserve the exact payment amount
    expect(result.body).toContain("$2,400");
    // Should preserve Texas
    expect(result.body).toContain("Texas");
    // Should NOT contain generic placeholders
    expect(result.body).not.toMatch(/Party A/i);
    expect(result.body).not.toMatch(/Party B/i);
  });

  it("falls back to repaired_starter_preview when validation fails", () => {
    const draft: ParsedDraftShape = {
      ...emptyDraft(),
      title: "Services Agreement",
      parties: [
        { name: "Maya Chen", role: "client" },
        { name: "Diego Alvarez", role: "service_provider" },
      ],
      purpose: "design a logo",
      payment_terms: "$2,400",
      jurisdiction: "Texas",
      free_document_text: BROKEN_FREE_DOC_PARTY_AB,
      free_document_validation: "missing_parties",
    };

    const result = resolveFreeStarterReviewBody({
      draft,
      rawIntake: MAYA_DIEGO_INTAKE,
    });

    // Should NOT use free_openai_direct when validation fails
    expect(result.source).not.toBe("free_openai_direct");
    // Falls back to repaired_starter_preview
    expect(result.source).toBe("repaired_starter_preview");
  });

  it("falls back to repaired_starter_preview when free_document_text is missing", () => {
    const draft: ParsedDraftShape = {
      ...emptyDraft(),
      title: "Services Agreement",
      parties: [
        { name: "Maya Chen", role: "client" },
        { name: "Diego Alvarez", role: "service_provider" },
      ],
      purpose: "design a logo",
      payment_terms: "$2,400",
      jurisdiction: "Texas",
    };

    const result = resolveFreeStarterReviewBody({
      draft,
      rawIntake: MAYA_DIEGO_INTAKE,
    });

    expect(result.source).toBe("repaired_starter_preview");
  });

  it("prefers freeDocumentText arg over draft.free_document_text", () => {
    const draft: ParsedDraftShape = {
      ...emptyDraft(),
      title: "Services Agreement",
      parties: [
        { name: "Maya Chen", role: "client" },
        { name: "Diego Alvarez", role: "service_provider" },
      ],
      free_document_text: "OLD BODY FROM DRAFT",
      free_document_validation: "ok",
    };

    const result = resolveFreeStarterReviewBody({
      draft,
      rawIntake: MAYA_DIEGO_INTAKE,
      freeDocumentText: MAYA_DIEGO_VALID_FREE_DOC,
      freeDocumentValidation: "ok",
    });

    expect(result.source).toBe("free_openai_direct");
    expect(result.body).toContain("Maya Chen");
    expect(result.body).not.toContain("OLD BODY FROM DRAFT");
  });
});

describe("Maya/Diego regression test", () => {
  it("complete 5-tenet dump preserves visitor words when free_document_text is valid", () => {
    const draft: ParsedDraftShape = {
      ...emptyDraft(),
      title: "Services Agreement",
      parties: [
        { name: "Maya Chen", role: "client" },
        { name: "Diego Alvarez", role: "service_provider" },
      ],
      purpose: "design a logo and brand kit",
      payment_terms: "$2,400 due on signing",
      jurisdiction: "Texas",
      duration: "30 days starting August 22, 2026",
      free_document_text: MAYA_DIEGO_VALID_FREE_DOC,
      free_document_validation: "ok",
    };

    const result = resolveFreeStarterReviewBody({
      draft,
      rawIntake: MAYA_DIEGO_INTAKE,
    });

    // All 5 tenets must be preserved:
    // 1. Party 1: Maya Chen
    expect(result.body).toContain("Maya Chen");
    // 2. Party 2: Diego Alvarez
    expect(result.body).toContain("Diego Alvarez");
    // 3. Payment: $2,400 (NOT $2,000)
    expect(result.body).toContain("$2,400");
    expect(result.body).not.toContain("$2,000");
    // 4. Term: August 2026 (NOT February 2026)
    expect(result.body).toContain("August");
    expect(result.body).not.toMatch(/February 2026/i);
    // 5. Law: Texas
    expect(result.body).toContain("Texas");

    // Must NOT have broken fragments
    expect(result.body).not.toMatch(/covers due\. Work\./i);
    expect(result.body).not.toMatch(/Party A/i);
    expect(result.body).not.toMatch(/Party B/i);
  });
});

describe("getFreeOnePagerFallbackForProFailure", () => {
  it("returns valid free document text when validation is ok", () => {
    const draft = {
      free_document_text: MAYA_DIEGO_VALID_FREE_DOC,
      free_document_validation: "ok",
    };
    const result = getFreeOnePagerFallbackForProFailure(draft);
    expect(result).toBe(MAYA_DIEGO_VALID_FREE_DOC.trim());
  });

  it("returns empty string when validation fails", () => {
    const draft = {
      free_document_text: "Some text but validation failed",
      free_document_validation: "missing_parties",
    };
    const result = getFreeOnePagerFallbackForProFailure(draft);
    expect(result).toBe("");
  });

  it("returns empty string when text is too short", () => {
    const draft = {
      free_document_text: "Too short",
      free_document_validation: "ok",
    };
    const result = getFreeOnePagerFallbackForProFailure(draft);
    expect(result).toBe("");
  });

  it("returns empty string when draft is null", () => {
    expect(getFreeOnePagerFallbackForProFailure(null)).toBe("");
    expect(getFreeOnePagerFallbackForProFailure(undefined)).toBe("");
  });

  it("returns empty string when free_document_text is missing", () => {
    const draft = {
      free_document_validation: "ok",
    };
    expect(getFreeOnePagerFallbackForProFailure(draft)).toBe("");
  });

  it("provides fallback for Pro failure when free one-pager was valid", () => {
    // Simulates the Maya/Diego scenario where:
    // 1. Free tier generated a valid one-pager
    // 2. User upgraded to Pro
    // 3. Pro generation failed
    // 4. System should fall back to the valid free one-pager
    const draftWithValidFree = {
      free_document_text: MAYA_DIEGO_VALID_FREE_DOC,
      free_document_validation: "ok",
    };
    const fallback = getFreeOnePagerFallbackForProFailure(draftWithValidFree);
    expect(fallback.length).toBeGreaterThan(200);
    expect(fallback).toContain("Maya Chen");
    expect(fallback).toContain("Diego Alvarez");
    expect(fallback).toContain("$2,400");
    expect(fallback).toContain("Texas");
  });
});
