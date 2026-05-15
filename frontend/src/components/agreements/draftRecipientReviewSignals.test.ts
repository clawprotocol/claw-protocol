import { describe, expect, it } from "vitest";
import {
  computeReviewApprovalStatus,
  draftAuditHasRecipientRecordedApproval,
  shouldWritePaidProEditReturnHandoffAfterReview,
} from "./draftRecipientReviewSignals";
import type { AgreementDraft } from "../../agreement/agreementTypes";

const BASE_TS = "2026-05-10T00:00:00.000Z";

function makeDraft(overrides: Partial<AgreementDraft>): AgreementDraft {
  return {
    id: "ag-1",
    title: "T",
    jurisdiction: "CA",
    parties: [],
    purpose: "p",
    payment_terms: "pay",
    duration: "1y",
    due_date: null,
    effective_date: null,
    created_at: BASE_TS,
    updated_at: BASE_TS,
    versions: [{ version: 1, created_at: BASE_TS }],
    audit_log: [],
    ...overrides,
  };
}

describe("draftRecipientReviewSignals", () => {
  it("draftAuditHasRecipientRecordedApproval is true for recipient_approved", () => {
    const d = makeDraft({
      audit_log: [{ event_type: "recipient_approved", at: BASE_TS }],
    });
    expect(draftAuditHasRecipientRecordedApproval(d)).toBe(true);
  });

  it("draftAuditHasRecipientRecordedApproval is true for participant_approved", () => {
    const d = makeDraft({
      audit_log: [{ event_type: "participant_approved", at: BASE_TS }],
    });
    expect(draftAuditHasRecipientRecordedApproval(d)).toBe(true);
  });

  it("shouldWritePaidProEditReturnHandoffAfterReview is false once recipient approved", () => {
    const d = makeDraft({
      audit_log: [{ event_type: "recipient_approved", at: BASE_TS }],
    });
    expect(shouldWritePaidProEditReturnHandoffAfterReview(d, true)).toBe(false);
  });

  it("shouldWritePaidProEditReturnHandoffAfterReview is true when no approval and recoverable", () => {
    const d = makeDraft({ audit_log: [] });
    expect(shouldWritePaidProEditReturnHandoffAfterReview(d, true)).toBe(true);
  });

  describe("computeReviewApprovalStatus", () => {
    it("with 4 minted links and zero approvals → 0 of 4 owner line", () => {
      const d = makeDraft({ audit_log: [], parties: [] });
      const agg = computeReviewApprovalStatus(d, { mintedReviewerLinkCount: 4 });
      expect(agg.ownerStatusLine).toBe("0 of 4 reviewers approved. Waiting for reviewer responses.");
    });

    it("with 4 minted links and one scoped approval → partial 1 of 4", () => {
      const d = makeDraft({
        parties: [
          { id: "r1", name: "R1", role: "reviewer" },
          { id: "r2", name: "R2", role: "reviewer" },
          { id: "r3", name: "R3", role: "reviewer" },
          { id: "r4", name: "R4", role: "reviewer" },
        ],
        audit_log: [
          {
            event_type: "recipient_approved",
            at: BASE_TS,
            value: { participant_id: "r1" },
          },
        ],
      });
      const agg = computeReviewApprovalStatus(d, { mintedReviewerLinkCount: 4 });
      expect(agg.approvedReviewerCount).toBe(1);
      expect(agg.anyReviewerApproval).toBe(true);
      expect(agg.allReviewersApproved).toBe(false);
      expect(agg.aggregateStatus).toBe("partial");
    });

    it("with 4 minted links and one legacy approval without participant_id → partial 1 of 4, not finalize", () => {
      const d = makeDraft({
        audit_log: [{ event_type: "recipient_approved", at: BASE_TS }],
      });
      const agg = computeReviewApprovalStatus(d, { mintedReviewerLinkCount: 4 });
      expect(agg.requiredReviewerCount).toBe(4);
      expect(agg.approvedReviewerCount).toBe(1);
      expect(agg.allReviewersApproved).toBe(false);
      expect(agg.finalizeForSigningEnabled).toBe(false);
      expect(agg.ownerStatusLine).toBe("1 of 4 reviewers approved. Waiting for remaining reviewers.");
      expect(agg.aggregateStatus).toBe("partial");
    });

    it("with 4 minted links and 4 reviewer party approvals → all approved, finalize enabled", () => {
      const parties = [
        { id: "r1", name: "R1", role: "reviewer" },
        { id: "r2", name: "R2", role: "reviewer" },
        { id: "r3", name: "R3", role: "reviewer" },
        { id: "r4", name: "R4", role: "reviewer" },
      ];
      const audit_log = parties.map((p) => ({
        event_type: "participant_approved" as const,
        at: BASE_TS,
        value: { participant_id: p.id },
      }));
      const d = makeDraft({ parties, audit_log });
      const agg = computeReviewApprovalStatus(d, { mintedReviewerLinkCount: 4 });
      expect(agg.allReviewersApproved).toBe(true);
      expect(agg.finalizeForSigningEnabled).toBe(true);
      expect(agg.ownerStatusLine).toBe("All reviewers approved — ready to sign.");
      expect(agg.aggregateStatus).toBe("all_approved");
    });

    it("single minted + single legacy approval → all approved headline path", () => {
      const d = makeDraft({
        audit_log: [{ event_type: "recipient_approved", at: BASE_TS }],
      });
      const agg = computeReviewApprovalStatus(d, { mintedReviewerLinkCount: 1 });
      expect(agg.requiredReviewerCount).toBe(1);
      expect(agg.allReviewersApproved).toBe(true);
      expect(agg.finalizeForSigningEnabled).toBe(true);
      expect(agg.ownerStatusLine).toBe("All reviewers approved — ready to sign.");
    });

    it("open recipient proposals block finalize even when all ids approved", () => {
      const parties = [
        { id: "r1", name: "R1", role: "reviewer" },
        { id: "r2", name: "R2", role: "reviewer" },
      ];
      const audit_log = [
        ...parties.map((p) => ({
          event_type: "participant_approved" as const,
          at: BASE_TS,
          value: { participant_id: p.id },
        })),
        {
          event_type: "recipient_proposal_pending" as const,
          at: BASE_TS,
          value: {
            proposal_id: "p1",
            instruction: "x",
            draft: { title: "T" },
          },
        },
      ];
      const d = makeDraft({ parties, audit_log });
      const agg = computeReviewApprovalStatus(d, { mintedReviewerLinkCount: 2 });
      expect(agg.hasOpenChangeRequests).toBe(true);
      expect(agg.allReviewersApproved).toBe(false);
      expect(agg.finalizeForSigningEnabled).toBe(false);
      expect(agg.aggregateStatus).toBe("changes_pending");
    });
  });
});
