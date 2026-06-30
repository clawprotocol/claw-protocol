/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import {
  parseCompletedExecutionBlocksFromCorpus,
  resolveAuthoritativeCompletedExecutionCorpus,
  validateCompletedExecutionMetadataInvariant,
} from "../../vs01/paidProCompletedExecutionMetadataAuthority";
import {
  reconstructSignedCorpusFromAuditAndPortable,
  resolveVs01FullyExecutedSignedCorpus,
  signatureTextForSignerRole,
} from "../../vs01/vs01FullyExecutedSignedSnapshot";
import type { Vs01CanonicalPacketPortableV1 } from "../../vs01/vs01CanonicalPacketSeed";
import type { Vs01RecipientPlacedField } from "../../vs01/types";
import {
  stampWitnessBlockPartySignature,
  stampWitnessBlockPartySigningDate,
} from "../../vs01/vs01WitnessBlockSigningDate";
import { TEST498_SIGNERS, buildTest498ThreePartyWitnessTail } from "./paidProTest498Fixtures";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";

const AG = "ag_test498";
const DOC = "doc_test498";
const ROLE_IDS = ["role_stonebridge", "role_novapath", "role_clearspring"] as const;

function witnessCorpus(): string {
  return `${"Services agreement corpus. ".repeat(120)}\n${buildTest498ThreePartyWitnessTail()}`;
}

function buildRoles() {
  return TEST498_SIGNERS.map((party, partyIndex) => ({
    roleId: ROLE_IDS[partyIndex]!,
    partyIndex,
    partyId: `cp${partyIndex}`,
    entityName: party.partyLegalName,
    partyName: party.partyLegalName,
    roleLabel: `Party ${partyIndex + 1}`,
    signerName: party.signerName,
    signerTitle: party.signerTitle,
    signerEmail: party.signerEmail,
    isEntityParty: true,
    requiresSignature: true,
    vs01CounterpartyId: `cp${partyIndex}`,
    kind: partyIndex === 0 ? ("owner" as const) : ("counterparty" as const),
  }));
}

/** Reproduces TEST474: witness fields missing assignedSignerRoleId — only party 0 field is role-bound. */
function buildMisassignedSignatureFields(): Vs01RecipientPlacedField[] {
  return TEST498_SIGNERS.map((party, partyIndex) => ({
    id: `sig_${partyIndex}`,
    counterpartyId: `cp${partyIndex}`,
    type: "signature" as const,
    page: 14,
    x: 0.1,
    y: 0.1 + partyIndex * 0.05,
    width: 0.3,
    height: 0.04,
    assignedPartyIndex: partyIndex,
    assignedSignerRoleId: partyIndex === 0 ? ROLE_IDS[0] : "",
    value: partyIndex === 0 ? party.signerName : "",
  }));
}

function buildPortable(corpusPlain: string): Vs01CanonicalPacketPortableV1 {
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
    fields: buildMisassignedSignatureFields(),
    roles: buildRoles(),
    pageCount: 15,
    witnessPageIndex: 14,
    initialsPolicy: { enabled: false, bodyPagesOnly: true },
    fieldCount: 3,
  };
}

function signatureCompletedEvent(partyIndex: number) {
  const party = TEST498_SIGNERS[partyIndex]!;
  return {
    event_type: "signature_completed",
    at: `2026-06-30T1${partyIndex}:00:00.000Z`,
    field: "signature",
    value: {
      signer_role_id: ROLE_IDS[partyIndex],
      participant_display_name: party.signerName,
      signed_date_iso: "2026-06-30",
      signed_date_display: "June 30, 2026",
      document_id: DOC,
    },
  };
}

/** Out-of-order completion: party 2 → party 0 → party 1 (TEST474 signing order variant). */
function buildOutOfOrderAuditLog(): AgreementDraft["audit_log"] {
  return [signatureCompletedEvent(2), signatureCompletedEvent(0), signatureCompletedEvent(1)];
}

function buildCorruptedSnapshotCorpus(): string {
  let corpus = witnessCorpus();
  const entities = TEST498_SIGNERS.map((p) => p.partyLegalName);
  for (let i = 0; i < 3; i += 1) {
    const sig =
      i === 1 ? TEST498_SIGNERS[0]!.signerName : TEST498_SIGNERS[i]!.signerName;
    const stamped = stampWitnessBlockPartySignature(corpus, i, sig, entities);
    corpus = stamped.text;
    const dated = stampWitnessBlockPartySigningDate(corpus, i, "2026-06-30", entities);
    corpus = dated.text;
  }
  return corpus;
}

