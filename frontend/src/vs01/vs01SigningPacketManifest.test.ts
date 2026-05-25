/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import { resolveFinalVs01CorpusOrBlock } from "./vs01SigningCorpus";
import { buildVs01SigningPacketModel } from "./buildVs01SigningPacketModel";
import {
  buildFullPacketManifestFromCanonicalModel,
  buildSigningUrlForPrepareRole,
  filterPacketManifestFieldsForRole,
} from "./vs01SigningPacketManifest";
import {
  buildVs01CanonicalPacketPortable,
  buildVs01CanonicalPacketSeed,
  encodeVs01CanonicalPacketPortable,
  resolveCanonicalPacketUrlRefs,
  VS01_CANONICAL_PACKET_MAX_URL_LEN,
  VS01_CANONICAL_PACKET_QUERY,
  VS01_CANONICAL_PACKET_STORED_QUERY,
} from "./vs01CanonicalPacketSeed";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";

const AG = "ag_test77_links";

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

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: AG,
    creatorName: "Acme LLC",
    creatorEmail: "anthemhayek@gmail.com",
    ownerSignerName: "Anthem H Blanchard",
    counterparties: [{ id: "cp_joe", name: "Joe Brown", email: "jb34@me.com", signerName: "Joe Brown" }],
  });
}

describe("buildSigningUrlForPrepareRole (test77)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("builds distinct owner and counterparty links with correct role ids and party indices", () => {
    const r = roles();
    const owner = r[0]!;
    const counterparty = r[1]!;
    const corpus = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: premiumCorpus(),
      guidedPro: true,
      premiumComplete: true,
    }).corpus;
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: corpus,
      roles: r,
      initialsEnabled: true,
    });
    expect(model.allowed).toBe(true);
    const manifest = buildFullPacketManifestFromCanonicalModel({ model, roles: r });
    const seed = buildVs01CanonicalPacketSeed({
      documentId: "doc_test77",
      agreementId: AG,
      corpusPlain: corpus,
    })!;
    const portable = buildVs01CanonicalPacketPortable({
      seed,
      fields: manifest,
      roles: r,
      pageCount: model.pages.length,
      witnessPageIndex: model.pages.length - 1,
      initialsEnabled: true,
    });
    const urlRefs = resolveCanonicalPacketUrlRefs({
      documentId: "doc_test77",
      packet: portable,
      initialsEnabled: true,
    });

    const ownerUrl = buildSigningUrlForPrepareRole({
      role: owner,
      ownerRole: owner,
      roles: r,
      senderPlacedFields: [],
      recipientPlacedFields: [],
      packetManifestFields: manifest,
      canonicalPacketPayload: urlRefs.encodedInline,
      canonicalPacketStored: urlRefs.storedOnly,
      packetRevision: urlRefs.packetRevision,
      documentId: "doc_test77",
      agreementId: AG,
      recipientIndex: owner.partyIndex,
    });
    const cpUrl = buildSigningUrlForPrepareRole({
      role: counterparty,
      ownerRole: owner,
      roles: r,
      senderPlacedFields: [],
      recipientPlacedFields: [],
      packetManifestFields: manifest,
      canonicalPacketPayload: urlRefs.encodedInline,
      canonicalPacketStored: urlRefs.storedOnly,
      packetRevision: urlRefs.packetRevision,
      documentId: "doc_test77",
      agreementId: AG,
      recipientIndex: counterparty.partyIndex,
    });

    const ownerParams = new URL(ownerUrl).searchParams;
    const cpParams = new URL(cpUrl).searchParams;
    expect(ownerParams.get("recipient_name")).toBe("Acme LLC");
    expect(ownerParams.get("recipient_email")).toBe("anthemhayek@gmail.com");
    expect(ownerParams.get("counterparty_id")).toBe("owner");
    expect(ownerParams.get("assigned_party_index")).toBe("0");
    expect(ownerParams.get("signer_role_id")).toBe(owner.roleId);
    expect(ownerParams.get("signer_role_id")).toContain(":i0:");

    expect(cpParams.get("recipient_name")).toBe("Joe Brown");
    expect(cpParams.get("recipient_email")).toBe("jb34@me.com");
    expect(cpParams.get("counterparty_id")).toBe("cp_joe");
    expect(cpParams.get("assigned_party_index")).toBe("1");
    expect(cpParams.get("signer_role_id")).toBe(counterparty.roleId);
    expect(cpParams.get("signer_role_id")).toContain(":i1:");

    expect(ownerUrl).not.toBe(cpUrl);
    expect(ownerUrl.length).toBeLessThan(2500);
    expect(cpUrl.length).toBeLessThan(2500);
    expect(ownerParams.has(VS01_CANONICAL_PACKET_QUERY) || ownerParams.get(VS01_CANONICAL_PACKET_STORED_QUERY) === "1").toBe(
      true,
    );
  });

  it("scopes manifest fields per role (no full packet on every link)", () => {
    const r = roles();
    const corpus = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: premiumCorpus(),
      guidedPro: true,
      premiumComplete: true,
    }).corpus;
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: corpus,
      roles: r,
      initialsEnabled: true,
    });
    const manifest = buildFullPacketManifestFromCanonicalModel({ model, roles: r });
    const ownerOnly = filterPacketManifestFieldsForRole(manifest, r[0]!);
    const cpOnly = filterPacketManifestFieldsForRole(manifest, r[1]!);
    expect(ownerOnly.length).toBeGreaterThan(0);
    expect(cpOnly.length).toBeGreaterThan(0);
    expect(ownerOnly.every((f) => f.assignedSignerRoleId === r[0]!.roleId || f.counterpartyId === "owner")).toBe(true);
    expect(cpOnly.every((f) => f.assignedSignerRoleId === r[1]!.roleId || f.counterpartyId === "cp_joe")).toBe(true);
    expect(ownerOnly.some((f) => f.assignedSignerRoleId === r[1]!.roleId)).toBe(false);
  });

  it("does not embed giant corpus in URL when portable exceeds max inline length", () => {
    const r = roles();
    const corpus = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: premiumCorpus(),
      guidedPro: true,
      premiumComplete: true,
    }).corpus;
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: corpus,
      roles: r,
    });
    const manifest = buildFullPacketManifestFromCanonicalModel({ model, roles: r });
    const seed = buildVs01CanonicalPacketSeed({
      documentId: "doc_long",
      agreementId: AG,
      corpusPlain: corpus,
    })!;
    const portable = buildVs01CanonicalPacketPortable({
      seed,
      fields: manifest,
      roles: r,
      pageCount: model.pages.length,
      witnessPageIndex: model.pages.length - 1,
    });
    const encoded = encodeVs01CanonicalPacketPortable(portable);
    expect(encoded.length).toBeGreaterThan(VS01_CANONICAL_PACKET_MAX_URL_LEN);
    const refs = resolveCanonicalPacketUrlRefs({
      documentId: "doc_long",
      packet: portable,
      initialsEnabled: true,
    });
    expect(refs.storedOnly).toBe(true);
    expect(refs.encodedInline).toBeNull();
  });
});
