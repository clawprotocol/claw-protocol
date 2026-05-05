import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Review intent /app/send prepare surface (paid Pro handoff)", () => {
  const agreementReview = join(__dirname, "..", "..", "components", "agreements", "AgreementReview.tsx");
  const simpleSend = join(__dirname, "SimpleSendPage.tsx");

  it("SimpleSendPage shell subtitle matches final review-link confirmation copy", () => {
    const s = readFileSync(simpleSend, "utf8");
    expect(s).toContain("Choose who can review this agreement. Nothing is signed.");
  });

  it("AgreementReview accepts parent review-link mint failure banner prop", () => {
    const s = readFileSync(agreementReview, "utf8");
    expect(s).toContain("reviewLinkMintFailureMessage");
  });

  it("AgreementReview gates LawDog Pro active strip behind review-link handoff flag", () => {
    const s = readFileSync(agreementReview, "utf8");
    expect(s).toContain("simpleHomePaidReviewLinkHandoff");
    expect(s).toContain("!simpleHomePaidReviewLinkHandoff");
    expect(s).toContain("Review link only · Nothing is signed");
    expect(s).toContain("Recipient setup");
    expect(s).toContain("Add recipient emails");
  });

  it("does not surface Collaborate Before Signing heading on AgreementReview", () => {
    const s = readFileSync(agreementReview, "utf8");
    expect(s).not.toContain("Collaborate Before Signing");
  });

  it("still wires review-link confirmation modal and mint path", () => {
    const s = readFileSync(agreementReview, "utf8");
    expect(s).toContain("Create review link?");
    expect(s).toContain("simpleReviewLinkConfirmModalOpen");
    expect(s).toContain("requestReviewLinkCreateConfirmation");
  });
});
