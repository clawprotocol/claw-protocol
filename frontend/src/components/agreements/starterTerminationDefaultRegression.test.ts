/**
 * Regression: production Priya/Diego logo-brand intake must not show send-ready
 * while Section 5 still reads "Termination terms to be agreed by the Parties."
 */
import { describe, expect, it } from "vitest";
import { buildStarterAgreementPreviewForReview } from "./agreementPreviewFromDraft";
import { resolveFreeStarterStickyReviewCta } from "./freeStarterStickyReviewCta";
import { normalizeParsedDraftLegalConcepts } from "./intakeDraftLegalNormalize";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import {
  STARTER_DEFAULT_TERMINATION_SUMMARY,
  starterPreviewHasUnresolvedTerminationPlaceholder,
} from "./starterAgreementPreviewNormalize";

const PRODUCTION_E2E_INTAKE =
  "Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC for a logo and brand kit, 2400 dollars due on signing, 30 days starting August 24 2026, Texas law.";

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

function runStarterPipeline(intakeText: string): ParsedDraftShape {
  let draft = runIntakeDefaultsAndRoles(emptyDraft(), intakeText, true, defaultIntakePartyRoleLabels());
  draft = normalizeParsedDraftLegalConcepts(draft, intakeText);
  return draft;
}

describe("starter termination default (production Priya/Diego E2E intake)", () => {
  it("fills structured termination_summary with concrete default when intake omits notice terms", () => {
    const draft = runStarterPipeline(PRODUCTION_E2E_INTAKE);
    expect(draft.termination_summary).toBe(STARTER_DEFAULT_TERMINATION_SUMMARY);
    expect(draft.termination_summary).toMatch(/material breach/i);
    expect(draft.termination_summary).toMatch(/thirty \(30\)/i);
  });

  it("starter preview Section 5 has concrete termination — no 'to be agreed' placeholder", () => {
    const draft = runStarterPipeline(PRODUCTION_E2E_INTAKE);
    const preview = buildStarterAgreementPreviewForReview(draft, { intakeText: PRODUCTION_E2E_INTAKE });
    expect(preview).toMatch(/5\.\s*Termination/i);
    expect(preview).not.toMatch(/termination terms to be agreed/i);
    expect(starterPreviewHasUnresolvedTerminationPlaceholder(preview)).toBe(false);
    const terminationSection =
      preview.match(/\b5\.\s*Termination\b[\s\S]*?(?=\n\s*\d+\.\s|\n*$)/i)?.[0] || "";
    expect(terminationSection).toMatch(/material breach/i);
    expect(terminationSection).not.toMatch(/to be agreed/i);
  });

  it("sticky review CTA is not send-ready while unresolved termination placeholder remains on body", () => {
    const draft = runStarterPipeline(PRODUCTION_E2E_INTAKE);
    const preview = buildStarterAgreementPreviewForReview(draft, { intakeText: PRODUCTION_E2E_INTAKE });
    const cta = resolveFreeStarterStickyReviewCta({
      draft,
      userVisibleFullDocumentPlain: preview,
      intakeText: PRODUCTION_E2E_INTAKE,
    });
    expect(cta.reviewIncomplete).toBe(false);
    expect(cta.fixLabel).toBeNull();

    const placeholderBody = preview.replace(
      STARTER_DEFAULT_TERMINATION_SUMMARY,
      "Termination terms to be agreed by the Parties.",
    );
    const blocked = resolveFreeStarterStickyReviewCta({
      draft: { ...draft, termination_summary: "Termination terms to be agreed by the Parties." },
      userVisibleFullDocumentPlain: placeholderBody,
      intakeText: PRODUCTION_E2E_INTAKE,
    });
    expect(blocked.reviewIncomplete).toBe(true);
    expect(blocked.fixLabel).toBe("Fix details");
  });
});
