/**
 * Token-authorized recipient review metadata from the server only.
 * Review occurs before signing lock: pending or accepted revision + SHA-256 is enough.
 * Signing lock remains required on the sign surface, not as the review-version criterion.
 */

export type RecipientReviewAuthorityMeta = {
  snapshotId: string;
  lockedVersionId: string;
  corpusSha256: string;
  corpusLength: number;
  participantId: string;
  status: string;
};

type ReviewRevisionFragment = {
  agreement_id?: string | null;
  snapshot_id?: string | null;
  locked_version_id?: string | null;
  corpus_sha256?: string | null;
  corpus_length?: number | null;
  corpus_plain?: string | null;
  status?: string | null;
  participant_id?: string | null;
} | null;

export function selectRecipientReviewAuthorityMeta(args: {
  agreementId: string;
  signingLock?: {
    locked_version_id?: string | null;
    content_sha256?: string | null;
    content_length?: number | null;
  } | null;
  reviewRevision?: ReviewRevisionFragment;
  acceptedReviewSnapshot?: ReviewRevisionFragment;
}): RecipientReviewAuthorityMeta | null {
  const agreementId = String(args.agreementId || "").trim();
  if (!agreementId) return null;
  const snap = args.reviewRevision || args.acceptedReviewSnapshot;
  const snapAid = String(snap?.agreement_id || "").trim();
  if (snapAid && snapAid !== agreementId) return null;
  const status = String(snap?.status || "").trim().toLowerCase();
  if (status && status !== "accepted" && status !== "pending") return null;
  const snapshotId = String(snap?.snapshot_id || "").trim();
  const lockedVersionId = String(
    snap?.locked_version_id || args.signingLock?.locked_version_id || "",
  ).trim();
  const corpusSha256 = String(snap?.corpus_sha256 || args.signingLock?.content_sha256 || "")
    .trim()
    .toLowerCase();
  const plain = String(snap?.corpus_plain || "").trim();
  const corpusLength =
    Number(snap?.corpus_length || args.signingLock?.content_length || 0) || plain.length;
  const participantId = String(snap?.participant_id || "").trim();
  if (!/^[0-9a-f]{64}$/.test(corpusSha256) || corpusLength < 1) return null;
  if (plain && plain.length !== corpusLength) return null;
  if (snapshotId && (status === "pending" || status === "accepted")) {
    return { snapshotId, lockedVersionId, corpusSha256, corpusLength, participantId, status };
  }
  if (!lockedVersionId) return null;
  return {
    snapshotId,
    lockedVersionId,
    corpusSha256,
    corpusLength,
    participantId,
    status: status || "locked",
  };
}
