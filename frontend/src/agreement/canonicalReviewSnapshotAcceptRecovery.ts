/**
 * Resume Screen 2 Continue → accept recovery.
 *
 * Persist+GET of a new pending snapshot clears the local accepted ref and sends
 * expected_accepted_snapshot_id="". A prior commercial accepted row then 409s
 * accept_concurrency_conflict and GET stays pending. This is not leftover
 * Logo/[ORG_1] detection — recover with the server accepted token + allow_revision,
 * or treat an already-accepted matching GET as success.
 */

import type { CanonicalReviewSnapshot } from "./canonicalReviewSnapshotApi";

export const ACCEPT_CONCURRENCY_CONFLICT_CODE = "accept_concurrency_conflict";
export const DIFFERENT_SNAPSHOT_ALREADY_ACCEPTED_CODE = "different_snapshot_already_accepted";

export function isAcceptConcurrencyConflictCode(code: string | null | undefined): boolean {
  const c = String(code || "").trim();
  return c === ACCEPT_CONCURRENCY_CONFLICT_CODE || c === DIFFERENT_SNAPSHOT_ALREADY_ACCEPTED_CODE;
}

export function resolveResumeContinueAcceptConcurrency(args: {
  displaySnapshotId: string;
  displayStatus: string;
  localAcceptedSnapshotId?: string | null;
  serverAcceptedSnapshotId?: string | null;
}): { expectedAcceptedSnapshotId: string; allowRevision: boolean } {
  const displayId = String(args.displaySnapshotId || "").trim();
  const status = String(args.displayStatus || "").trim().toLowerCase();
  const server = String(args.serverAcceptedSnapshotId || "").trim();
  const local = String(args.localAcceptedSnapshotId || "").trim();
  const prior = server || local;
  if (status === "accepted") {
    return { expectedAcceptedSnapshotId: displayId || prior, allowRevision: false };
  }
  if (prior && prior !== displayId) {
    return { expectedAcceptedSnapshotId: prior, allowRevision: true };
  }
  return { expectedAcceptedSnapshotId: prior || "", allowRevision: Boolean(prior && prior !== displayId) };
}

export type PendingAcceptConcurrencyRecovery =
  | { action: "already_accepted" }
  | { action: "retry"; expectedAcceptedSnapshotId: string; allowRevision: true }
  | { action: "fail"; code: string };

export function decidePendingAcceptConcurrencyRecovery(args: {
  displaySnapshotId: string;
  displayDigest: string;
  displayLength: number;
  fetchedStatus: string;
  fetchedSnapshot: Pick<CanonicalReviewSnapshot, "snapshot_id" | "corpus_sha256" | "corpus_length">;
  serverAcceptedSnapshotId?: string | null;
}): PendingAcceptConcurrencyRecovery {
  const displayId = String(args.displaySnapshotId || "").trim();
  const displayDigest = String(args.displayDigest || "").trim().toLowerCase();
  const fetchedId = String(args.fetchedSnapshot.snapshot_id || "").trim();
  const fetchedDigest = String(args.fetchedSnapshot.corpus_sha256 || "").trim().toLowerCase();
  const fetchedLen = Number(args.fetchedSnapshot.corpus_length || 0);
  if (!displayId || !fetchedId) {
    return { action: "fail", code: "display_authority_mismatch" };
  }
  if (
    fetchedId !== displayId ||
    fetchedDigest !== displayDigest ||
    fetchedLen !== Number(args.displayLength || 0)
  ) {
    return { action: "fail", code: "display_authority_mismatch" };
  }
  const status = String(args.fetchedStatus || "").trim().toLowerCase();
  if (status === "accepted") {
    return { action: "already_accepted" };
  }
  if (status !== "pending") {
    return { action: "fail", code: "snapshot_not_pending" };
  }
  const token = String(args.serverAcceptedSnapshotId || "").trim();
  return { action: "retry", expectedAcceptedSnapshotId: token, allowRevision: true };
}
