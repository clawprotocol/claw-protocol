/**
 * Free one-pager direct paint tests.
 *
 * Regression tests for the Maya Chen / Diego Alvarez launch-blocking bug:
 * - Verifies that when `free_document_text` is present and validation is "ok",
 *   the resolver paints that body directly instead of building from structured fields.
 * - Verifies validation failure detection and Pro redirect recommendation.
 * - Verifies that visitor words (names, price, term, law) are preserved.
 * 
 * Also includes hollow body gate tests for thin dumps like:
 * - "Can someone watch my dog Saturday?" (scraped "Can" as party name)
 * - Role-only parties (Client + Service_provider)
 * - Empty Payment/Law sections
 */
import { describe, expect, it } from "vitest";
import {
  evaluateSimpleHollowBodyGate,
  getFreeOnePagerFallbackForProFailure,
  isFreeOnePagerValid,
  isHollowPartyName,
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

  it("shouldRedirectFreeToProForValidation returns true for 'hollow_body'", () => {
    expect(shouldRedirectFreeToProForValidation("hollow_body")).toBe(true);
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

// Priya/Diego scenario from #66 bug report - body has Party A/B and drops tenets
const PRIYA_DIEGO_INTAKE =
  "Ok long story my friend Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC to design a logo and brand kit for $2,400 due on signing. Work runs 30 days starting August 22, 2026. Governing law is Texas. Also my cousin wants his boat mentioned, here's a chili recipe, we might add a third partner later but not now, and ignore this dogecoin slack paste: WOW MUCH COIN meeting Tuesday parking lot. Make it look official. Priya is the client. Diego is the designer.";

const PRIYA_DIEGO_BROKEN_BODY = `SERVICES AGREEMENT

This Agreement is entered into by and between:
Party A ("Client") and Party B ("Service Provider") (collectively, the "Parties").

1. Scope of Services / Purpose
This agreement covers due. Work.

2. Payment Terms
$2,400

3. Services Term and Effective Date
Services Term: 30 days
Effective Date: August 22, 2026

4. Governing Law
Governing law: To be agreed by the parties unless otherwise agreed.`;

describe("Priya/Diego #66 regression test", () => {
  it("rejects body with Party A/B when intake named Priya/Diego", () => {
    const draft: ParsedDraftShape = {
      ...emptyDraft(),
      title: "Services Agreement",
      parties: [
        { name: "Priya Shah", role: "client" },
        { name: "Diego Alvarez", role: "service_provider" },
      ],
      purpose: "design a logo and brand kit",
      payment_terms: "$2,400 due on signing",
      jurisdiction: "Texas",
      duration: "30 days starting August 22, 2026",
      free_document_text: PRIYA_DIEGO_BROKEN_BODY,
      free_document_validation: "ok", // Backend incorrectly passed
    };

    const result = resolveFreeStarterReviewBody({
      draft,
      rawIntake: PRIYA_DIEGO_INTAKE,
    });

    // Body should be blocked because:
    // 1. Intake named Priya Shah and Diego Alvarez, but body has Party A/B
    // 2. Body has "covers due. Work." truncation
    // 3. Texas law was in dump but body says "To be agreed"
    expect(result.hollowBodyBlocked).toBe(true);
    expect(result.hollowBodyReason).toBeTruthy();
  });

  it("rejects local template fallback when intake has named parties", () => {
    const draft: ParsedDraftShape = {
      ...emptyDraft(),
      title: "Services Agreement",
      parties: [
        { name: "Client", role: "client" },
        { name: "Service Provider", role: "service_provider" },
      ],
      purpose: "design a logo and brand kit",
      payment_terms: "$2,400 due on signing",
      jurisdiction: "Texas",
      duration: "30 days starting August 22, 2026",
      // No free_document_text - will fall back to local template
    };

    const result = resolveFreeStarterReviewBody({
      draft,
      rawIntake: PRIYA_DIEGO_INTAKE,
    });

    // Local template produces Party A ("Client") and Party B ("Service Provider")
    // This should be blocked because intake has real names
    expect(result.hollowBodyBlocked).toBe(true);
    expect(result.hollowBodyReason).toBeTruthy();
  });

  it("blocks body with 'covers due. Work.' truncation", () => {
    const draft: ParsedDraftShape = {
      ...emptyDraft(),
      title: "Services Agreement",
      parties: [
        { name: "Priya Shah", role: "client" },
        { name: "Diego Alvarez", role: "service_provider" },
      ],
      purpose: "This agreement covers due. Work.",
      payment_terms: "$2,400",
      jurisdiction: "Texas",
      free_document_text: PRIYA_DIEGO_BROKEN_BODY,
      free_document_validation: "ok",
    };

    const result = resolveFreeStarterReviewBody({
      draft,
      rawIntake: PRIYA_DIEGO_INTAKE,
    });

    expect(result.hollowBodyBlocked).toBe(true);
  });

  it("blocks body that drops Texas jurisdiction from intake", () => {
    const draftWithTexas: ParsedDraftShape = {
      ...emptyDraft(),
      title: "Services Agreement",
      parties: [
        { name: "Priya Shah", role: "client" },
        { name: "Diego Alvarez", role: "service_provider" },
      ],
      purpose: "design a logo and brand kit",
      payment_terms: "$2,400",
      jurisdiction: "Texas",
      duration: "30 days starting August 22, 2026",
      free_document_text: PRIYA_DIEGO_BROKEN_BODY, // Body says "To be agreed" for law
      free_document_validation: "ok",
    };

    const result = resolveFreeStarterReviewBody({
      draft: draftWithTexas,
      rawIntake: PRIYA_DIEGO_INTAKE,
    });

    // The body dropped Texas which was in the intake
    expect(result.hollowBodyBlocked).toBe(true);
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

describe("isHollowPartyName", () => {
  it("returns true for role placeholders", () => {
    expect(isHollowPartyName("Client")).toBe(true);
    expect(isHollowPartyName("Service_provider")).toBe(true);
    expect(isHollowPartyName("Service Provider")).toBe(true);
    expect(isHollowPartyName("Contractor")).toBe(true);
    expect(isHollowPartyName("Vendor")).toBe(true);
    expect(isHollowPartyName("Party")).toBe(true);
    expect(isHollowPartyName("Party A")).toBe(true);
    expect(isHollowPartyName("Party B")).toBe(true);
  });

  it("returns true for scraped question words", () => {
    expect(isHollowPartyName("Can")).toBe(true);
    expect(isHollowPartyName("Need")).toBe(true);
    expect(isHollowPartyName("Looking")).toBe(true);
    expect(isHollowPartyName("Please")).toBe(true);
    expect(isHollowPartyName("Someone")).toBe(true);
    expect(isHollowPartyName("Anyone")).toBe(true);
    expect(isHollowPartyName("Help")).toBe(true);
  });

  it("returns true for very short words", () => {
    expect(isHollowPartyName("Jo")).toBe(true);
    expect(isHollowPartyName("Me")).toBe(true);
    expect(isHollowPartyName("A")).toBe(true);
  });

  it("returns false for real names", () => {
    expect(isHollowPartyName("Maya Chen")).toBe(false);
    expect(isHollowPartyName("Diego Alvarez")).toBe(false);
    expect(isHollowPartyName("Harbor Marks LLC")).toBe(false);
    expect(isHollowPartyName("Northline Studio")).toBe(false);
    expect(isHollowPartyName("Acme Corp")).toBe(false);
    expect(isHollowPartyName("John Smith")).toBe(false);
  });

  it("returns false for company names", () => {
    expect(isHollowPartyName("Apple Inc")).toBe(false);
    expect(isHollowPartyName("Google LLC")).toBe(false);
    expect(isHollowPartyName("Smith & Associates")).toBe(false);
  });
});

// The hollow body from the dog dump: "Can someone watch my dog Saturday?"
const DOG_DUMP_HOLLOW_BODY = `BUSINESS AGREEMENT

This Agreement ("Agreement") is entered into by and between:
Client ("Client") and Can ("Service_provider") (collectively, the "Parties").

1. Scope of Services / Purpose
Commercial arrangement to be agreed between the parties.

2. Payment Terms

3. Term and Effective Date
Term: As stated in the agreement.
Effective Date: Upon full execution by the parties unless otherwise specified.

4. Governing Law

5. Termination
Termination terms to be agreed by the Parties.`;

describe("evaluateSimpleHollowBodyGate", () => {
  it("blocks the dog dump hollow body (Client + Can, empty Payment/Law)", () => {
    const result = evaluateSimpleHollowBodyGate(DOG_DUMP_HOLLOW_BODY, [
      { name: "Client", role: "client" },
      { name: "Can", role: "service_provider" },
    ]);
    expect(result.isHollow).toBe(true);
    expect(result.reason).toBeTruthy();
  });

  it("blocks bodies with role-only parties in draft", () => {
    const body = `SERVICES AGREEMENT

This Agreement ("Agreement") is entered into by and between Client ("Client") and Service Provider ("Provider") (collectively, the "Parties").

1. Scope of Services / Purpose
The Service Provider agrees to provide professional consulting services to the Client as described herein. The scope includes general business consulting and advisory services.

2. Payment Terms
$500 upon completion of all services described in this Agreement.

3. Term and Effective Date
This Agreement shall be effective for 30 days from the date of execution.

4. Governing Law
This Agreement shall be governed by and construed in accordance with the laws of the State of Texas.`;

    const result = evaluateSimpleHollowBodyGate(body, [
      { name: "Client", role: "client" },
      { name: "Service Provider", role: "service_provider" },
    ]);
    expect(result.isHollow).toBe(true);
    // Either body or draft check can catch this - both are role-only parties
    expect(["role_only_parties_in_body", "role_only_parties_in_draft"]).toContain(result.reason);
  });

  it("blocks bodies with hollow sections", () => {
    const bodyWithHollowPayment = `SERVICES AGREEMENT

This Agreement ("Agreement") is entered into by and between Maya Chen ("Client") and Diego Alvarez ("Provider") (collectively, the "Parties").

1. Scope of Services / Purpose
Diego Alvarez agrees to design a professional logo and brand identity kit for Maya Chen's business. The scope includes primary logo, color palette, and typography guidelines.

2. Payment Terms

3. Term and Effective Date
This Agreement shall be effective for 30 days from the date of execution by both parties.

4. Governing Law
This Agreement shall be governed by and construed in accordance with the laws of the State of Texas.`;

    const result = evaluateSimpleHollowBodyGate(bodyWithHollowPayment, null);
    expect(result.isHollow).toBe(true);
    expect(result.reason).toBe("hollow_sections");
  });

  it("blocks bodies missing both payment and law", () => {
    const bodyMissingBoth = `SERVICES AGREEMENT

This Agreement is entered into by and between Maya Chen and Diego Alvarez.

1. Scope
Design a logo and brand kit.

2. Payment Terms
To be agreed.

3. Term
30 days.

4. Governing Law
TBD`;

    const result = evaluateSimpleHollowBodyGate(bodyMissingBoth, null);
    expect(result.isHollow).toBe(true);
  });

  it("passes complete Maya/Diego body", () => {
    const result = evaluateSimpleHollowBodyGate(MAYA_DIEGO_VALID_FREE_DOC, [
      { name: "Maya Chen", role: "client" },
      { name: "Diego Alvarez", role: "service_provider" },
    ]);
    expect(result.isHollow).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("passes body with real names and tenets", () => {
    const validBody = `CONSULTING AGREEMENT

This Agreement is entered into by and between John Smith and Acme Corp.

1. Scope
Software development consulting services.

2. Payment Terms
$5,000 per month, payable on the 1st.

3. Term
12 months starting January 1, 2026.

4. Governing Law
This Agreement is governed by the laws of California.`;

    const result = evaluateSimpleHollowBodyGate(validBody, [
      { name: "John Smith", role: "consultant" },
      { name: "Acme Corp", role: "client" },
    ]);
    expect(result.isHollow).toBe(false);
    expect(result.reason).toBeNull();
  });
});

describe("resolveFreeStarterReviewBody hollow body gate", () => {
  it("sets hollowBodyBlocked=true for dog dump style hollow body", () => {
    const draft: ParsedDraftShape = {
      ...emptyDraft(),
      title: "Business Agreement",
      parties: [
        { name: "Client", role: "client" },
        { name: "Can", role: "service_provider" },
      ],
      purpose: "Commercial arrangement to be agreed",
      payment_terms: "",
      jurisdiction: "",
      free_document_text: DOG_DUMP_HOLLOW_BODY,
      free_document_validation: "ok", // Backend passed but body is still hollow
    };

    const result = resolveFreeStarterReviewBody({
      draft,
      rawIntake: "Can someone watch my dog Saturday?",
    });

    expect(result.hollowBodyBlocked).toBe(true);
    expect(result.hollowBodyReason).toBeTruthy();
  });

  it("sets hollowBodyBlocked=false for complete Maya/Diego body", () => {
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

    expect(result.hollowBodyBlocked).toBe(false);
    expect(result.hollowBodyReason).toBeNull();
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
