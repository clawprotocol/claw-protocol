import { describe, expect, it } from "vitest";
import {
  countDistinctValidRecipientEmails,
  premiumReviewMintConfirmModalTitle,
  premiumReviewMintPrimaryLabel,
} from "./reviewLinkCtaState";

describe("reviewLinkCtaState", () => {
  it("premiumReviewMintPrimaryLabel: zero valid emails or validation errors → Add recipient emails", () => {
    expect(premiumReviewMintPrimaryLabel(0, false)).toBe("Add recipient emails");
    expect(premiumReviewMintPrimaryLabel(0, true)).toBe("Add recipient emails");
    expect(premiumReviewMintPrimaryLabel(2, true)).toBe("Add recipient emails");
  });

  it("premiumReviewMintPrimaryLabel: one valid email → Create review link", () => {
    expect(premiumReviewMintPrimaryLabel(1, false)).toBe("Create review link");
  });

  it("premiumReviewMintPrimaryLabel: multiple valid emails → Create review links", () => {
    expect(premiumReviewMintPrimaryLabel(2, false)).toBe("Create review links");
    expect(premiumReviewMintPrimaryLabel(4, false)).toBe("Create review links");
  });

  it("premiumReviewMintConfirmModalTitle tracks primary label", () => {
    expect(premiumReviewMintConfirmModalTitle(0, false)).toBe("Add recipient emails?");
    expect(premiumReviewMintConfirmModalTitle(1, false)).toBe("Create review link?");
    expect(premiumReviewMintConfirmModalTitle(3, false)).toBe("Create review links?");
  });

  it("countDistinctValidRecipientEmails dedupes and ignores invalid", () => {
    expect(
      countDistinctValidRecipientEmails([
        { raw: "  a@b.com " },
        { raw: "A@B.COM" },
        { raw: "not-an-email" },
        { raw: "c@d.org" },
      ]),
    ).toBe(2);
  });
});
