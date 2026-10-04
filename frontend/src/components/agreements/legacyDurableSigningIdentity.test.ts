import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { AgreementDraft } from "../../agreement/agreementTypes";
import type { FrozenSigningAuthoritySnapshotV1 } from "./frozenSigningAuthoritySnapshot";
import { overlayFrozenSigningAuthorityOntoDraft } from "../../vs01/vs01EsignRemountPrepareRestore";
import {
  SigningIdentityAuthorityError,
  prepareDurableExecutionAuthority,
  signingCorpusAuthority,
  type PreparedExecutionAuthority,
} from "./legacyDurableSigningIdentity";

const AGREEMENT_ID = "ag_legacy_identity_fixture";
const DURABLE_A = "11111111-1111-4111-8111-111111111111";
const DURABLE_B = "22222222-2222-4222-8222-222222222222";
const GENERATED_A = "party_a11a11a11a11:b22b22b22b22";
const GENERATED_B = "party_c33c33c33c33:d44d44d44d44";
const ENTITY_A = "Northwind Field Analytics LLC";
const ENTITY_B = "Cedar Ridge Services LLC";
const SIGNER_A = "Casey North";
const SIGNER_B = "Riley Cedar";
const EMAIL_A = "casey.north@example.test";
const EMAIL_B = "riley.cedar@example.test";

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function acceptedCorpus(): string {
  return [
    "SERVICES AGREEMENT",
    "",
    "This Agreement is between Northwind Field Analytics LLC (Client) and Cedar Ridge Services LLC (Service Provider).",
    "The operative commercial terms in this accepted corpus are the signing text.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `${ENTITY_A}:`,
    "By: __________________________",
    `Name: ${SIGNER_A}`,
    "Title: Officer",
    "Date: _____________________________",
    "",
    `${ENTITY_B}:`,
    "By: __________________________",
    `Name: ${SIGNER_B}`,
    "Title: Officer",
    "Date: _____________________________",
    "",
  ].join("\n");
}

function staleFrozenCorpus(): string {
  return [
    "STALE FROZEN BODY",
    "This stale frozen corpus must not become signing text.",
    "Marker stale-frozen-corpus-must-not-rank.",
  ].join("\n");
}

function legacyDraft(): AgreementDraft {
  const corpus = acceptedCorpus();
  return {
    id: AGREEMENT_ID,
    title: "Sanitized legacy identity fixture",
    jurisdiction: "Delaware",
    parties: [
      { id: DURABLE_A, name: ENTITY_A, role: "Client", requiresSignature: true },
      { id: DURABLE_B, name: ENTITY_B, role: "Service Provider", requiresSignature: true },
    ],
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "2026-10-04T00:00:00Z",
    updated_at: "2026-10-04T00:00:00Z",
    versions: [],
    audit_log: [],
    accepted_review_snapshot_v1: {
      status: "accepted",
      snapshotId: "crs_legacy_fixture",
      corpusSha256: sha256(corpus),
      corpusLength: corpus.length,
      corpusPlain: corpus,
    },
  };
}

function legacyFrozen(): FrozenSigningAuthoritySnapshotV1 {
  return {
    version: 1,
    agreementId: AGREEMENT_ID,
    agreementSessionId: "sess_legacy_fixture",
    frozenCorpusHash: sha256(staleFrozenCorpus()),
    frozenAt: "2026-10-04T00:00:00Z",
    parties: [
      {
        agreementPartyId: GENERATED_A,
        legalEntityName: ENTITY_A,
        agreementRole: "Client",
        canonicalOrder: 0,
      },
      {
        agreementPartyId: GENERATED_B,
        legalEntityName: ENTITY_B,
        agreementRole: "Service Provider",
        canonicalOrder: 1,
      },
    ],
    signers: [
      {
        signerRecordId: `signer:${GENERATED_A}:0`,
        agreementPartyId: GENERATED_A,
        signerName: SIGNER_A,
        signerTitle: "Officer",
        signerEmail: EMAIL_A,
        signingOrder: 0,
        requiresSignature: true,
        requiresInitials: false,
      },
      {
        signerRecordId: `signer:${GENERATED_B}:0`,
        agreementPartyId: GENERATED_B,
        signerName: SIGNER_B,
        signerTitle: "Officer",
        signerEmail: EMAIL_B,
        signingOrder: 1,
        requiresSignature: true,
        requiresInitials: false,
      },
    ],
    recipients: [],
    execution: {
      partyOrder: [GENERATED_A, GENERATED_B],
      signerOrder: [`signer:${GENERATED_A}:0`, `signer:${GENERATED_B}:0`],
      executionBlockHash: sha256("witness-legacy-fixture"),
    },
  };
}

