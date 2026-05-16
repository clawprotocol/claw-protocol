import { describe, expect, it } from "vitest";
import {
  canFinalizeReviewForSigning,
  computeOwnerDoneReviewApprovalPresentation,
  computeReviewApprovalStatus,
  draftAuditHasRecipientRecordedApproval,
  shouldWritePaidProEditReturnHandoffAfterReview,
  signingHandoffLinksReadyForDonePage,
} from "./draftRecipientReviewSignals";
import { normalizeHandoffToReviewerLinkRows } from "../../launch/simpleProduct/reviewerLinkRowModel";
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

  describe("canFinalizeReviewForSigning", () => {
    const aggBase = {
      requiredReviewerCount: 4,
      allReviewersApproved: true,
      hasOpenChangeRequests: false,
    };
    const linksOk = {
      reviewLinksReady: true,
      anyReviewHref: true,
      linksStillLoading: false,
      linksIncomplete: false,
    };

    it("is false without agreement id", () => {
      expect(
        canFinalizeReviewForSigning({
          agreementIdTrimmed: "",
          ...linksOk,
          reviewApprovalAggregate: aggBase,
        }),
      ).toBe(false);
    });

    it("is false when links still loading", () => {
      expect(
        canFinalizeReviewForSigning({
          agreementIdTrimmed: "ag-1",
          reviewLinksReady: true,
          anyReviewHref: true,
          linksStillLoading: true,
          linksIncomplete: false,
          reviewApprovalAggregate: aggBase,
        }),
      ).toBe(false);
    });

    it("is false when required reviewer count is 0", () => {
      expect(
        canFinalizeReviewForSigning({
          agreementIdTrimmed: "ag-1",
          ...linksOk,
          reviewApprovalAggregate: { ...aggBase, requiredReviewerCount: 0 },
        }),
      ).toBe(false);
    });

    it("is false for 2 of 4 approved", () => {
      const d = makeDraft({
        parties: [
          { id: "r1", name: "R1", role: "reviewer" },
          { id: "r2", name: "R2", role: "reviewer" },
          { id: "r3", name: "R3", role: "reviewer" },
          { id: "r4", name: "R4", role: "reviewer" },
        ],
        audit_log: [
          { event_type: "participant_approved" as const, at: BASE_TS, value: { participant_id: "r1" } },
          { event_type: "participant_approved" as const, at: BASE_TS, value: { participant_id: "r2" } },
        ],
      });
      const agg = computeReviewApprovalStatus(d, { mintedReviewerLinkCount: 4 });
      expect(
        canFinalizeReviewForSigning({
          agreementIdTrimmed: "ag-1",
          ...linksOk,
          reviewApprovalAggregate: agg,
        }),
      ).toBe(false);
    });

    it("is false for 3 of 4 approved", () => {
      const parties = [
        { id: "r1", name: "R1", role: "reviewer" },
        { id: "r2", name: "R2", role: "reviewer" },
        { id: "r3", name: "R3", role: "reviewer" },
        { id: "r4", name: "R4", role: "reviewer" },
      ];
      const audit_log = parties.slice(0, 3).map((p) => ({
        event_type: "participant_approved" as const,
        at: BASE_TS,
        value: { participant_id: p.id },
      }));
      const d = makeDraft({ parties, audit_log });
      const agg = computeReviewApprovalStatus(d, { mintedReviewerLinkCount: 4 });
      expect(
        canFinalizeReviewForSigning({
          agreementIdTrimmed: "ag-1",
          ...linksOk,
          reviewApprovalAggregate: agg,
        }),
      ).toBe(false);
    });

    it("is true for 4 of 4 approved and links ready", () => {
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
      expect(
        canFinalizeReviewForSigning({
          agreementIdTrimmed: "ag-1",
          ...linksOk,
          reviewApprovalAggregate: agg,
        }),
      ).toBe(true);
    });

    it("is false when open change requests exist despite full approvals", () => {
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
          value: { proposal_id: "p1", instruction: "x", draft: { title: "T" } },
        },
      ];
      const d = makeDraft({ parties, audit_log });
      const agg = computeReviewApprovalStatus(d, { mintedReviewerLinkCount: 2 });
      expect(
        canFinalizeReviewForSigning({
          agreementIdTrimmed: "ag-1",
          ...linksOk,
          reviewApprovalAggregate: agg,
        }),
      ).toBe(false);
    });
  });

  describe("computeOwnerDoneReviewApprovalPresentation", () => {
    it("uses reviewer_rows for multi minted links and matches table approval counts", () => {
      const parties = [
        { id: "r1", name: "R1", role: "reviewer" },
        { id: "r2", name: "R2", role: "reviewer" },
      ];
      const audit_log = parties.map((p) => ({
        event_type: "participant_approved" as const,
        at: BASE_TS,
        value: { participant_id: p.id },
      }));
      const d = makeDraft({ parties, audit_log });
      const rows = normalizeHandoffToReviewerLinkRows([
        { displayName: "R1", reviewHref: "https://h/r1", recipientPartyId: "r1" },
        { displayName: "R2", reviewHref: "https://h/r2", recipientPartyId: "r2" },
      ]);
      const pres = computeOwnerDoneReviewApprovalPresentation(d, rows);
      expect(pres.approvalAggregateSource).toBe("reviewer_rows");
      expect(pres.aggregate.approvedReviewerCount).toBe(2);
      expect(pres.aggregate.allReviewersApproved).toBe(true);
      expect(pres.aggregate.ownerStatusLine).toBe(
        "2 of 2 reviewers approved. Ready to finalize for signing.",
      );
    });

    it("prefers row-derived 4/4 when draft parties omit reviewer ids but audit + handoff ids align", () => {
      const audit_log = (["r1", "r2", "r3", "r4"] as const).map((id) => ({
        event_type: "participant_approved" as const,
        at: BASE_TS,
        value: { participant_id: id },
      }));
      const d = makeDraft({
        parties: [{ id: "o", name: "Owner", role: "owner" }],
        audit_log,
      });
      const rows = normalizeHandoffToReviewerLinkRows(
        (["r1", "r2", "r3", "r4"] as const).map((id) => ({
          displayName: id,
          reviewHref: `https://h/${id}`,
          recipientPartyId: id,
        })),
      );
      const pres = computeOwnerDoneReviewApprovalPresentation(d, rows);
      expect(pres.approvalAggregateSource).toBe("reviewer_rows");
      expect(pres.draftSignalsBaseline.approvedReviewerCount).toBe(0);
      expect(pres.aggregate.approvedReviewerCount).toBe(4);
      expect(pres.aggregate.ownerStatusLine).toBe(
        "4 of 4 reviewers approved. Ready to finalize for signing.",
      );
    });
  });

  describe("signingHandoffLinksReadyForDonePage", () => {
    it("requires review hrefs and not loading/incomplete", () => {
      expect(
        signingHandoffLinksReadyForDonePage({
          reviewLinksReady: true,
          anyReviewHref: true,
          linksStillLoading: false,
          linksIncomplete: false,
        }),
      ).toBe(true);
      expect(
        signingHandoffLinksReadyForDonePage({
          reviewLinksReady: true,
          anyReviewHref: false,
          linksStillLoading: false,
          linksIncomplete: false,
        }),
      ).toBe(false);
    });
  });
});
