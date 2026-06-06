import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REVIEW_FIRST_SIMPLE_PRO_SOURCE = "simple_pro_send_for_review";

describe("SimpleProFinalReviewScreen review-first routing (static)", () => {
  it("AgreementBuilderIntake handleProSendForReview calls completeGuidedPaidProReviewFirstHandoff not enterFinalReviewRecipientSetup", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const handleIdx = intake.indexOf("const handleProSendForReview = React.useCallback");
    const block = intake.slice(handleIdx, handleIdx + 1800);
    expect(block).toContain('void completeGuidedPaidProReviewFirstHandoff("simple_pro_send_for_review")');
    expect(block).toContain(REVIEW_FIRST_SIMPLE_PRO_SOURCE);
    expect(block).toContain('selectedTrack: "review"');
    expect(block).not.toMatch(
      /paidProSignatureDetailsReady[\s\S]{0,120}enterFinalReviewRecipientSetup\("review_only"\)/,
    );
  });

  it("completeGuidedPaidProReviewFirstHandoff suppresses onCreated navigation during review persist", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const handoffIdx = intake.indexOf("const completeGuidedPaidProReviewFirstHandoff = React.useCallback");
    const block = intake.slice(handoffIdx, handoffIdx + 12000);
    expect(block).toContain("runPersistAndOpen(mergedDraft, partyCtx, true, \"review\", \"review\", true)");
    expect(block).toContain(", true)");
    expect(intake).toContain("reviewFirstHandoffPersist = false");
    expect(intake).toContain("suppress_onCreated_for_review_first_persist");
    expect(block).not.toContain("navigate(`/app/send/");
  });

  it("mint 422 uses reviewFirstHandoffError only — not setHardError on mint failure", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const handoffIdx = intake.indexOf("const completeGuidedPaidProReviewFirstHandoff = React.useCallback");
    const block = intake.slice(handoffIdx, handoffIdx + 12000);
    expect(block).toContain("const failReviewFirstMint = (");
    expect(block).toContain("setHardError(null);");
    expect(block).toContain("setReviewFirstHandoffError(message);");
    expect(block).toContain("logReviewFirstInlineErrorRendered");
    expect(block).toContain("logReviewFirstPersistSkipped");
    expect(block).toContain("logReviewFirstEnvTokenSecretMissing");
    expect(intake).toContain("reviewFirstSigningTokenSecretMissing");
    expect(block).toContain("result.failure.mintErrorCode");
    expect(block).toContain("clearReviewFirstMintInFlight()");
    expect(block).not.toMatch(/failReviewFirstMint[\s\S]{0,120}setHardError\(message\)/);
  });

  it("hardErrorForUi suppresses generic save footer when reviewFirstHandoffError on final review", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("if (reviewFirstHandoffError && simpleProFinalReviewActive) return null;");
  });

  it("canonical paid Pro review uses enterprise header and review status panel", () => {
    const screen = readFileSync(join(__dirname, "SimpleProFinalReviewScreen.tsx"), "utf8");
    expect(screen).toContain("canonicalPaidProReview");
    expect(screen).toContain("PAID_PRO_REVIEW_SHELL_TITLE");
    expect(screen).toContain("PaidProReviewStatusPanel");
    expect(screen).toContain("paid-pro-final-version-indicator");
    const statusPanel = readFileSync(join(__dirname, "PaidProReviewStatusPanel.tsx"), "utf8");
    expect(statusPanel).toContain('data-testid="paid-pro-review-status-panel"');
    // Legacy noisy header surfaces are gone.
    expect(screen).not.toContain('data-testid="canonical-paid-pro-review-chip-state"');
    expect(screen).not.toContain('data-testid="canonical-paid-pro-review-badge"');
    expect(screen).not.toContain("Ready for review");
    expect(screen).not.toContain("Back to signer details");
  });

  it("guided final review resolution prefers paidProSourceOfTruth when canonical SoT exists", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const block = intake.slice(
      intake.indexOf("const guidedFinalReviewAuthoritativeResolution = useMemo"),
      intake.indexOf("const guidedAuthoritativeBodyPlain = useMemo"),
    );
    expect(block).toContain("hasPaidProSourceOfTruth()");
    expect(block).toMatch(/source:\s*["']paidProSourceOfTruth["']\s+as const/);
  });

  it("canonical paid review renders paidReviewPlain before unavailable preview", () => {
    const screen = readFileSync(join(__dirname, "SimpleProFinalReviewScreen.tsx"), "utf8");
    expect(screen).toContain("paidReviewPlain");
    expect(screen).toContain("hasCanonicalPaidReviewBody");
    expect(screen).toContain("simple-pro-final-review-paid-sot-body");
    expect(screen).toMatch(/data-paid-pro-authoritative-source=\{/);
    const unavailableIdx = screen.indexOf("simple-pro-final-review-document-empty");
    const paidBodyIdx = screen.indexOf("simple-pro-final-review-paid-sot-body");
    expect(paidBodyIdx).toBeGreaterThan(-1);
    expect(screen).toContain("showPreviewUnavailable");
    expect(screen.indexOf("showPreviewUnavailable")).toBeLessThan(unavailableIdx);
  });

  it("AgreementBuilderIntake passes paidReviewPlain and suppresses finalizing when SoT exists", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("paidReviewPlain={");
    expect(intake).toContain("simpleProFinalReviewDisplayPlain");
    expect(intake).toContain("suppressPaidProFinalReviewFinalizingState");
    expect(intake).toContain("resolvePaidProFinalReviewVisiblePlain");
  });

  it("AgreementBuilderIntake routes missing paid Pro signer metadata to signer details before signature prep", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("resolvePaidProSignerDetailsGate");
    expect(intake).toContain("paidProSignatureDetailsReady");
    expect(intake).toContain('enterFinalReviewRecipientSetup("signature")');
    expect(intake).toContain("PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA");
    expect(intake).toContain("PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA");
  });

  it("canonical paid review renders document before actions", () => {
    const screen = readFileSync(join(__dirname, "SimpleProFinalReviewScreen.tsx"), "utf8");
    const documentIdx = screen.indexOf('data-testid="simple-pro-final-review-document"');
    const actionsIdx = screen.indexOf('data-testid="simple-pro-final-review-actions"');
    expect(screen).toContain("resolvePaidProFirstReviewDocumentPresentation");
    expect(screen).toContain("logPaidProReviewRenderSourceOnce");
    expect(screen).toContain("preferHydratedReviewHtml");
    expect(documentIdx).toBeGreaterThan(-1);
    expect(actionsIdx).toBeGreaterThan(documentIdx);
  });

  it("review-link persist failure uses dedicated panel test ids near CTA", () => {
    const screen = readFileSync(join(__dirname, "SimpleProFinalReviewScreen.tsx"), "utf8");
    expect(screen).toContain('"simple-pro-review-link-persist-failure"');
    expect(screen).toContain("Retry creating review link");
    expect(screen).toContain('data-testid="simple-pro-review-link-copy-debug"');
  });

  it("SimpleProFinalReviewScreen renders review-first error in final review actions region", () => {
    const screen = readFileSync(join(__dirname, "SimpleProFinalReviewScreen.tsx"), "utf8");
    expect(screen).toContain('data-testid="simple-pro-final-review-actions"');
    expect(screen).toContain("reviewFirstActionsBlocked");
    expect(screen).toContain('"simple-pro-review-first-handoff-error"');
    expect(screen).toContain("scrollIntoView");
    expect(screen).toContain("reviewFirstSigningTokenSecretMissing");
    expect(screen).toContain("review-first-env-config-hint");
    const actionsIdx = screen.indexOf('data-testid="simple-pro-final-review-actions"');
    const errorIdx = screen.indexOf('"simple-pro-review-first-handoff-error"');
    expect(errorIdx).toBeGreaterThan(actionsIdx);
  });

  it("openPaidProPostInlineSendDestination never navigates to /app/send for review intent", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const fnIdx = intake.indexOf("const openPaidProPostInlineSendDestination = React.useCallback");
    const block = intake.slice(fnIdx, fnIdx + 2400);
    const reviewStart = block.indexOf('if (effectivePremiumSendMode === "review")');
    const signatureStart = block.indexOf('if (\n      shouldSkipPaidProPrepareReviewLinkInterstitial');
    const reviewBranch = block.slice(
      reviewStart,
      signatureStart > reviewStart ? signatureStart : reviewStart + 900,
    );
    expect(reviewBranch).toContain("intake_inline_send_review_first");
    expect(reviewBranch).not.toContain("navigate(`/app/send/");
  });
});
