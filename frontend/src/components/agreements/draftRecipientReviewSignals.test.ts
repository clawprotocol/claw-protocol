import { describe, expect, it } from "vitest";
import {
  draftAuditHasRecipientRecordedApproval,
  shouldWritePaidProEditReturnHandoffAfterReview,
} from "./draftRecipientReviewSignals";
import type { AgreementDraft } from "../../agreement/agreementTypes";

function draftWithAudit(events: Array<{ event_type: string }>): AgreementDraft {
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
    created_at: "",
    updated_at: "",
    versions: [],
    audit_log: events,
  } as AgreementDraft;
}

describe("draftRecipientReviewSignals", () => {
  it("draftAuditHasRecipientRecordedApproval is true for recipient_approved", () => {
    expect(
      draftAuditHasRecipientRecordedApproval(
        draftWithAudit([{ event_type: "recipient_approved" }]),
      ),
    ).toBe(true);
  });

  it("draftAuditHasRecipientRecordedApproval is true for participant_approved", () => {
    expect(
      draftAuditHasRecipientRecordedApproval(
        draftWithAudit([{ event_type: "participant_approved" }]),
      ),
    ).toBe(true);
  });

  it("shouldWritePaidProEditReturnHandoffAfterReview is false once recipient approved", () => {
    const d = draftWithAudit([{ event_type: "recipient_approved" }]);
    expect(shouldWritePaidProEditReturnHandoffAfterReview(d, true)).toBe(false);
  });

  it("shouldWritePaidProEditReturnHandoffAfterReview is true when no approval and recoverable", () => {
    const d = draftWithAudit([]);
    expect(shouldWritePaidProEditReturnHandoffAfterReview(d, true)).toBe(true);
  });
});
