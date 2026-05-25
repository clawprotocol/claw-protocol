/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import type { PlacedSigningField } from "./signingFields";
import type { Vs01Counterparty } from "./types";
import { handlePreparePacketContinue } from "./vs01PreparePacketContinue";
import { VS01_CANONICAL_PACKET_STORED_QUERY } from "./vs01CanonicalPacketSeed";
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
  return [stampSenderFieldWithPrepareRole(base, role)];
}

function premiumCorpus(): string {
  return `${"Premium operational clause with detailed duties and payment mechanics. ".repeat(90)}

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Acme LLC
By: ______________________
Name: Anthem H Blanchard
Title: Manager
Date: ____________________

SERVICE PROVIDER:
Joe Brown
By: ______________________
Name: Joe Brown
Date: ____________________`;
}

describe("handlePreparePacketContinue", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

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

  it("test77: two-signer canonical packet yields distinct role-mapped links without giant inline cpacket", () => {
    const cps: Vs01Counterparty[] = [
      { id: "cp_joe", name: "Joe Brown", email: "jb34@me.com", signerName: "Joe Brown" },
    ];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Acme LLC",
      creatorEmail: "anthemhayek@gmail.com",
      ownerSignerName: "Anthem H Blanchard",
      counterparties: cps,
    });
    let sender: PlacedSigningField[] = [];
    for (const role of roles) {
      sender = [...sender, ...completeRoleFields(role)];
    }
    const result = handlePreparePacketContinue({
      agreementId: AG,
      agreementTitle: "Test",
      documentId: "doc_test77",
      creatorName: "Acme LLC",
      creatorEmail: "anthemhayek@gmail.com",
      ownerSignerName: "Anthem H Blanchard",
      counterparties: cps,
      senderPlacedFields: sender,
      recipientPlacedFields: [],
      prepareCorpusPlain: premiumCorpus(),
      initialsEnabled: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ownerParams = new URL(result.handoff.ownerSigningUrl!).searchParams;
    const cpParams = new URL(result.handoff.signers[0]!.signingUrl).searchParams;
    expect(ownerParams.get("recipient_name")).toBe("Acme LLC");
    expect(ownerParams.get("recipient_email")).toBe("anthemhayek@gmail.com");
    expect(ownerParams.get("assigned_party_index")).toBe("0");
    expect(ownerParams.get("signer_role_id")).toContain(":i0:");
    expect(cpParams.get("recipient_name")).toBe("Joe Brown");
    expect(cpParams.get("recipient_email")).toBe("jb34@me.com");
    expect(cpParams.get("assigned_party_index")).toBe("1");
    expect(cpParams.get("signer_role_id")).toContain(":i1:");
    expect(
      ownerParams.has("vs01_cpacket") || ownerParams.get(VS01_CANONICAL_PACKET_STORED_QUERY) === "1",
    ).toBe(true);
    expect(result.handoff.ownerSigningUrl!.length).toBeLessThan(2500);
  });

  it("test77: initials off removes initials from portable packet and revision", () => {
    const cps: Vs01Counterparty[] = [{ id: "cp_joe", name: "Joe Brown", email: "jb34@me.com" }];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Acme LLC",
      creatorEmail: "anthemhayek@gmail.com",
      counterparties: cps,
    });
    let sender: PlacedSigningField[] = [];
    for (const role of roles) {
      sender = [...sender, ...completeRoleFields(role)];
    }
    const on = handlePreparePacketContinue({
      agreementId: AG,
      agreementTitle: "Test",
      documentId: "doc_init",
      creatorName: "Acme LLC",
      creatorEmail: "anthemhayek@gmail.com",
      counterparties: cps,
      senderPlacedFields: sender,
      recipientPlacedFields: [],
      prepareCorpusPlain: premiumCorpus(),
      initialsEnabled: true,
    });
    const off = handlePreparePacketContinue({
      agreementId: AG,
      agreementTitle: "Test",
      documentId: "doc_init",
      creatorName: "Acme LLC",
      creatorEmail: "anthemhayek@gmail.com",
      counterparties: cps,
      senderPlacedFields: sender,
      recipientPlacedFields: [],
      prepareCorpusPlain: premiumCorpus(),
      initialsEnabled: false,
    });
    expect(on.ok && off.ok).toBe(true);
    if (!on.ok || !off.ok) return;
    expect(on.handoff.packetRevision).not.toBe(off.handoff.packetRevision);
    expect(off.handoff.initialsEnabled).toBe(false);
  });
});
