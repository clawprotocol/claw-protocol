import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "./agreementTypes";
import {
  auditHasRecipientApprovalForParticipant,
  auditHasRecipientApprovalForRevision,
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

describe("auditHasRecipientApprovalForRevision", () => {
  const ts = "2026-09-15T00:00:00.000Z";
  const snap = "crs_c39f2cb710ac4ae899238b61be4a13e2";
  const digest = "03e26cfda553ef8c920a09db67171286f82a750e9ddfa2171f82bc71a29eeb85";

  it("requires the same participant, snapshot, and digest", () => {
    const audit = [
      {
        event_type: "participant_approved" as const,
        at: ts,
        value: { participant_id: "p_lumen", snapshot_id: snap, corpus_sha256: digest },
      },
    ];
    expect(auditHasRecipientApprovalForRevision(audit, { participantId: "p_lumen", snapshotId: snap, digest })).toBe(true);
    expect(auditHasRecipientApprovalForRevision(audit, { participantId: "p_vanguard", snapshotId: snap, digest })).toBe(false);
    expect(
      auditHasRecipientApprovalForRevision(audit, {
        participantId: "p_lumen",
        snapshotId: "crs_other",
        digest,
      }),
    ).toBe(false);
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
