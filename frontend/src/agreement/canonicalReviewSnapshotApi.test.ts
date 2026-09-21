/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptCanonicalReviewSnapshot,
  acceptDisplayedCommercialReviewSnapshot,
  canEnableCommercialPrepareFromServerSnapshot,
  establishServerAcceptedReviewSnapshot,
  coerceCanonicalReviewSnapshot,
  persistCanonicalReviewSnapshot,
  prepareCommercialReviewSnapshotAuthority,
  readAcceptedReviewSnapshotRef,
  readDisplayReviewSnapshotAuthority,
  sha256CorpusDigest,
  storeAcceptedReviewSnapshotRef,
  storeDisplayReviewSnapshotAuthority,
} from "./canonicalReviewSnapshotApi";

describe("canonicalReviewSnapshotApi", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("stores and reads accepted snapshot ref scoped by agreement", () => {
    storeAcceptedReviewSnapshotRef({
      agreementId: "ag_1",
      snapshotId: "crs_1",
      corpusSha256: "abc",
      corpusLength: 1200,
    });
    expect(readAcceptedReviewSnapshotRef("ag_1")?.snapshotId).toBe("crs_1");
    expect(readAcceptedReviewSnapshotRef("ag_other")).toBeNull();
  });

  it("sha256CorpusDigest is stable for identical corpus", async () => {
    const a = await sha256CorpusDigest("hello world corpus ".repeat(40));
    const b = await sha256CorpusDigest("hello world corpus ".repeat(40));
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fire-and-forget establishServerAcceptedReviewSnapshot is removed (fail closed)", async () => {
    const result = await establishServerAcceptedReviewSnapshot({
      agreementId: "ag_test",
      corpusPlain: ("OPERATIVE\n\n" + "x".repeat(600)).trim(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("fire_and_forget_commercial_accept_removed");
  });

  it("coerceCanonicalReviewSnapshot accepts wrapped and flat persist/GET envelopes", () => {
    const flat = {
      snapshot_id: "crs_flat",
      agreement_id: "ag_flat",
      corpus_plain: "OPERATIVE\n\n" + "x".repeat(600),
      corpus_sha256: "a".repeat(64),
      corpus_length: 612,
      status: "accepted",
    };
    expect(coerceCanonicalReviewSnapshot(flat)?.snapshot_id).toBe("crs_flat");
    expect(
      coerceCanonicalReviewSnapshot({
        ok: true,
        snapshot: { ...flat, snapshot_id: "crs_wrapped" },
        registry_version: 1,
      })?.snapshot_id,
    ).toBe("crs_wrapped");
  });

  it("prepareCommercialReviewSnapshotAuthority hydrates from a flat snapshot envelope", async () => {
    const corpus = ("OPERATIVE\n\n" + "x".repeat(600)).trim();
    const digest = await sha256CorpusDigest(corpus);
    const flat = {
      snapshot_id: "crs_flat",
      agreement_id: "ag_flat",
      corpus_plain: corpus,
      corpus_sha256: digest,
      corpus_length: corpus.length,
      status: "accepted",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => flat,
      })),
    );
    const result = await prepareCommercialReviewSnapshotAuthority({
      agreementId: "ag_flat",
      corpusPlain: corpus,
      generationSessionId: "gen_flat",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.snapshot.snapshot_id).toBe("crs_flat");
    expect(readDisplayReviewSnapshotAuthority("ag_flat")?.snapshotId).toBe("crs_flat");
  });

  it("prepareCommercialReviewSnapshotAuthority persists then GETs and does not accept", async () => {
    const corpus = ("OPERATIVE\n\n" + "x".repeat(600)).trim();
    const digest = await sha256CorpusDigest(corpus);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method || "GET").toUpperCase();
      if (url.includes("/canonical-review-snapshot") && method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            snapshot: {
              snapshot_id: "crs_test",
              agreement_id: "ag_test",
              corpus_plain: corpus,
              corpus_sha256: digest,
              corpus_length: corpus.length,
              status: "pending",
              schema_version: "claw.canonical_review_snapshot/v1",
            },
            registry_version: 1,
          }),
        } as Response;
      }
      if (url.includes("/canonical-review-snapshot") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "pending",
            snapshot: {
              snapshot_id: "crs_test",
              agreement_id: "ag_test",
              corpus_plain: corpus,
              corpus_sha256: digest,
              corpus_length: corpus.length,
              status: "pending",
              schema_version: "claw.canonical_review_snapshot/v1",
            },
            registry_version: 1,
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await prepareCommercialReviewSnapshotAuthority({
      agreementId: "ag_test",
      corpusPlain: corpus,
      generationSessionId: "gen_1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.snapshot.snapshot_id).toBe("crs_test");
    expect(result.status).toBe("pending");
    expect(readDisplayReviewSnapshotAuthority("ag_test")?.snapshotId).toBe("crs_test");
    expect(readAcceptedReviewSnapshotRef("ag_test")).toBeNull();
    expect(canEnableCommercialPrepareFromServerSnapshot("ag_test")).toBe(false);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/accept"))).toBe(false);
  });

  it("prepareCommercialReviewSnapshotAuthority reuses an accepted snapshot without posting a new pending", async () => {
    const corpus = ("OPERATIVE\n\n" + "accepted-reuse ".repeat(40)).trim();
    const digest = await sha256CorpusDigest(corpus);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method || "GET").toUpperCase();
      if (url.includes("/canonical-review-snapshot") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "accepted",
            snapshot: {
              snapshot_id: "crs_accepted",
              agreement_id: "ag_accepted",
              corpus_plain: corpus,
              corpus_sha256: digest,
              corpus_length: corpus.length,
              status: "accepted",
            },
            registry_version: 2,
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await prepareCommercialReviewSnapshotAuthority({
      agreementId: "ag_accepted",
      corpusPlain: corpus,
      generationSessionId: "gen_reuse",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.snapshot.snapshot_id).toBe("crs_accepted");
    expect(result.status).toBe("accepted");
    expect(readAcceptedReviewSnapshotRef("ag_accepted")?.snapshotId).toBe("crs_accepted");
    expect(fetchMock.mock.calls.some((c) => String(c[1]?.method || "GET").toUpperCase() === "POST")).toBe(
      false,
    );
  });

  it("prepareCommercialReviewSnapshotAuthority does not persist a divergent pending after accept", async () => {
    const accepted = ("OPERATIVE\n\n" + "accepted-bytes ".repeat(40)).trim();
    const rewritten = ("OPERATIVE\n\n" + "rewritten-bytes ".repeat(40)).trim();
    const digest = await sha256CorpusDigest(accepted);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method || "GET").toUpperCase();
      if (url.includes("/canonical-review-snapshot") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "accepted",
            snapshot: {
              snapshot_id: "crs_accepted",
              agreement_id: "ag_locked",
              corpus_plain: accepted,
              corpus_sha256: digest,
              corpus_length: accepted.length,
              status: "accepted",
            },
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await prepareCommercialReviewSnapshotAuthority({
      agreementId: "ag_locked",
      corpusPlain: rewritten,
      generationSessionId: "gen_rewrite",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected immutable reject");
    expect(result.code).toBe("accepted_snapshot_immutable");
    expect(fetchMock.mock.calls.some((c) => String(c[1]?.method || "GET").toUpperCase() === "POST")).toBe(
      false,
    );
  });

  it("prepareCommercialReviewSnapshotAuthority may persist a new pending when the customer approved a revision", async () => {
    const accepted = ("OPERATIVE\n\n" + "accepted-bytes ".repeat(40)).trim();
    const rewritten = ("OPERATIVE\n\n" + "named-signer-bytes ".repeat(40)).trim();
    const digest = await sha256CorpusDigest(accepted);
    const rewrittenDigest = await sha256CorpusDigest(rewritten);
    let current = {
      status: "accepted",
      snapshot: {
        snapshot_id: "crs_accepted",
        agreement_id: "ag_locked",
        corpus_plain: accepted,
        corpus_sha256: digest,
        corpus_length: accepted.length,
        status: "accepted",
      },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method || "GET").toUpperCase();
      if (url.includes("/canonical-review-snapshot/accept") && method === "POST") {
        const body = JSON.parse(String(init?.body || "{}")) as {
          snapshot_id?: string;
          allow_revision?: boolean;
          expected_accepted_snapshot_id?: string;
        };
        expect(body.allow_revision).toBe(true);
        expect(body.expected_accepted_snapshot_id).toBe("crs_accepted");
        expect(body.snapshot_id).toBe("crs_named");
        current = {
          status: "accepted",
          snapshot: {
            snapshot_id: "crs_named",
            agreement_id: "ag_locked",
            corpus_plain: rewritten,
            corpus_sha256: rewrittenDigest,
            corpus_length: rewritten.length,
            status: "accepted",
          },
        };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            accepted: current.snapshot,
          }),
        } as Response;
      }
      if (url.includes("/canonical-review-snapshot") && method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "pending",
            snapshot: {
              snapshot_id: "crs_named",
              agreement_id: "ag_locked",
              corpus_plain: rewritten,
              corpus_sha256: rewrittenDigest,
              corpus_length: rewritten.length,
              status: "pending",
            },
          }),
        } as Response;
      }
      if (url.includes("/canonical-review-snapshot") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => current,
        } as Response;
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await prepareCommercialReviewSnapshotAuthority({
      agreementId: "ag_locked",
      corpusPlain: rewritten,
      generationSessionId: "gen_named",
      allowSupersedingRevision: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.snapshot.snapshot_id).toBe("crs_named");
    expect(result.status).toBe("accepted");
    expect(result.snapshot.corpus_sha256).toBe(rewrittenDigest);
    expect(
      fetchMock.mock.calls.some(
        (c) =>
          String(c[0]).includes("/canonical-review-snapshot/accept") &&
          String(c[1]?.method || "").toUpperCase() === "POST",
      ),
    ).toBe(true);
  });

  it("prepareCommercialReviewSnapshotAuthority accepts the customer-approved pending when none is accepted yet", async () => {
    const first = ("OPERATIVE\n\n" + "first-apply-bytes ".repeat(40)).trim();
    const named = ("OPERATIVE\n\n" + "named-advisor-bytes ".repeat(40)).trim();
    const firstDigest = await sha256CorpusDigest(first);
    const namedDigest = await sha256CorpusDigest(named);
    let current = {
      status: "pending",
      snapshot: {
        snapshot_id: "crs_first",
        agreement_id: "ag_identity",
        corpus_plain: first,
        corpus_sha256: firstDigest,
        corpus_length: first.length,
        status: "pending",
      },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method || "GET").toUpperCase();
      if (url.includes("/canonical-review-snapshot/accept") && method === "POST") {
        const body = JSON.parse(String(init?.body || "{}")) as {
          snapshot_id?: string;
          allow_revision?: boolean;
        };
        expect(body.allow_revision).toBe(false);
        expect(body.snapshot_id).toBe("crs_named");
        current = {
          status: "accepted",
          snapshot: {
            snapshot_id: "crs_named",
            agreement_id: "ag_identity",
            corpus_plain: named,
            corpus_sha256: namedDigest,
            corpus_length: named.length,
            status: "accepted",
          },
        };
        return {
          ok: true,
          status: 200,
          json: async () => ({ accepted: current.snapshot }),
        } as Response;
      }
      if (url.includes("/canonical-review-snapshot") && method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "pending",
            snapshot: {
              snapshot_id: "crs_named",
              agreement_id: "ag_identity",
              corpus_plain: named,
              corpus_sha256: namedDigest,
              corpus_length: named.length,
              status: "pending",
            },
          }),
        } as Response;
      }
      if (url.includes("/canonical-review-snapshot") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => current,
        } as Response;
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await prepareCommercialReviewSnapshotAuthority({
      agreementId: "ag_identity",
      corpusPlain: named,
      generationSessionId: "gen_named",
      allowSupersedingRevision: true,
      acceptIfNoPriorAccepted: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.snapshot.snapshot_id).toBe("crs_named");
    expect(result.status).toBe("accepted");
    expect(result.snapshot.corpus_sha256).toBe(namedDigest);
  });

  it("acceptDisplayedCommercialReviewSnapshot fails when display differs from GET", async () => {
    const corpus = ("OPERATIVE\n\n" + "x".repeat(600)).trim();
    const digest = await sha256CorpusDigest(corpus);
    storeDisplayReviewSnapshotAuthority({
      agreementId: "ag_test",
      snapshotId: "crs_display_a",
      corpusSha256: digest,
      corpusLength: corpus.length,
      status: "pending",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          status: "pending",
          snapshot: {
            snapshot_id: "crs_other_b",
            agreement_id: "ag_test",
            corpus_plain: corpus,
            corpus_sha256: digest,
            corpus_length: corpus.length,
            status: "pending",
          },
        }),
      })),
    );
    const result = await acceptDisplayedCommercialReviewSnapshot({ agreementId: "ag_test" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("display_authority_mismatch");
  });

  it("acceptCanonicalReviewSnapshot does not send replacement corpus bytes", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        accepted: {
          snapshot_id: "crs_a",
          agreement_id: "ag_a",
          corpus_plain: "body",
          corpus_sha256: "d".repeat(64),
          corpus_length: 4,
          status: "accepted",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await acceptCanonicalReviewSnapshot({
      agreementId: "ag_a",
      snapshotId: "crs_a",
      expectedDigest: "d".repeat(64),
      expectedAcceptedSnapshotId: "",
      displaySnapshotId: "crs_a",
      displayDigest: "d".repeat(64),
      displayLength: 4,
    });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit?];
    const body = JSON.parse(String(firstCall[1]?.body ?? "{}"));
    expect(body.snapshot_id).toBe("crs_a");
    expect(body.expected_digest).toBe("d".repeat(64));
    expect(body.corpus_plain).toBeUndefined();
    expect(body.display_snapshot_id).toBe("crs_a");
  });

  it("persistCanonicalReviewSnapshot returns error code on http failure", async () => {
    const res = await persistCanonicalReviewSnapshot({
      agreementId: "ag_x",
      corpusPlain: "short",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("invalid_snapshot_args");
  });

  it("canEnableCommercialPrepareFromServerSnapshot requires verified GET corpus + display==accepted", async () => {
    const corpus = ("OPERATIVE\n\n" + "x".repeat(600)).trim();
    const sha = await sha256CorpusDigest(corpus);
    const { storeVerifiedCommercialDisplayCorpus } = await import("./canonicalReviewSnapshotApi");
    storeVerifiedCommercialDisplayCorpus({
      agreementId: "ag_1",
      snapshotId: "crs_1",
      corpusSha256: sha,
      corpusLength: corpus.length,
      status: "pending",
      corpusPlain: corpus,
    });
    expect(canEnableCommercialPrepareFromServerSnapshot("ag_1")).toBe(false);
    storeAcceptedReviewSnapshotRef({
      agreementId: "ag_1",
      snapshotId: "crs_1",
      corpusSha256: sha,
      corpusLength: corpus.length,
    });
    storeVerifiedCommercialDisplayCorpus({
      agreementId: "ag_1",
      snapshotId: "crs_1",
      corpusSha256: sha,
      corpusLength: corpus.length,
      status: "accepted",
      corpusPlain: corpus,
    });
    expect(canEnableCommercialPrepareFromServerSnapshot("ag_1")).toBe(true);
  });

  it("prepare/empty agreementId cannot bypass Prepare authority", async () => {
    const corpus = ("OPERATIVE\n\n" + "x".repeat(600)).trim();
    for (const agreementId of ["", "   "]) {
      const prepared = await prepareCommercialReviewSnapshotAuthority({
        agreementId,
        corpusPlain: corpus,
      });
      expect(prepared.ok).toBe(false);
      if (!prepared.ok) expect(prepared.code).toBe("invalid_snapshot_args");
      expect(canEnableCommercialPrepareFromServerSnapshot(agreementId)).toBe(false);
    }
  });

  it("local accepted/display refs alone do not unlock Prepare without verified GET corpus", async () => {
    // Local-only session refs (simulating a premium completion snap leftover) are insufficient
    // until verified GET corpus + matching accepted authority exist.
    storeAcceptedReviewSnapshotRef({
      agreementId: "ag_local_only",
      snapshotId: "crs_local",
      corpusSha256: "f".repeat(64),
      corpusLength: 1200,
    });
    expect(canEnableCommercialPrepareFromServerSnapshot("ag_local_only")).toBe(false);
    expect(canEnableCommercialPrepareFromServerSnapshot("")).toBe(false);
    expect(canEnableCommercialPrepareFromServerSnapshot(null)).toBe(false);

    storeDisplayReviewSnapshotAuthority({
      agreementId: "ag_local_only",
      snapshotId: "crs_other",
      corpusSha256: "e".repeat(64),
      corpusLength: 1200,
      status: "accepted",
    });
    expect(canEnableCommercialPrepareFromServerSnapshot("ag_local_only")).toBe(false);

    storeDisplayReviewSnapshotAuthority({
      agreementId: "ag_local_only",
      snapshotId: "crs_local",
      corpusSha256: "f".repeat(64),
      corpusLength: 1200,
      status: "accepted",
    });
    // Matching metadata without GET corpus bytes still blocks Prepare.
    expect(canEnableCommercialPrepareFromServerSnapshot("ag_local_only")).toBe(false);

    const corpus = ("OPERATIVE\n\n" + "y".repeat(600)).trim();
    const sha = await sha256CorpusDigest(corpus);
    const { storeVerifiedCommercialDisplayCorpus } = await import("./canonicalReviewSnapshotApi");
    storeVerifiedCommercialDisplayCorpus({
      agreementId: "ag_local_only",
      snapshotId: "crs_local",
      corpusSha256: sha,
      corpusLength: corpus.length,
      status: "accepted",
      corpusPlain: corpus,
    });
    storeAcceptedReviewSnapshotRef({
      agreementId: "ag_local_only",
      snapshotId: "crs_local",
      corpusSha256: sha,
      corpusLength: corpus.length,
    });
    expect(canEnableCommercialPrepareFromServerSnapshot("ag_local_only")).toBe(true);
  });
});
