import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static audit: owner-side recipient suggested edits (QA traceability).
 * Runtime: `recipientProposalPanel` in AgreementReview when an open recipient proposal exists.
 */
describe("AgreementReview owner recipient proposal surface (audit)", () => {
  it("uses clear pending-review copy, CTAs, detail anchor, and post-accept signing handoff", () => {
    const p = join(__dirname, "AgreementReview.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("OWNER_SUGGESTED_CHANGES_RECEIVED_TITLE");
    expect(s).toContain("OWNER_SUGGESTED_CHANGES_REVIEW_SUBTEXT");
    expect(s).toContain("OWNER_SUGGESTED_CHANGES_NOT_SIGNED_LINE");
    expect(s).toContain("OWNER_REVIEW_BEFORE_SIGNING");
    expect(s).toContain("OWNER_CTA_REVIEW_SUGGESTED_CHANGES");
    expect(s).toContain("OWNER_CTA_ACCEPT_AND_CONTINUE");
    expect(s).toContain("OWNER_CTA_MAKE_MORE_CHANGES");
    expect(s).toContain("OWNER_CTA_REJECT_SUGGESTIONS");
    expect(s).toContain("OWNER_MULTIPLE_SUGGESTIONS_LABEL");
    expect(s).toContain("OWNER_LOCK_AND_CONTINUE_TO_SIGNING");
    expect(s).toContain("OWNER_FINALIZE_LOCK_HINT");
    expect(s).toContain("OWNER_MAKE_MORE_CHANGES_LINE");
    expect(s).toContain("owner-suggested-changes-detail");
    expect(s).toContain("owner-revise-workspace");
    expect(s).toContain("owner-finalize-signing");
    expect(s).toContain("applyOpenRecipientProposal");
    expect(s).toContain("rejectOpenRecipientProposal");
    expect(s).toContain("recipient_proposal_pending");
    expect(s).toContain("MATERIAL_CHANGE_SUMMARY_LABEL");
    expect(s).toMatch(/scrollIntoView/);
    expect(s).not.toContain("owner-proposal-queue");
  });

  it("after accept, shows success handoff copy and reuses the existing finalize (putSigningLock) path for Lock and continue", () => {
    const p = join(__dirname, "AgreementReview.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("OWNER_ACCEPT_SUGGESTED_CHANGES_SUCCESS_TITLE");
    expect(s).toContain("OWNER_ACCEPT_SUGGESTED_CHANGES_SUCCESS_DETAIL");
    expect(s).toContain("ownerPostAcceptSigningGuide");
    expect(s).toContain("setOwnerPostAcceptSigningGuide(true)");
    expect(s).toContain("OWNER_NEXT_CONFIRM_SIGNERS_AND_SEND");
    expect(s).toContain("OWNER_NEXT_SEND_FOR_SIGNATURE");
    expect(s).toContain("OWNER_NEXT_LOCK_THEN_SEND");
    expect(s).toContain("OWNER_SEND_FOR_SIGNATURE");
    expect(s).toContain("putSigningLock");
    expect(s).toContain("onOwnerJumpToRecipientsStep");
    expect(s).toContain("owner-signing-recipients-setup");
    const lockHandlerStart = s.indexOf(
      "if (!versionIdToLock || !acceptedVersionIdToLock || !draft || signingLockBusy) return;",
    );
    expect(lockHandlerStart).toBeGreaterThan(0);
    const lockHandlerEnd = s.indexOf("})();", lockHandlerStart);
    expect(lockHandlerEnd).toBeGreaterThan(lockHandlerStart);
    const lockHandlerSlice = s.slice(lockHandlerStart, lockHandlerEnd);
    expect(lockHandlerSlice).toContain("putSigningLock");
    expect(lockHandlerSlice).toContain("accepted_version_id: acceptedVersionIdToLock");
    expect(lockHandlerSlice).not.toContain("readAuthoritativeAgreementVersion");
    expect(s).toMatch(/signingLockBusy[\s\S]{0,240}ownerPostAcceptSigningGuide[\s\S]{0,120}OWNER_LOCK_AND_CONTINUE_TO_SIGNING/);
    expect(s).not.toMatch(/Continue to signing/);
  });

  it("does not use internal proposal-queue wording for the multi-suggestion control", () => {
    const p = join(__dirname, "AgreementReview.tsx");
    const s = readFileSync(p, "utf8");
    const panelStart = s.indexOf("const recipientProposalPanel");
    expect(panelStart).toBeGreaterThanOrEqual(0);
    const panelEnd = s.indexOf("const workWithAnotherAiSection", panelStart);
    expect(panelEnd).toBeGreaterThan(panelStart);
    const panelSlice = s.slice(panelStart, panelEnd);
    expect(panelSlice).not.toMatch(/\bQueue\b/);
    expect(panelSlice).not.toMatch(/proposal surface/i);
    expect(panelSlice).not.toMatch(/recipient payload/i);
  });
});
