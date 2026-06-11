import { describe, expect, it } from "vitest";
import { buildOwnerProposalReviewPath } from "./ownerProposalReviewRouting";

describe("ownerProposalReviewRouting", () => {
  it("builds review-changes path for owner proposal review", () => {
    expect(buildOwnerProposalReviewPath("ag_test")).toBe("/app/review-changes/ag_test");
  });
});
