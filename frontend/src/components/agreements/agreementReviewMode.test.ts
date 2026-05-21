import { describe, expect, it, vi } from "vitest";
import {
  resolveAgreementReviewMode,
  shouldSuppressPremiumAdvisoryReview,
  MIN_SOURCE_COMPARE_TEXT_CHARS,
} from "./agreementReviewMode";
import { fetchPremiumAdvisoryEnrichmentAfterAccept } from "./premiumAdvisoryPostAccept";
import { buildSourceComparisonView } from "./sourceComparisonReview";
import { resolveGuidedCompletionRenderState } from "./guidedDealCompletion/resolveGuidedCompletionRenderState";
import { buildGuidedSessionFromAgreement } from "./guidedDealCompletion/guidedCompletionEngine";
import { LIGHTHOUSE_APEX_CASUAL_QA_INTAKE, lighthouseApexMigrationBodyFixture } from "./qaManualTenPrompts";

describe("agreementReviewMode", () => {
  const longSource = "A".repeat(MIN_SOURCE_COMPARE_TEXT_CHARS);
  const longRevised = "B".repeat(MIN_SOURCE_COMPARE_TEXT_CHARS + 50);

  it("selects source_comparison when uploaded source text is present", () => {
    const r = resolveAgreementReviewMode({
      uploadedSourceText: longSource,
      currentRevisedText: longRevised,
    });
    expect(r.mode).toBe("source_comparison");
    expect(r.sourceText).toBe(longSource);
  });

  it("selects generated_agreement_review when no upload source", () => {
    const r = resolveAgreementReviewMode({
      currentRevisedText: longRevised,
    });
    expect(r.mode).toBe("generated_agreement_review");
  });

  it("suppresses premium advisory in source_comparison mode", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const out = await fetchPremiumAdvisoryEnrichmentAfterAccept({
      draft: {
        title: "Test",
        jurisdiction: "DE",
        parties: [],
        purpose: "x",
        payment_terms: "x",
        duration: null,
        due_date: null,
        effective_date: null,
        payment: { amount: null, cadence: null, valid: false },
      },
      rawIntakeForSot: "services agreement",
      userGapAnswers: null,
      winningBodyText: longRevised,
      reviewMode: "source_comparison",
    });
    expect(out.premiumReview).toBeNull();
    expect(out.premiumFinalizeAudit).toBeNull();
    expect(out.premiumReviewRoute).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("source comparison diff renders additions and deletions", () => {
    const view = buildSourceComparisonView("Fee is $100.\n\nTerm is one year.", "Fee is $200.\n\nTerm is two years.");
    expect(view.summary.changedSections).toBeGreaterThan(0);
    expect(view.summary.additions + view.summary.deletions).toBeGreaterThan(0);
  });

  it("guided completion never renders in source_comparison mode", () => {
    const body = lighthouseApexMigrationBodyFixture();
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: LIGHTHOUSE_APEX_CASUAL_QA_INTAKE,
      body,
    })!;
    const state = resolveGuidedCompletionRenderState({
      bodyText: body,
      intakeText: LIGHTHOUSE_APEX_CASUAL_QA_INTAKE,
      guidedSession: session,
      panelMountedSurface: "document_editor",
      bodyUsable: true,
    });
    expect(state.sessionHasRenderableQueue).toBe(true);

    const sourceModeState = resolveGuidedCompletionRenderState({
      bodyText: body,
      guidedSession: session,
      panelMountedSurface: null,
      bodyUsable: false,
      draftState: "source_comparison",
    });
    expect(sourceModeState.canRenderGuidedQuestions).toBe(false);
    expect(sourceModeState.shouldShowNeedsDetails).toBe(false);
  });

  it("generated Pro path still allows session renderability when panel mounted", () => {
    const body = lighthouseApexMigrationBodyFixture();
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: LIGHTHOUSE_APEX_CASUAL_QA_INTAKE,
      body,
    })!;
    const state = resolveGuidedCompletionRenderState({
      bodyText: body,
      intakeText: LIGHTHOUSE_APEX_CASUAL_QA_INTAKE,
      guidedSession: session,
      panelMountedSurface: "document_editor",
      bodyUsable: true,
      rawReadiness: "needs_details",
    });
    expect(state.canRenderGuidedQuestions).toBe(true);
    expect(shouldSuppressPremiumAdvisoryReview("generated_agreement_review")).toBe(false);
  });

  it("failed extraction resolves source mode without sufficient text", () => {
    const r = resolveAgreementReviewMode({
      explicitMode: "source_comparison",
      uploadedSourceText: "short",
      currentRevisedText: longRevised,
    });
    expect(r.mode).toBe("source_comparison");
    expect((r.sourceText ?? "").length).toBeLessThan(MIN_SOURCE_COMPARE_TEXT_CHARS);
    expect(r.reason).toBe("source_mode_extraction_insufficient");
  });

  it("selects source_comparison from pro_redline pending import snapshots", () => {
    const r = resolveAgreementReviewMode({
      proRedlinePending: {
        base_document_text: longSource,
        imported_document_text: longRevised,
      },
      currentRevisedText: longRevised + "\nextra",
    });
    expect(r.mode).toBe("source_comparison");
    expect(r.reason).toBe("pro_redline_pending_import");
    expect(r.sourceText).toBe(longSource);
  });

  it("explicit generated_agreement_review overrides uploaded source", () => {
    const r = resolveAgreementReviewMode({
      explicitMode: "generated_agreement_review",
      uploadedSourceText: longSource,
      currentRevisedText: longRevised,
    });
    expect(r.mode).toBe("generated_agreement_review");
    expect(r.sourceText).toBeNull();
  });

  it("regression: advisory suppression and no guided clutter in source mode", () => {
    expect(shouldSuppressPremiumAdvisoryReview("source_comparison")).toBe(true);
    const body = lighthouseApexMigrationBodyFixture();
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: LIGHTHOUSE_APEX_CASUAL_QA_INTAKE,
      body,
    })!;
    const state = resolveGuidedCompletionRenderState({
      bodyText: body,
      intakeText: LIGHTHOUSE_APEX_CASUAL_QA_INTAKE,
      guidedSession: session,
      panelMountedSurface: "document_editor",
      bodyUsable: false,
      rawReadiness: "needs_details",
      draftState: "source_comparison",
    });
    expect(state.shouldShowNeedsDetails).toBe(false);
    expect(state.shouldShowCompleteAgreementHeading).toBe(false);
    expect(state.canRenderGuidedQuestions).toBe(false);
  });
});
