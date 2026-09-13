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
          snapshot_id: "crs-1",
          corpus_sha256: SHA,
          corpus_length: 20,
          corpus_plain: "x".repeat(20),
          status: "accepted",
          participant_id: "p-r1",
        },
      }),
    ).toEqual({
      snapshotId: "crs-1",
      lockedVersionId: "lv-1",
      corpusSha256: SHA,
      corpusLength: 20,
      participantId: "p-r1",
      status: "accepted",
    });
  });

  it("accepts a pending owner-authorized revision without a signing lock", () => {
    expect(
      selectRecipientReviewAuthorityMeta({
        agreementId: "ag-a",
        reviewRevision: {
          agreement_id: "ag-a",
          snapshot_id: "crs-pending",
          corpus_sha256: SHA,
          corpus_length: 20,
          status: "pending",
          participant_id: "p-r1",
        },
      }),
    ).toEqual({
      snapshotId: "crs-pending",
      lockedVersionId: "",
      corpusSha256: SHA,
      corpusLength: 20,
      participantId: "p-r1",
      status: "pending",
    });
  });

  it("can take locked version from the accepted snapshot without a signing lock", () => {
    expect(
      selectRecipientReviewAuthorityMeta({
        agreementId: "ag-a",
        acceptedReviewSnapshot: {
          agreement_id: "ag-a",
          snapshot_id: "crs-2",
          locked_version_id: "lv-snap",
          corpus_sha256: SHA,
          corpus_length: 20,
          status: "accepted",
        },
      }),
    ).toEqual({
      snapshotId: "crs-2",
      lockedVersionId: "lv-snap",
      corpusSha256: SHA,
      corpusLength: 20,
      participantId: "",
      status: "accepted",
    });
  });

  it("accepts lock-only sha and length when no review revision is projected", () => {
    expect(
      selectRecipientReviewAuthorityMeta({
        agreementId: "ag-a",
        signingLock: { locked_version_id: "lv-1", content_sha256: SHA, content_length: 42 },
      }),
    ).toEqual({
      snapshotId: "",
      lockedVersionId: "lv-1",
      corpusSha256: SHA,
      corpusLength: 42,
      participantId: "",
      status: "locked",
    });
  });

  it("rejects other-agreement snapshot or length mismatch; empty lock alone is not a review failure", () => {
    expect(
      selectRecipientReviewAuthorityMeta({
        agreementId: "ag-a",
        signingLock: { locked_version_id: "lv-1" },
        acceptedReviewSnapshot: {
          agreement_id: "ag-b",
          snapshot_id: "crs-x",
          corpus_sha256: SHA,
          corpus_length: 20,
          status: "accepted",
        },
      }),
    ).toBeNull();
    expect(
      selectRecipientReviewAuthorityMeta({
        agreementId: "ag-a",
        reviewRevision: {
          agreement_id: "ag-a",
          snapshot_id: "crs-pending",
          corpus_sha256: SHA,
          corpus_length: 19,
          corpus_plain: "x".repeat(20),
          status: "pending",
        },
      }),
    ).toBeNull();
  });
});
