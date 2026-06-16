/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import type { AgreementDraft } from "../agreement/agreementTypes";
import {
  applySignerCompletionToPortablePacket,
  attachFullyExecutedSnapshotToPortable,
  buildFullyExecutedSignedSnapshot,
  readFullyExecutedSnapshotFromDraft,
  resolveVs01FullyExecutedSignedCorpus,
} from "./vs01FullyExecutedSignedSnapshot";
import type { Vs01CanonicalPacketPortableV1 } from "./vs01CanonicalPacketSeed";
import { countSignedWitnessBlocks } from "./vs01WitnessBlockSigningDate";

const WITNESS_TAIL = `
IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Red Mesa Logistics LLC
By: __________________________
Name: Hue Lorrey
Title: CEO
Date: _____________________________

SERVICE PROVIDER:
Harbor Peak Automation LLC
By: __________________________
Name: Heath Ledger
Title: Member
Date: _____________________________`;

const OWNER_ROLE = "vs01r:ag_test362:i0:owner";
const CP_ROLE = "vs01r:ag_test362:i1:cp";
const AG = "ag_test362";
const DOC = "doc_test362";

function witnessCorpus(): string {
  return `${"Services agreement corpus. ".repeat(90)}\n${WITNESS_TAIL}`;
}

function basePortable(corpusPlain = witnessCorpus()): Vs01CanonicalPacketPortableV1 {
  return {
    v: 1,
    seed: {
      v: 1,
      documentId: DOC,
      agreementId: AG,
      corpusPlain,
      corpusHash: fingerprintAgreementBody(corpusPlain),
      savedAt: new Date().toISOString(),
    },
    fields: [
      {
        id: "owner_sig",
        counterpartyId: "owner",
        type: "signature",
        page: 9,
        x: 0.1,
        y: 0.1,
        width: 0.3,
        height: 0.05,
        assignedPartyIndex: 0,
        assignedSignerRoleId: OWNER_ROLE,
        value: "",
      },
      {
        id: "cp_sig",
        counterpartyId: "cp1",
        type: "signature",
        page: 9,
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.05,
        assignedPartyIndex: 1,
        assignedSignerRoleId: CP_ROLE,
        value: "",
      },
    ],
    roles: [
      {
        roleId: OWNER_ROLE,
        partyIndex: 0,
        partyId: "owner",
        entityName: "Red Mesa Logistics LLC",
        partyName: "Red Mesa Logistics LLC",
        roleLabel: "Client",
        signerName: "Hue Lorrey",
        isEntityParty: true,
        requiresSignature: true,
        vs01CounterpartyId: "owner",
        kind: "owner",
      },
      {
        roleId: CP_ROLE,
        partyIndex: 1,
        partyId: "cp1",
        entityName: "Harbor Peak Automation LLC",
        partyName: "Harbor Peak Automation LLC",
        roleLabel: "Provider",
        signerName: "Heath Ledger",
        isEntityParty: true,
        requiresSignature: true,
        vs01CounterpartyId: "cp1",
        kind: "counterparty",
      },
    ],
    pageCount: 10,
    witnessPageIndex: 9,
    initialsPolicy: { enabled: false, bodyPagesOnly: true },
    fieldCount: 2,
  };
}

describe("vs01FullyExecutedSignedSnapshot (Test362)", () => {
  it("signer 1 stamps signature and date; signer 2 date stays blank", () => {
    const portable = basePortable();
    const signer1Fields = portable.fields.map((f) =>
      f.id === "owner_sig" ? { ...f, value: "Hue Lorrey" } : f,
    );
    const applied = applySignerCompletionToPortablePacket({
      portable,
      agreementId: AG,
      documentId: DOC,
      signerRoleId: OWNER_ROLE,
      partyIndex: 0,
      signingDateIso: "2026-06-15",
      signatureText: "Hue Lorrey",
      recipientFields: signer1Fields,
    });

    expect(applied.signatureStamped).toBe(true);
    expect(applied.corpusStamped).toBe(true);
    expect(applied.portable.seed.corpusPlain).toMatch(/CLIENT:[\s\S]*By: Hue Lorrey/);
    expect(applied.portable.seed.corpusPlain).toMatch(/CLIENT:[\s\S]*Date: June 15, 2026/);
    expect(applied.portable.seed.corpusPlain).toMatch(/SERVICE PROVIDER:[\s\S]*Date: _+/);
    expect(buildFullyExecutedSignedSnapshot(applied.portable)).toBeNull();
  });

  it("final signer produces fully executed snapshot with both signatures and dates", () => {
    let portable = basePortable();
    const signer1Fields = portable.fields.map((f) =>
      f.id === "owner_sig" ? { ...f, value: "Hue Lorrey" } : f,
    );
    portable = applySignerCompletionToPortablePacket({
      portable,
      agreementId: AG,
      documentId: DOC,
      signerRoleId: OWNER_ROLE,
      partyIndex: 0,
      signingDateIso: "2026-06-15",
      signatureText: "Hue Lorrey",
      recipientFields: signer1Fields,
    }).portable;

    const signer2Fields = portable.fields.map((f) =>
      f.id === "cp_sig" ? { ...f, value: "Heath Ledger" } : f,
    );
    portable = applySignerCompletionToPortablePacket({
      portable,
      agreementId: AG,
      documentId: DOC,
      signerRoleId: CP_ROLE,
      partyIndex: 1,
      signingDateIso: "2026-06-16",
      signatureText: "Heath Ledger",
      recipientFields: signer2Fields,
    }).portable;

    portable = attachFullyExecutedSnapshotToPortable(portable);
    const snap = portable.fullyExecutedSnapshot;
    expect(snap?.corpusPlain).toMatch(/By: Hue Lorrey/);
    expect(snap?.corpusPlain).toMatch(/By: Heath Ledger/);
    expect(snap?.corpusPlain).toMatch(/Date: June 15, 2026/);
    expect(snap?.corpusPlain).toMatch(/Date: June 16, 2026/);
    expect(countSignedWitnessBlocks(snap!.corpusPlain)).toEqual({ signed: 2, total: 2 });
  });

  it("resolveVs01FullyExecutedSignedCorpus prefers server fully_executed_snapshot", () => {
    const corpusPlain = witnessCorpus().replace(
      /Date: _+/,
      "Date: June 15, 2026",
    );
    const draft = {
      id: AG,
      vs01_signing_packet_v1: {
        v: 1,
        fully_executed_snapshot: {
          v: 1,
          corpus_plain: corpusPlain,
          corpus_hash: fingerprintAgreementBody(corpusPlain),
          saved_at: "2026-06-16T00:00:00Z",
        },
        portable: basePortable(),
      },
    } as unknown as AgreementDraft;

    const resolved = resolveVs01FullyExecutedSignedCorpus(draft);
    expect(resolved?.source).toBe("fully_executed_snapshot");
    expect(resolved?.text).toContain("June 15, 2026");
    expect(readFullyExecutedSnapshotFromDraft(draft)?.corpusPlain).toContain("June 15, 2026");
  });
});
