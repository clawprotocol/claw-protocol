/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setOrgId } from "../../launch/orgContext";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { SHARED_HARBOR_PEAK, SHARED_RED_MESA } from "./paidProSharedFixtureSystem";

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
    "X-Claw-Org-Id": "org_batch221_owner",
    Authorization: "Bearer test-owner",
  }),
}));

const AGREEMENT_ID = "ag_batch221_pending";
const ORGANIZATION_ID = "org_batch221_owner";

function uniqueBody(tag: string): string {
  return [
    "PROFESSIONAL SERVICES AGREEMENT",
    "",
    `This pending snapshot body is unique to ${tag}.`,
    "",
    ...Array.from({ length: 20 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1} for ${tag}.`),
  ].join("\n");
}

function snapshotPayload(args: {
  agreementId: string;
  corpus: string;
  digest: string;
  status: "pending" | "accepted";
}): Record<string, unknown> {
  return {
    status: args.status,
    snapshot: {
      snapshot_id: `crs_${args.agreementId}_${args.status}`,
      agreement_id: args.agreementId,
      corpus_plain: args.corpus,
      corpus_sha256: args.digest,
      corpus_length: args.corpus.trim().length,
      status: args.status,
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

function liveAuthority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: SHARED_RED_MESA,
    recipient2Name: SHARED_HARBOR_PEAK,
    recipient1Email: "jordan.hale@example.test",
    recipient2Email: "casey.quinn@example.test",
    extraPartyReviewEmails: [],
    partySignerNames: ["Jordan Hale", "Casey Quinn"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: ["100 Ridge Way, Boise, ID 83702", "200 Cedar Ave, Tacoma, WA 98402"],
  });
}

describe("Batch 2.2.1 pending snapshot cannot seed frozen authority", () => {
  const hydrateSpy = vi.fn(
    (gate: { agreementId: string; organizationId: string; body: string; hash: string }) =>
      buildHydratedAuthoritativeSigningCorpusFromAuthority({
        rawCorpus: gate.body,
        authority: liveAuthority(),
        intakeRaw: "",
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: gate.agreementId,
        organizationId: gate.organizationId,
        expectedFrozenHash: gate.hash,
      }),
  );

  beforeEach(async () => {
    fetchMock.mockReset();
    hydrateSpy.mockClear();
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

  it("owned pending GET may hydrate review display but restore and finalize stay blocked", async () => {
    const { sha256CorpusDigest } = await import("../../agreement/canonicalReviewSnapshotApi");
    const corpus = uniqueBody(AGREEMENT_ID);
    const digest = await sha256CorpusDigest(corpus);
    mockGetSnapshot(() => ({
      status: 200,
      body: snapshotPayload({
        agreementId: AGREEMENT_ID,
        corpus,
        digest,
        status: "pending",
      }),
    }));

    const { hydrateCommercialReviewFromServerSnapshot, readAcceptedReviewSnapshotRef } = await import(
      "../../agreement/canonicalReviewSnapshotApi"
    );
    const displayed = await hydrateCommercialReviewFromServerSnapshot({ agreementId: AGREEMENT_ID });
    expect(displayed.ok).toBe(true);
    if (!displayed.ok) return;
    expect(displayed.accepted).toBe(false);
    expect(displayed.status).toBe("pending");
    expect(displayed.snapshot.corpus_plain.trim()).toBe(corpus.trim());
    expect(readAcceptedReviewSnapshotRef(AGREEMENT_ID)).toBeNull();

    const { restoreImmutableFrozenLegalCorpusFromCanonicalSnapshot } = await import(
      "./paidProFrozenLegalCorpusFromCanonicalSnapshot"
    );
    const restored = await restoreImmutableFrozenLegalCorpusFromCanonicalSnapshot({
      agreementId: AGREEMENT_ID,
      organizationId: ORGANIZATION_ID,
    });
    expect(restored).toMatchObject({ ok: false, reason: "pending_snapshot" });

    const { readImmutableFrozenLegalCorpus } = await import("./paidProFrozenLegalCorpus");
    expect(
      readImmutableFrozenLegalCorpus({
        agreementId: AGREEMENT_ID,
        organizationId: ORGANIZATION_ID,
      }),
    ).toBeNull();

    const { gateSignerFinalizeOnVerifiedFrozenAuthority } = await import(
      "./paidProFrozenLegalCorpusFromCanonicalSnapshot"
    );
    const gate = await gateSignerFinalizeOnVerifiedFrozenAuthority({
      agreementId: AGREEMENT_ID,
      organizationId: ORGANIZATION_ID,
    });
    expect(gate).toMatchObject({ ok: false, reason: "pending_snapshot" });
    expect(hydrateSpy).not.toHaveBeenCalled();
  });
});
