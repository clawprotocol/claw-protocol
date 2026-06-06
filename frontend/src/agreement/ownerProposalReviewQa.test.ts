import { describe, expect, it } from "vitest";
import {
  buildOwnerQaReviewAbsoluteLink,
  buildOwnerQaReviewDonePath,
  corpusHasSignatureBlock,
  htmlHasSignatureBlock,
} from "./ownerProposalReviewQa";

describe("ownerProposalReviewQa", () => {
  it("builds absolute owner QA link with origin", () => {
    expect(buildOwnerQaReviewAbsoluteLink("ag_qa_1", "https://claw.example")).toBe(
      "https://claw.example/app/done/ag_qa_1?qaReview=1",
    );
    expect(buildOwnerQaReviewDonePath("ag_qa_1")).toBe("/app/done/ag_qa_1?qaReview=1");
  });

  it("detects signature blocks in copy and display html", () => {
    const corpus = `MASTER SERVICES AGREEMENT

IN WITNESS WHEREOF

Blue Canyon Analytics LLC
Sarah Mitchell
CEO`;
    expect(corpusHasSignatureBlock(corpus)).toBe(true);
    const html = '<p class="premium-doc-signature-party-start">Blue Canyon Analytics LLC</p>';
    expect(htmlHasSignatureBlock(html)).toBe(true);
  });
});
