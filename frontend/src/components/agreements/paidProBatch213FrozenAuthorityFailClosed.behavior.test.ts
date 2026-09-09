/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setOrgId } from "../../launch/orgContext";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
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
    "X-Claw-Org-Id": "org_batch213_owner",
    Authorization: "Bearer test-owner",
  }),
}));

const AGREEMENT_ID = "ag_batch213_frozen";
const ORGANIZATION_A = "org_batch213_owner";
const ORGANIZATION_B = "org_batch213_other";

const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
const corpusSrc = readFileSync(join(__dirname, "paidProFrozenLegalCorpus.ts"), "utf8");

function uniqueBody(tag: string): string {
  return [
    "PROFESSIONAL SERVICES AGREEMENT",
    "",
    `This Agreement is unique to ${tag} and must not leak across organizations.`,
    "",
    ...Array.from({ length: 20 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1} for ${tag}.`),
  ].join("\n");
}

function snapshotPayload(args: {
  agreementId: string;
  corpus: string;
  digest: string;
}): Record<string, unknown> {
  return {
    status: "accepted",
    snapshot: {
      snapshot_id: `crs_${args.agreementId}`,
      agreement_id: args.agreementId,
      corpus_plain: args.corpus,
      corpus_sha256: args.digest,
      corpus_length: args.corpus.trim().length,
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

describe("Batch 2.1.3 missing frozen authority fail-closed", () => {
  const hydrateSpy = vi.fn(
    (gate: { agreementId: string; organizationId: string; body: string; hash: string }) =>
      buildHydratedAuthoritativeSigningCorpusFromAuthority({
        rawCorpus: `${gate.body}\n\nUNAUTHORIZED OVERLAY MUST NOT APPLY.`,
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

  async function productionFinalizeAuthorityThenHydrate(args: {
    agreementId?: string | null;
    organizationId?: string | null;
    expectedHash?: string | null;
  }) {
    const { gateSignerFinalizeOnVerifiedFrozenAuthority } = await import(
      "./paidProFrozenLegalCorpusFromCanonicalSnapshot"
    );
    const gate = await gateSignerFinalizeOnVerifiedFrozenAuthority(args);
    if (!gate.ok) return { blocked: true as const, gate };
    return { blocked: false as const, gate, hydrated: hydrateSpy(gate) };
  }

  beforeEach(async () => {
    fetchMock.mockReset();
    hydrateSpy.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.clear();
    localStorage.clear();
    setOrgId(ORGANIZATION_A);
    const { clearImmutableFrozenLegalCorpus } = await import("./paidProFrozenLegalCorpus");
    clearImmutableFrozenLegalCorpus();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("production code has no unscoped or raw-corpus hash fallbacks", () => {
    expect(corpusSrc).not.toMatch(/ephemeralUnscoped/);
    expect(corpusSrc).not.toMatch(/currentAgreementId/);
    expect(corpusSrc).not.toMatch(/rawCorpus/);
    expect(corpusSrc).toContain("sessionByOrgAndAgreement");

    const fnStart = intakeSrc.indexOf(
      "const finalizePaidProSignerMetadataAndOpenReviewDecision = React.useCallback",
    );
    const fnEnd = intakeSrc.indexOf(
      "finalizePaidProSignerMetadataAndOpenReviewDecisionRef.current",
      fnStart,
    );
    const block = intakeSrc.slice(fnStart, fnEnd);
    const gateIdx = block.indexOf("gateSignerFinalizeOnVerifiedFrozenAuthority");
    const hydrateIdx = block.indexOf("buildHydratedAuthoritativeSigningCorpusFromAuthority");
    const snapshotIdx = block.indexOf("createAuthoritativeSigningSnapshot");
    const unlockIdx = block.indexOf("setGuidedFinalReviewExplicitlyOpened(true)");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(hydrateIdx);
    const gateFailIdx = block.indexOf("if (!frozenGate.ok)");
    expect(gateFailIdx).toBeGreaterThan(-1);
    expect(gateFailIdx).toBeLessThan(hydrateIdx);
    const gateFailReturn = block.indexOf("return false", gateFailIdx);
    expect(gateFailReturn).toBeGreaterThan(gateFailIdx);
    expect(gateFailReturn).toBeLessThan(hydrateIdx);
    expect(hydrateIdx).toBeLessThan(snapshotIdx);
    expect(hydrateIdx).toBeLessThan(unlockIdx);
    expect(block).not.toContain("resolveExpectedFrozenHashForSignerFinalize");
  });

  it("valid durable ID plus missing cache plus 404 blocks and never hydrates", async () => {
    mockGetSnapshot(() => ({
      status: 404,
      body: { detail: { code: "snapshot_not_found" } },
    }));
    const result = await productionFinalizeAuthorityThenHydrate({
      agreementId: AGREEMENT_ID,
      organizationId: ORGANIZATION_A,
    });
    expect(result.blocked).toBe(true);
    expect(result.gate).toMatchObject({ ok: false, reason: "server_get_failed" });
    expect(hydrateSpy).not.toHaveBeenCalled();
    const { readImmutableFrozenLegalCorpus } = await import("./paidProFrozenLegalCorpus");
    expect(
      readImmutableFrozenLegalCorpus({
        agreementId: AGREEMENT_ID,
        organizationId: ORGANIZATION_A,
      }),
    ).toBeNull();
  });

  it("wrong hash blocks and never hydrates", async () => {
    const corpus = uniqueBody(AGREEMENT_ID);
    const { rememberImmutableFrozenLegalCorpus } = await import("./paidProFrozenLegalCorpus");
    expect(
      rememberImmutableFrozenLegalCorpus(corpus, {
        agreementId: AGREEMENT_ID,
        organizationId: ORGANIZATION_A,
      }),
    ).toBe(true);
    const result = await productionFinalizeAuthorityThenHydrate({
      agreementId: AGREEMENT_ID,
      organizationId: ORGANIZATION_A,
      expectedHash: "wrong-frozen-hash",
    });
    expect(result.blocked).toBe(true);
    expect(result.gate).toMatchObject({ ok: false, reason: "hash_mismatch" });
    expect(hydrateSpy).not.toHaveBeenCalled();
  });

  it("missing ID blocks and never hydrates", async () => {
    const result = await productionFinalizeAuthorityThenHydrate({
      agreementId: "",
      organizationId: ORGANIZATION_A,
    });
    expect(result.blocked).toBe(true);
    expect(result.gate).toMatchObject({ ok: false, reason: "missing_authority" });
    expect(hydrateSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verified GET seeds the exact scoped record and permits finalization", async () => {
    const { sha256CorpusDigest } = await import("../../agreement/canonicalReviewSnapshotApi");
    const corpus = uniqueBody(AGREEMENT_ID);
    const digest = await sha256CorpusDigest(corpus);
    mockGetSnapshot(() => ({
      status: 200,
      body: snapshotPayload({ agreementId: AGREEMENT_ID, corpus, digest }),
    }));
    const result = await productionFinalizeAuthorityThenHydrate({
      agreementId: AGREEMENT_ID,
      organizationId: ORGANIZATION_A,
    });
    expect(result.blocked).toBe(false);
    if (result.blocked) return;
    expect(result.gate).toMatchObject({
      ok: true,
      agreementId: AGREEMENT_ID,
      organizationId: ORGANIZATION_A,
      body: corpus.trim(),
      hash: hashPaidProCorpus(corpus),
    });
    expect(hydrateSpy).toHaveBeenCalledTimes(1);
    expect(result.hydrated.corpus).toBe(corpus.trim());
    const {
      readImmutableFrozenLegalCorpus,
      resolveExpectedFrozenHashForSignerFinalize,
      shouldBlockSignerFinalizeFrozenMismatch,
    } = await import("./paidProFrozenLegalCorpus");
    expect(
      readImmutableFrozenLegalCorpus({
        agreementId: AGREEMENT_ID,
        organizationId: ORGANIZATION_A,
      }),
    ).toBe(corpus.trim());
    expect(
      resolveExpectedFrozenHashForSignerFinalize({
        agreementId: AGREEMENT_ID,
        organizationId: ORGANIZATION_A,
      }),
    ).toBe(hashPaidProCorpus(corpus));
    expect(
      shouldBlockSignerFinalizeFrozenMismatch({
        agreementId: AGREEMENT_ID,
        organizationId: ORGANIZATION_A,
        hydratedCorpus: result.hydrated.corpus,
      }),
    ).toBe(false);
  });

  it("switching organizations invalidates the record", async () => {
    const corpus = uniqueBody(AGREEMENT_ID);
    const { rememberImmutableFrozenLegalCorpus, readImmutableFrozenLegalCorpus } = await import(
      "./paidProFrozenLegalCorpus"
    );
    expect(
      rememberImmutableFrozenLegalCorpus(corpus, {
        agreementId: AGREEMENT_ID,
        organizationId: ORGANIZATION_A,
      }),
    ).toBe(true);
    expect(
      readImmutableFrozenLegalCorpus({
        agreementId: AGREEMENT_ID,
        organizationId: ORGANIZATION_A,
      }),
    ).toBe(corpus.trim());

    setOrgId(ORGANIZATION_B);
    expect(
      readImmutableFrozenLegalCorpus({
        agreementId: AGREEMENT_ID,
        organizationId: ORGANIZATION_A,
      }),
    ).toBeNull();
    expect(
      readImmutableFrozenLegalCorpus({
        agreementId: AGREEMENT_ID,
        organizationId: ORGANIZATION_B,
      }),
    ).toBeNull();

    mockGetSnapshot(() => ({
      status: 404,
      body: { detail: { code: "snapshot_not_found" } },
    }));
    const result = await productionFinalizeAuthorityThenHydrate({
      agreementId: AGREEMENT_ID,
      organizationId: ORGANIZATION_B,
    });
    expect(result.blocked).toBe(true);
    expect(hydrateSpy).not.toHaveBeenCalled();
  });

  it("shouldBlock is true when the keyed record is missing", async () => {
    const { shouldBlockSignerFinalizeFrozenMismatch, resolveExpectedFrozenHashForSignerFinalize } =
      await import("./paidProFrozenLegalCorpus");
    expect(
      shouldBlockSignerFinalizeFrozenMismatch({
        agreementId: AGREEMENT_ID,
        organizationId: ORGANIZATION_A,
        hydratedCorpus: uniqueBody(AGREEMENT_ID),
      }),
    ).toBe(true);
    expect(
      resolveExpectedFrozenHashForSignerFinalize({
        agreementId: AGREEMENT_ID,
        organizationId: ORGANIZATION_A,
      }),
    ).toBeNull();
  });
});
