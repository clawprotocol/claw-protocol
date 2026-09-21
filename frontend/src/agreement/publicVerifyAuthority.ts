import type { PublicVerifyPayload } from "./agreementPublicVerify";

function trimLower(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Server-authoritative “verified / fully executed” for the public page.
 * Client caches, display text, and a lone audit flag are never enough.
 */
export function isPublicVerifyFullyAttested(data: PublicVerifyPayload | null | undefined): boolean {
  if (!data) return false;
  if (trimLower(data.record_status) === "pending") return false;
  const sig = data.signature_status;
  if (!sig?.fully_executed) return false;
  const recorded = Number(sig.signatures_recorded ?? 0);
  const required = Number(sig.signer_party_count ?? 0);
  if (!Number.isFinite(recorded) || !Number.isFinite(required)) return false;
  if (required <= 0 || recorded < required) return false;
  const vfy = data.verification;
  if (!vfy || vfy.envelope_attestation_valid !== true) return false;
  const snap = vfy.accepted_review_snapshot;
  const snapSha = trimLower(snap?.corpus_sha256);
  if (!snapSha) return false;
  const envSha = trimLower(vfy.envelope_provenance?.acceptedSoTDigest);
  if (!envSha || envSha !== snapSha) return false;
  const commitment = trim(sig.signing_commitment_hash || vfy.signing_commitment_hash);
  if (!commitment) return false;
  if (!trim(sig.locked_version_id)) return false;
  return true;
}

/**
 * Public completed-PDF only when the server already sends an explicit
 * owner/workspace distribution opt-in. Browser/session state cannot invent one.
 * Today no such field is minted — fail closed (metadata-only).
 */
export function publicCompletedPdfDistributionPermitted(
  data: PublicVerifyPayload | null | undefined,
): boolean {
  if (!isPublicVerifyFullyAttested(data)) return false;
  const root = data?.public_completed_pdf_distribution;
  const nested = data?.verification?.public_completed_pdf_distribution;
  return root === true || nested === true;
}

export function publicVerifyStatusLabel(data: PublicVerifyPayload): string {
  if (isPublicVerifyFullyAttested(data)) return "Fully executed";
  const status = trim(data.summary?.status);
  if (status === "fully_executed") return "Record not verified";
  if (status === "partially_signed") return "Partially signed";
  if (status === "locked_for_signing") return "Locked for signing";
  if (status === "in_negotiation") return "In negotiation";
  return status || "—";
}

export function publicVerifyProofBadgeState(
  data: PublicVerifyPayload,
): "draft" | "pending" | "signed" | "verified" {
  if (trimLower(data.record_status) === "pending") return "pending";
  if (isPublicVerifyFullyAttested(data)) return "verified";
  const status = trim(data.summary?.status);
  if (status === "partially_signed" || status === "locked_for_signing") return "pending";
  return "draft";
}
