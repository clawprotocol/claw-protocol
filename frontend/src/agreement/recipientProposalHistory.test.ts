import { describe, expect, it } from "vitest";
import { listRecipientProposalRecords, openRecipientProposalRecords } from "./recipientProposalHistory";
import type { AgreementDraft } from "./agreementTypes";

const BASELINE =
  "MASTER SERVICES AGREEMENT\n\nPayment is due within thirty (30) days after receipt of invoice.";

function draftWithAudit(audit: AgreementDraft["audit_log"]): AgreementDraft {
  return {
    id: "ag_hist",
    title: "Services",
    jurisdiction: "CA",
    parties: [
      { id: "p-owner", name: "Owner", role: "owner" },
      { id: "p-rev", name: "Reviewer", role: "party" },
    ],
    purpose: BASELINE,
    payment_terms: "Net 30",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    versions: [],
    audit_log: audit,
  };
}

describe("recipientProposalHistory", () => {
  it("lists submitted proposal with metadata and change count", () => {
    const proposed = BASELINE.replace("thirty (30)", "fifteen (15)");
    const records = listRecipientProposalRecords({
      draft: draftWithAudit([
        {
          event_type: "recipient_proposal_pending",
          at: "2026-01-02T10:00:00Z",
          field: "recipient_proposal",
          value: {
            proposal_id: "prop-1",
            instruction: "Shorten payment timing",
            submitted_at: "2026-01-02T10:00:00Z",
            proposer_id: "p-rev",
            proposer_display_name: "Reviewer",
            draft: { purpose: proposed, payment_terms: "Net 30", parties: [], title: "Services", jurisdiction: "CA" },
          },
        },
      ]),
      baselineCorpus: BASELINE,
    });
    expect(records).toHaveLength(1);
    expect(records[0]?.status).toBe("submitted");
    expect(records[0]?.proposal_id).toBe("prop-1");
    expect(records[0]?.changeCount).toBeGreaterThan(0);
    expect(openRecipientProposalRecords(records)).toHaveLength(1);
  });

  it("marks accepted and rejected lifecycle states", () => {
    const records = listRecipientProposalRecords({
      draft: draftWithAudit([
        {
          event_type: "recipient_proposal_pending",
          at: "2026-01-02T10:00:00Z",
          field: "recipient_proposal",
          value: {
            proposal_id: "prop-a",
            instruction: "A",
            draft: { purpose: BASELINE, parties: [], title: "T", jurisdiction: "CA" },
          },
        },
        {
          event_type: "recipient_proposal_applied",
          at: "2026-01-02T11:00:00Z",
          field: "recipient_proposal",
          value: { proposal_id: "prop-a" },
        },
        {
          event_type: "recipient_proposal_pending",
          at: "2026-01-03T10:00:00Z",
          field: "recipient_proposal",
          value: {
            proposal_id: "prop-b",
            instruction: "B",
            draft: { purpose: BASELINE, parties: [], title: "T", jurisdiction: "CA" },
          },
        },
        {
          event_type: "recipient_proposal_rejected",
          at: "2026-01-03T11:00:00Z",
          field: "recipient_proposal",
          value: { proposal_id: "prop-b" },
        },
      ]),
      baselineCorpus: BASELINE,
    });
    expect(records.find((r) => r.proposal_id === "prop-a")?.status).toBe("accepted");
    expect(records.find((r) => r.proposal_id === "prop-b")?.status).toBe("rejected");
    expect(openRecipientProposalRecords(records)).toHaveLength(0);
  });
});
