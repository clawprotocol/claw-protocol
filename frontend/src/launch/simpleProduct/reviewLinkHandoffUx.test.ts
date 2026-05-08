import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Review link handoff UX (LawDog)", () => {
  it("owner success on SimpleDonePage shows handoff copy and not Your Agreement", () => {
    const p = join(__dirname, "SimpleDonePage.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("Review link created");
    expect(s).toContain("Nothing has been signed. Copy this private link and send it to the reviewer.");
    expect(s).toContain("Copy review link");
    expect(s).toContain("Open reviewer view");
    expect(s).toContain("[review-link-owner-success-visible]");
    expect(s).toContain("incognito or another browser");
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

  it("AgreementRecipientReview reviewer surface uses reviewer heading", () => {
    const p = join(__dirname, "../../agreement/AgreementRecipientReview.tsx");
    const s = readFileSync(p, "utf8");
    const party = readFileSync(join(__dirname, "../../agreement/recipientReviewPartyActions.tsx"), "utf8");
    expect(s).toContain("RECIPIENT_PUBLIC_HERO_TITLE");
    expect(s).toContain("RECIPIENT_PUBLIC_HERO_SUBTITLE");
    expect(s).toContain("recipient-summary-card");
    expect(s).toContain("recipient-document-shell");
    expect(s).toContain("RecipientPartyReviewActions");
    expect(party).toContain("Send back a revised version");
    expect(party).toContain("Looks good");
    expect(party).toContain("I'm not participating");
    expect(s).toContain("← Back to agreement");
    expect(s).toContain("scrollAndFocusSuggestPanel");
    expect(s).not.toContain("Bring back suggested edits");
    expect(s).not.toContain("You're reviewing this agreement");
    expect(s).not.toContain("Back to read-only view");
    expect(s).toContain("RECIPIENT_PREVIEW_COMPARE_TRUST_SUBCOPY");
    expect(s).toContain("recipient-workflow-revised");
    expect(s).toContain("recipient-workflow-quick");
    expect(s).toContain("RecipientWantACopyStrip");
    const wantCopy = readFileSync(join(__dirname, "../../agreement/recipientWantACopyStrip.tsx"), "utf8");
    expect(wantCopy).toContain("recipient-download-draft-pdf");
    expect(s).not.toContain("Manual compare");
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
