/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcceptedCorpusAuthority } from "../agreement/acceptedCorpusAuthority";
import {
  cacheConfirmedFrozenSigningAuthority,
  clearFrozenSigningAuthorityForTests,
  readCachedFrozenSigningAuthority,
  type FrozenSigningAuthoritySnapshotV1,
} from "../components/agreements/frozenSigningAuthoritySnapshot";
import { sha256Hex } from "../utils/agreements/hash";
import {
  createOwnerSigningStatusHydrationBoundary,
  hydrateOwnerSigningStatusPage,
  type OwnerSigningStatusHydratedState,
} from "./ownerSigningStatusHydration";

const AGREEMENT_ID = "ag_phase3b_owner";
const ACCEPTED_HASH = "a".repeat(64);

const accepted: AcceptedCorpusAuthority = {
  agreement_id: AGREEMENT_ID,
  version_id: "av_phase3b_owner",
  corpus_sha256: ACCEPTED_HASH,
  accepted_at: "2026-07-17T12:00:00Z",
  authority_state: "accepted",
  legal_parties: [
    {
      agreement_party_id: "party_owner",
      legal_entity_name: "Owner Legal LLC",
      agreement_role: "owner",
      canonical_order: 0,
    },
    {
      agreement_party_id: "party_counterparty",
      legal_entity_name: "Counterparty Legal Inc.",
      agreement_role: "party",
      canonical_order: 1,
    },
  ],
};

async function frozenAuthority(
  overrides: Partial<FrozenSigningAuthoritySnapshotV1> = {},
): Promise<FrozenSigningAuthoritySnapshotV1> {
  const partyOrder = ["party_owner", "party_counterparty"];
  return {
    version: 1,
    agreementId: AGREEMENT_ID,
    acceptedVersionId: accepted.version_id,
    acceptedCorpusSha256: accepted.corpus_sha256,
    frozenAt: "2026-07-17T12:05:00Z",
    parties: [
      {
        agreementPartyId: "party_owner",
        legalEntityName: "Owner Legal LLC",
        agreementRole: "owner",
        canonicalOrder: 0,
      },
      {
        agreementPartyId: "party_counterparty",
        legalEntityName: "Counterparty Legal Inc.",
        agreementRole: "party",
        canonicalOrder: 1,
      },
    ],
    signers: [
      {
        signerRecordId: "signer:party_owner:0",
        agreementPartyId: "party_owner",
        signerName: "Olivia Owner",
        signerTitle: "CEO",
        signerEmail: "owner@example.test",
        signingOrder: 0,
      },
      {
        signerRecordId: "signer:party_counterparty:0",
        agreementPartyId: "party_counterparty",
        signerName: "Casey Counterparty",
        signerTitle: "President",
        signerEmail: "counterparty@example.test",
        signingOrder: 1,
      },
    ],
    execution: {
      partyOrder,
      signerOrder: ["signer:party_owner:0", "signer:party_counterparty:0"],
      executionPartyHash: await sha256Hex(JSON.stringify(partyOrder)),
    },
    ...overrides,
  };
}

function agreementPayload(args?: {
  acceptedVersion?: unknown;
  signingLock?: { locked_version_id: string; content_sha256: string } | null;
  auditLog?: unknown[];
  id?: string;
  completedArtifact?: Record<string, unknown> | null;
}) {
  return {
    id: args?.id ?? AGREEMENT_ID,
    draft: {
      id: args?.id ?? AGREEMENT_ID,
      title: "Backend Agreement",
      audit_log: args?.auditLog ?? [],
    },
    accepted_version:
      args && "acceptedVersion" in args ? args.acceptedVersion : accepted,
    signing_lock: args?.signingLock ?? null,
    completed_artifact: args?.completedArtifact ?? null,
  };
}

