import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  auditPaidProReviewLinkGenerationCorpus,
  buildPaidProCorpusLifecycleDiffPayload,
  recordPaidProCorpusLifecycleCheckpoint,
  resetPaidProCorpusLifecycleDiffForTests,
} from "./paidProCorpusLifecycleDiff";
import {
  logPaidProReviewTrackLifecycle,
  logReviewLinkCreated,
  logReviewLinkOpen,
  logReviewLinkSurfaceMounted,
  resolvePaidProReviewTrackCanonicalHash,
} from "./paidProReviewTrackLifecycle";

const FREEZE_BODY = [
  "CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  "This Agreement is between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
  "",
  ...Array.from({ length: 18 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT:",
  "Blue Canyon Analytics LLC",
  "By: _________________________________",
  "Name:",
  "Title:",
  "",
  "SERVICE PROVIDER:",
  "Iron Vale Systems Inc.",
  "By: _________________________________",
  "Name:",
  "Title:",
].join("\n");

describe("Test271 review track E2E hardening", () => {
  beforeEach(() => {
    resetPaidProCorpusLifecycleDiffForTests();
  });

  it("review link generation preserves canonical hash (identical)", () => {
    recordPaidProCorpusLifecycleCheckpoint("canonical_freeze", FREEZE_BODY);
    const audit = auditPaidProReviewLinkGenerationCorpus(FREEZE_BODY);
    expect(audit?.classification).toBe("identical");
    expect(audit?.substantiveClauseDelta).toBe(false);
  });

  it("review link generation rejects substantive clause drift", () => {
    recordPaidProCorpusLifecycleCheckpoint("canonical_freeze", FREEZE_BODY);
    const drifted = FREEZE_BODY.replace("Section 1.", "Section 1. AMENDED materially.");
    const payload = buildPaidProCorpusLifecycleDiffPayload({
      fromStage: "canonical_freeze",
      toStage: "review_link_generation",
      beforeText: FREEZE_BODY,
      afterText: drifted,
    });
    expect(payload.classification).toBe("substantive_clause_change");
    expect(payload.substantiveClauseDelta).toBe(true);
  });

  it("resolvePaidProReviewTrackCanonicalHash reads canonical_freeze checkpoint", () => {
    recordPaidProCorpusLifecycleCheckpoint("canonical_freeze", FREEZE_BODY);
    const hash = resolvePaidProReviewTrackCanonicalHash(FREEZE_BODY);
    expect(hash).toBeTruthy();
    expect(hash).toMatch(/^\d+:[a-f0-9]+$/);
  });

  it("review track lifecycle and reviewer surface log helpers are exported", () => {
    expect(typeof logPaidProReviewTrackLifecycle).toBe("function");
    expect(typeof logReviewLinkCreated).toBe("function");
    expect(typeof logReviewLinkOpen).toBe("function");
    expect(typeof logReviewLinkSurfaceMounted).toBe("function");
  });
});

describe("Test271 review track routing (static intake wiring)", () => {
  const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

  it("handleProSendForReview never gates review on paidProSignatureDetailsReady", () => {
    const handleIdx = intake.indexOf("const handleProSendForReview = React.useCallback");
    const handleEnd = intake.indexOf("const handleFinalizeRoutePrimaryAction", handleIdx);
    const block = intake.slice(handleIdx, handleEnd);
    expect(block).toContain("if (acceptedPaidProAuthorityActive || paidProAuthoritative)");
    expect(block).toContain('enterFinalReviewRecipientSetup("review_only")');
    expect(block).toContain('void completeGuidedPaidProReviewFirstHandoff("simple_pro_send_for_review")');
    expect(block).toContain('selectedTrack: "review"');
    expect(block).toContain('logPaidProReviewTrackLifecycle("review_track_selected"');
    expect(block).not.toMatch(
      /paidProSignatureDetailsReady[\s\S]{0,120}enterFinalReviewRecipientSetup\("review_only"\)/,
    );
  });

  it("enterFinalReviewRecipientSetup review_only never invokes signer handlers", () => {
    const enterIdx = intake.indexOf("const enterFinalReviewRecipientSetup = React.useCallback");
    const enterBlock = intake.slice(enterIdx, enterIdx + 4200);
    const reviewOnlyIdx = enterBlock.indexOf('if (intent === "review_only")');
    const signatureGateIdx = enterBlock.indexOf(
      "acceptedPaidProAuthorityActive && !paidProSignatureDetailsReady",
    );
    expect(reviewOnlyIdx).toBeGreaterThan(-1);
    expect(reviewOnlyIdx).toBeLessThan(signatureGateIdx);
    const reviewBranch = enterBlock.slice(reviewOnlyIdx, signatureGateIdx);
    expect(reviewBranch).not.toContain("handlePremiumReviewFirstContinueToSigners");
    expect(reviewBranch).not.toContain("claw-paid-pro-inline-signer-setup");
    expect(reviewBranch).toContain('handlePremiumSendModePick("review")');
    expect(reviewBranch).toContain("setCreateFlowSendRecipientEditorOpen(true)");
  });

  it("enterFinalReviewRecipientSetup signature path still uses signer setup gate", () => {
    const enterIdx = intake.indexOf("const enterFinalReviewRecipientSetup = React.useCallback");
    const enterBlock = intake.slice(enterIdx, enterIdx + 5500);
    expect(enterBlock).toContain("claw-paid-pro-inline-signer-setup");
    expect(enterBlock).toContain('handlePremiumReviewFirstContinueToSigners({ telemetryMode: "signature" })');
  });

  it("finalize route review bypasses signer-details gate and never calls signer continue handler", () => {
    const routeIdx = intake.indexOf("const handleFinalizeRoutePrimaryAction = React.useCallback");
    const routeBlock = intake.slice(routeIdx, routeIdx + 2200);
    expect(routeBlock).toContain('mode === "review" && paidProAuthoritative');
    expect(routeBlock).toContain('completeGuidedPaidProReviewFirstHandoff("finalize_route_primary_review")');
    expect(routeBlock).not.toMatch(
      /mode === "review"[\s\S]{0,200}enterFinalReviewRecipientSetup\("review_only"\)/,
    );
    expect(routeBlock).toContain('completeGuidedPaidProReviewFirstHandoff("finalize_route_recipients_setup")');
    expect(routeBlock).not.toContain('handlePremiumReviewFirstContinueToSigners({ telemetryMode: mode })');
  });

  it("premium_continue_to_signers review mode calls review handoff not signer handler", () => {
    const caseIdx = intake.indexOf('case "premium_continue_to_signers":');
    const caseBlock = intake.slice(caseIdx, caseIdx + 700);
    expect(caseBlock).toContain('completeGuidedPaidProReviewFirstHandoff("premium_continue_to_signers_review")');
    expect(caseBlock).toContain('handlePremiumReviewFirstContinueToSigners({ telemetryMode: "signature" })');
    expect(caseBlock).not.toContain('handlePremiumReviewFirstContinueToSigners({ telemetryMode: m })');
  });

  it("review-link persist failure keeps authoritative corpus and surfaces persist blocker", () => {
    expect(intake).toContain("reviewLinkPersistFailureRef");
    expect(intake).toContain("logReviewLinkPersistFailure");
    expect(intake).toContain('restorePinnedFinalizedSignerCorpus("guided_review_first_handoff_persist")');
    expect(intake).toContain("reviewLinkPersistFailureActive");
  });

  it("completeGuidedPaidProReviewFirstHandoff audits review link generation corpus", () => {
    const handoffIdx = intake.indexOf("const completeGuidedPaidProReviewFirstHandoff = React.useCallback");
    const handoffBlock = intake.slice(handoffIdx, handoffIdx + 14000);
    expect(handoffBlock).toContain("auditPaidProReviewLinkGenerationCorpus(bodyPlain)");
    expect(handoffBlock).toContain('logPaidProReviewTrackLifecycle("review_link_generated"');
    expect(handoffBlock).toContain("logReviewLinkCreated(");
  });

  it("review track open reviewer link and return to owner surfaces are wired", () => {
    const donePage = readFileSync(
      join(__dirname, "../../launch/simpleProduct/SimpleDonePage.tsx"),
      "utf8",
    );
    expect(donePage).toContain("logReviewLinkOpen(");
    expect(donePage).toContain('logPaidProReviewTrackLifecycle("reviewer_link_opened"');
    expect(donePage).toContain('logPaidProReviewTrackLifecycle("returned_to_owner"');

    const recipientReview = readFileSync(
      join(__dirname, "../../agreement/AgreementRecipientReview.tsx"),
      "utf8",
    );
    expect(recipientReview).toContain("logReviewLinkSurfaceMounted(");
    expect(recipientReview).toContain('logPaidProReviewTrackLifecycle("reviewer_link_opened"');
    expect(recipientReview).toContain('logPaidProReviewTrackLifecycle("reviewer_link_closed"');
  });

  it("review track then prepare signatures remains on signature path", () => {
    expect(intake).toContain('enterFinalReviewRecipientSetup("signature")');
    expect(intake).toContain("handleProSendForSignature");
    const sigIdx = intake.indexOf("const handleProSendForSignature = React.useCallback");
    const sigBlock = intake.slice(sigIdx, sigIdx + 2800);
    expect(sigBlock).toContain('enterFinalReviewRecipientSetup("signature")');
    expect(sigBlock).not.toContain('enterFinalReviewRecipientSetup("review_only")');
  });
});
