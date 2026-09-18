/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sha256CorpusDigest } from "../../agreement/canonicalReviewSnapshotApi";
import {
  evaluateAcceptedSigningPreparation,
  persistedPartiesReadyForAcceptedSigning,
  requiredSignersFromPersistedParties,
  shouldReuseAcceptedSigningAuthority,
  type PersistedSigningParty,
} from "./acceptedSigningPreparationAuthority";
import {
  requiredDirectSigningParticipantIds,
  shouldMintSignTokenForEveryRequiredParticipant,
} from "./paidProDirectSigningLockAndInvite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGREEMENT_ID = "ag-silver-mesa-accepted";
const SNAPSHOT_ID = "crs-silver-mesa-accepted";

const SILVER_MESA_PARTIES: PersistedSigningParty[] = [
  {
    id: "ironclad-uuid",
    name: "Ironclad Systems Group LLC",
    role: "Sponsor",
    signerName: "Ethan Cole",
    email: "ethan.cole@ironcladsg.com",
  },
  {
    id: "harborline-uuid",
    name: "Harborline Data Solutions Inc.",
    role: "Vendor",
    signerName: "Maya Bennett",
    email: "maya.bennett@harborlinedata.com",
  },
  {
    id: "northwind-uuid",
    name: "Northwind Automation Partners LLC",
    role: "Integrator",
    signerName: "Lucas Reed",
    email: "lucas.reed@northwindap.io",
  },
  {
    id: "silver-uuid",
    name: "Silver Mesa Analytics LP",
    role: "Analyst",
    signerName: "Olivia Hart",
    email: "olivia.hart@silvermesaanalytics.com",
  },
];

function acceptedPaper(): string {
  return [
    "JOINT AI SOFTWARE ROLLOUT AGREEMENT",
    'Ironclad Systems Group LLC ("Sponsor"), Harborline Data Solutions Inc. ("Vendor"), Northwind Automation Partners LLC ("Integrator"), and Silver Mesa Analytics LP ("Analyst").',
    "Fee $187,500. Term 24 months. Texas law. Austin ZIP 78701.",
    "If to Silver Mesa Analytics LP: Email: notices@silvermesaanalytics.com.",
    "Reviewer access remains olivia.hart@silvermesaanalytics.com.",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "Ironclad Systems Group LLC\nBy: ______________________\nName: Ethan Cole",
    "Harborline Data Solutions Inc.\nBy: ______________________\nName: Maya Bennett",
    "Northwind Automation Partners LLC\nBy: ______________________\nName: Lucas Reed",
    "Silver Mesa Analytics LP\nBy: ______________________\nName: Olivia Hart",
    "Operative commercial paragraph continues the same four-party Texas rollout. ".repeat(40),
  ].join("\n");
}

async function acceptedGet(overrides?: Partial<Parameters<typeof evaluateAcceptedSigningPreparation>[0]["acceptedGet"]>) {
  const corpus = acceptedPaper().trim();
  const digest = await sha256CorpusDigest(corpus);
  return {
    agreement_id: AGREEMENT_ID,
    snapshot_id: SNAPSHOT_ID,
    corpus_sha256: digest,
    corpus_plain: corpus,
    corpus_length: corpus.length,
    status: "accepted" as const,
    ...overrides,
  };
}

