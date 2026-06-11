import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import {
  deriveOwnerReviewPartyStatusRows,
  deriveRequiredReviewerPartyStatusRows,
  partyRequiresReviewApproval,
} from "./ownerReviewPartyStatusChecklist";

const twoPartyDraft: AgreementDraft = {
  id: "ag_two_party",
  title: "Consulting Agreement",
  jurisdiction: "CA",
  parties: [
    { id: "p-client", name: "Blue Canyon Analytics LLC", role: "party" },
    { id: "p-reviewer", name: "Iron Vale Systems Inc", role: "reviewer", email: "iron@example.test" },
  ],
  purpose: "Services",
  payment_terms: "Net 30",
  duration: "1y",
  due_date: null,
  effective_date: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T12:00:00.000Z",
  versions: [{ version: 1, created_at: "2026-01-01T00:00:00.000Z" }],
  audit_log: [
    {
      event_type: "participant_approved",
      at: "2026-06-07T00:00:00.000Z",
      value: { participant_id: "p-reviewer", message: "approved_current_draft" },
    },
  ],
};

describe("ownerReviewPartyStatusChecklist required reviewers", () => {
  it("excludes owner/client from required reviewer rows in two-party flow", () => {
    const allRows = deriveOwnerReviewPartyStatusRows(twoPartyDraft);
    const requiredRows = deriveRequiredReviewerPartyStatusRows(twoPartyDraft);
    expect(allRows.length).toBe(2);
    expect(requiredRows.length).toBe(1);
    expect(requiredRows[0]?.displayName).toBe("Iron Vale Systems Inc");
    expect(requiredRows[0]?.status).toBe("approved");
    expect(partyRequiresReviewApproval(twoPartyDraft.parties[0]!, 0, twoPartyDraft.parties)).toBe(false);
    expect(partyRequiresReviewApproval(twoPartyDraft.parties[1]!, 1, twoPartyDraft.parties)).toBe(true);
  });

  it("does not count owner role as required reviewer", () => {
    const draft: AgreementDraft = {
      ...twoPartyDraft,
      parties: [
        { id: "p-owner", name: "Owner Co", role: "owner", email: "owner@example.test" },
        { id: "p-reviewer", name: "Reviewer Co", role: "reviewer", email: "rev@example.test" },
      ],
    };
    expect(deriveRequiredReviewerPartyStatusRows(draft).map((row) => row.displayName)).toEqual(["Reviewer Co"]);
  });
});
