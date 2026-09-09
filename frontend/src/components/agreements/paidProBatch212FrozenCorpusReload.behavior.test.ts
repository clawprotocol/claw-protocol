/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setOrgId } from "../../launch/orgContext";

const fetchMock = vi.fn();

vi.mock("../../lib/clawApi", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    apiUrl: (path: string) => `http://test.local${path}`,
    resolveApiBase: () => "http://test.local",
  };
});

vi.mock("../../agreement/agreementOrgHeaders", () => ({
  clawAgreementHeaders: () => ({
    "X-Claw-Org-Id": "org_batch212_owner",
    Authorization: "Bearer test-owner",
  }),
}));

const AGREEMENT_A = "ag_frozen_legal_a";
const AGREEMENT_B = "ag_frozen_legal_b";
const ORGANIZATION_ID = "org_batch212_owner";

function uniqueBody(tag: string): string {
  return [
    "PROFESSIONAL SERVICES AGREEMENT",
    "",
    `This Agreement is unique to ${tag} and must not leak across agreements.`,
    "",
    ...Array.from({ length: 20 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1} for ${tag}.`),
  ].join("\n");
}

function snapshotPayload(args: {
  agreementId: string;
  corpus: string;
  digest: string;
  length?: number;
}): Record<string, unknown> {
  return {
    status: "accepted",
    snapshot: {
      snapshot_id: `crs_${args.agreementId}`,
      agreement_id: args.agreementId,
      corpus_plain: args.corpus,
      corpus_sha256: args.digest,
      corpus_length: args.length ?? args.corpus.trim().length,
      status: "accepted",
    },
  };
}

function mockGetSnapshot(
  handler: (url: string) => { status: number; body: Record<string, unknown> },
): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.includes("/canonical-review-snapshot") || url.includes("/accept")) {
      throw new Error(`unexpected fetch ${url}`);
    }
    const result = handler(url);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: async () => result.body,
    };
  });
}

describe("Batch 2.1.2 canonical-snapshot frozen corpus reload", () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.clear();
    localStorage.clear();
    setOrgId(ORGANIZATION_ID);
    const { clearImmutableFrozenLegalCorpus } = await import("./paidProFrozenLegalCorpus");
    clearImmutableFrozenLegalCorpus();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("resets modules and restores the same agreement only after a verified GET", async () => {
    const { sha256CorpusDigest } = await import("../../agreement/canonicalReviewSnapshotApi");
    const corpus = uniqueBody(AGREEMENT_A);
    const digest = await sha256CorpusDigest(corpus);
    mockGetSnapshot(() => ({
      status: 200,
      body: snapshotPayload({ agreementId: AGREEMENT_A, corpus, digest }),
    }));

    const first = await import("./paidProFrozenLegalCorpusFromCanonicalSnapshot");
    const seeded = await first.restoreImmutableFrozenLegalCorpusFromCanonicalSnapshot({
      agreementId: AGREEMENT_A,
      organizationId: ORGANIZATION_ID,
      expectedSha256: digest,
    });
    expect(seeded.ok).toBe(true);

    vi.resetModules();
    vi.stubGlobal("fetch", fetchMock);
    const { resolveImmutableFrozenLegalCorpusOnSignerFinalize } = await import(
      "./paidProFrozenLegalCorpus"
    );
    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_A,
        organizationId: ORGANIZATION_ID,
      }),
    ).toBeNull();

    const restoredMod = await import("./paidProFrozenLegalCorpusFromCanonicalSnapshot");
    const restored = await restoredMod.restoreImmutableFrozenLegalCorpusFromCanonicalSnapshot({
      agreementId: AGREEMENT_A,
      organizationId: ORGANIZATION_ID,
      expectedSha256: digest,
    });
    expect(restored).toMatchObject({ ok: true, body: corpus.trim(), sha256: digest });
    const { resolveImmutableFrozenLegalCorpusOnSignerFinalize: resolveAfter } = await import(
      "./paidProFrozenLegalCorpus"
    );
    expect(
      resolveAfter({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_A,
        organizationId: ORGANIZATION_ID,
        expectedHash: restored.ok ? restored.hash : "",
      }),
    ).toBe(corpus.trim());
  });

  it("403, wrong agreement id, bad digest, and bad length never seed a corpus", async () => {
    const { sha256CorpusDigest } = await import("../../agreement/canonicalReviewSnapshotApi");
    const corpus = uniqueBody(AGREEMENT_A);
    const digest = await sha256CorpusDigest(corpus);
    const { restoreImmutableFrozenLegalCorpusFromCanonicalSnapshot } = await import(
      "./paidProFrozenLegalCorpusFromCanonicalSnapshot"
    );
    const { resolveImmutableFrozenLegalCorpusOnSignerFinalize } = await import(
      "./paidProFrozenLegalCorpus"
    );

    mockGetSnapshot(() => ({
      status: 403,
      body: { detail: { code: "forbidden" } },
    }));
    expect(
      await restoreImmutableFrozenLegalCorpusFromCanonicalSnapshot({
        agreementId: AGREEMENT_A,
        organizationId: ORGANIZATION_ID,
      }),
    ).toMatchObject({ ok: false, reason: "server_get_failed", code: "forbidden" });

    mockGetSnapshot(() => ({
      status: 200,
      body: snapshotPayload({ agreementId: AGREEMENT_B, corpus, digest }),
    }));
    expect(
      await restoreImmutableFrozenLegalCorpusFromCanonicalSnapshot({
        agreementId: AGREEMENT_A,
        organizationId: ORGANIZATION_ID,
      }),
    ).toMatchObject({ ok: false, reason: "agreement_mismatch" });

    mockGetSnapshot(() => ({
      status: 200,
      body: snapshotPayload({
        agreementId: AGREEMENT_A,
        corpus,
        digest: "a".repeat(64),
      }),
    }));
    expect(
      await restoreImmutableFrozenLegalCorpusFromCanonicalSnapshot({
        agreementId: AGREEMENT_A,
        organizationId: ORGANIZATION_ID,
      }),
    ).toMatchObject({ ok: false, reason: "server_get_failed", code: "persist_get_authority_mismatch" });

    mockGetSnapshot(() => ({
      status: 200,
      body: snapshotPayload({
        agreementId: AGREEMENT_A,
        corpus,
        digest,
        length: corpus.trim().length + 40,
      }),
    }));
    expect(
      await restoreImmutableFrozenLegalCorpusFromCanonicalSnapshot({
        agreementId: AGREEMENT_A,
        organizationId: ORGANIZATION_ID,
      }),
    ).toMatchObject({ ok: false, reason: "server_get_failed", code: "persist_get_authority_mismatch" });

    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_A,
        organizationId: ORGANIZATION_ID,
      }),
    ).toBeNull();
  });

  it("Agreement A cannot be returned while finalizing Agreement B", async () => {
    const { sha256CorpusDigest } = await import("../../agreement/canonicalReviewSnapshotApi");
    const a = uniqueBody(AGREEMENT_A);
    const b = uniqueBody(AGREEMENT_B);
    const digestA = await sha256CorpusDigest(a);
    const digestB = await sha256CorpusDigest(b);
    mockGetSnapshot((url) => {
      const id = decodeURIComponent(url.split("/api/agreements/")[1]?.split("/")[0] || "");
      if (id === AGREEMENT_A) {
        return { status: 200, body: snapshotPayload({ agreementId: AGREEMENT_A, corpus: a, digest: digestA }) };
      }
      if (id === AGREEMENT_B) {
        return { status: 200, body: snapshotPayload({ agreementId: AGREEMENT_B, corpus: b, digest: digestB }) };
      }
      return { status: 404, body: { detail: { code: "snapshot_not_found" } } };
    });
    const { restoreImmutableFrozenLegalCorpusFromCanonicalSnapshot } = await import(
      "./paidProFrozenLegalCorpusFromCanonicalSnapshot"
    );
    const { resolveImmutableFrozenLegalCorpusOnSignerFinalize } = await import(
      "./paidProFrozenLegalCorpus"
    );
    expect(
      (await restoreImmutableFrozenLegalCorpusFromCanonicalSnapshot({
        agreementId: AGREEMENT_A,
        organizationId: ORGANIZATION_ID,
      })).ok,
    ).toBe(true);
    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_B,
        organizationId: ORGANIZATION_ID,
      }),
    ).toBeNull();
    expect(
      (await restoreImmutableFrozenLegalCorpusFromCanonicalSnapshot({
        agreementId: AGREEMENT_B,
        organizationId: ORGANIZATION_ID,
      })).ok,
    ).toBe(true);
    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_A,
        organizationId: ORGANIZATION_ID,
      }),
    ).toBe(a.trim());
    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_B,
        organizationId: ORGANIZATION_ID,
      }),
    ).toBe(b.trim());
  });

  it("logout clears client cache only; authorized re-login restores through a new GET", async () => {
    const { sha256CorpusDigest } = await import("../../agreement/canonicalReviewSnapshotApi");
    const corpus = uniqueBody(AGREEMENT_A);
    const digest = await sha256CorpusDigest(corpus);
    let getCount = 0;
    mockGetSnapshot(() => {
      getCount += 1;
      return {
        status: 200,
        body: snapshotPayload({ agreementId: AGREEMENT_A, corpus, digest }),
      };
    });
    const { restoreImmutableFrozenLegalCorpusFromCanonicalSnapshot } = await import(
      "./paidProFrozenLegalCorpusFromCanonicalSnapshot"
    );
    const { resolveImmutableFrozenLegalCorpusOnSignerFinalize } = await import(
      "./paidProFrozenLegalCorpus"
    );
    expect(
      (await restoreImmutableFrozenLegalCorpusFromCanonicalSnapshot({
        agreementId: AGREEMENT_A,
        organizationId: ORGANIZATION_ID,
      })).ok,
    ).toBe(true);
    expect(getCount).toBe(1);

    const { clearLawdogUserSessionState } = await import("../../auth/userSessionState");
    clearLawdogUserSessionState();
    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_A,
        organizationId: ORGANIZATION_ID,
      }),
    ).toBeNull();

    setOrgId(ORGANIZATION_ID);
    const again = await restoreImmutableFrozenLegalCorpusFromCanonicalSnapshot({
      agreementId: AGREEMENT_A,
      organizationId: ORGANIZATION_ID,
      expectedSha256: digest,
    });
    expect(again.ok).toBe(true);
    expect(getCount).toBe(2);
    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_A,
        organizationId: ORGANIZATION_ID,
      }),
    ).toBe(corpus.trim());
  });
});
