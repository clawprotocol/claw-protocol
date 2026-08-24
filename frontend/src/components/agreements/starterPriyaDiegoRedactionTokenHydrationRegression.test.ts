/**
 * Regression: production Priya/Diego logo-brand intake must not paint unresolved
 * [ORG_1] / [ADDRESS_1] redaction tokens in the visible Starter Draft textbox.
 */
import { describe, expect, it } from "vitest";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { normalizeParsedDraftLegalConcepts } from "./intakeDraftLegalNormalize";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import {
  evaluateSimpleHollowBodyGate,
  hydrateFreeStarterVisibleBody,
  resolveFreeStarterReviewBody,
  starterBodyHasUnresolvedRedactionTokens,
} from "./freeStarterReviewBodyResolver";

const EXACT_PRODUCTION_INTAKE =
  "Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC to design a logo and brand kit. Payment: 2400 dollars due on signing. Term: 30 days starting August 24, 2026. Governing law: Texas.";

const PRODUCTION_BROKEN_FREE_DOC = `SERVICES AGREEMENT

This Agreement is entered into by and between Priya Shah of Northline Studio and Diego Alvarez of [ORG_1].

1. Scope of Services
Diego Alvarez of Harbor Marks LLC will design a logo and brand kit for Priya Shah of Northline Studio.

2. Payment Terms
$2,400 due on signing.

3. Term
Term: The term of this Agreement shall last until [ADDRESS_1] 24, 2026.

4. Governing Law
This Agreement is governed by the laws of the State of Texas.`;

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

function priyaDiegoDraft(): ParsedDraftShape {
  let draft = runIntakeDefaultsAndRoles(
    emptyDraft(),
    EXACT_PRODUCTION_INTAKE,
    true,
    defaultIntakePartyRoleLabels(),
  );
  draft = normalizeParsedDraftLegalConcepts(draft, EXACT_PRODUCTION_INTAKE);
  return {
    ...draft,
    free_document_text: PRODUCTION_BROKEN_FREE_DOC,
    free_document_validation: "ok",
  };
}

describe("Priya/Diego starter redaction token hydration (production acceptance)", () => {
  it("flags raw server one-pager with ORG_1 and ADDRESS_1 as unresolved redaction tokens", () => {
    expect(starterBodyHasUnresolvedRedactionTokens(PRODUCTION_BROKEN_FREE_DOC)).toBe(true);
    const gate = evaluateSimpleHollowBodyGate(PRODUCTION_BROKEN_FREE_DOC, priyaDiegoDraft().parties ?? null, {
      intake: EXACT_PRODUCTION_INTAKE,
      jurisdiction: "Texas",
    });
    expect(gate.isHollow).toBe(true);
    expect(gate.reason).toBe("unresolved_redaction_tokens");
  });

  it("hydrateFreeStarterVisibleBody rehydrates Harbor Marks LLC and August 24, 2026 from exact intake", () => {
    const draft = priyaDiegoDraft();
    const hydrated = hydrateFreeStarterVisibleBody(PRODUCTION_BROKEN_FREE_DOC, draft, EXACT_PRODUCTION_INTAKE);
    expect(hydrated).toMatch(/Diego Alvarez of Harbor Marks LLC/);
    expect(hydrated).not.toMatch(/\[ORG_1\]/i);
    expect(hydrated).toMatch(/August 24, 2026/);
    expect(hydrated).not.toMatch(/\[ADDRESS_1\]/i);
    expect(starterBodyHasUnresolvedRedactionTokens(hydrated)).toBe(false);
  });

  it("resolveFreeStarterReviewBody paints hydrated names for validated free_document_text", () => {
    const result = resolveFreeStarterReviewBody({
      draft: priyaDiegoDraft(),
      rawIntake: EXACT_PRODUCTION_INTAKE,
    });
    expect(result.source).toBe("free_openai_direct");
    expect(result.hollowBodyBlocked).toBe(false);
    expect(result.body).toMatch(/Priya Shah of Northline Studio/);
    expect(result.body).toMatch(/Diego Alvarez of Harbor Marks LLC/);
    expect(result.body).not.toMatch(/\[ORG_1\]/i);
    expect(result.body).toMatch(/August 24, 2026/);
    expect(result.body).not.toMatch(/\[ADDRESS_1\]/i);
    expect(result.body).toMatch(/\$2,400/);
    expect(result.body).toMatch(/Texas/i);
  });
});
