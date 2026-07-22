/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptCanonicalReviewSnapshot,
  establishServerAcceptedReviewSnapshot,
  persistCanonicalReviewSnapshot,
  readAcceptedReviewSnapshotRef,
  sha256CorpusDigest,
  storeAcceptedReviewSnapshotRef,
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

  it("establishServerAcceptedReviewSnapshot persists then accepts", async () => {
    const corpus = ("OPERATIVE\n\n" + "x".repeat(600)).trim();
    const digest = await sha256CorpusDigest(corpus);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/canonical-review-snapshot/accept")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            accepted: {
              snapshot_id: "crs_test",
              agreement_id: "ag_test",
              corpus_plain: corpus,
              corpus_sha256: digest,
              corpus_length: corpus.length,
              status: "accepted",
              schema_version: "claw.canonical_review_snapshot/v1",
            },
          }),
        } as Response;
      }
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
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await establishServerAcceptedReviewSnapshot({
      agreementId: "ag_test",
      corpusPlain: corpus,
      generationSessionId: "gen_1",
    });
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
      }),
    );
    if (!result.ok) {
      throw new Error(`establish failed: ${result.code}`);
    }
    expect(result.accepted.snapshot_id).toBe("crs_test");
    expect(result.accepted.corpus_sha256).toBe(digest);
    expect(readAcceptedReviewSnapshotRef("ag_test")?.snapshotId).toBe("crs_test");
    expect(fetchMock).toHaveBeenCalled();
    const acceptCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/accept")) as
      | [string, RequestInit?]
      | undefined;
    expect(acceptCall).toBeTruthy();
    const acceptBody = JSON.parse(String(acceptCall?.[1]?.body ?? "{}"));
    expect(acceptBody.corpus_plain).toBeUndefined();
    expect(acceptBody.snapshot_id).toBe("crs_test");
  });

  it("persistCanonicalReviewSnapshot returns error code on http failure", async () => {
    const res = await persistCanonicalReviewSnapshot({
      agreementId: "ag_x",
      corpusPlain: "short",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("invalid_snapshot_args");
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
    });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit?];
    const body = JSON.parse(String(firstCall[1]?.body ?? "{}"));
    expect(body.snapshot_id).toBe("crs_a");
    expect(body.expected_digest).toBe("d".repeat(64));
    expect(body.corpus_plain).toBeUndefined();
  });
});
