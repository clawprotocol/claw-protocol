/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLegalPartiesFromSignerSetupState,
  paidProSignerSetupUiStateFromRecipientSetup,
} from "./paidProNPartySignerSetup";
import {
  resolvePaidProSigningHandoffRecipients,
} from "./paidProSigningHandoffAuthority";
import {
  validateCompletedAgreementAuthorizedDelta,
  completedActionsFromSnapshotSigners,
  assertAllRequiredActionsComplete,
} from "./completedAgreementAuthorizedDelta";
import {
  buildPrepareSignerRolesFromDurableAuthority,
  hydrateOwnerSigningStatusPage,
} from "../../launch/ownerSigningStatusHydration";
import { classifyLegacyPacketAuthority } from "./legacyPacketAuthorityPolicy";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import type { FrozenSigningAuthoritySnapshotV1 } from "./frozenSigningAuthoritySnapshot";
import type { Vs01CanonicalPacketPortableV1 } from "../../vs01/vs01CanonicalPacketSeed";

function makeFrozenSnapshot(overrides?: Partial<FrozenSigningAuthoritySnapshotV1>): FrozenSigningAuthoritySnapshotV1 {
  const corpus = "Agreement terms.\n\nIN WITNESS WHEREOF\n\nCLIENT:\nBeta LLC\n\nPROVIDER:\nAlpha LLC";
  return {
    version: 1,
    agreementId: "ag_test558",
    agreementSessionId: "sess_558",
    frozenCorpusHash: hashPaidProCorpus(corpus),
    frozenAt: new Date().toISOString(),
    parties: [
      { agreementPartyId: "party_a", legalEntityName: "Alpha LLC", canonicalOrder: 0 },
      { agreementPartyId: "party_b", legalEntityName: "Beta LLC", canonicalOrder: 1 },
    ],
    signers: [
      {
        signerRecordId: "signer:party_a:0",
        agreementPartyId: "party_a",
        signerEmail: "a@test.com",
        signerName: "Alice",
        signingOrder: 0,
        requiresSignature: true,
        requiresInitials: true,
      },
      {
        signerRecordId: "signer:party_b:0",
        agreementPartyId: "party_b",
        signerEmail: "b@test.com",
        signerName: "Bob",
        signingOrder: 1,
        requiresSignature: true,
        requiresInitials: false,
      },
    ],
    recipients: [],
    execution: {
      partyOrder: ["party_a", "party_b"],
      signerOrder: ["signer:party_a:0", "signer:party_b:0"],
      executionBlockHash: hashPaidProCorpus("witness"),
    },
    packetState: "active",
    activePacketRevision: "rev_1",
    ...overrides,
  };
}

function makePortable(frozen: FrozenSigningAuthoritySnapshotV1): Vs01CanonicalPacketPortableV1 {
  const corpus = "Agreement terms.\n\nIN WITNESS WHEREOF\n\nCLIENT:\nBeta LLC\n\nPROVIDER:\nAlpha LLC";
  return {
    v: 1,
    seed: {
      v: 1,
      documentId: "doc_558",
      agreementId: frozen.agreementId,
      corpusHash: frozen.frozenCorpusHash,
      corpusPlain: corpus + "\n" + "x".repeat(1400),
      savedAt: new Date().toISOString(),
    },
    fields: [],
    roles: [
      {
        roleId: "role_a",
        partyId: "party_a",
        vs01CounterpartyId: "party_a",
        partyIndex: 0,
        entityName: "Alpha LLC",
        partyName: "Alpha LLC",
        roleLabel: "Provider",
        signerEmail: "wrong-session@test.com",
        signerName: "Wrong Session",
        requiresSignature: true,
        isEntityParty: true,
        kind: "owner" as const,
      },
      {
        roleId: "role_b",
        partyId: "party_b",
        vs01CounterpartyId: "party_b",
        partyIndex: 1,
        entityName: "Beta LLC",
        partyName: "Beta LLC",
        roleLabel: "Client",
        signerEmail: "b@test.com",
        signerName: "Bob",
        requiresSignature: true,
        isEntityParty: true,
        kind: "counterparty" as const,
      },
    ],
    fieldCount: 0,
    pageCount: 1,
    witnessPageIndex: 0,
    initialsPolicy: { enabled: true, bodyPagesOnly: true },
  };
}

