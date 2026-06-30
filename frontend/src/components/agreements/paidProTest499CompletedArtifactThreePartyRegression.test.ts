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
} from "../../vs01/vs01FullyExecutedSignedSnapshot";
import type { Vs01CanonicalPacketPortableV1 } from "../../vs01/vs01CanonicalPacketSeed";
import type { Vs01RecipientPlacedField } from "../../vs01/types";
import {
  stampWitnessBlockPartySignature,
  stampWitnessBlockPartySigningDate,
} from "../../vs01/vs01WitnessBlockSigningDate";
import { TEST498_SIGNERS, buildTest498ThreePartyWitnessTail } from "./paidProTest498Fixtures";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";

const AG = "ag_test499";
const DOC = "doc_test499";
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
    assignedSignerEmail: party.signerEmail,
    value: partyIndex === 0 ? party.signerName : partyIndex === 1 ? party.signerName : "",
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

/** Sequential signing: party 0 → party 1 → party 2. */
function buildSequentialAuditLog(): AgreementDraft["audit_log"] {
  return [signatureCompletedEvent(0), signatureCompletedEvent(1), signatureCompletedEvent(2)];
}

/**
 * TEST475 live corruption: incremental stamping left party 2 By as Caleb while Name is Maya.
 */
function buildCorruptedIncrementalSeedCorpus(): string {
  let corpus = witnessCorpus();
  const entities = TEST498_SIGNERS.map((p) => p.partyLegalName);
  const stamps = [
    TEST498_SIGNERS[0]!.signerName,
    TEST498_SIGNERS[1]!.signerName,
    TEST498_SIGNERS[1]!.signerName,
  ];
  for (let i = 0; i < 3; i += 1) {
    const sig = stamps[i]!;
    const stamped = stampWitnessBlockPartySignature(corpus, i, sig, entities);
    corpus = stamped.text;
    const dated = stampWitnessBlockPartySigningDate(corpus, i, "2026-06-30", entities);
    corpus = dated.text;
  }
  return corpus;
}

function assertThreePartyExecutionParity(corpusPlain: string, portable: Vs01CanonicalPacketPortableV1) {
  const rows = parseCompletedExecutionBlocksFromCorpus(
    corpusPlain,
    TEST498_SIGNERS.map((p) => p.partyLegalName),
  );
  expect(rows[0]?.byValue).toBe("Sandra Wells");
  expect(rows[0]?.nameValue).toBe("Sandra Wells");
  expect(rows[1]?.byValue).toBe("Caleb Price");
  expect(rows[1]?.nameValue).toBe("Caleb Price");
  expect(rows[2]?.byValue).toBe("Maya Coleman");
  expect(rows[2]?.nameValue).toBe("Maya Coleman");
  expect(rows[2]?.byValue).not.toBe(rows[1]?.byValue);

  const validation = validateCompletedExecutionMetadataInvariant({ corpusPlain, portable });
  expect(validation.ok).toBe(true);
  expect(validation.violations).toEqual([]);
}

describe("TEST499 — 3-party completed artifact party 2 must not inherit party 1 By (TEST475 regression)", () => {
  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
  });

  afterEach(() => {
    resetPaidProPipelineTestIsolation();
  });

  it("reconstructSignedCorpusFromAuditAndPortable strips corrupted party 2 By and replays audit", () => {
    const corruptedSeed = buildCorruptedIncrementalSeedCorpus();
    const portable = buildPortable(corruptedSeed);
    const draft = {
      id: AG,
      audit_log: buildSequentialAuditLog(),
    } as AgreementDraft;

    const rowsBefore = parseCompletedExecutionBlocksFromCorpus(
      corruptedSeed,
      TEST498_SIGNERS.map((p) => p.partyLegalName),
    );
    expect(rowsBefore[2]?.byValue).toBe("Caleb Price");
    expect(rowsBefore[2]?.nameValue).toBe("Maya Coleman");

    const rebuilt = reconstructSignedCorpusFromAuditAndPortable({
      draft,
      portable,
      source: "test499_reconstruct",
    });
    expect(rebuilt).toBeTruthy();
    assertThreePartyExecutionParity(rebuilt!, portable);
  });

  it("resolveAuthoritativeCompletedExecutionCorpus rejects corrupted snapshot and uses reconstruction", () => {
    const corruptedSeed = buildCorruptedIncrementalSeedCorpus();
    const portable = buildPortable(witnessCorpus());
    const draft = {
      id: AG,
      audit_log: buildSequentialAuditLog(),
      vs01_signing_packet_v1: {
        v: 1,
        portable: buildPortable(corruptedSeed),
        fully_executed_snapshot: {
          v: 1,
          corpus_plain: corruptedSeed,
          corpus_hash: "bad",
          saved_at: "2026-06-30T00:00:00Z",
        },
      },
    } as unknown as AgreementDraft;

    const resolved = resolveAuthoritativeCompletedExecutionCorpus({
      draft,
      portable,
      snapshotCorpus: corruptedSeed,
      preferSource: "fully_executed_snapshot",
    });
    expect(resolved?.source).toBe("reconstructed");
    assertThreePartyExecutionParity(resolved!.text, portable);
  });

  it("resolveVs01FullyExecutedSignedCorpus agrees across snapshot and reconstruction paths", () => {
    const portable = buildPortable(witnessCorpus());
    const auditLog = buildSequentialAuditLog();
    const rebuilt = reconstructSignedCorpusFromAuditAndPortable({
      draft: { id: AG, audit_log: auditLog } as AgreementDraft,
      portable,
      source: "test499_vs01_resolve",
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
    assertThreePartyExecutionParity(resolved!.text, portable);
  });

  it("regression fails if party 2 By still equals party 1 signer after reconstruction", () => {
    const corruptedSeed = buildCorruptedIncrementalSeedCorpus();
    const portable = buildPortable(corruptedSeed);
    const validation = validateCompletedExecutionMetadataInvariant({
      corpusPlain: corruptedSeed,
      portable,
    });
    expect(validation.ok).toBe(false);
    expect(validation.violations.some((v) => v.includes("party 2"))).toBe(true);
  });
});
