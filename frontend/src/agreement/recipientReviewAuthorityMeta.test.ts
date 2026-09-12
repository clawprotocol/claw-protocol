import { describe, expect, it } from "vitest";
import { selectRecipientReviewAuthorityMeta } from "./recipientReviewAuthorityMeta";

const SHA = "a".repeat(64);

describe("selectRecipientReviewAuthorityMeta", () => {
  it("accepts matching accepted snapshot + lock", () => {
    expect(
      selectRecipientReviewAuthorityMeta({
        agreementId: "ag-a",
        signingLock: { locked_version_id: "lv-1", content_sha256: SHA },
        acceptedReviewSnapshot: {
          agreement_id: "ag-a",
          corpus_sha256: SHA,
          corpus_length: 20,
          corpus_plain: "x".repeat(20),
          status: "accepted",
        },
      }),
    ).toEqual({ lockedVersionId: "lv-1", corpusSha256: SHA, corpusLength: 20 });
  });

  it("can take locked version from the accepted snapshot without a signing lock", () => {
    expect(
      selectRecipientReviewAuthorityMeta({
        agreementId: "ag-a",
        acceptedReviewSnapshot: {
          agreement_id: "ag-a",
          locked_version_id: "lv-snap",
          corpus_sha256: SHA,
          corpus_length: 20,
          status: "accepted",
        },
      }),
    ).toEqual({ lockedVersionId: "lv-snap", corpusSha256: SHA, corpusLength: 20 });
  });

  it("accepts lock-only sha and length when no accepted snapshot is projected", () => {
    expect(
      selectRecipientReviewAuthorityMeta({
        agreementId: "ag-a",
        signingLock: { locked_version_id: "lv-1", content_sha256: SHA, content_length: 42 },
      }),
    ).toEqual({ lockedVersionId: "lv-1", corpusSha256: SHA, corpusLength: 42 });
  });

  it("rejects other-agreement snapshot, pending status, or length mismatch", () => {
    expect(
      selectRecipientReviewAuthorityMeta({
        agreementId: "ag-a",
        signingLock: { locked_version_id: "lv-1" },
        acceptedReviewSnapshot: {
          agreement_id: "ag-b",
          corpus_sha256: SHA,
          corpus_length: 20,
          status: "accepted",
        },
      }),
    ).toBeNull();
    expect(
      selectRecipientReviewAuthorityMeta({
        agreementId: "ag-a",
        signingLock: { locked_version_id: "lv-1" },
        acceptedReviewSnapshot: {
          agreement_id: "ag-a",
          corpus_sha256: SHA,
          corpus_length: 20,
          status: "pending",
        },
      }),
    ).toBeNull();
    expect(
      selectRecipientReviewAuthorityMeta({
        agreementId: "ag-a",
        signingLock: { locked_version_id: "lv-1" },
        acceptedReviewSnapshot: {
          agreement_id: "ag-a",
          corpus_sha256: SHA,
          corpus_length: 19,
          corpus_plain: "x".repeat(20),
          status: "accepted",
        },
      }),
    ).toBeNull();
  });
});
