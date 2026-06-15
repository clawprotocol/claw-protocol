/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { resolveFinalVs01CorpusOrBlock } from "./vs01SigningCorpus";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { buildVs01SigningPacketModel } from "./buildVs01SigningPacketModel";
import { buildFullPacketManifestFromCanonicalModel } from "./vs01SigningPacketManifest";
import { resolveRecipientCanonicalSigningPacket } from "./resolveRecipientCanonicalSigningPacket";
import {
  buildVs01CanonicalPacketSeed,
  storeVs01CanonicalPacketPortable,
} from "./vs01CanonicalPacketSeed";
import { handlePreparePacketContinue } from "./vs01PreparePacketContinue";
import type { PlacedSigningField } from "./signingFields";
import type { Vs01Counterparty } from "./types";
import { stampSenderFieldWithPrepareRole } from "./vs01SignerFieldAssignment";

const AG = "ag_qa364";
const DOC = "doc_qa364";

function qa364Corpus(): string {
  const clause =
    "Provider shall perform commercially reasonable services, maintain documentation, and support milestone acceptance. ";
  const sections = Array.from({ length: 8 }, (_, i) => {
    const n = i + 1;
    return `${n}. SECTION ${n}\n${n}.1 Scope.\n${clause.repeat(4)}\n${n}.2 Cooperation and payment mechanics.`;
  }).join("\n\n");
  return `CONSULTING AND IMPLEMENTATION AGREEMENT

${sections}

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Red Mesa Logistics LLC
By: ______________________
Name: Ann Rice
Title: Author
Date: ____________________

SERVICE PROVIDER:
Harbor Peak Automation LLC
By: ______________________
Name: Heath Lincoln
Title: Member
Date: ____________________`;
}

function counterparties(): Vs01Counterparty[] {
  return [
    {
      id: "cp_harbor",
      name: "Harbor Peak Automation LLC",
      email: "cp@example.com",
      signerName: "Heath Lincoln",
      signerTitle: "Member",
    },
  ];
}

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: AG,
    creatorName: "Red Mesa Logistics LLC",
    creatorEmail: "owner@example.com",
    ownerSignerName: "Ann Rice",
    ownerSignerTitle: "Author",
    counterparties: counterparties(),
  });
}

function completeRoleFields(role: ReturnType<typeof roles>[number]): PlacedSigningField[] {
  const base: PlacedSigningField = {
    id: `sig-${role.roleId}`,
    type: "signature",
    page: 0,
    x: 0.1,
    y: 0.1,
    width: 0.34,
    height: 0.075,
    assignedSignerRoleId: role.roleId,
  };
  return [stampSenderFieldWithPrepareRole(base, role)];
}

describe("QA364 prepare vs recipient canonical parity", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("prepare packet and recipient resolver share page descriptors and corpus hash", () => {
    const r = roles();
    const corpus = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: qa364Corpus(),
      guidedPro: true,
      premiumComplete: true,
    }).corpus;
    let sender: PlacedSigningField[] = [];
    for (const role of r) sender = [...sender, ...completeRoleFields(role)];

    const prepared = handlePreparePacketContinue({
      agreementId: AG,
      agreementTitle: "Services Agreement",
      documentId: DOC,
      creatorName: "Red Mesa Logistics LLC",
      creatorEmail: "owner@example.com",
      ownerSignerName: "Ann Rice",
      ownerSignerTitle: "Author",
      counterparties: counterparties(),
      senderPlacedFields: sender,
      recipientPlacedFields: [],
      prepareCorpusPlain: corpus,
      initialsEnabled: true,
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok || !prepared.portablePacket) return;

    const prepareModel = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: corpus,
      roles: r,
      initialsEnabled: true,
    });
    expect(prepareModel.allowed).toBe(true);

    localStorage.clear();
    sessionStorage.clear();
    storeVs01CanonicalPacketPortable(DOC, prepared.portablePacket);

    const recipient = resolveRecipientCanonicalSigningPacket({
      documentId: DOC,
      agreementId: AG,
      roles: r,
      portablePacket: prepared.portablePacket,
    });
    expect(recipient?.seedSource).toBe("portable_packet");
    expect(recipient?.corpusHash).toBe(
      buildVs01CanonicalPacketSeed({ documentId: DOC, agreementId: AG, corpusPlain: corpus })!.corpusHash,
    );
    expect(recipient?.model.pages.length).toBe(prepareModel.pages.length);
    expect(recipient?.model.pages.length).toBeLessThan(16);
    expect(recipient?.model.pages[0]?.flowLines[0]).toMatch(/CONSULTING AND IMPLEMENTATION AGREEMENT/i);
    expect(
      buildFullPacketManifestFromCanonicalModel({ model: recipient!.model, roles: r }).length,
    ).toBeGreaterThan(0);
  });
});
