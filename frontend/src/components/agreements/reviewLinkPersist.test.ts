import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
const screen = readFileSync(join(__dirname, "SimpleProFinalReviewScreen.tsx"), "utf8");

describe("Test274 review-link persist blocker", () => {
  it("runPersistAndOpen never fake-succeeds when reviewFirstHandoffPersist is true", () => {
    const fnIdx = intake.indexOf("async function runPersistAndOpen");
    const catchIdx = intake.indexOf("} catch (e: unknown) {", fnIdx);
    const catchBlock = intake.slice(catchIdx, catchIdx + 3200);
    expect(catchBlock).toContain("if (reviewFirstHandoffPersist)");
    expect(catchBlock).toContain("logReviewLinkPersistFailure");
    expect(catchBlock).toContain("return false");
    const fakeSuccessIdx = catchBlock.indexOf("if (createProductionTwoPane && !hydrate && structuredOk)");
    const reviewGuardIdx = catchBlock.indexOf("if (reviewFirstHandoffPersist)");
    expect(reviewGuardIdx).toBeGreaterThan(-1);
    expect(fakeSuccessIdx).toBeGreaterThan(reviewGuardIdx);
  });

  it("failReviewFirstPersist surfaces dedicated panel via reviewFirstHandoffError not hardError", () => {
    const handoffIdx = intake.indexOf("const completeGuidedPaidProReviewFirstHandoff = React.useCallback");
    const block = intake.slice(handoffIdx, handoffIdx + 9000);
    expect(block).toContain("const failReviewFirstPersist = (");
    expect(block).toContain("setHardError(null)");
    expect(block).toContain("setReviewFirstHandoffError(message)");
    expect(block).toContain("setReviewLinkPersistFailureDiagnostics");
    expect(block).toContain("logReviewLinkPersistFailure");
    expect(block).toContain("REVIEW_LINK_PERSIST_BLOCKING_MESSAGE");
    expect(block).not.toMatch(/failReviewFirstPersist[\s\S]{0,200}setHardError\(message\)/);
  });

  it("persist network failure does not clear pinned authoritative corpus", () => {
    const handoffIdx = intake.indexOf("const completeGuidedPaidProReviewFirstHandoff = React.useCallback");
    const block = intake.slice(handoffIdx, handoffIdx + 9000);
    expect(block).toContain('restorePinnedFinalizedSignerCorpus("guided_review_first_handoff_persist")');
    expect(block).toContain("auditPaidProReviewLinkGenerationCorpus(bodyPlain)");
    expect(block).not.toMatch(
      /failReviewFirstPersist[\s\S]{0,400}setAgreementDocumentText\(""\)/,
    );
  });

  it("duplicate review-link clicks are deduped while request is in flight", () => {
    const handoffIdx = intake.indexOf("const completeGuidedPaidProReviewFirstHandoff = React.useCallback");
    const block = intake.slice(handoffIdx, handoffIdx + 400);
    expect(block).toContain("if (guidedReviewFirstHandoffInFlightRef.current) return");
    expect(block).toContain("guidedReviewFirstHandoffInFlightRef.current = true");
  });

  it("retry re-invokes completeGuidedPaidProReviewFirstHandoff with same handoff entry", () => {
    expect(intake).toContain('"simple_pro_review_first_retry"');
    expect(intake).toContain("setReviewLinkPersistFailureDiagnostics(null)");
  });

  it("successful review handoff routes to /app/done/:id", () => {
    const handoffIdx = intake.indexOf("const completeGuidedPaidProReviewFirstHandoff = React.useCallback");
    const block = intake.slice(handoffIdx, handoffIdx + 14000);
    expect(block).toContain("const donePath = `/app/done/${encodeURIComponent(id)}`");
    expect(block).toContain("logReviewFirstNavigateDone");
  });

  it("persist failure uses persist_failed reason instead of agreement_id_missing UX", () => {
    const handoffIdx = intake.indexOf("const completeGuidedPaidProReviewFirstHandoff = React.useCallback");
    const block = intake.slice(handoffIdx, handoffIdx + 9000);
    expect(block).toContain("failReviewFirstPersist(");
    expect(block).toContain('"persist_failed"');
    expect(block).toContain("REVIEW_LINK_PERSIST_BLOCKING_MESSAGE");
    expect(block).not.toContain('"agreement_id_missing"');
  });

  it("review persist uses same apiUrl draft contract as postNewDraft", () => {
    expect(intake).toContain('apiUrl("/api/agreements/draft")');
    expect(intake).toContain("reviewLinkPersistFailureRef");
    const premiumApi = readFileSync(join(__dirname, "premiumFullDraftApi.ts"), "utf8");
    expect(premiumApi).toContain("apiUrl(");
    expect(premiumApi).toContain('"/api/agreements/premium-full-draft"');
  });

  it("SimpleProFinalReviewScreen renders dedicated review-link persist panel", () => {
    expect(screen).toContain("reviewLinkPersistFailureActive");
    expect(screen).toContain('"simple-pro-review-link-persist-failure"');
    expect(screen).toContain('data-testid="simple-pro-review-link-copy-agreement"');
    expect(screen).toContain('data-testid="simple-pro-review-link-copy-debug"');
    expect(screen).toContain("Retry creating review link");
  });
});
