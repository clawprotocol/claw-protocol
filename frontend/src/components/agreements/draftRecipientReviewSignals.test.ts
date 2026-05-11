import { describe, expect, it } from "vitest";
import {
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
});
