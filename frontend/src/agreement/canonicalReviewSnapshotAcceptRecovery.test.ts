import { describe, expect, it } from "vitest";
import {
  decidePendingAcceptConcurrencyRecovery,
  isAcceptConcurrencyConflictCode,
  resolveResumeContinueAcceptConcurrency,
} from "./canonicalReviewSnapshotAcceptRecovery";

describe("resume Continue accept concurrency recovery", () => {
  it("fresh pending with no prior accepted stays empty-token first accept", () => {
    expect(
      resolveResumeContinueAcceptConcurrency({
        displaySnapshotId: "crs_new",
        displayStatus: "pending",
        localAcceptedSnapshotId: null,
        serverAcceptedSnapshotId: null,
      }),
    ).toEqual({ expectedAcceptedSnapshotId: "", allowRevision: false });
  });

  it("pending over prior commercial uses server token + allow_revision", () => {
    expect(
      resolveResumeContinueAcceptConcurrency({
        displaySnapshotId: "crs_pending",
        displayStatus: "pending",
        localAcceptedSnapshotId: null,
        serverAcceptedSnapshotId: "crs_commercial",
      }),
    ).toEqual({ expectedAcceptedSnapshotId: "crs_commercial", allowRevision: true });
  });

  it("cleared local ref still uses stashed / local prior for revision", () => {
    expect(
      resolveResumeContinueAcceptConcurrency({
        displaySnapshotId: "crs_pending",
        displayStatus: "pending",
        localAcceptedSnapshotId: "crs_commercial",
        serverAcceptedSnapshotId: null,
      }),
    ).toEqual({ expectedAcceptedSnapshotId: "crs_commercial", allowRevision: true });
  });

  it("already-accepted display is idempotent (no revision)", () => {
    expect(
      resolveResumeContinueAcceptConcurrency({
        displaySnapshotId: "crs_accepted",
        displayStatus: "accepted",
        localAcceptedSnapshotId: "crs_accepted",
        serverAcceptedSnapshotId: "crs_accepted",
      }),
    ).toEqual({ expectedAcceptedSnapshotId: "crs_accepted", allowRevision: false });
  });

  it("409 recovery treats matching accepted GET as success", () => {
    expect(
      decidePendingAcceptConcurrencyRecovery({
        displaySnapshotId: "crs_pending",
        displayDigest: "a".repeat(64),
        displayLength: 800,
        fetchedStatus: "accepted",
        fetchedSnapshot: {
          snapshot_id: "crs_pending",
          corpus_sha256: "a".repeat(64),
          corpus_length: 800,
        },
        serverAcceptedSnapshotId: "crs_pending",
      }),
    ).toEqual({ action: "already_accepted" });
  });

  it("409 recovery retries pending GET with server token + allow_revision", () => {
    expect(
      decidePendingAcceptConcurrencyRecovery({
        displaySnapshotId: "crs_pending",
        displayDigest: "b".repeat(64),
        displayLength: 900,
        fetchedStatus: "pending",
        fetchedSnapshot: {
          snapshot_id: "crs_pending",
          corpus_sha256: "b".repeat(64),
          corpus_length: 900,
        },
        serverAcceptedSnapshotId: "crs_commercial",
      }),
    ).toEqual({
      action: "retry",
      expectedAcceptedSnapshotId: "crs_commercial",
      allowRevision: true,
    });
  });

  it("409 recovery fails closed when GET diverges from display", () => {
    expect(
      decidePendingAcceptConcurrencyRecovery({
        displaySnapshotId: "crs_display",
        displayDigest: "c".repeat(64),
        displayLength: 700,
        fetchedStatus: "pending",
        fetchedSnapshot: {
          snapshot_id: "crs_other",
          corpus_sha256: "c".repeat(64),
          corpus_length: 700,
        },
        serverAcceptedSnapshotId: "crs_commercial",
      }),
    ).toEqual({ action: "fail", code: "display_authority_mismatch" });
  });

  it("recognizes concurrency conflict codes only", () => {
    expect(isAcceptConcurrencyConflictCode("accept_concurrency_conflict")).toBe(true);
    expect(isAcceptConcurrencyConflictCode("different_snapshot_already_accepted")).toBe(true);
    expect(isAcceptConcurrencyConflictCode("display_authority_mismatch")).toBe(false);
    expect(isAcceptConcurrencyConflictCode("")).toBe(false);
  });
});
