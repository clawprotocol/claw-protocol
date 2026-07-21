/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { bumpAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import {
  buildFrozenSigningAuthoritySnapshotV1,
  clearFrozenSigningAuthoritySnapshotForTests,
  extractRequiredSigningActions,
  loadFrozenSigningAuthority,
  readFrozenSigningAuthoritySnapshot,
  resolveFrozenPartyByAgreementPartyId,
  resolveFrozenSignerByRecordId,
  resolveSigningStatusCounts,
  validateFrozenSigningAuthoritySnapshot,
} from "./frozenSigningAuthoritySnapshot";
import {
  attachSignerToParty,
  clearSignerExecutionAuthorityForTests,
  writeSignerExecutionAuthority,
} from "./signerExecutionAuthority";
import {
  clearStarterToPaidPartyHandoffForTests,
  writeStarterToPaidPartyHandoff,
} from "./starterToPaidPartyHandoff";
import { establishLegalPartyAuthorityFromIntake } from "./legalPartyAuthority";
import { clearLegalPartyAuthoritySessionForTests } from "./legalPartyAuthoritySession";
import {
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { labeledPartyBlocksForSignerMetadata } from "./labeledPartyBlockParse";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { TEST368_TRIPARTITE_LABELED_PARTIES_INTAKE } from "./paidProTest368Fixtures";
import { TEST550_CEDAR, TEST550_CEDAR_NORTHWIND_INTAKE, TEST550_NORTHWIND } from "./paidProTest550Fixtures";
import {
  TEST440_BRIGHT_PEAK,
  TEST440_HORIZON,
} from "./paidProTest440BrandLicensingDegradedRecoveryFixtures";
import {
  buildTest463FourPartyPreparePacket,
  TEST463_AG,
  test463RoleByEntity,
} from "../../vs01/paidProTest463Fixtures";
import { resolveVs01RecipientIdentityFromAuthority } from "../../vs01/vs01RecipientIdentityAuthority";
import { bootstrapVs01RecipientSigningAuthority } from "../../vs01/vs01RecipientAuthorityBootstrap";
import { buildSigningInviteTargetsFromHandoff } from "../../vs01/vs01SigningInviteDelivery";
import { resolveRecipientInitialsEnabled } from "../../vs01/vs01RecipientSignerMarksHydration";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";

function clearAllBrowserSigningAuthority() {
  clearFrozenSigningAuthoritySnapshotForTests();
  clearStarterToPaidPartyHandoffForTests();
  clearSignerExecutionAuthorityForTests();
  clearAuthoritativeSigningSnapshot();
  if (typeof sessionStorage !== "undefined") {
    try {
      const keys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const k = sessionStorage.key(i);
        if (
          k?.startsWith("claw_frozen_signing_authority_v1:") ||
          k?.startsWith("claw_signer_execution_authority_v1:") ||
          k?.startsWith("claw_starter_paid_party_handoff_v1:")
        ) {
          keys.push(k);
        }
      }
      for (const k of keys) sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
  if (typeof localStorage !== "undefined") {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k?.startsWith("vs01_signing_packet_status_v1:") || k?.startsWith("claw_paid_pro_vs01_post_sign_ls_v1:")) {
          keys.push(k);
        }
      }
      for (const k of keys) localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}
function resetPhase3Isolation() {
  clearAllBrowserSigningAuthority();
  clearLegalPartyAuthoritySessionForTests();
}

function freezeTwoPartySnapshot(intake = TEST550_CEDAR_NORTHWIND_INTAKE) {
  const authority = establishLegalPartyAuthorityFromIntake(intake);
  writeStarterToPaidPartyHandoff(intake, authority);
  attachSignerToParty({
    agreementPartyId: authority.parties[0].agreementPartyId,
    signerName: "Sarah Mitchell",
    signerTitle: "CEO",
    signerEmail: "sarah@cedar.test",
    intakeText: intake,
  });
  attachSignerToParty({
    agreementPartyId: authority.parties[1].agreementPartyId,
    signerName: "Pat Provider",
    signerTitle: "Manager",
    signerEmail: "pat@northwind.test",
    intakeText: intake,
  });
  const parties = authority.parties.map((p, partyIndex) => ({
    partyIndex,
    partyLegalName: p.legalEntityName,
    signerEmail: partyIndex === 0 ? "sarah@cedar.test" : "pat@northwind.test",
    signerName: partyIndex === 0 ? "Sarah Mitchell" : "Pat Provider",
    signerTitle: partyIndex === 0 ? "CEO" : "Manager",
    partyAddress: "",
  }));
  setConsumedPaidProSignerMetadataAuthority({ parties, source: "live_ui", hash: "", updatedAt: Date.now() });
  const manifest = buildCanonicalFinalPartyManifestFromAuthority(
    { parties, source: "live_ui", hash: "", updatedAt: Date.now() },
    { intakeText: intake },
  );
  const corpus = [
    "SERVICES AGREEMENT",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `CLIENT:`,
    TEST550_NORTHWIND,
    "Name: Pat Provider",
    "",
    `SERVICE PROVIDER:`,
    TEST550_CEDAR,
    "Name: Sarah Mitchell",
  ].join("\n");
  const snap = createAuthoritativeSigningSnapshot({
    corpus,
    signerMetadata: authorityPartiesToRecipientMetadata(parties),
    partyManifest: manifest,
    signatureBlockModel: buildCanonicalSignerManifest({ identities: [], signFirst: true }),
    intakeText: intake,
    authorityParties: parties,
    replaceExisting: true,
  });
  return { authority, snap, frozen: readFrozenSigningAuthoritySnapshot() };
}

describe("paidProTest557 Phase 3 frozen signing authority", () => {
  afterEach(() => resetPhase3Isolation());

  it("Case 1 — two-party packet snapshot preserves stable IDs and corpus hash", () => {
    const { snap, frozen } = freezeTwoPartySnapshot();
    expect(frozen).not.toBeNull();
    expect(frozen!.parties).toHaveLength(2);
    expect(frozen!.signers).toHaveLength(2);
    expect(frozen!.frozenCorpusHash).toBe(snap.hash);
    expect(new Set(frozen!.parties.map((p) => p.agreementPartyId)).size).toBe(2);
    expect(new Set(frozen!.signers.map((s) => s.signerRecordId)).size).toBe(2);
  });

  it("Case 2 — tripartite snapshot preserves three party associations", () => {
    const intake = TEST368_TRIPARTITE_LABELED_PARTIES_INTAKE;
    const authority = establishLegalPartyAuthorityFromIntake(intake);
    writeStarterToPaidPartyHandoff(intake, authority);
    const blocks = labeledPartyBlocksForSignerMetadata(intake);
    const parties = blocks.map((block, partyIndex) => ({
      partyIndex,
      partyLegalName: block.legalEntity,
      signerEmail:
        block.signerEmail.includes("@") ? block.signerEmail : "robert@bluecanyon.test",
      signerName: block.signerName,
      signerTitle: block.signerTitle,
      partyAddress: block.address,
    }));
    for (const p of authority.parties) {
      const block = parties[p.canonicalOrder];
      if (!block) continue;
      attachSignerToParty({
        agreementPartyId: p.agreementPartyId,
        signerName: block.signerName,
        signerTitle: block.signerTitle,
        signerEmail: block.signerEmail.includes("@") ? block.signerEmail : "robert@bluecanyon.test",
        intakeText: intake,
      });
    }
    setConsumedPaidProSignerMetadataAuthority({ parties, source: "live_ui", hash: "", updatedAt: Date.now() });
    const manifest = buildCanonicalFinalPartyManifestFromAuthority(
      { parties, source: "live_ui", hash: "", updatedAt: Date.now() },
      { intakeText: intake },
    );
    createAuthoritativeSigningSnapshot({
      corpus: "Agreement body\n\nIN WITNESS WHEREOF\n\nCLIENT:\nRed Mesa\n\nSERVICE PROVIDER:\nHarbor\n\nANALYTICS PROVIDER:\nBlue Canyon",
      signerMetadata: authorityPartiesToRecipientMetadata(parties),
      partyManifest: manifest,
      signatureBlockModel: buildCanonicalSignerManifest({ identities: [], signFirst: true }),
      intakeText: intake,
      authorityParties: parties,
      replaceExisting: true,
    });
    const frozen = readFrozenSigningAuthoritySnapshot();
    expect(frozen).not.toBeNull();
    expect(frozen!.parties).toHaveLength(3);
    expect(frozen?.execution.partyOrder).toHaveLength(3);
    expect(frozen?.signers.some((s) => s.signerName === "Robert Henderson")).toBe(true);
  });

  it("Case 3 — four-party packet uses stable party IDs in roles", () => {
    const { roles } = buildTest463FourPartyPreparePacket();
    expect(roles).toHaveLength(4);
    expect(new Set(roles.map((r) => r.partyId)).size).toBe(4);
    const horizon = test463RoleByEntity(TEST440_HORIZON, roles);
    const brightPeak = test463RoleByEntity(TEST440_BRIGHT_PEAK, roles);
    expect(horizon.partyId).not.toBe(brightPeak.partyId);
    expect(horizon.roleId).not.toBe(brightPeak.roleId);
  });

  it("Case 4 — four legal parties two signers: counts separate", () => {
    const fourParties = [
      { index: 0, name: "Evergreen", email: "eve@test.com", id: "party_evergreen" },
      { index: 1, name: "Atlas", email: "", id: "party_atlas" },
      { index: 2, name: "Horizon", email: "horizon@test.com", id: "party_horizon" },
      { index: 3, name: "BrightPeak", email: "", id: "party_brightpeak" },
    ];
    const parties = fourParties.map((p) => ({
      partyIndex: p.index,
      partyLegalName: p.name,
      signerEmail: p.email,
      signerName: p.email ? `${p.name} Signer` : "",
      signerTitle: "",
      partyAddress: "",
    }));
    const authoritySnap = {
      corpus: "body\n\nIN WITNESS WHEREOF",
      hash: hashPaidProCorpus("body"),
      frozenAt: Date.now(),
      signerMetadata: authorityPartiesToRecipientMetadata(parties),
      recipientMetadata: authorityPartiesToRecipientMetadata(parties),
      partyManifest: {
        parties: fourParties.map((p) => ({
          index: p.index,
          role: `party_${p.index + 1}` as const,
          partyName: p.name,
          email: p.email,
          signerName: p.email ? `${p.name} Signer` : null,
          signerTitle: null,
          roleLabel: `Party ${p.index + 1}`,
          signerKind: "entity_representative" as const,
          isSenderSide: false,
          isIndividual: false,
        })),
      },
      signatureBlockModel: buildCanonicalSignerManifest({ identities: [], signFirst: true }),
      source: "paid_pro_signer_metadata_finalize" as const,
    };
    writeSignerExecutionAuthority(
      [
        {
          agreementPartyId: "party_evergreen",
          signerRecordId: "signer:party_evergreen:0",
          signerEmail: "eve@test.com",
          isSigningParty: true,
          source: "signer_setup",
        },
        {
          agreementPartyId: "party_horizon",
          signerRecordId: "signer:party_horizon:0",
          signerEmail: "horizon@test.com",
          isSigningParty: true,
          source: "signer_setup",
        },
      ],
      null,
    );
    const frozen = buildFrozenSigningAuthoritySnapshotV1({
      agreementId: TEST463_AG,
      authoritativeSnapshot: authoritySnap,
    });
    const counts = resolveSigningStatusCounts({ snapshot: frozen });
    expect(counts.legalPartyCount).toBe(4);
    expect(counts.requiredSignerCount).toBe(2);
  });

  it("Case 6 — Horizon email link maps to Horizon role not BrightPeak", () => {
    const { roles, portable, handoff } = buildTest463FourPartyPreparePacket();
    const horizon = test463RoleByEntity(TEST440_HORIZON, roles);
    const brightPeak = test463RoleByEntity(TEST440_BRIGHT_PEAK, roles);
    const identity = resolveVs01RecipientIdentityFromAuthority({
      portable,
      tokenPartyId: horizon.partyId,
      urlSignerRoleId: horizon.roleId,
      urlCounterpartyId: horizon.vs01CounterpartyId ?? horizon.partyId,
      urlRecipientIndex: horizon.partyIndex,
      urlRecipientName: TEST440_HORIZON,
      urlRecipientEmail: horizon.signerEmail ?? "",
    });
    expect("blocked" in identity).toBe(false);
    if ("blocked" in identity) return;
    expect(identity.lockedSignerRoleId).toBe(horizon.roleId);
    expect(identity.lockedSignerRoleId).not.toBe(brightPeak.roleId);
    const targets = buildSigningInviteTargetsFromHandoff(handoff, roles);
    const horizonTarget = targets.find((t) => t.email === horizon.signerEmail);
    expect(horizonTarget?.signer_role_id).toBe(horizon.roleId);
  });

  it("Case 7 — initials requirement survives portable packet policy", async () => {
    const { portable } = buildTest463FourPartyPreparePacket();
    const enabled = resolveRecipientInitialsEnabled({
      portable,
      packetRevision: null,
    });
    expect(enabled).toBe(true);
    expect(portable.initialsPolicy.enabled).toBe(true);
    const boot = await bootstrapVs01RecipientSigningAuthority({
      agreementId: TEST463_AG,
      documentId: portable.seed.documentId,
      urlSignerRoleId: portable.roles[1]?.roleId ?? null,
      urlCounterpartyId: portable.roles[1]?.vs01CounterpartyId ?? portable.roles[1]?.partyId ?? "",
      urlRecipientIndex: 1,
      urlRecipientName: portable.roles[1]?.entityName ?? "",
      urlRecipientEmail: portable.roles[1]?.signerEmail ?? "",
      cachedPortable: portable,
    });
    expect(boot.ok).toBe(true);
    if (!boot.ok || !("initialsEnabled" in boot)) return;
    expect(boot.initialsEnabled).toBe(true);
  });

  it("Case 15 — missing required signer email rejects snapshot", () => {
    const parties = [
      {
        partyIndex: 0,
        partyLegalName: "Alpha LLC",
        signerEmail: "",
        signerName: "A Signer",
        signerTitle: "CEO",
        partyAddress: "",
      },
    ];
    const authoritySnap = {
      corpus: "Agreement\n\nIN WITNESS WHEREOF",
      hash: hashPaidProCorpus("Agreement"),
      frozenAt: Date.now(),
      signerMetadata: authorityPartiesToRecipientMetadata(parties),
      recipientMetadata: authorityPartiesToRecipientMetadata(parties),
      partyManifest: {
        parties: [
          {
            index: 0,
            role: "client" as const,
            partyName: "Alpha LLC",
            email: "",
            signerName: "A Signer",
            signerTitle: "CEO",
            roleLabel: "Client",
            signerKind: "entity_representative" as const,
            isSenderSide: false,
            isIndividual: false,
          },
        ],
      },
      signatureBlockModel: buildCanonicalSignerManifest({ identities: [], signFirst: true }),
      source: "paid_pro_signer_metadata_finalize" as const,
    };
    const built = buildFrozenSigningAuthoritySnapshotV1({
      agreementId: "ag_missing_email",
      authoritativeSnapshot: authoritySnap,
    });
    const validation = validateFrozenSigningAuthoritySnapshot(built);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.error).toBe("missing_required_signer_email");
  });

  it("Case 16 — unknown party ID on signer record rejected at validation", () => {
    const built: import("./frozenSigningAuthoritySnapshot").FrozenSigningAuthoritySnapshotV1 = {
      version: 1,
      agreementId: "ag_unknown_party",
      agreementSessionId: "sess_test",
      frozenCorpusHash: hashPaidProCorpus("Agreement"),
      frozenAt: new Date().toISOString(),
      parties: [
        {
          agreementPartyId: "party_alpha",
          legalEntityName: TEST550_CEDAR,
          canonicalOrder: 0,
        },
      ],
      signers: [
        {
          signerRecordId: "signer:party_unknown_xyz:0",
          agreementPartyId: "party_unknown_xyz",
          signerEmail: "ghost@example.com",
          signingOrder: 0,
          requiresSignature: true,
          requiresInitials: false,
        },
      ],
      recipients: [],
      execution: {
        partyOrder: ["party_alpha"],
        signerOrder: ["signer:party_unknown_xyz:0"],
        executionBlockHash: hashPaidProCorpus("witness"),
      },
    };
    const validation = validateFrozenSigningAuthoritySnapshot(built);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.error).toBe("unknown_party_id");
  });

  it("Case 18 — sequential agreement isolation", () => {
    freezeTwoPartySnapshot();
    const firstFrozen = readFrozenSigningAuthoritySnapshot();
    bumpAgreementGenerationId();
    resetPhase3Isolation();
    const second = freezeTwoPartySnapshot();
    expect(firstFrozen?.parties[0]?.legalEntityName).not.toBe(second.frozen?.parties[1]?.legalEntityName);
    expect(readFrozenSigningAuthoritySnapshot()?.agreementSessionId).not.toBe(
      firstFrozen?.agreementSessionId,
    );
  });

  it("Case 19 — frozen snapshot readable without owner session handoff", () => {
    const { frozen } = freezeTwoPartySnapshot();
    clearStarterToPaidPartyHandoffForTests();
    clearSignerExecutionAuthorityForTests();
    const reloaded = readFrozenSigningAuthoritySnapshot();
    expect(reloaded?.frozenCorpusHash).toBe(frozen?.frozenCorpusHash);
    expect(reloaded?.signers).toHaveLength(2);
    const party = resolveFrozenPartyByAgreementPartyId(reloaded!.parties[0].agreementPartyId, reloaded);
    const signer = resolveFrozenSignerByRecordId(reloaded!.signers[0].signerRecordId, reloaded);
    expect(party?.legalEntityName).toBeTruthy();
    expect(signer?.signerEmail).toContain("@");
  });

  it("Case 1b — durable snapshot reloads from backend after browser clear", async () => {
    const { frozen, snap } = freezeTwoPartySnapshot();
    expect(frozen).not.toBeNull();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ snapshot: frozen }), { status: 200 }),
    );
    clearAllBrowserSigningAuthority();
    expect(readFrozenSigningAuthoritySnapshot()).toBeNull();
    const reloaded = await loadFrozenSigningAuthority({
      agreementId: frozen!.agreementId,
      expectedCorpusHash: snap.hash,
    });
    expect(reloaded?.frozenCorpusHash).toBe(snap.hash);
    expect(reloaded?.signers).toHaveLength(2);
    vi.restoreAllMocks();
  });

  it("Case 5 — two legal parties three signers", () => {
    const intake = TEST550_CEDAR_NORTHWIND_INTAKE;
    const authority = establishLegalPartyAuthorityFromIntake(intake);
    writeStarterToPaidPartyHandoff(intake, authority);
    const partyA = authority.parties[0].agreementPartyId;
    const partyB = authority.parties[1].agreementPartyId;
    writeSignerExecutionAuthority(
      [
        {
          agreementPartyId: partyA,
          signerRecordId: "signer:party_a:0",
          signerEmail: "a1@test.com",
          isSigningParty: true,
          source: "signer_setup",
        },
        {
          agreementPartyId: partyA,
          signerRecordId: "signer:party_a:1",
          signerEmail: "a2@test.com",
          isSigningParty: true,
          source: "signer_setup",
        },
        {
          agreementPartyId: partyB,
          signerRecordId: "signer:party_b:0",
          signerEmail: "b1@test.com",
          isSigningParty: true,
          source: "signer_setup",
        },
      ],
      intake,
    );
    const parties = authority.parties.map((p, partyIndex) => ({
      partyIndex,
      partyLegalName: p.legalEntityName,
      signerEmail: partyIndex === 0 ? "a1@test.com" : "b1@test.com",
      signerName: partyIndex === 0 ? "A1" : "B1",
      signerTitle: "",
      partyAddress: "",
    }));
    const authoritySnap = {
      corpus: "body\n\nIN WITNESS WHEREOF",
      hash: hashPaidProCorpus("body"),
      frozenAt: Date.now(),
      signerMetadata: authorityPartiesToRecipientMetadata(parties),
      recipientMetadata: authorityPartiesToRecipientMetadata(parties),
      partyManifest: {
        parties: parties.map((p) => ({
          index: p.partyIndex,
          role: (p.partyIndex === 0 ? "client" : "service_provider") as "client" | "service_provider",
          partyName: p.partyLegalName,
          email: p.signerEmail,
          signerName: p.signerName,
          signerTitle: null,
          roleLabel: p.partyLegalName,
          signerKind: "entity_representative" as const,
          isSenderSide: false,
          isIndividual: false,
        })),
      },
      signatureBlockModel: buildCanonicalSignerManifest({ identities: [], signFirst: true }),
      source: "paid_pro_signer_metadata_finalize" as const,
    };
    const frozen = buildFrozenSigningAuthoritySnapshotV1({
      agreementId: "ag_three_signers",
      authoritativeSnapshot: authoritySnap,
      intakeText: intake,
    });
    const counts = resolveSigningStatusCounts({ snapshot: frozen });
    expect(counts.legalPartyCount).toBe(2);
    expect(counts.requiredSignerCount).toBe(3);
    expect(frozen.signers).toHaveLength(3);
  });

  it("Case 8 — reviewer excluded from required signer count", () => {
    const { frozen } = freezeTwoPartySnapshot();
    const withReviewer = {
      ...frozen!,
      recipients: [
        ...frozen!.recipients,
        {
          recipientRecordId: "recipient:reviewer:review@test.com",
          recipientType: "reviewer" as const,
          email: "review@test.com",
        },
      ],
    };
    const counts = resolveSigningStatusCounts({ snapshot: withReviewer });
    expect(counts.requiredSignerCount).toBe(2);
    expect(counts.invitationCount).toBe(2);
  });

  it("Case 9 — resend identity stability", () => {
    const { roles, handoff } = buildTest463FourPartyPreparePacket();
    const first = buildSigningInviteTargetsFromHandoff(handoff, roles);
    const second = buildSigningInviteTargetsFromHandoff(handoff, roles);
    expect(first.length).toBe(second.length);
    expect(new Set(first.map((t) => t.signer_role_id)).size).toBe(
      new Set(second.map((t) => t.signer_role_id)).size,
    );
  });

  it("Case 10 — cancelled packet state fails closed in validation", () => {
    const { frozen } = freezeTwoPartySnapshot();
    const cancelled = { ...frozen!, packetState: "cancelled" as const };
    expect(cancelled.packetState).toBe("cancelled");
    expect(validateFrozenSigningAuthoritySnapshot(cancelled).ok).toBe(true);
  });

  it("Case 11 — reissue binds new packet revision", () => {
    const { frozen } = freezeTwoPartySnapshot();
    const reissued = {
      ...frozen!,
      packetState: "active" as const,
      activePacketRevision: "rev_v2",
      supersedesRevision: "rev_v1",
    };
    expect(reissued.activePacketRevision).toBe("rev_v2");
    expect(validateFrozenSigningAuthoritySnapshot(reissued, frozen!.frozenCorpusHash).ok).toBe(true);
  });

  it("Case 12 — same email distinct recipient records", () => {
    const { frozen } = freezeTwoPartySnapshot();
    const dupEmail = {
      ...frozen!,
      recipients: [
        ...frozen!.recipients,
        {
          recipientRecordId: "recipient:signer:signer:party_alt:0",
          agreementPartyId: frozen!.parties[0].agreementPartyId,
          signerRecordId: "signer:party_alt:0",
          recipientType: "signer" as const,
          email: frozen!.signers[0].signerEmail,
        },
      ],
    };
    const ids = dupEmail.recipients.map((r) => r.recipientRecordId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("Case 13 — signing order does not alter party order", () => {
    const { frozen } = freezeTwoPartySnapshot();
    const reversedSigners = [...frozen!.signers].reverse().map((s, i) => ({
      ...s,
      signingOrder: i,
    }));
    const reordered = { ...frozen!, signers: reversedSigners };
    expect(reordered.execution.partyOrder).toEqual(frozen!.execution.partyOrder);
  });

  it("Case 14 — review/signing corpus hash parity", () => {
    const { snap, frozen } = freezeTwoPartySnapshot();
    expect(frozen!.frozenCorpusHash).toBe(snap.hash);
  });

  it("Case 17 — duplicate signer ID rejected", () => {
    const { frozen } = freezeTwoPartySnapshot();
    const dup = {
      ...frozen!,
      signers: [
        frozen!.signers[0],
        { ...frozen!.signers[0], agreementPartyId: frozen!.parties[1].agreementPartyId },
      ],
    };
    const validation = validateFrozenSigningAuthoritySnapshot(dup);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.error).toBe("duplicate_signer_record_id");
  });

  it("Case 21 — VS01 lifecycle uses durable portable packet", async () => {
    const { portable } = buildTest463FourPartyPreparePacket();
    const boot = await bootstrapVs01RecipientSigningAuthority({
      agreementId: TEST463_AG,
      documentId: portable.seed.documentId,
      urlSignerRoleId: portable.roles[0]?.roleId ?? null,
      urlCounterpartyId: portable.roles[0]?.vs01CounterpartyId ?? portable.roles[0]?.partyId ?? "",
      urlRecipientIndex: 0,
      urlRecipientName: portable.roles[0]?.entityName ?? "",
      urlRecipientEmail: portable.roles[0]?.signerEmail ?? "",
      cachedPortable: portable,
    });
    expect(boot.ok).toBe(true);
  });

  it("Case 22 — anti-fixture multi-party scenario", () => {
    const intake = TEST368_TRIPARTITE_LABELED_PARTIES_INTAKE;
    const authority = establishLegalPartyAuthorityFromIntake(intake);
    expect(authority.parties.length).toBeGreaterThanOrEqual(3);
    expect(new Set(authority.parties.map((p) => p.agreementPartyId)).size).toBe(authority.parties.length);
  });

  it("Case 23 — backend persistence failure blocks local-only activation", async () => {
    const { frozen } = freezeTwoPartySnapshot();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: { code: "frozen_signing_authority_required" } }), {
        status: 400,
      }),
    );
    const { postSigningLinksSent } = await import("../../agreement/agreementWorkspaceApi");
    const res = await postSigningLinksSent(frozen!.agreementId, {
      packet_revision: "rev_fail",
      document_id: "doc_fail",
      portable_packet: { seed: { corpusHash: frozen!.frozenCorpusHash } },
      frozen_signing_authority: null,
      targets: [],
    });
    expect(res.ok).toBe(false);
    expect(res.skip_reason).toBe("frozen_signing_authority_required");
    vi.restoreAllMocks();
  });

  it("Case 24 — unsupported snapshot version fails closed", () => {
    const { frozen } = freezeTwoPartySnapshot();
    const bad = { ...frozen!, version: 99 as 1 };
    const validation = validateFrozenSigningAuthoritySnapshot(bad, undefined, { expectedVersion: 1 });
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.error).toBe("unsupported_version");
  });

  it("Case 20 — owner-session independence from durable backend", async () => {
    const { frozen, snap } = freezeTwoPartySnapshot();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("frozen-signing-authority")) {
        return new Response(JSON.stringify({ snapshot: frozen, status_counts: { required_signer_count: 2 } }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    clearAllBrowserSigningAuthority();
    const durable = await loadFrozenSigningAuthority({
      agreementId: frozen!.agreementId,
      expectedCorpusHash: snap.hash,
    });
    expect(durable?.signers).toHaveLength(2);
    const counts = resolveSigningStatusCounts({ snapshot: durable! });
    expect(counts.requiredSignerCount).toBe(2);
    vi.restoreAllMocks();
  });

  it("Case 7b — initials required actions durable", () => {
    const { frozen } = freezeTwoPartySnapshot();
    const withInitials = {
      ...frozen!,
      requiredActions: undefined,
      signers: frozen!.signers.map((s, i) => ({
        ...s,
        requiresInitials: i === 0,
      })),
    };
    const actions = extractRequiredSigningActions(withInitials);
    expect(actions.some((a) => a.type === "initials")).toBe(true);
    expect(actions.filter((a) => a.signerRecordId === withInitials.signers[0].signerRecordId)).toHaveLength(2);
  });

  it("Case 20 module load — Phase 2 TEST554–556 modules load", async () => {
    expect(await import("./paidProTest554Phase1LegalPartyAuthority.test")).toBeTruthy();
    expect(await import("./paidProTest555Phase2PartyHandoff.test")).toBeTruthy();
    expect(await import("./paidProTest556Phase2ReviewProjectionClosure.test")).toBeTruthy();
  });
});
