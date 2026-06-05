import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const recipientReview = readFileSync(join(__dirname, "AgreementRecipientReview.tsx"), "utf8");
const simpleDone = readFileSync(join(__dirname, "../launch/simpleProduct/SimpleDonePage.tsx"), "utf8");

describe("Test276 review-first submit authority wiring", () => {
  it("uses resolveReviewFirstSubmitAuthority for revised workflow submit gating", () => {
    expect(recipientReview).toContain("resolveReviewFirstSubmitAuthority");
    expect(recipientReview).toContain("logReviewFirstSubmitStart");
    expect(recipientReview).toContain("logReviewFirstSubmitBlocked");
    expect(recipientReview).toContain("logReviewFirstSubmitSuccess");
    expect(recipientReview).toContain("logReviewFirstSubmitFailed");
    expect(recipientReview).toContain("logReviewFirstSubmitAuthority");
    expect(recipientReview).toContain("reviewerNeedsPersonalizedLink");
    expect(recipientReview).toContain("resolveReviewerEffectiveParticipantId");
    expect(recipientReview).toContain('data-testid="recipient-review-submit-blocked"');
    expect(recipientReview).toContain("Submitted — waiting for owner review");
  });

  it("Test279 confirm submit stages then finalizes with proposalId", () => {
    expect(recipientReview).toContain("stageRecipientProposalApi");
    expect(recipientReview).toContain("finalizeRecipientProposalApi");
    expect(recipientReview).toContain("logReviewFirstProposalCreated");
    expect(recipientReview).toContain("logReviewFirstSubmitConfirm");
    expect(recipientReview).toContain("proposal_id_missing_before_post");
    expect(recipientReview).toContain("proposalId?: string | null");
    const confirmIdx = recipientReview.indexOf("async function performRecipientSuggestedEditsSubmit");
    const block = recipientReview.slice(confirmIdx, confirmIdx + 6500);
    expect(block).toContain("stageRecipientProposalApi");
    expect(block).toContain("finalizeRecipientProposalApi");
    expect(block).not.toMatch(/finalizeRecipientProposalApi[\s\S]{0,120}proposalId\s*=\s*""/);
  });

  it("AgreementReviewGate recovers token from session after URL strip", () => {
    const gate = readFileSync(join(__dirname, "../ClawProductApp.tsx"), "utf8");
    expect(gate).toContain("loadAnyRecipientMagicLinkSessionForAgreement");
    expect(gate).toContain("logReviewerTokenDetected");
    expect(gate).toContain("logReviewerTokenPersisted");
    expect(gate).toContain("logReviewerTokenMissing");
  });

  it("routes copy-for-editing through formatAgreementPlainTextForEditing", () => {
    expect(recipientReview).toContain("formatAgreementPlainTextForEditing");
    const intake = readFileSync(
      join(__dirname, "../components/agreements/AgreementBuilderIntake.tsx"),
      "utf8",
    );
    expect(intake).toContain("formatAgreementPlainTextForEditing");
    const exportUi = readFileSync(join(__dirname, "recipientAgreementReadPdfExport.tsx"), "utf8");
    expect(exportUi).toContain("formatAgreementPlainTextForEditing");
  });

  it("labels owner Open reviewer view as preview-only when href lacks token", () => {
    expect(simpleDone).toContain("primaryReviewHrefIsPreviewOnly");
    expect(simpleDone).toContain("Open preview (read-only)");
    expect(simpleDone).toContain('data-testid="simple-done-reviewer-preview-only-note"');
  });
});