function installBackend(args: {
  agreement?: ReturnType<typeof agreementPayload>;
  agreementStatus?: number;
  frozen?: FrozenSigningAuthoritySnapshotV1 | null;
  frozenStatus?: number;
  signaturesRecorded?: number;
  fullyExecuted?: boolean;
  verifyAgreementId?: string;
}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/frozen-signing-authority")) {
      const status = args.frozenStatus ?? (args.frozen ? 200 : 404);
      return new Response(
        JSON.stringify(args.frozen ? { snapshot: args.frozen } : { detail: "not_found" }),
        { status },
      );
    }
    if (url.includes("/public/") && url.includes("/verify")) {
      const signatureEvents = (args.frozen?.signers ?? [])
        .slice(0, args.signaturesRecorded ?? 0)
        .map((signer) => ({
          event_type: "signature_completed",
          signer_role_id: signer.signerRecordId,
          participant_id: signer.agreementPartyId,
        }));
      return new Response(
        JSON.stringify({
          agreement_id: args.verifyAgreementId ?? AGREEMENT_ID,
          summary: { title: "Backend Agreement" },
          participants: [],
          version_history: [],
          signature_status: {
            signatures_recorded: args.signaturesRecorded ?? 0,
            signer_party_count: args.frozen?.signers.length ?? 0,
            fully_executed: args.fullyExecuted ?? false,
            locked_version_id: accepted.version_id,
          },
          signature_events: signatureEvents,
          verification: { agreement_hash: "backend" },
        }),
        { status: 200 },
      );
    }
    if (url.includes(`/api/agreements/${AGREEMENT_ID}`)) {
      return new Response(JSON.stringify(args.agreement ?? agreementPayload()), {
        status: args.agreementStatus ?? 200,
      });
    }
    return new Response(JSON.stringify({ detail: "not_found" }), { status: 404 });
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearFrozenSigningAuthorityForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearFrozenSigningAuthorityForTests();
  localStorage.clear();
  sessionStorage.clear();
});