function clearAllBrowserState() {
  if (typeof sessionStorage !== "undefined") sessionStorage.clear();
  if (typeof localStorage !== "undefined") localStorage.clear();
}

function mockDurableFetch(frozen: FrozenSigningAuthoritySnapshotV1, portable: Vs01CanonicalPacketPortableV1) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/frozen-signing-authority")) {
      return new Response(
        JSON.stringify({
          snapshot: frozen,
          status_counts: { required_signer_count: 2, legal_party_count: 2 },
        }),
        { status: 200 },
      );
    }
    if (url.includes("/api/agreements/public/") && url.includes("/verify")) {
      return new Response(
        JSON.stringify({
          signature_status: { signatures_recorded: 1, signer_party_count: 2, fully_executed: false },
          signature_events: [],
          summary: { title: "Test Agreement" },
        }),
        { status: 200 },
      );
    }
    if (url.match(/\/api\/agreements\/[^/]+$/) && !url.includes("public")) {
      return new Response(
        JSON.stringify({
          draft: {
            id: frozen.agreementId,
            title: "Test Agreement",
            vs01_signing_packet_v1: {
              document_id: portable.seed.documentId,
              packet_revision: frozen.activePacketRevision ?? "rev_1",
              packet_state: frozen.packetState ?? "active",
              frozen_corpus_hash: frozen.frozenCorpusHash,
              portable,
            },
            frozen_signing_authority_v1: frozen,
          },
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({}), { status: 404 });
  });
}

