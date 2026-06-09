import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "./agreementTypes";
import { resolveReviewProposalGate } from "./reviewProposalGate";

function draftWithAppliedIronProposal(): AgreementDraft {
  return {
    id: "ag_gate",
    title: "T",
    jurisdiction: "DE",
    parties: [
      { id: "p-blue", name: "Blue", role: "party" },
      { id: "p-iron", name: "Iron", role: "reviewer" },
    ],
    purpose: "Agreement body ".repeat(40),
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "",
    updated_at: "",
    versions: [],
    audit_log: [
      {
        event_type: "recipient_proposal_pending",
        at: "2026-06-07T21:00:00.000Z",
        value: {
          proposal_id: "prop-1",
          proposer_id: "p-iron",
          instruction: "Change",
          draft: { purpose: "Updated ".repeat(40) },
        },
      },
      {
        event_type: "recipient_proposal_applied",
        at: "2026-06-07T22:00:00.000Z",
        value: { proposal_id: "prop-1" },
      },
    ],
  } as AgreementDraft;
}

describe("reviewProposalGate", () => {
  it("blocks the proposer whose proposal was just accepted until another party acts", () => {
    const draft = draftWithAppliedIronProposal();
    const gate = resolveReviewProposalGate({ draft, requesterPartyId: "p-iron" });
    expect(gate.allowed).toBe(false);
    expect(gate.lastAcceptedProposalPartyId).toBe("p-iron");
    expect(gate.reason).toBe("awaiting_other_party_review");
  });

  it("allows another party to submit after acceptance", () => {
    const draft = draftWithAppliedIronProposal();
    const gate = resolveReviewProposalGate({ draft, requesterPartyId: "p-blue" });
    expect(gate.allowed).toBe(true);
  });

  it("allows proposer again after another party approves", () => {
    const draft: AgreementDraft = {
      ...draftWithAppliedIronProposal(),
      audit_log: [
        ...(draftWithAppliedIronProposal().audit_log ?? []),
        {
          event_type: "participant_approved",
          at: "2026-06-07T23:00:00.000Z",
          value: { participant_id: "p-blue" },
        },
      ],
    };
    const gate = resolveReviewProposalGate({ draft, requesterPartyId: "p-iron" });
    expect(gate.allowed).toBe(true);
    expect(gate.reason).toBe("other_party_acted_since_accept");
  });
});
