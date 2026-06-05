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