describe("legacy generated signer identity", () => {
  it("prepares signing parties from durable UUIDs and keeps the accepted digest", () => {
    const draft = legacyDraft();
    const frozen = legacyFrozen();
    const accepted = draft.accepted_review_snapshot_v1!;
    const prepared = overlayFrozenSigningAuthorityOntoDraft(draft, frozen, AGREEMENT_ID);

    expect(prepared.parties.map((party) => party.id)).toEqual([DURABLE_A, DURABLE_B]);
    expect(prepared.parties.map((party) => party.role)).toEqual(["Client", "Service Provider"]);
    expect(prepared.parties.map((party) => party.signerName)).toEqual([SIGNER_A, SIGNER_B]);
    expect(prepared.parties.map((party) => party.signerEmail)).toEqual([EMAIL_A, EMAIL_B]);
    expect(prepared.accepted_review_snapshot_v1?.corpusSha256).toBe(accepted.corpusSha256);
    expect(prepared.accepted_review_snapshot_v1?.corpusLength).toBe(accepted.corpusLength);
    expect(prepared.accepted_review_snapshot_v1?.corpusPlain).toBe(accepted.corpusPlain);
    expect(prepared.accepted_review_snapshot_v1?.corpusPlain).not.toContain("stale-frozen-corpus-must-not-rank");
    expect(frozen.frozenCorpusHash).not.toBe(accepted.corpusSha256);
    const authority = prepareDurableExecutionAuthority({ draft, frozen });
    expect(authority.corpusSource).toBe("accepted_canonical");
    expect(authority.digest).toBe(accepted.corpusSha256);
    expect(authority.length).toBe(accepted.corpusLength);
    expect(authority.participantIds).toEqual([DURABLE_A, DURABLE_B]);
    expect(authority.alias[GENERATED_A]).toBe(DURABLE_A);
    expect(authority.alias[GENERATED_B]).toBe(DURABLE_B);
  });
});

const EXTRA = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    generated: "party_e55e55e55e55:f66f66f66f66",
    entity: "Harbor Peak Workshop LLC",
    role: "Advisor",
    signer: "Avery Harbor",
    email: "avery.harbor@example.test",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    generated: "party_a77a77a77a77:b88b88b88b88",
    entity: "Ironvale Field Ops LLC",
    role: "Auditor",
    signer: "Quinn Ironvale",
    email: "quinn.ironvale@example.test",
  },
];

function paddedCorpus(marker: string): string {
  return `${marker}\n${"Operative commercial clause. ".repeat(12)}`;
}

function authorityForCount(count: 2 | 3 | 4, reverseFrozen = false): PreparedExecutionAuthority {
  const base = [
    {
      id: DURABLE_A,
      generated: GENERATED_A,
      entity: ENTITY_A,
      role: "Client",
      signer: SIGNER_A,
      email: EMAIL_A,
    },
    {
      id: DURABLE_B,
      generated: GENERATED_B,
      entity: ENTITY_B,
      role: "Service Provider",
      signer: SIGNER_B,
      email: EMAIL_B,
    },
    ...EXTRA,
  ].slice(0, count);
  const rows = reverseFrozen ? [...base].reverse() : base;
  const corpus = paddedCorpus(`accepted-${count}`);
  const draft = legacyDraft();
  draft.parties = base.map((row) => ({
    id: row.id,
    name: row.entity,
    role: row.role,
    requiresSignature: true,
  }));
  draft.accepted_review_snapshot_v1 = {
    status: "accepted",
    snapshotId: `crs_${count}`,
    corpusPlain: corpus,
    corpusLength: corpus.length,
    corpusSha256: sha256(corpus),
  };
  const frozen = legacyFrozen();
  frozen.parties = rows.map((row, index) => ({
    agreementPartyId: row.generated,
    legalEntityName: row.entity,
    agreementRole: row.role,
    canonicalOrder: reverseFrozen ? count - 1 - index : index,
  }));
  frozen.signers = rows.map((row, index) => ({
    signerRecordId: `signer:${row.generated}:0`,
    agreementPartyId: row.generated,
    signerName: row.signer,
    signerTitle: "Officer",
    signerEmail: row.email,
    signingOrder: index,
    requiresSignature: true,
    requiresInitials: false,
  }));
  frozen.frozenCorpusHash = sha256(staleFrozenCorpus());
  return prepareDurableExecutionAuthority({ draft, frozen });
}