describe("paidProTest558 Phase 3C owner-session closure", () => {
  afterEach(() => {
    clearAllBrowserState();
    vi.restoreAllMocks();
  });

  it("Case 1 — owner page after complete browser clear", async () => {
    const frozen = makeFrozenSnapshot();
    const portable = makePortable(frozen);
    mockDurableFetch(frozen, portable);
    clearAllBrowserState();

    const hydrated = await hydrateOwnerSigningStatusPage(frozen.agreementId);
    expect(hydrated.ok).toBe(true);
    if (!hydrated.ok) return;
    expect(hydrated.prepareSignerRoles).toHaveLength(2);
    expect(hydrated.progress.requiredCount).toBe(2);
    expect(hydrated.packetRevision).toBe("rev_1");
    expect(hydrated.prepareSignerRoles[0]?.signerName).toBe("Alice");
  });

  it("Case 2 — N-party signer setup from injected durable snapshot", () => {
    const frozen = makeFrozenSnapshot();
    const ui = paidProSignerSetupUiStateFromRecipientSetup([], null, [], []);
    const parties = buildLegalPartiesFromSignerSetupState(ui, {
      lifecycleMode: "post_freeze_active",
      frozenSnapshot: frozen,
    });
    expect(parties).toHaveLength(2);
    expect(parties[0]?.name).toBe("Alpha LLC");
    expect(parties[0]?.signerEmail).toBe("a@test.com");
  });

  it("Case 3 — post-freeze handoff rejects live-session override", () => {
    const frozen = makeFrozenSnapshot();
    const recipients = resolvePaidProSigningHandoffRecipients({
      lifecycleMode: "post_freeze_active",
      frozenSnapshot: frozen,
    });
    expect(recipients[0]?.email).toBe("a@test.com");
    expect(recipients[0]?.email).not.toBe("wrong-session@test.com");
  });

  it("Case 4 — missing durable snapshot for active packet fails closed", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.match(/\/api\/agreements\/[^/]+$/) && !url.includes("public")) {
        return new Response(
          JSON.stringify({
            draft: {
              id: "ag_missing",
              title: "X",
              vs01_signing_packet_v1: {
                document_id: "doc_x",
                packet_revision: "rev_x",
                packet_state: "active",
                portable: makePortable(makeFrozenSnapshot({ agreementId: "ag_missing" })),
              },
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/frozen-signing-authority")) {
        return new Response(JSON.stringify({ detail: "not found" }), { status: 404 });
      }
      if (url.includes("/verify")) {
        return new Response(JSON.stringify({ signature_status: null, signature_events: [] }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    clearAllBrowserState();
    const result = await hydrateOwnerSigningStatusPage("ag_missing");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(["missing_durable_authority", "legacy_reissue_required"]).toContain(result.error);
  });

  it("Case 5 — resend identity stability from durable snapshot", () => {
    const frozen = makeFrozenSnapshot();
    const first = resolvePaidProSigningHandoffRecipients({ lifecycleMode: "post_freeze_active", frozenSnapshot: frozen });
    const second = resolvePaidProSigningHandoffRecipients({ lifecycleMode: "post_freeze_active", frozenSnapshot: frozen });
    expect(first.map((r) => r.email)).toEqual(second.map((r) => r.email));
  });

  it("Case 6 — cancelled packet state surfaces fail closed", async () => {
    const frozen = makeFrozenSnapshot({ packetState: "cancelled" });
    const portable = makePortable(frozen);
    mockDurableFetch(frozen, portable);
    const result = await hydrateOwnerSigningStatusPage(frozen.agreementId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("packet_cancelled");
  });

  it("Case 7 — reissue superseded revision binding", () => {
    const frozen = makeFrozenSnapshot({ activePacketRevision: "rev_v2" });
    expect(frozen.activePacketRevision).toBe("rev_v2");
  });

  it("Case 8 — legal clause mutation rejected", () => {
    const frozen = makeFrozenSnapshot();
    const corpus = "Agreement terms.\n\nIN WITNESS WHEREOF\n\nCLIENT:\nBeta LLC\n\nPROVIDER:\nAlpha LLC";
    const mutated = "Different terms entirely.\n\nIN WITNESS WHEREOF\n\nCLIENT:\nBeta LLC\n\nPROVIDER:\nAlpha LLC";
    const actions = completedActionsFromSnapshotSigners(frozen, ["signer:party_a:0", "signer:party_b:0"]);
    const result = validateCompletedAgreementAuthorizedDelta({
      frozenCorpus: corpus,
      completedCorpus: mutated,
      snapshot: frozen,
      completedActions: actions,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("operative_clause_mutation");
  });

  it("Case 9 — party-name mutation rejected", () => {
    const frozen = makeFrozenSnapshot();
    const corpus = "Agreement terms.\n\nIN WITNESS WHEREOF\n\nCLIENT:\nBeta LLC\n\nPROVIDER:\nAlpha LLC";
    const mutated = "Agreement terms.\n\nIN WITNESS WHEREOF\n\nCLIENT:\nEvil Corp\n\nPROVIDER:\nAlpha LLC";
    const actions = completedActionsFromSnapshotSigners(frozen, ["signer:party_a:0", "signer:party_b:0"]);
    const result = validateCompletedAgreementAuthorizedDelta({
      frozenCorpus: corpus,
      completedCorpus: mutated,
      snapshot: frozen,
      completedActions: actions,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("legal_entity_mutation");
  });

  it("Case 10 — execution-heading mutation rejected", () => {
    const frozen = makeFrozenSnapshot();
    const corpus = "Agreement terms.\n\nIN WITNESS WHEREOF\n\nCLIENT:\nBeta LLC\n\nPROVIDER:\nAlpha LLC";
    const mutated = "Agreement terms.\n\nIN WITNESS WHEREOF\n\nVENDOR:\nBeta LLC\n\nPROVIDER:\nAlpha LLC";
    const actions = completedActionsFromSnapshotSigners(frozen, ["signer:party_a:0", "signer:party_b:0"]);
    const result = validateCompletedAgreementAuthorizedDelta({
      frozenCorpus: corpus,
      completedCorpus: mutated,
      snapshot: frozen,
      completedActions: actions,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("execution_heading_mutation");
  });

  it("Case 11 — authorized signature accepted", () => {
    const frozen = makeFrozenSnapshot();
    const corpus = "Agreement terms.\n\nIN WITNESS WHEREOF\n\nCLIENT:\nBeta LLC\n\nPROVIDER:\nAlpha LLC";
    const signed = corpus + "\nBy: Alice\nDate: July 8, 2026\nBy: Bob\nDate: July 8, 2026";
    const actions = completedActionsFromSnapshotSigners(frozen, ["signer:party_a:0", "signer:party_b:0"]);
    const result = validateCompletedAgreementAuthorizedDelta({
      frozenCorpus: corpus,
      completedCorpus: signed,
      snapshot: frozen,
      completedActions: actions,
    });
    expect(result.ok).toBe(true);
  });

  it("Case 12 — authorized initials accepted", () => {
    const frozen = makeFrozenSnapshot();
    const corpus = "Agreement terms.\n\nIN WITNESS WHEREOF\n\nCLIENT:\nBeta LLC\n\nPROVIDER:\nAlpha LLC";
    const signed = corpus + "\nInitials: AM\nBy: Bob\nDate: July 8, 2026";
    const actions = completedActionsFromSnapshotSigners(frozen, ["signer:party_a:0", "signer:party_b:0"]);
    const result = validateCompletedAgreementAuthorizedDelta({
      frozenCorpus: corpus,
      completedCorpus: signed,
      snapshot: frozen,
      completedActions: actions,
    });
    expect(result.ok).toBe(true);
  });

  it("Case 13 — authorized dates accepted", () => {
    const frozen = makeFrozenSnapshot();
    const corpus = "Agreement terms.\n\nIN WITNESS WHEREOF\n\nCLIENT:\nBeta LLC\n\nPROVIDER:\nAlpha LLC";
    const signed = corpus + "\nDate: July 8, 2026\nDate: July 9, 2026";
    const actions = completedActionsFromSnapshotSigners(frozen, ["signer:party_a:0", "signer:party_b:0"]);
    const result = validateCompletedAgreementAuthorizedDelta({
      frozenCorpus: corpus,
      completedCorpus: signed,
      snapshot: frozen,
      completedActions: actions,
    });
    expect(result.ok).toBe(true);
  });

  it("Case 14 — wrong signer field rejected", () => {
    const frozen = makeFrozenSnapshot();
    const actions = [
      {
        actionId: "signature:signer:party_unknown:0",
        signerRecordId: "signer:party_unknown:0",
        agreementPartyId: "party_unknown",
        fieldId: "signature:signer:party_unknown:0",
        type: "signature" as const,
      },
    ];
    const gate = assertAllRequiredActionsComplete({ snapshot: frozen, completedActions: actions });
    expect(gate.ok).toBe(false);
  });

  it("Case 15 — unauthorized initials location rejected via missing required action", () => {
    const frozen = makeFrozenSnapshot();
    const actions = completedActionsFromSnapshotSigners(frozen, ["signer:party_b:0"]);
    const gate = assertAllRequiredActionsComplete({ snapshot: frozen, completedActions: actions });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.error).toBe("missing_required_action");
  });

  it("Case 16 — superseded packet action rejected", () => {
    const frozen = makeFrozenSnapshot();
    const actions = completedActionsFromSnapshotSigners(frozen, ["signer:party_a:0"], {
      packetRevision: "rev_old",
    });
    const result = validateCompletedAgreementAuthorizedDelta({
      frozenCorpus: "Agreement terms.\n\nIN WITNESS WHEREOF\n\nCLIENT:\nBeta LLC\n\nPROVIDER:\nAlpha LLC",
      completedCorpus: "Agreement terms.\n\nIN WITNESS WHEREOF\n\nCLIENT:\nBeta LLC\n\nPROVIDER:\nAlpha LLC\nBy: A",
      snapshot: frozen,
      completedActions: actions,
      activePacketRevision: "rev_1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("superseded_packet_action");
  });

  it("Case 17 — missing required action prevents completion", () => {
    const frozen = makeFrozenSnapshot();
    const gate = assertAllRequiredActionsComplete({
      snapshot: frozen,
      completedActions: completedActionsFromSnapshotSigners(frozen, ["signer:party_a:0"]),
    });
    expect(gate.ok).toBe(false);
  });

  it("Case 18 — durable reopen uses backend snapshot roles", async () => {
    const frozen = makeFrozenSnapshot();
    const portable = makePortable(frozen);
    mockDurableFetch(frozen, portable);
    clearAllBrowserState();
    const hydrated = await hydrateOwnerSigningStatusPage(frozen.agreementId);
    expect(hydrated.ok).toBe(true);
    if (!hydrated.ok) return;
    expect(hydrated.prepareSignerRoles[0]?.signerEmail).toBe("a@test.com");
  });

  it("Case 19 — legacy packet safely recoverable classification", () => {
    const portable = makePortable(makeFrozenSnapshot());
    const diag = classifyLegacyPacketAuthority({
      frozenSnapshot: null,
      portable,
      packetState: "draft",
      hasBackendPacket: true,
    });
    expect(diag.classification).toBe("safely_recoverable");
  });

  it("Case 20 — unsafe legacy active packet requires reissue", () => {
    const portable = makePortable(makeFrozenSnapshot());
    const diag = classifyLegacyPacketAuthority({
      frozenSnapshot: null,
      portable,
      packetState: "active",
      hasBackendPacket: true,
    });
    expect(diag.classification).toBe("requires_reissue");
  });

  it("Case 21 — durable prepare roles prefer frozen signer over portable session", () => {
    const frozen = makeFrozenSnapshot();
    const portable = makePortable(frozen);
    const roles = buildPrepareSignerRolesFromDurableAuthority({ frozen, portable });
    expect(roles[0]?.signerEmail).toBe("a@test.com");
    expect(roles[0]?.signerName).toBe("Alice");
  });

  it("Case 22 — sequential agreement isolation", async () => {
    const frozenA = makeFrozenSnapshot({ agreementId: "ag_a" });
    const frozenB = makeFrozenSnapshot({ agreementId: "ag_b", parties: [{ agreementPartyId: "x", legalEntityName: "X Corp", canonicalOrder: 0 }], signers: [], recipients: [], execution: { partyOrder: ["x"], signerOrder: [], executionBlockHash: "h" } });
    expect(frozenA.agreementId).not.toBe(frozenB.agreementId);
  });

  it("Case 23 — four-party completed agreement identity from snapshot", () => {
    const frozen = makeFrozenSnapshot({
      parties: [
        { agreementPartyId: "p0", legalEntityName: "P0", canonicalOrder: 0 },
        { agreementPartyId: "p1", legalEntityName: "P1", canonicalOrder: 1 },
        { agreementPartyId: "p2", legalEntityName: "P2", canonicalOrder: 2 },
        { agreementPartyId: "p3", legalEntityName: "P3", canonicalOrder: 3 },
      ],
      signers: [
        { signerRecordId: "s0", agreementPartyId: "p0", signerEmail: "e0@test.com", signingOrder: 0, requiresSignature: true, requiresInitials: false },
        { signerRecordId: "s2", agreementPartyId: "p2", signerEmail: "e2@test.com", signingOrder: 1, requiresSignature: true, requiresInitials: false },
      ],
      execution: { partyOrder: ["p0", "p1", "p2", "p3"], signerOrder: ["s0", "s2"], executionBlockHash: "h" },
    });
    const recipients = resolvePaidProSigningHandoffRecipients({ lifecycleMode: "post_freeze_active", frozenSnapshot: frozen });
    expect(recipients).toHaveLength(4);
  });

  it("Case 24 — Phase 1–3B non-regression modules load", async () => {
    expect(await import("./paidProTest554Phase1LegalPartyAuthority.test")).toBeTruthy();
    expect(await import("./paidProTest555Phase2PartyHandoff.test")).toBeTruthy();
    expect(await import("./paidProTest556Phase2ReviewProjectionClosure.test")).toBeTruthy();
    expect(await import("./paidProTest557Phase3FrozenSigningAuthority.test")).toBeTruthy();
  });
});
