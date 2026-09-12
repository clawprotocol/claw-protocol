/**
 * Token-authorized recipient review metadata — version, length, and SHA-256
 * from the server response only. Display chrome cannot invent or mutate these.
 */

export type RecipientReviewAuthorityMeta = {
  lockedVersionId: string;
  corpusSha256: string;
  corpusLength: number;
};

export function selectRecipientReviewAuthorityMeta(args: {
  agreementId: string;
  signingLock?: {
    locked_version_id?: string | null;
    content_sha256?: string | null;
    content_length?: number | null;
  } | null;
  acceptedReviewSnapshot?: {
    agreement_id?: string | null;
    locked_version_id?: string | null;
    corpus_sha256?: string | null;
    corpus_length?: number | null;
    corpus_plain?: string | null;
    status?: string | null;
  } | null;
}): RecipientReviewAuthorityMeta | null {
  const agreementId = String(args.agreementId || "").trim();
  if (!agreementId) return null;
  const snap = args.acceptedReviewSnapshot;
  const snapAid = String(snap?.agreement_id || "").trim();
  if (snapAid && snapAid !== agreementId) return null;
  const status = String(snap?.status || "").trim().toLowerCase();
  if (status && status !== "accepted") return null;
  const lockedVersionId = String(
    snap?.locked_version_id || args.signingLock?.locked_version_id || "",
  ).trim();
  const corpusSha256 = String(snap?.corpus_sha256 || args.signingLock?.content_sha256 || "")
    .trim()
    .toLowerCase();
  const plain = String(snap?.corpus_plain || "").trim();
  const corpusLength =
    Number(snap?.corpus_length || args.signingLock?.content_length || 0) || plain.length;
  if (!lockedVersionId || !/^[0-9a-f]{64}$/.test(corpusSha256) || corpusLength < 1) {
    return null;
  }
  if (plain && plain.length !== corpusLength) return null;
  return { lockedVersionId, corpusSha256, corpusLength };
}
