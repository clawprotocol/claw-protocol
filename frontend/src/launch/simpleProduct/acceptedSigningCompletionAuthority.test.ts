/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import {
  isAllSignersCompletedFromAudit,
  pendingSignatureCount,
} from "../../agreement/pendingSignatureDerive";
import {
  completionProgressFromPersistedParticipants,
  evaluateAcceptedCompletionReceipt,
  evaluateAcceptedSignatureAttempt,
  requiredCompletionParticipants,
  requiredSignerPartiesFromDraft,
  type AcceptedSigningParticipant,
} from "./acceptedSigningCompletionAuthority";
import type { PersistedSigningParty } from "./acceptedSigningPreparationAuthority";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGREEMENT_ID = "ag-silver-mesa-complete";
const SNAPSHOT_ID = "crs-silver-mesa-complete";
const DIGEST = "a".repeat(64);
const CORPUS = [
  "JOINT AI SOFTWARE ROLLOUT AGREEMENT",
  'Ironclad Systems Group LLC ("Sponsor"), Harborline Data Solutions Inc. ("Vendor"), Northwind Automation Partners LLC ("Integrator"), and Silver Mesa Analytics LP ("Analyst").',
  "Fee $187,500. Term 24 months. Texas law. Austin ZIP 78701.",
  "If to Silver Mesa Analytics LP: Email: notices@silvermesaanalytics.com.",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "Ironclad Systems Group LLC\nBy: ______________________\nName: Ethan Cole",
  "Harborline Data Solutions Inc.\nBy: ______________________\nName: Maya Bennett",
  "Northwind Automation Partners LLC\nBy: ______________________\nName: Lucas Reed",
  "Silver Mesa Analytics LP\nBy: ______________________\nName: Olivia Hart",
  "Operative commercial paragraph continues the same four-party Texas rollout. ".repeat(40),
].join("\n");

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

function twoParty(): PersistedSigningParty[] {
  return [
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
  ];
}

function threeParty(): PersistedSigningParty[] {
  return [
    ...twoParty(),
    {
      id: "alex-uuid",
      name: "Alex Rivera",
      role: "Advisor",
      signerName: "Alex Rivera",
      email: "alex.rivera@advisor.test",
    },
  ];
}

function attempt(overrides?: Partial<Parameters<typeof evaluateAcceptedSignatureAttempt>[0]>) {
  const required = requiredCompletionParticipants(SILVER_MESA_PARTIES).map((row) => row.partyId);
  return evaluateAcceptedSignatureAttempt({
    tokenMode: "sign",
    tokenPartyId: "silver-uuid",
    targetPartyId: "silver-uuid",
    signedParticipantIds: [],
    requiredParticipantIds: required,
    agreementId: AGREEMENT_ID,
    tokenAgreementId: AGREEMENT_ID,
    acceptedSnapshotId: SNAPSHOT_ID,
    acceptedDigest: DIGEST,
    lockSnapshotId: SNAPSHOT_ID,
    lockDigest: DIGEST,
    packetSnapshotId: SNAPSHOT_ID,
    packetDigest: DIGEST,
    packetCorpus: CORPUS,
    ...overrides,
  });
}

function receipt(overrides?: Partial<Parameters<typeof evaluateAcceptedCompletionReceipt>[0]>) {
  return evaluateAcceptedCompletionReceipt({
    parties: SILVER_MESA_PARTIES,
    signedParticipantIds: SILVER_MESA_PARTIES.map((party) => String(party.id)),
    acceptedSnapshotId: SNAPSHOT_ID,
    acceptedDigest: DIGEST,
    lockSnapshotId: SNAPSHOT_ID,
    lockDigest: DIGEST,
    packetSnapshotId: SNAPSHOT_ID,
    packetDigest: DIGEST,
    ...overrides,
  });
}

function draftFromParties(
  parties: PersistedSigningParty[],
  signedIds: string[] = [],
): AgreementDraft {
  return {
    id: AGREEMENT_ID,
    title: "Joint AI Software Rollout Agreement",
    jurisdiction: "TX",
    parties: parties.map((party) => ({
      id: party.id,
      name: String(party.name),
      role: String(party.role),
      email: party.email,
      signerName: party.signerName,
    })),
    purpose: "rollout",
    payment_terms: "$187,500",
    duration: "24 months",
    due_date: null,
    effective_date: null,
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
    versions: [{ version: 1, created_at: "2026-09-18T00:00:00.000Z" }],
    audit_log: signedIds.map((id) => ({
      event_type: "signature_completed",
      at: "2026-09-18T00:00:00.000Z",
      field: "signing",
      value: { participant_id: id },
    })),
  };
}

