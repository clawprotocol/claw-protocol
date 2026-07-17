/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAcceptedCorpusPersistenceBoundary,
  type AcceptedCorpusAuthority,
} from "../../agreement/acceptedCorpusAuthority";
import {
  loadFrozenSigningAuthority,
  persistFrozenSigningAuthority,
} from "../../agreement/frozenSigningAuthorityApi";
import type { AuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import {
  buildFrozenSigningAuthorityCandidate,
  cacheConfirmedFrozenSigningAuthority,
  clearCachedFrozenSigningAuthority,
  clearFrozenSigningAuthorityForTests,
  createFrozenSigningAuthorityPersistenceBoundary,
  readCachedFrozenSigningAuthority,
  type FrozenSigningAuthoritySnapshotV1,
} from "./frozenSigningAuthoritySnapshot";
import {
  clearSignerExecutionAuthorityForTests,
  writeSignerExecutionAuthority,
} from "./signerExecutionAuthority";

const ACCEPTED: AcceptedCorpusAuthority = {
  agreement_id: "ag_backend_real",
  version_id: "av_backend_issued",
  corpus_sha256: "a".repeat(64),
  accepted_at: "2026-07-17T00:00:00Z",
  authority_state: "accepted",
  legal_parties: Array.from({ length: 2 }, (_, index) => ({
    agreement_party_id: `party_backend_${index + 1}`,
    legal_entity_name: `Legal Entity ${index + 1} LLC`,
    agreement_role: index === 0 ? "owner" : "signer",
    canonical_order: index,
  })),
};

function acceptedAuthority(partyCount: number): AcceptedCorpusAuthority {
  return {
    ...ACCEPTED,
    legal_parties: Array.from({ length: partyCount }, (_, index) => ({
      agreement_party_id: `party_backend_${index + 1}`,
      legal_entity_name: `Legal Entity ${index + 1} LLC`,
      agreement_role: index === 0 ? "owner" : "signer",
      canonical_order: index,
    })),
  };
}

function signingSnapshot(partyCount: number): AuthoritativeSigningSnapshot {
  const parties = Array.from({ length: partyCount }, (_, index) => ({
    index,
    role: (index === 0 ? "client" : index === 1 ? "service_provider" : `party_${index + 1}`) as
      | "client"
      | "service_provider"
      | `party_${number}`,
    partyName: `Legal Entity ${index + 1} LLC`,
    email: `signer${index + 1}@example.test`,
    signerName: `Display Signer ${index + 1}`,
    signerTitle: `Title ${index + 1}`,
    roleLabel: `Party ${index + 1}`,
    signerKind: "entity_representative" as const,
    isSenderSide: index === 0,
    isIndividual: false,
  }));
  return {
    corpus: "Accepted corpus",
    hash: "frontend-nonauthoritative-hash",
    frozenAt: Date.now(),
    source: "paid_pro_signer_metadata_finalize",
    partyManifest: { parties },
    signerMetadata: {
      partySignerNames: parties.map((party) => party.signerName),
      partySignerTitles: parties.map((party) => party.signerTitle),
      partyAddresses: parties.map(() => ""),
      partyLegalNames: parties.map((party) => party.partyName),
      partyIds: parties.map((_, index) => `party_backend_${index + 1}`),
      recipient1Name: parties[0]?.partyName ?? "",
      recipient2Name: parties[1]?.partyName ?? "",
      recipient1Email: parties[0]?.email ?? "",
      recipient2Email: parties[1]?.email ?? "",
      extraPartyReviewEmails: parties.slice(2).map((party) => party.email),
    },
    recipientMetadata: {
      partySignerNames: parties.map((party) => party.signerName),
      partySignerTitles: parties.map((party) => party.signerTitle),
      partyAddresses: parties.map(() => ""),
      partyLegalNames: parties.map((party) => party.partyName),
      partyIds: parties.map((_, index) => `party_backend_${index + 1}`),
      recipient1Name: parties[0]?.partyName ?? "",
      recipient2Name: parties[1]?.partyName ?? "",
      recipient1Email: parties[0]?.email ?? "",
      recipient2Email: parties[1]?.email ?? "",
      extraPartyReviewEmails: parties.slice(2).map((party) => party.email),
    },
    signatureBlockModel: {
      signFirst: true,
      entries: parties.map((party, index) => ({
        partyName: party.partyName,
        signerName: party.signerName,
        title: party.signerTitle,
        email: party.email,
        signingOrder: index,
        reviewStatus: "pending" as const,
        signatureStatus: "pending" as const,
      })),
    },
  };
}

function confirmed(candidate: FrozenSigningAuthoritySnapshotV1): FrozenSigningAuthoritySnapshotV1 {
  return { ...candidate, frozenAt: "2026-07-17T00:00:00Z" };
}

afterEach(() => {
  vi.restoreAllMocks();
  clearFrozenSigningAuthorityForTests();
  clearSignerExecutionAuthorityForTests();
});

describe("paidProTest557 Phase 3A frozen signing authority", () => {
  it("requires confirmed backend accepted-version authority", async () => {
    await expect(
      buildFrozenSigningAuthorityCandidate({
        acceptedAuthority: { ...ACCEPTED, version_id: "session-version" },
        authoritativeSnapshot: signingSnapshot(2),
      }),
    ).rejects.toThrow("accepted_version_required");
  });

  it.each([2, 3, 4])(
    "preserves %i-party order and signer/legal-party separation",
    async (partyCount) => {
      const candidate = await buildFrozenSigningAuthorityCandidate({
        acceptedAuthority: acceptedAuthority(partyCount),
        authoritativeSnapshot: signingSnapshot(partyCount),
      });
      expect(candidate.agreementId).toBe(ACCEPTED.agreement_id);
      expect(candidate.acceptedVersionId).toBe(ACCEPTED.version_id);
      expect(candidate.acceptedCorpusSha256).toBe(ACCEPTED.corpus_sha256);
      expect(candidate.parties).toHaveLength(partyCount);
      expect(candidate.signers).toHaveLength(partyCount);
      expect(candidate.execution.partyOrder).toEqual(
        candidate.parties.map((party) => party.agreementPartyId),
      );
      expect(candidate.execution.signerOrder).toEqual(
        candidate.signers.map((signer) => signer.signerRecordId),
      );
      expect(candidate.signers[0].signerName).not.toBe(candidate.parties[0].legalEntityName);
      expect(candidate.execution.executionPartyHash).toMatch(/^[a-f0-9]{64}$/);
    },
  );

  it("preserves multiple Phase 2 signers linked to one accepted legal party", async () => {
    writeSignerExecutionAuthority(
      [
        {
          agreementPartyId: "party_backend_1",
          signerRecordId: "signer:party_backend_1:0",
          signerName: "Owner Signer One",
          signerEmail: "owner-one@example.test",
          isSigningParty: true,
          signingOrder: 0,
          source: "signer_setup",
        },
        {
          agreementPartyId: "party_backend_1",
          signerRecordId: "signer:party_backend_1:1",
          signerName: "Owner Signer Two",
          signerEmail: "owner-two@example.test",
          isSigningParty: true,
          signingOrder: 1,
          source: "signer_setup",
        },
        {
          agreementPartyId: "party_backend_2",
          signerRecordId: "signer:party_backend_2:0",
          signerName: "Counterparty Signer",
          signerEmail: "counterparty@example.test",
          isSigningParty: true,
          signingOrder: 2,
          source: "signer_setup",
        },
      ],
      null,
    );
    const candidate = await buildFrozenSigningAuthorityCandidate({
      acceptedAuthority: ACCEPTED,
      authoritativeSnapshot: signingSnapshot(2),
    });
    expect(candidate.signers).toHaveLength(3);
    expect(candidate.signers[0].agreementPartyId).toBe(candidate.signers[1].agreementPartyId);
    expect(candidate.execution.signerOrder).toEqual(
      candidate.signers.map((signer) => signer.signerRecordId),
    );
  });

  it("submits the real agreement and accepted version and awaits backend confirmation", async () => {
    const candidate = await buildFrozenSigningAuthorityCandidate({
      acceptedAuthority: ACCEPTED,
      authoritativeSnapshot: signingSnapshot(2),
    });
    let release!: () => void;
    const backendWait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      await backendWait;
      const body = JSON.parse(String(init?.body)) as { snapshot: FrozenSigningAuthoritySnapshotV1 };
      return new Response(JSON.stringify({ snapshot: confirmed(body.snapshot) }), { status: 200 });
    });
    let continued = false;
    const persistence = persistFrozenSigningAuthority(ACCEPTED.agreement_id, candidate).then(
      (snapshot) => {
        continued = true;
        return snapshot;
      },
    );
    await Promise.resolve();
    expect(continued).toBe(false);
    release();
    const response = await persistence;
    expect(continued).toBe(true);
    expect(response.frozenAt).toBeTruthy();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain(`/agreements/${ACCEPTED.agreement_id}/frozen-signing-authority`);
    const submitted = JSON.parse(String(init?.body)).snapshot;
    expect(submitted.agreementId).toBe(ACCEPTED.agreement_id);
    expect(submitted.acceptedVersionId).toBe(ACCEPTED.version_id);
  });

  it("writes cache only after success and rejection blocks continuation", async () => {
    const candidate = await buildFrozenSigningAuthorityCandidate({
      acceptedAuthority: ACCEPTED,
      authoritativeSnapshot: signingSnapshot(2),
    });
    const boundary = createFrozenSigningAuthorityPersistenceBoundary();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "injected_failure" }), { status: 500 }),
    );
    let continued = false;
    await expect(
      boundary.ensure(
        0,
        JSON.stringify(candidate),
        () => persistFrozenSigningAuthority(ACCEPTED.agreement_id, candidate),
        {
          onConfirmed: (snapshot) => cacheConfirmedFrozenSigningAuthority(snapshot),
          onRejected: () => clearCachedFrozenSigningAuthority(ACCEPTED.agreement_id),
        },
      ).then(() => {
        continued = true;
      }),
    ).rejects.toThrow("injected_failure");
    expect(continued).toBe(false);
    expect(readCachedFrozenSigningAuthority(ACCEPTED.agreement_id)).toBeNull();

    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ snapshot: confirmed(candidate) }), { status: 200 }),
    );
    const saved = await boundary.ensure(
      0,
      JSON.stringify(candidate),
      () => persistFrozenSigningAuthority(ACCEPTED.agreement_id, candidate),
      { onConfirmed: cacheConfirmedFrozenSigningAuthority },
    );
    expect(readCachedFrozenSigningAuthority(ACCEPTED.agreement_id)).toEqual(saved);
  });

  it("backend truth outranks a stale confirmed browser cache on reload", async () => {
    const candidate = confirmed(
      await buildFrozenSigningAuthorityCandidate({
        acceptedAuthority: ACCEPTED,
        authoritativeSnapshot: signingSnapshot(2),
      }),
    );
    cacheConfirmedFrozenSigningAuthority(candidate);
    expect(readCachedFrozenSigningAuthority(ACCEPTED.agreement_id)).toEqual(candidate);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));
    await expect(loadFrozenSigningAuthority(ACCEPTED.agreement_id)).resolves.toBeNull();
    expect(readCachedFrozenSigningAuthority(ACCEPTED.agreement_id)).toBeNull();
  });

  it("reuses concurrent persistence and stale-session completion cannot publish", async () => {
    const candidate = confirmed(
      await buildFrozenSigningAuthorityCandidate({
        acceptedAuthority: ACCEPTED,
        authoritativeSnapshot: signingSnapshot(2),
      }),
    );
    const boundary = createFrozenSigningAuthorityPersistenceBoundary();
    let resolvePersist!: (snapshot: FrozenSigningAuthoritySnapshotV1) => void;
    const persist = vi.fn(
      () =>
        new Promise<FrozenSigningAuthoritySnapshotV1>((resolve) => {
          resolvePersist = resolve;
        }),
    );
    const key = JSON.stringify(candidate);
    const first = boundary.ensure(0, key, persist);
    const second = boundary.ensure(0, key, persist);
    expect(first).toBe(second);
    await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(1);
    resolvePersist(candidate);
    await expect(first).resolves.toEqual(candidate);

    let resolveStale!: (snapshot: FrozenSigningAuthoritySnapshotV1) => void;
    const stale = boundary.ensure(
      0,
      `${key}:changed`,
      () =>
        new Promise((resolve) => {
          resolveStale = resolve;
        }),
      { onConfirmed: cacheConfirmedFrozenSigningAuthority },
    );
    await Promise.resolve();
    boundary.activateSession(1);
    const newerCandidate = { ...candidate, frozenAt: "2026-07-17T01:00:00Z" };
    const newer = boundary.ensure(
      1,
      `${key}:new-session`,
      async () => newerCandidate,
      { onConfirmed: cacheConfirmedFrozenSigningAuthority },
    );
    await expect(newer).resolves.toEqual(newerCandidate);
    resolveStale(candidate);
    await expect(stale).rejects.toThrow("stale_review_session");
    expect(readCachedFrozenSigningAuthority(ACCEPTED.agreement_id)).toEqual(newerCandidate);
  });

  it("runs frozen persistence independently after accepted authority already completed", async () => {
    const acceptedBoundary = createAcceptedCorpusPersistenceBoundary();
    const frozenBoundary = createFrozenSigningAuthorityPersistenceBoundary();
    const persistAccepted = vi.fn(async () => ACCEPTED);
    const acceptedBeforeSignerFinalize = await acceptedBoundary.ensure(0, persistAccepted);
    expect(acceptedBeforeSignerFinalize).toBe(ACCEPTED);

    const candidate = confirmed(
      await buildFrozenSigningAuthorityCandidate({
        acceptedAuthority: await acceptedBoundary.ensure(0, persistAccepted),
        authoritativeSnapshot: signingSnapshot(2),
      }),
    );
    const persistFrozen = vi.fn(async () => candidate);
    await frozenBoundary.ensure(0, JSON.stringify(candidate), persistFrozen);

    expect(persistAccepted).toHaveBeenCalledTimes(1);
    expect(persistFrozen).toHaveBeenCalledTimes(1);
  });
});
