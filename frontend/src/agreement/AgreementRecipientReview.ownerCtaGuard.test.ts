import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AgreementRecipientReview owner CTA guard", () => {
  it("does not expose owner-only resolution CTAs on reviewer surface", () => {
    const s = readFileSync(join(__dirname, "AgreementRecipientReview.tsx"), "utf8");
    expect(s).not.toContain("Resolve in workspace");
    expect(s).not.toContain("simple-done-resolve-in-workspace");
    expect(s).not.toContain("OWNER_CTA_REVIEW_SUGGESTED_CHANGES");
    expect(s).not.toContain("OwnerProposalReviewQaPanel");
    expect(s).toContain("logReviewerOwnerCtaHidden");
    expect(s).toContain("logReviewerDisplayCopyParity");
    expect(s).toContain("reviewerProposalAwaitingOwner");
    expect(s).toContain("recipient-approve-blocked-awaiting-owner");
    expect(s).toContain("logReviewerProposalSubmitted");
    expect(s).toContain("recipient-qa-open-owner-review");
    expect(s).not.toContain("Resolve in workspace");
  });
});