describe("legacy identity mapping table", () => {
  it.each([2, 3, 4] as const)("maps %i parties by strict legal name onto durable ids", (count) => {
    const prepared = authorityForCount(count, count === 3);
    const expected = [DURABLE_A, DURABLE_B, EXTRA[0]!.id, EXTRA[1]!.id].slice(0, count);
    expect(prepared.participantIds).toEqual(expected);
    expect(prepared.parties.map((party) => party.order)).toEqual(expected.map((_, index) => index));
    expect(prepared.corpusSource).toBe("accepted_canonical");
    expect(prepared.parties.every((party) => !party.partyId.startsWith("party_"))).toBe(true);
    if (count === 3) {
      expect(prepared.alias[EXTRA[0]!.generated]).toBe(EXTRA[0]!.id);
      expect(prepared.parties[2]?.signerName).toBe("Avery Harbor");
    }
  });

  it("refuses to adopt a stale frozen corpus", () => {
    const accepted = acceptedCorpus();
    const digest = sha256(accepted);
    expect(() =>
      signingCorpusAuthority({
        acceptedCorpus: accepted,
        acceptedDigest: digest,
        frozenCorpus: staleFrozenCorpus(),
        frozenDigest: sha256(staleFrozenCorpus()),
        preferFrozen: true,
      }),
    ).toThrowError(SigningIdentityAuthorityError);
    try {
      signingCorpusAuthority({
        acceptedCorpus: accepted,
        acceptedDigest: digest,
        frozenDigest: sha256(staleFrozenCorpus()),
        preferFrozen: true,
      });
    } catch (error) {
      expect((error as SigningIdentityAuthorityError).code).toBe("frozen_corpus_mismatch");
    }
  });

  it.each([
    ["duplicate legal names", "ambiguous_legal_name", (frozen: FrozenSigningAuthoritySnapshotV1, draft: AgreementDraft) => {
      frozen.parties[1]!.legalEntityName = ENTITY_A;
      draft.parties[1]!.name = ENTITY_A;
    }],
    ["missing legal name", "missing_legal_name", (frozen: FrozenSigningAuthoritySnapshotV1) => {
      frozen.parties[0]!.legalEntityName = "";
    }],
    ["count mismatch", "party_count_mismatch", (_frozen: FrozenSigningAuthoritySnapshotV1, draft: AgreementDraft) => {
      draft.parties = draft.parties.slice(0, 1);
    }],
    ["reordered ambiguous names", "ambiguous_legal_name", (frozen: FrozenSigningAuthoritySnapshotV1, draft: AgreementDraft) => {
      frozen.parties[0]!.legalEntityName = ENTITY_A;
      frozen.parties[1]!.legalEntityName = ENTITY_A;
      draft.parties[0]!.name = ENTITY_A;
      draft.parties[1]!.name = `${ENTITY_A}.`;
      frozen.parties.reverse();
    }],
    ["mixed durable and generated ids", "mixed_party_identity", (frozen: FrozenSigningAuthoritySnapshotV1) => {
      frozen.parties[0]!.agreementPartyId = "99999999-9999-4999-8999-999999999999";
    }],
    ["missing signer record", "missing_signer_record", (frozen: FrozenSigningAuthoritySnapshotV1) => {
      frozen.signers = frozen.signers.slice(0, 1);
    }],
    ["multiple signers for one party", "multiple_signers_for_party", (frozen: FrozenSigningAuthoritySnapshotV1) => {
      frozen.signers[1]!.agreementPartyId = GENERATED_A;
    }],
    ["unknown generated signer id", "unknown_generated_party", (frozen: FrozenSigningAuthoritySnapshotV1) => {
      frozen.signers[1]!.agreementPartyId = "party_deadbeefdead:beefbeefbeef";
    }],
    ["role conflict", "role_conflict", (frozen: FrozenSigningAuthoritySnapshotV1) => {
      frozen.parties[1]!.agreementRole = "Vendor";
    }],
    ["accepted snapshot missing", "accepted_snapshot_missing", (_frozen: FrozenSigningAuthoritySnapshotV1, draft: AgreementDraft) => {
      draft.accepted_review_snapshot_v1 = null;
    }],
    ["accepted snapshot invalid", "accepted_snapshot_invalid", (_frozen: FrozenSigningAuthoritySnapshotV1, draft: AgreementDraft) => {
      draft.accepted_review_snapshot_v1 = {
        ...draft.accepted_review_snapshot_v1!,
        corpusSha256: "ab".repeat(32),
      };
    }],
  ])("fails closed for %s", (_label, code, mutate) => {
    const draft = legacyDraft();
    const frozen = legacyFrozen();
    mutate(frozen, draft);
    expect(() => prepareDurableExecutionAuthority({ draft, frozen })).toThrowError(SigningIdentityAuthorityError);
    try {
      prepareDurableExecutionAuthority({ draft, frozen });
    } catch (error) {
      expect((error as SigningIdentityAuthorityError).code).toBe(code);
    }
  });
});
