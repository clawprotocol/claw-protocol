import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("OwnerProposalReviewQaPanel wiring", () => {
  it("SimpleDonePage mounts QA owner review panel behind qaReview flag", () => {
    const done = readFileSync(join(__dirname, "../../launch/simpleProduct/SimpleDonePage.tsx"), "utf8");
    expect(done).toContain("OwnerProposalReviewQaPanel");
    expect(done).toContain("isOwnerProposalReviewQaEnabled");
    expect(readFileSync(join(__dirname, "OwnerProposalReviewQaPanel.tsx"), "utf8")).toContain(
      "owner-proposal-review-qa-panel",
    );
  });

  it("AgreementReview mounts QA panel in workspace when flag enabled", () => {
    const review = readFileSync(join(__dirname, "AgreementReview.tsx"), "utf8");
    expect(review).toContain("OwnerProposalReviewQaPanel");
    expect(review).toContain("isOwnerProposalReviewQaEnabled");
  });

  it("panel exposes proposal metadata, diff, and accept/reject actions", () => {
    const panel = readFileSync(join(__dirname, "OwnerProposalReviewQaPanel.tsx"), "utf8");
    const qaLog = readFileSync(join(__dirname, "../../agreement/ownerProposalReviewQa.ts"), "utf8");
    expect(panel).toContain("owner-proposal-qa-metadata");
    expect(panel).toContain("owner-proposal-qa-diff");
    expect(panel).toContain("ReviewFirstChangeCard");
    expect(panel).toContain("logOwnerProposalAccepted");
    expect(panel).toContain("logOwnerProposalRejected");
    expect(qaLog).toContain("[owner-review-opened]");
  });
});