describe("TEST498 — 3-party completed artifact By/Name parity (TEST474 regression)", () => {
  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
  });

  afterEach(() => {
    resetPaidProPipelineTestIsolation();
  });

  it("signatureTextForSignerRole does not borrow party 0 value for party 1 when role unassigned", () => {
    const fields = buildMisassignedSignatureFields();
    expect(signatureTextForSignerRole(fields, ROLE_IDS[0])).toBe("Sandra Wells");
    expect(signatureTextForSignerRole(fields, ROLE_IDS[1])).toBe("");
    expect(signatureTextForSignerRole(fields, ROLE_IDS[2])).toBe("");
  });

  it("reconstructSignedCorpusFromAuditAndPortable uses audit displayName for unassigned witness fields", () => {
    const portable = buildPortable(witnessCorpus());
    const draft = {
      id: AG,
      audit_log: buildOutOfOrderAuditLog(),
    } as AgreementDraft;

    const rebuilt = reconstructSignedCorpusFromAuditAndPortable({ draft, portable });
    expect(rebuilt).toBeTruthy();

    const rows = parseCompletedExecutionBlocksFromCorpus(rebuilt!, TEST498_SIGNERS.map((p) => p.partyLegalName));
    expect(rows[0]?.byValue).toBe("Sandra Wells");
    expect(rows[0]?.nameValue).toBe("Sandra Wells");
    expect(rows[1]?.byValue).toBe("Caleb Price");
    expect(rows[1]?.nameValue).toBe("Caleb Price");
    expect(rows[2]?.byValue).toBe("Maya Coleman");
    expect(rows[2]?.nameValue).toBe("Maya Coleman");

    const validation = validateCompletedExecutionMetadataInvariant({ corpusPlain: rebuilt!, portable });
    expect(validation.ok).toBe(true);
    expect(validation.violations).toEqual([]);
  });

  it("resolveAuthoritativeCompletedExecutionCorpus prefers audit reconstruction over corrupted snapshot", () => {
    const portable = buildPortable(witnessCorpus());
    const draft = {
      id: AG,
      audit_log: buildOutOfOrderAuditLog(),
      vs01_signing_packet_v1: {
        v: 1,
        portable,
        fully_executed_snapshot: {
          v: 1,
          corpus_plain: buildCorruptedSnapshotCorpus(),
          corpus_hash: "bad",
          saved_at: "2026-06-30T00:00:00Z",
        },
      },
    } as unknown as AgreementDraft;

    const resolved = resolveAuthoritativeCompletedExecutionCorpus({
      draft,
      portable,
      snapshotCorpus: buildCorruptedSnapshotCorpus(),
      preferSource: "fully_executed_snapshot",
    });
    expect(resolved?.source).toBe("reconstructed");
    expect(resolved?.text).toContain("NovaPath Learning Inc");
    expect(resolved?.text).toMatch(/NovaPath Learning Inc\.?:[\s\S]*By: Caleb Price/);
    expect(resolved?.text).not.toMatch(/NovaPath Learning Inc\.?:[\s\S]*By: Sandra Wells/);
  });

  it("resolveVs01FullyExecutedSignedCorpus agrees across snapshot, reconstruction, and owner view paths", async () => {
    const portable = buildPortable(witnessCorpus());
    const auditLog = buildOutOfOrderAuditLog();
    const rebuilt = reconstructSignedCorpusFromAuditAndPortable({
      draft: { id: AG, audit_log: auditLog } as AgreementDraft,
      portable,
    });
    expect(rebuilt).toBeTruthy();

    const draft = {
      id: AG,
      title: "Agreement",
      audit_log: auditLog,
      vs01_signing_packet_v1: {
        v: 1,
        portable,
        fully_executed_snapshot: {
          v: 1,
          corpus_plain: rebuilt!,
          corpus_hash: fingerprintAgreementBody(rebuilt!),
          saved_at: "2026-06-30T00:00:00Z",
          signer_role_ids: [...ROLE_IDS],
        },
      },
    } as unknown as AgreementDraft;

    const resolved = resolveVs01FullyExecutedSignedCorpus(draft);
    expect(resolved?.source).toBe("fully_executed_snapshot");

    for (const party of TEST498_SIGNERS) {
      expect(resolved!.text).toContain(`By: ${party.signerName}`);
      expect(resolved!.text).toContain(`Name: ${party.signerName}`);
    }

    const validation = validateCompletedExecutionMetadataInvariant({
      corpusPlain: resolved!.text,
      portable,
    });
    expect(validation.ok).toBe(true);
    expect(validation.rows.every((r) => r.byValue === r.nameValue)).toBe(true);
  });
});