describe("accepted signing preparation authority", () => {
  it("derives required signers from persisted durable IDs for two, three, and four parties", () => {
    const two = requiredSignersFromPersistedParties([
      {
        id: "harbor-uuid",
        name: "Harbor Peak Analytics LLC",
        role: "Consultant",
        signerName: "Pat Harbor",
        email: "pat.harbor@harbor.test",
      },
      {
        id: "ironvale-uuid",
        name: "Ironvale Manufacturing Inc.",
        role: "Client",
        signerName: "Sam Ironvale",
        email: "sam.ironvale@ironvale.test",
      },
    ]);
    expect(two.map((row) => row.partyId)).toEqual(["harbor-uuid", "ironvale-uuid"]);
    expect(
      requiredDirectSigningParticipantIds({
        parties: two.map((row) => ({ id: row.partyId, name: row.legalEntity, role: row.role })),
      } as never),
    ).toEqual(["harbor-uuid", "ironvale-uuid"]);

    const three = requiredSignersFromPersistedParties([
      {
        id: "harbor-uuid",
        name: "Harbor Peak Analytics LLC",
        role: "Consultant",
        signerName: "Pat Harbor",
        email: "pat.harbor@harbor.test",
      },
      {
        id: "ironvale-uuid",
        name: "Ironvale Manufacturing Inc.",
        role: "Client",
        signerName: "Sam Ironvale",
        email: "sam.ironvale@ironvale.test",
      },
      {
        id: "alex-uuid",
        name: "Alex Rivera",
        role: "Advisor",
        signerName: "Alex Rivera",
        email: "alex.rivera@advisor.test",
      },
    ]);
    expect(three.map((row) => row.partyId)).toEqual(["harbor-uuid", "ironvale-uuid", "alex-uuid"]);

    const four = requiredSignersFromPersistedParties(SILVER_MESA_PARTIES);
    expect(four.map((row) => row.partyId)).toEqual([
      "ironclad-uuid",
      "harborline-uuid",
      "northwind-uuid",
      "silver-uuid",
    ]);
    expect(four.find((row) => row.legalEntity.includes("Silver Mesa"))).toMatchObject({
      partyId: "silver-uuid",
      signerName: "Olivia Hart",
      email: "olivia.hart@silvermesaanalytics.com",
      role: "Analyst",
    });
  });

  it("does not use a hardcoded >=3 rule or review-link count to authorize signers", async () => {
    const twoPartyDraft = {
      parties: [
        { id: "harbor-uuid", name: "Harbor Peak Analytics LLC", role: "Consultant" },
        { id: "ironvale-uuid", name: "Ironvale Manufacturing Inc.", role: "Client" },
      ],
    };
    expect(shouldMintSignTokenForEveryRequiredParticipant(twoPartyDraft as never)).toBe(true);
    expect(requiredDirectSigningParticipantIds(twoPartyDraft as never)).toHaveLength(2);

    const ownerDraft = {
      parties: [
        { id: "harbor-uuid", name: "Harbor Peak Analytics LLC", role: "owner" },
        { id: "ironvale-uuid", name: "Ironvale Manufacturing Inc.", role: "reviewer" },
      ],
    };
    expect(shouldMintSignTokenForEveryRequiredParticipant(ownerDraft as never)).toBe(false);

    const get = await acceptedGet();
    const authorized = evaluateAcceptedSigningPreparation({
      requestedAgreementId: AGREEMENT_ID,
      persistedParties: SILVER_MESA_PARTIES,
      acceptedGet: get,
      reviewLinkCount: 1,
      reviewLinkPartyIds: ["review-link-only"],
    });
    expect(authorized.ok).toBe(true);
    if (!authorized.ok) return;
    expect(authorized.requiredParticipantIds).toHaveLength(4);
    expect(authorized.requiredParticipantIds).not.toContain("review-link-only");
  });

  it("fails closed for synthetic IDs, missing metadata, snapshot mismatch, and incomplete corpus", async () => {
    const get = await acceptedGet();
    expect(
      evaluateAcceptedSigningPreparation({
        requestedAgreementId: AGREEMENT_ID,
        persistedParties: SILVER_MESA_PARTIES.map((party, idx) =>
          idx === 3 ? { ...party, id: "party_3" } : party,
        ),
        acceptedGet: get,
      }).reason,
    ).toBe("synthetic_or_missing_participant_id");
    expect(
      evaluateAcceptedSigningPreparation({
        requestedAgreementId: AGREEMENT_ID,
        persistedParties: SILVER_MESA_PARTIES.map((party, idx) =>
          idx === 3 ? { ...party, signerName: "", email: "" } : party,
        ),
        acceptedGet: get,
      }).reason,
    ).toBe("missing_signer_metadata");
    expect(
      evaluateAcceptedSigningPreparation({
        requestedAgreementId: "ag-other",
        persistedParties: SILVER_MESA_PARTIES,
        acceptedGet: get,
      }).reason,
    ).toBe("agreement_id_mismatch");
    expect(
      evaluateAcceptedSigningPreparation({
        requestedAgreementId: AGREEMENT_ID,
        persistedParties: SILVER_MESA_PARTIES,
        acceptedGet: { ...get, corpus_sha256: "c".repeat(64) },
        expectedDigest: get.corpus_sha256,
      }).reason,
    ).toBe("digest_mismatch");
    expect(
      evaluateAcceptedSigningPreparation({
        requestedAgreementId: AGREEMENT_ID,
        persistedParties: SILVER_MESA_PARTIES,
        acceptedGet: { ...get, status: "pending" },
      }).reason,
    ).toBe("rejected_pending");
    expect(
      evaluateAcceptedSigningPreparation({
        requestedAgreementId: AGREEMENT_ID,
        persistedParties: SILVER_MESA_PARTIES,
        acceptedGet: { ...get, corpus_plain: "short", corpus_length: 5 },
      }).reason,
    ).toMatch(/missing_corpus|incomplete_packet_corpus|length_mismatch/);
  });

  it("reuses the same accepted snapshot identity and rejects a conflicting packet", () => {
    expect(
      shouldReuseAcceptedSigningAuthority({
        previousSnapshotId: SNAPSHOT_ID,
        previousDigest: "abc",
        nextSnapshotId: SNAPSHOT_ID,
        nextDigest: "abc",
      }),
    ).toBe(true);
    expect(
      shouldReuseAcceptedSigningAuthority({
        previousSnapshotId: SNAPSHOT_ID,
        previousDigest: "abc",
        nextSnapshotId: "crs-other",
        nextDigest: "abc",
      }),
    ).toBe(false);
    expect(persistedPartiesReadyForAcceptedSigning(SILVER_MESA_PARTIES)).toBe(true);
    expect(
      persistedPartiesReadyForAcceptedSigning(SILVER_MESA_PARTIES.map((party) => ({ ...party, id: "party_0" }))),
    ).toBe(false);
  });

  it("wires lock-and-mint and Prepare to persisted-party authority", () => {
    const lockInvite = readFileSync(join(__dirname, "paidProDirectSigningLockAndInvite.ts"), "utf8");
    expect(lockInvite).toContain("evaluateAcceptedSigningPreparation");
    expect(lockInvite).not.toContain("namedLegal >= 3");
    const intake = readFileSync(
      join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"),
      "utf8",
    );
    expect(intake).toContain("persistedPartiesReadyForAcceptedSigning");
    expect(intake).toContain("evaluateAcceptedSigningPreparation");
  });
});
