import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Review link handoff UX (LawDog)", () => {
  it("owner success on SimpleDonePage shows handoff copy and not Your Agreement", () => {
    const p = join(__dirname, "SimpleDonePage.tsx");
    const signals = join(__dirname, "../../components/agreements/draftRecipientReviewSignals.ts");
    const s = readFileSync(p, "utf8");
    const signalsSrc = readFileSync(signals, "utf8");
    expect(s).toContain("Review link ready");
    expect(signalsSrc).toContain("Review link created");
    expect(s).toContain("Send this private link to the reviewer. Nothing is signed until all parties approve the same final draft.");
    expect(s).toContain("Copy review link");
    expect(s).toContain("Open reviewer view");
    expect(s).toContain("[review-link-owner-success-visible]");
    expect(s).toContain("showReviewFlowDiagPanel = reviewFlowDiagLocal");
    expect(s).toContain("Review link could not be created. Please try again.");
    expect(s).not.toMatch(/Your Agreement/);
  });

  it("SimpleSendPage uses owner prep title and success/fail mint logs", () => {
    const p = join(__dirname, "SimpleSendPage.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("Prepare review link");
    expect(s).toContain("[review-link-create-success]");
    expect(s).toContain("[review-link-create-failed]");
    expect(s).not.toContain("[review-link-created]");
  });

  it("AgreementReview exposes confirmation-step CTAs for review path", () => {
    const p = join(__dirname, "../../components/agreements/AgreementReview.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("Continue to confirmation");
    expect(s).toContain("Create review link?");
    expect(s).toContain("simpleReviewLinkConfirmModalOpen");
  });

  it("AgreementRecipientReview reviewer surface uses review-first collaborative draft UI", () => {
    const p = join(__dirname, "../../agreement/AgreementRecipientReview.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("REVIEW_FIRST_TITLE");
    expect(s).toContain("Review agreement");
    expect(s).toContain("REVIEW_FIRST_HELPER");
    expect(s).toContain("recipient-review-first-actions");
    expect(s).toContain("recipient-review-approve-draft");
    expect(s).toContain("recipient-review-propose-updated-draft");
    expect(s).toContain("recipient-review-more-options");
    expect(s).toContain("recipient-review-edit-draft");
    expect(s).toContain("recipient-review-upload-updated-draft");
    expect(s).toContain("recipient-review-download-actions");
    expect(s).toContain("recipient-review-change-visibility-summary");
    expect(s).toContain("Changes proposed");
    expect(s).toContain("recipient-summary-card");
    expect(s).toContain("recipient-document-shell");
    expect(s).toContain("← Back to agreement");
    expect(s).toContain("scrollAndFocusSuggestPanel");
    expect(s).not.toContain("Bring back suggested edits");
    expect(s).not.toContain("You're reviewing this agreement");
    expect(s).not.toContain("Back to read-only view");
    expect(s).toContain("recipient-manual-edit-draft-mode");
    expect(s).toContain("recipient-manual-upload-revised-draft");
    expect(s).toContain("recipient-suggested-changes-panel");
    expect(s).toContain("recipient-suggested-changes-document");
    expect(s).not.toContain("recipient-tab-redline");
    expect(s).toContain("[reviewer-view-visible]");
    expect(s).not.toContain("LawDog Pro active");
  });

  it("Premium fork CTA matches recipient setup wording", () => {
    const p = join(__dirname, "../../components/agreements/PremiumSendNextStepFork.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("Continue to confirmation");
    expect(s).not.toContain("Open reviewer setup");
  });
});
