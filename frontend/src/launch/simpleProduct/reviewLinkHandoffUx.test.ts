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

  it("SimpleSendPage uses owner prep title and review-link-created log", () => {
    const p = join(__dirname, "SimpleSendPage.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("Prepare review link");
    expect(s).toContain("[review-link-created]");
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
    expect(s).toContain("You're reviewing this agreement");
    expect(s).toContain("Suggest changes before anyone signs.");
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