describe("Phase 3B1 owner signing-status hydration", () => {
  it("backend accepted and frozen authority replace contradictory browser caches", async () => {
    const staleAccepted = {
      ...accepted,
      version_id: "av_stale_browser",
      corpus_sha256: "b".repeat(64),
    };
    const staleFrozen = await frozenAuthority({
      acceptedVersionId: staleAccepted.version_id,
      acceptedCorpusSha256: staleAccepted.corpus_sha256,
    });
    sessionStorage.setItem(
      `claw_backend_accepted_corpus_v1:${AGREEMENT_ID}`,
      JSON.stringify(staleAccepted),
    );
    cacheConfirmedFrozenSigningAuthority(staleFrozen);
    localStorage.setItem(`vs01_packet_prepared_v1:${AGREEMENT_ID}`, "presentation-marker");
    const backendFrozen = await frozenAuthority();
    installBackend({ frozen: backendFrozen });

    const result = await hydrateOwnerSigningStatusPage(AGREEMENT_ID);
    expect(result.status).toBe("frozen");
    expect(result.accepted?.version_id).toBe(accepted.version_id);
    expect(readCachedFrozenSigningAuthority(AGREEMENT_ID)?.acceptedVersionId).toBe(
      accepted.version_id,
    );
    expect(localStorage.getItem(`vs01_packet_prepared_v1:${AGREEMENT_ID}`)).toBe(
      "presentation-marker",
    );
  });

  it("backend 404 clears accepted, frozen, packet, handoff, and completion caches", async () => {
    const staleFrozen = await frozenAuthority();
    sessionStorage.setItem(
      `${"claw_backend_accepted_corpus_v1:"}${AGREEMENT_ID}`,
      JSON.stringify(accepted),
    );
    cacheConfirmedFrozenSigningAuthority(staleFrozen);
    localStorage.setItem(
      `vs01_signing_packet_status_v1:${AGREEMENT_ID}`,
      JSON.stringify({
        agreementId: AGREEMENT_ID,
        updatedAt: "now",
        bySignerKey: { owner: "signed", counterparty: "signed" },
        fullySigned: true,
      }),
    );
    localStorage.setItem(`vs01_packet_prepared_v1:${AGREEMENT_ID}`, "now");
    localStorage.setItem(
      `claw_paid_pro_vs01_post_sign_ls_v1:${AGREEMENT_ID}`,
      JSON.stringify({
        v: 1,
        agreementId: AGREEMENT_ID,
        vs01DocumentId: "doc_stale",
        packetPrepareOnly: true,
        signers: [],
      }),
    );
    installBackend({ agreementStatus: 404, frozen: null });

    const result = await hydrateOwnerSigningStatusPage(AGREEMENT_ID);
    expect(result.status).toBe("conflict");
    expect(result.conflict).toBe("backend_agreement_not_found");
    expect(sessionStorage.getItem(`claw_backend_accepted_corpus_v1:${AGREEMENT_ID}`)).toBeNull();
    expect(readCachedFrozenSigningAuthority(AGREEMENT_ID)).toBeNull();
    expect(localStorage.getItem(`vs01_signing_packet_status_v1:${AGREEMENT_ID}`)).toBeNull();
    expect(localStorage.getItem(`vs01_packet_prepared_v1:${AGREEMENT_ID}`)).toBeNull();
    expect(localStorage.getItem(`claw_paid_pro_vs01_post_sign_ls_v1:${AGREEMENT_ID}`)).toBeNull();
  });

  it("keeps accepted-but-unfrozen distinct from frozen", async () => {
    installBackend({ frozen: null });
    const result = await hydrateOwnerSigningStatusPage(AGREEMENT_ID);
    expect(result.status).toBe("unfrozen");
    expect(result.authorityClassification).toBe("accepted_not_frozen");
  });

  it("hydrates exact backend legal parties, signers, and execution order", async () => {
    const frozen = await frozenAuthority();
    installBackend({ frozen });
    const result = await hydrateOwnerSigningStatusPage(AGREEMENT_ID);
    expect(result.status).toBe("frozen");
    expect(result.frozen?.parties.map((party) => party.legalEntityName)).toEqual([
      "Owner Legal LLC",
      "Counterparty Legal Inc.",
    ]);
    expect(result.frozen?.signers.map((signer) => signer.signerName)).toEqual([
      "Olivia Owner",
      "Casey Counterparty",
    ]);
    expect(result.frozen?.execution.signerOrder).toEqual([
      "signer:party_owner:0",
      "signer:party_counterparty:0",
    ]);
  });

  it.each([
    ["agreement", { agreementId: "ag_wrong" }, "frozen_authority_unavailable"],
    ["version", { acceptedVersionId: "av_wrong" }, "accepted_frozen_binding_mismatch"],
    ["hash", { acceptedCorpusSha256: "b".repeat(64) }, "accepted_frozen_binding_mismatch"],
  ])("turns %s mismatch into conflict", async (_label, overrides, conflict) => {
    localStorage.setItem(`vs01_packet_prepared_v1:${AGREEMENT_ID}`, "stale");
    const frozen = await frozenAuthority(overrides);
    installBackend({ frozen });
    const result = await hydrateOwnerSigningStatusPage(AGREEMENT_ID);
    expect(result.status).toBe("conflict");
    expect(result.conflict).toBe(conflict);
    expect(localStorage.getItem(`vs01_packet_prepared_v1:${AGREEMENT_ID}`)).toBeNull();
  });

  it("clears presentation caches when canonical party identity contradicts accepted authority", async () => {
    localStorage.setItem(`vs01_packet_prepared_v1:${AGREEMENT_ID}`, "stale-party-cache");
    const valid = await frozenAuthority();
    const contradictory = {
      ...valid,
      parties: valid.parties.map((party, index) =>
        index === 1 ? { ...party, legalEntityName: "Wrong Legal Entity LLC" } : party,
      ),
    };
    installBackend({ frozen: contradictory });
    const result = await hydrateOwnerSigningStatusPage(AGREEMENT_ID);
    expect(result.status).toBe("conflict");
    expect(result.conflict).toBe("frozen_party_order_mismatch");
    expect(localStorage.getItem(`vs01_packet_prepared_v1:${AGREEMENT_ID}`)).toBeNull();
  });

  it("hydrates signing only after lock/version/hash consistency", async () => {
    const frozen = await frozenAuthority();
    localStorage.setItem(`vs01_packet_prepared_v1:${AGREEMENT_ID}`, "confirmed-presentation");
    installBackend({
      frozen,
      agreement: agreementPayload({
        signingLock: {
          locked_version_id: accepted.version_id,
          content_sha256: accepted.corpus_sha256,
        },
      }),
      signaturesRecorded: 1,
    });
    const result = await hydrateOwnerSigningStatusPage(AGREEMENT_ID);
    expect(result.status).toBe("signing");
    expect(result.signedCount).toBe(1);
    expect(result.requiredCount).toBe(2);
    expect(localStorage.getItem(`vs01_packet_prepared_v1:${AGREEMENT_ID}`)).toBe(
      "confirmed-presentation",
    );
  });

  it("local fully-signed markers cannot manufacture signing or completion", async () => {
    const frozen = await frozenAuthority();
    localStorage.setItem(
      `vs01_signing_packet_status_v1:${AGREEMENT_ID}`,
      JSON.stringify({
        agreementId: AGREEMENT_ID,
        updatedAt: "now",
        bySignerKey: { owner: "signed", counterparty: "signed" },
        fullySigned: true,
      }),
    );
    installBackend({ frozen });
    const result = await hydrateOwnerSigningStatusPage(AGREEMENT_ID);
    expect(result.status).toBe("frozen");
    expect(result.signedCount).toBe(0);
    expect(localStorage.getItem(`vs01_signing_packet_status_v1:${AGREEMENT_ID}`)).not.toBeNull();
  });

  it("legacy classification preserves presentation caches without promoting authority", async () => {
    localStorage.setItem(`vs01_packet_prepared_v1:${AGREEMENT_ID}`, "legacy-presentation");
    installBackend({
      agreement: agreementPayload({ acceptedVersion: null }),
      frozen: null,
    });
    const result = await hydrateOwnerSigningStatusPage(AGREEMENT_ID);
    expect(result.status).toBe("legacy");
    expect(result.authorityClassification).toBe("legacy_unversioned");
    expect(localStorage.getItem(`vs01_packet_prepared_v1:${AGREEMENT_ID}`)).toBe(
      "legacy-presentation",
    );
  });

  it("does not promote backend completion before completed artifact exists", async () => {
    const frozen = await frozenAuthority();
    installBackend({
      frozen,
      agreement: agreementPayload({
        signingLock: {
          locked_version_id: accepted.version_id,
          content_sha256: accepted.corpus_sha256,
        },
      }),
      signaturesRecorded: 2,
      fullyExecuted: true,
    });
    const result = await hydrateOwnerSigningStatusPage(AGREEMENT_ID);
    expect(result.status).toBe("conflict");
    expect(result.conflict).toBe("completed_parity_not_certified");
  });

  it("promotes certified completion when backend completed artifact validates", async () => {
    const frozen = await frozenAuthority();
    const materialHash = "a".repeat(64);
    const corpusHash = "b".repeat(64);
    installBackend({
      frozen,
      agreement: agreementPayload({
        signingLock: {
          locked_version_id: accepted.version_id,
          content_sha256: accepted.corpus_sha256,
        },
        completedArtifact: {
          agreement_id: AGREEMENT_ID,
          accepted_version_id: accepted.version_id,
          accepted_corpus_sha256: accepted.corpus_sha256,
          completed_corpus_sha256: corpusHash,
          material_hash: materialHash,
          signing_lock: {
            locked_version_id: accepted.version_id,
            content_sha256: accepted.corpus_sha256,
          },
        },
      }),
      signaturesRecorded: 2,
      fullyExecuted: true,
    });
    const result = await hydrateOwnerSigningStatusPage(AGREEMENT_ID);
    expect(result.status).toBe("completed");
    expect(result.backendCompleted).toBe(true);
  });

  it("deduplicates concurrent loads and rejects stale agreement responses", async () => {
    let resolveA!: (value: OwnerSigningStatusHydratedState) => void;
    const deferredA = new Promise<OwnerSigningStatusHydratedState>((resolve) => {
      resolveA = resolve;
    });
    const stateB: OwnerSigningStatusHydratedState = {
      agreementId: "ag_b",
      agreementTitle: "B",
      status: "legacy",
      authorityClassification: "legacy_unversioned",
      accepted: null,
      frozen: null,
      signedCount: 0,
      requiredCount: 0,
    };
    const hydrate = vi.fn((id: string) =>
      id === "ag_a" ? deferredA : Promise.resolve(stateB),
    );
    const boundary = createOwnerSigningStatusHydrationBoundary(hydrate);
    boundary.activate("ag_a");
    const firstA = boundary.load("ag_a");
    const secondA = boundary.load("ag_a");
    await Promise.resolve();
    expect(hydrate).toHaveBeenCalledTimes(1);
    boundary.activate("ag_b");
    await expect(boundary.load("ag_b")).resolves.toEqual(stateB);
    resolveA({ ...stateB, agreementId: "ag_a", agreementTitle: "A" });
    await expect(firstA).rejects.toThrow("owner_signing_status_stale_load");
    await expect(secondA).rejects.toThrow("owner_signing_status_stale_load");
  });

  it("cancellation prevents an in-flight response from publishing", async () => {
    let resolve!: (value: OwnerSigningStatusHydratedState) => void;
    const deferred = new Promise<OwnerSigningStatusHydratedState>((done) => {
      resolve = done;
    });
    const boundary = createOwnerSigningStatusHydrationBoundary(() => deferred);
    boundary.activate(AGREEMENT_ID);
    const pending = boundary.load(AGREEMENT_ID);
    boundary.cancel();
    resolve({
      agreementId: AGREEMENT_ID,
      agreementTitle: "Cancelled load",
      status: "legacy",
      authorityClassification: "legacy_unversioned",
      accepted: null,
      frozen: null,
      signedCount: 0,
      requiredCount: 0,
    });
    await expect(pending).rejects.toThrow("owner_signing_status_stale_load");
  });
});
