import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static audit: owner-side recipient proposal review surface (QA traceability).
 * Runtime flow: `recipientProposalPanel` in AgreementReview when `openRecipientProposal` is set.
 */
describe("AgreementReview owner recipient proposal surface (audit)", () => {
  it("exposes pending review, material summary, compare, and apply/reject affordances", () => {
    const p = join(__dirname, "AgreementReview.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("OWNER_INCOMING_SUGGESTED_EDITS_HEADING");
    expect(s).toContain("MATERIAL_CHANGE_SUMMARY_LABEL");
    expect(s).toContain("applyOpenRecipientProposal");
    expect(s).toContain("rejectOpenRecipientProposal");
    expect(s).toContain("recipient_proposal_pending");
    expect(s).toContain("Nothing changes without");
  });
});
