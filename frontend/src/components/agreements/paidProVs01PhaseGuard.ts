/**
 * VS01 eligibility and signing-corpus integrity run only when signature prep is active
 * or a finalized signer-ready corpus exists — not during premium wait / first review.
 */

export type PaidProVs01CheckPhase =
  | "starter_preview"
  | "premium_wait"
  | "paid_pro_first_review"
  | "signature_preparation"
  | "signer_ready";

export function resolvePaidProVs01CheckPhase(args: {
  premiumCorpusInProgress?: boolean;
  paidProAuthoritative?: boolean;
  hasAuthoritativeSigningSnapshot?: boolean;
  guidedSigningHandoffActive?: boolean;
  signaturePreparationRequested?: boolean;
  prepareSignatureLinksRequested?: boolean;
}): PaidProVs01CheckPhase {
  if (args.hasAuthoritativeSigningSnapshot) return "signer_ready";
  if (args.guidedSigningHandoffActive) return "signer_ready";
  if (args.signaturePreparationRequested || args.prepareSignatureLinksRequested) {
    return "signature_preparation";
  }
  if (args.premiumCorpusInProgress) return "premium_wait";
  if (args.paidProAuthoritative) return "paid_pro_first_review";
  return "starter_preview";
}

export function shouldRunPaidProVs01CorpusChecks(phase: PaidProVs01CheckPhase): boolean {
  return phase === "signature_preparation" || phase === "signer_ready";
}
