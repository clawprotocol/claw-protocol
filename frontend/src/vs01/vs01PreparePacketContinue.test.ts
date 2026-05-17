/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { PlacedSigningField } from "./signingFields";
import type { Vs01Counterparty } from "./types";
import { handlePreparePacketContinue } from "./vs01PreparePacketContinue";
import {
  buildVs01PrepareSigningRoles,
  stampSenderFieldWithPrepareRole,
  type Vs01PrepareSigningRole,
} from "./vs01SignerFieldAssignment";

const AG = "agreement_continue_test";

function completeRoleFields(role: Vs01PrepareSigningRole): PlacedSigningField[] {
  const base: PlacedSigningField = {
    id: "b",
    type: "signature",
    page: 0,
    x: 0.1,
    y: 0.1,
    width: 0.34,
    height: 0.075,
  };
  const sender = [
    stampSenderFieldWithPrepareRole(base, role),
    stampSenderFieldWithPrepareRole({ ...base, id: "pn", type: "printed_name" }, role),
    stampSenderFieldWithPrepareRole({ ...base, id: "dt", type: "date", value: "2026-05-16" }, role),
  ];
  if (role.isEntityParty) {
    sender.push(
      stampSenderFieldWithPrepareRole(
        { ...base, id: "tt", type: "text", textPurpose: "title" },
        role,
      ),
    );
  }
  return sender;
}

describe("handlePreparePacketContinue", () => {
  it("blocks when required fields missing", () => {
    const cps: Vs01Counterparty[] = [{ id: "c1", name: "Atlas LLC", email: "a@x.com" }];
    const result = handlePreparePacketContinue({
      agreementId: AG,
      agreementTitle: "Test",
      documentId: "doc1",
      creatorName: "Owner Co",
      creatorEmail: "o@x.com",
      counterparties: cps,
      senderPlacedFields: [],
      recipientPlacedFields: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.finish.rows.length).toBeGreaterThan(0);
  });

  it("allows continue and returns handoff when all signers complete", () => {
    const cps: Vs01Counterparty[] = [{ id: "c1", name: "Atlas LLC", email: "a@x.com" }];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner Co",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    let sender: PlacedSigningField[] = [];
    for (const role of roles) {
      sender = [...sender, ...completeRoleFields(role)];
    }
    const result = handlePreparePacketContinue({
      agreementId: AG,
      agreementTitle: "Test",
      documentId: "doc1",
      creatorName: "Owner Co",
      creatorEmail: "o@x.com",
      counterparties: cps,
      senderPlacedFields: sender,
      recipientPlacedFields: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.handoff.signers.length).toBe(1);
    expect(result.handoff.signers[0]?.signingUrl).toContain("doc1");
    expect(result.handoff.packetPrepareOnly).toBe(true);
    expect(result.handoff.ownerSigningUrl).toContain("vs01_recipient_sign=1");
    expect(result.handoff.ownerSigningUrl).toContain("doc1");
  });
});
