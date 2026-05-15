import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "./agreementTypes";
import {
  auditHasRecipientApprovalForParticipant,
  deriveParticipantRows,
  humanizePartyRoleForTable,
  participantDisplayName,
} from "./participantModel";

describe("participantDisplayName", () => {
  it("uses trimmed name when present", () => {
    expect(participantDisplayName({ name: "Anthem Blanchard" }, 0)).toBe("Anthem Blanchard");
    expect(participantDisplayName({ name: "  John Doe  " }, 1)).toBe("John Doe");
  });

  it("falls back to Party A/B only when name missing", () => {
    expect(participantDisplayName({ name: "" }, 0)).toBe("Party A");
    expect(participantDisplayName({ name: "   " }, 1)).toBe("Party B");
    expect(participantDisplayName({}, 2)).toBe("Party C");
  });
});

describe("humanizePartyRoleForTable", () => {
  it("maps draft role tokens to readable labels", () => {
    expect(humanizePartyRoleForTable("party_a")).toBe("Client");
    expect(humanizePartyRoleForTable("party_b")).toBe("Consultant");
    expect(humanizePartyRoleForTable("owner")).toBe("Owner");
  });
});

describe("auditHasRecipientApprovalForParticipant", () => {
  const ts = "2026-05-10T00:00:00.000Z";

  it("when any approval is scoped, only matching participant_id counts", () => {
    const audit = [
      {
        event_type: "recipient_approved" as const,
        at: ts,
        value: { participant_id: "p-atlas" },
      },
    ];
    expect(auditHasRecipientApprovalForParticipant(audit, "p-meridian")).toBe(false);
    expect(auditHasRecipientApprovalForParticipant(audit, "p-atlas")).toBe(true);
  });

  it("when no approval carries participant_id, any approval counts for a named participant (legacy)", () => {
    const audit = [{ event_type: "recipient_approved" as const, at: ts }];
    expect(auditHasRecipientApprovalForParticipant(audit, "p-bob")).toBe(true);
  });

  it("empty participantId only matches legacy unscoped approvals", () => {
    const audit = [
      { event_type: "recipient_approved" as const, at: ts, value: { participant_id: "p-x" } },
    ];
    expect(auditHasRecipientApprovalForParticipant(audit, "")).toBe(false);
  });
});

describe("deriveParticipantRows", () => {
  it("never substitutes Party A for a named participant", () => {
    const draft: AgreementDraft = {
      id: "x",
      title: "T",
      jurisdiction: "OK",
      parties: [
        { name: "Anthem Blanchard", role: "party_a", id: "p1" },
        { name: "John Doe", role: "party_b", id: "p2" },
      ],
      purpose: "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      created_at: "",
      updated_at: "",
      versions: [],
      audit_log: [],
      review_sent_at: null,
      workspace_archived_at: null,
    };
    const rows = deriveParticipantRows(draft);
    expect(rows[0]?.name).toBe("Anthem Blanchard");
    expect(rows[1]?.name).toBe("John Doe");
    expect(rows[0]?.roleLabel).toBe("Client");
    expect(rows[1]?.roleLabel).toBe("Consultant");
  });
});