describe("accepted signing completion authority", () => {
  it("derives two-, three-, and four-party completion counts from persisted required participants", () => {
    const two = requiredCompletionParticipants(twoParty());
    expect(two.map((row: AcceptedSigningParticipant) => row.partyId)).toEqual([
      "harbor-uuid",
      "ironvale-uuid",
    ]);
    expect(completionProgressFromPersistedParticipants({ parties: twoParty(), signedParticipantIds: [] })).toEqual(
      expect.objectContaining({ requiredCount: 2, signedCount: 0, complete: false }),
    );
    expect(
      completionProgressFromPersistedParticipants({
        parties: twoParty(),
        signedParticipantIds: ["harbor-uuid", "ironvale-uuid"],
      }).complete,
    ).toBe(true);

    const three = completionProgressFromPersistedParticipants({
      parties: threeParty(),
      signedParticipantIds: ["harbor-uuid", "ironvale-uuid"],
    });
    expect(three.requiredCount).toBe(3);
    expect(three.complete).toBe(false);

    const four = completionProgressFromPersistedParticipants({
      parties: SILVER_MESA_PARTIES,
      signedParticipantIds: ["silver-uuid", "ironclad-uuid", "harborline-uuid"],
    });
    expect(four.requiredCount).toBe(4);
    expect(four.signedCount).toBe(3);
    expect(four.complete).toBe(false);
    expect(four.requiredParticipantIds).toEqual([
      "ironclad-uuid",
      "harborline-uuid",
      "northwind-uuid",
      "silver-uuid",
    ]);
    expect(requiredSignerPartiesFromDraft(SILVER_MESA_PARTIES as never).map((party) => party.id)).toEqual(
      four.requiredParticipantIds,
    );
  });

  it("does not treat a hardcoded four-party threshold or role===signer as authority", () => {
    const source = readFileSync(join(__dirname, "acceptedSigningCompletionAuthority.ts"), "utf8");
    expect(source).not.toMatch(/requiredCount\s*>=\s*[234]|===\s*[234]|>=\s*3|hardcoded/);
    expect(source).toContain("requiredSignersFromPersistedParties");
    const derive = readFileSync(join(__dirname, "../../agreement/pendingSignatureDerive.ts"), "utf8");
    expect(derive).toContain("requiredSignerPartiesFromDraft");
    expect(derive).toContain("const signers = requiredSignerParties(draft)");
    expect(derive).toContain("const signerParties = requiredSignerParties(args.draft)");
    expect(derive).not.toMatch(/signers\.length\s*>=\s*3|pending\s*===\s*[234]/);
  });

  it("excludes parties marked as not requiring signature and synthetic IDs", () => {
    const withNoticeOnly = [
      ...twoParty(),
      {
        id: "notice-uuid",
        name: "Notice Desk LLC",
        role: "reviewer",
        signerName: "Notice Desk",
        email: "notices@harborpeak.test",
        requiresSignature: false,
      },
      { id: "party_3", name: "Synthetic Slot", role: "Advisor", signerName: "No One", email: "none@example.test" },
    ];
    const required = requiredCompletionParticipants(withNoticeOnly);
    expect(required.map((row) => row.partyId)).toEqual(["harbor-uuid", "ironvale-uuid"]);
    expect(
      completionProgressFromPersistedParticipants({
        parties: withNoticeOnly,
        signedParticipantIds: ["harbor-uuid", "ironvale-uuid", "notice-uuid"],
      }),
    ).toEqual(
      expect.objectContaining({
        requiredCount: 2,
        signedCount: 2,
        complete: true,
        signedRequiredIds: ["harbor-uuid", "ironvale-uuid"],
      }),
    );
  });

  it("keeps Consultant/Client and three-party order without rewriting roles", () => {
    const two = requiredCompletionParticipants(twoParty());
    expect(two.map((row) => ({ role: row.role, signerName: row.signerName, email: row.email }))).toEqual([
      { role: "Consultant", signerName: "Pat Harbor", email: "pat.harbor@harbor.test" },
      { role: "Client", signerName: "Sam Ironvale", email: "sam.ironvale@ironvale.test" },
    ]);
    const reversed = requiredCompletionParticipants([...twoParty()].reverse());
    expect(reversed.map((row) => row.partyId)).toEqual(["ironvale-uuid", "harbor-uuid"]);
    expect(reversed.map((row) => row.role)).toEqual(["Client", "Consultant"]);
    const three = requiredCompletionParticipants(threeParty());
    expect(three.map((row) => row.role)).toEqual(["Consultant", "Client", "Advisor"]);
    expect(three.map((row) => row.partyId)).toEqual(["harbor-uuid", "ironvale-uuid", "alex-uuid"]);
  });

  it("issues a receipt only after every persisted required party has signed", () => {
    expect(
      receipt({ parties: twoParty(), signedParticipantIds: ["harbor-uuid"] }).reason,
    ).toBe("receipt_before_all_required");
    expect(
      receipt({
        parties: twoParty(),
        signedParticipantIds: ["harbor-uuid", "ironvale-uuid"],
      }).ok,
    ).toBe(true);
    expect(
      receipt({ parties: threeParty(), signedParticipantIds: ["harbor-uuid"] }).reason,
    ).toBe("receipt_before_all_required");
    expect(
      receipt({
        parties: threeParty(),
        signedParticipantIds: ["harbor-uuid", "ironvale-uuid"],
      }).reason,
    ).toBe("receipt_before_all_required");
    expect(
      receipt({
        parties: threeParty(),
        signedParticipantIds: ["harbor-uuid", "ironvale-uuid", "alex-uuid"],
      }).ok,
    ).toBe(true);
  });

  it("counts commercial Silver Mesa roles on the pending/complete surfaces", () => {
    const afterOlivia = draftFromParties(SILVER_MESA_PARTIES, ["silver-uuid"]);
    expect(pendingSignatureCount({ draft: afterOlivia, agreementFullySigned: false })).toEqual({
      pending: 3,
      total: 4,
    });
    expect(isAllSignersCompletedFromAudit(afterOlivia)).toBe(false);
    const complete = draftFromParties(
      SILVER_MESA_PARTIES,
      SILVER_MESA_PARTIES.map((party) => String(party.id)),
    );
    expect(pendingSignatureCount({ draft: complete, agreementFullySigned: false })).toEqual({
      pending: 0,
      total: 4,
    });
    expect(isAllSignersCompletedFromAudit(complete)).toBe(true);
  });

  it("fails closed when a token tries to sign another participant's block", () => {
    expect(
      attempt({ tokenPartyId: "silver-uuid", targetPartyId: "ironclad-uuid" }).reason,
    ).toBe("token_cannot_sign_other_party");
  });

  it("fails closed on sign-token replay", () => {
    expect(attempt({ signedParticipantIds: ["silver-uuid"] }).reason).toBe("sign_token_replay");
  });

  it("fails closed when a review token is used on a signing endpoint", () => {
    expect(attempt({ tokenMode: "review" }).reason).toBe("review_token_cannot_sign");
  });

  it("fails closed when a receipt is attempted before all required parties sign", () => {
    expect(
      receipt({ signedParticipantIds: ["silver-uuid", "ironclad-uuid", "harborline-uuid"] }).reason,
    ).toBe("receipt_before_all_required");
    expect(receipt().ok).toBe(true);
  });

  it("fails closed on packet/snapshot/digest mismatch and incomplete packet structure", () => {
    expect(attempt({ packetDigest: "b".repeat(64) }).reason).toBe("snapshot_digest_mismatch");
    expect(attempt({ lockSnapshotId: "crs-other" }).reason).toBe("snapshot_digest_mismatch");
    expect(attempt({ packetCorpus: "short" }).reason).toBe("incomplete_packet");
    expect(attempt({ packetCorpus: `${"x".repeat(400)}\nNo witness` }).reason).toBe("missing_signature_block");
    expect(
      attempt({
        packetCorpus: `${"x".repeat(400)}\nIN WITNESS WHEREOF\nSilver Mesa Analytics LP`,
      }).reason,
    ).toBe("missing_by_structure");
    expect(receipt({ packetSnapshotId: "crs-other" }).reason).toBe("snapshot_digest_mismatch");
  });

  it("fails closed for missing durable IDs, wrong agreement, and name/email-only binding", () => {
    expect(attempt({ tokenPartyId: "party_3", targetPartyId: "party_3" }).reason).toBe(
      "missing_durable_participant_id",
    );
    expect(attempt({ tokenAgreementId: "ag-other" }).reason).toBe("wrong_agreement");
    expect(attempt({ requiredParticipantIds: [] }).reason).toBe("missing_required_signers");
    expect(attempt().ok).toBe(true);
    if (attempt().ok) expect(attempt().participantId).toBe("silver-uuid");
  });

  it("wires recipient ceremony complete to persisted-party completion authority", () => {
    const review = readFileSync(join(__dirname, "../../agreement/AgreementRecipientReview.tsx"), "utf8");
    expect(review).toContain("evaluateAcceptedSignatureAttempt");
    expect(review).toContain("requiredCompletionParticipants");
  });

  it("exposes Agree and sign on both desktop and mobile without a desktop-only-only path", () => {
    const review = readFileSync(join(__dirname, "../../agreement/AgreementRecipientReview.tsx"), "utf8");
    expect(review).toMatch(/className="hidden sm:block"[\s\S]*data-testid="recipient-sign-action"/);
    expect(review).toMatch(/sm:hidden[\s\S]*data-testid="recipient-sign-action"/);
    const handlers = review.match(/onClick=\{\(\) => void handleRecordSignature\(\)\}/g) || [];
    expect(handlers.length).toBeGreaterThanOrEqual(2);
    expect(review).not.toMatch(/data-testid="recipient-sign-action"[\s\S]{0,120}hidden md:flex/);
    expect(review).not.toMatch(/lg:only|desktop-only-sign/);
  });
});
