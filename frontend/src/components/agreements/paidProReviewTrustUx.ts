/**
 * Paid Pro review trust / workflow clarity — copy and step models only (no corpus changes).
 */

export type PaidProReviewTrustStepId =
  | "agreement_generated"
  | "legal_review_complete"
  | "signer_details"
  | "signature_links_ready";

export type PaidProReviewTrustStepState = "done" | "active" | "pending";

export type PaidProReviewTrustStep = {
  id: PaidProReviewTrustStepId;
  label: string;
  state: PaidProReviewTrustStepState;
};

export const PAID_PRO_REVIEW_STATUS_HEADLINE = "Review status";

/** Canonical status while signer metadata is incomplete (document chip + trust rail). */
export const PAID_PRO_REVIEW_SIGNER_DETAILS_NEEDED_STATUS = "Signer details needed";

/**
 * Review trust rail + status chip only — routing/CTA gates still use the live signer-details gate.
 * After {@link hasAuthoritativeSigningSnapshot}, never show "Signer details needed" on status surfaces.
 */
export function resolvePaidProReviewSignerStatusReady(args: {
  signerDetailsGateComplete: boolean;
  hasAuthoritativeSigningSnapshot: boolean;
}): boolean {
  return Boolean(args.signerDetailsGateComplete || args.hasAuthoritativeSigningSnapshot);
}

export const PAID_PRO_REVIEW_SUPPORTING_BEFORE_SIGNERS =
  "Add signer name, title, and notice details for each party.";

export const PAID_PRO_REVIEW_SUPPORTING_AFTER_SIGNERS =
  "Signer details are saved in the agreement. Continue when you are ready to prepare signature links.";

/** Shown only on non-compact shells that still render the final-version card. */
export const PAID_PRO_FINAL_VERSION_HEADLINE = "Next step";

export const PAID_PRO_FINAL_VERSION_BEFORE_SIGNERS =
  "Add signer details below, then prepare signature links when you are ready.";

export const PAID_PRO_FINAL_VERSION_READY_FOR_SIGNATURE =
  "Prepare signature links when you are ready to share them with signers.";

export const PAID_PRO_SIGNER_SAVED_BANNER_HEADLINE = "Signer details saved.";

export type PaidProSignerSavedMapping = {
  partyLegalName: string;
  signerName: string;
};

export function resolvePaidProReviewTrustSteps(args: {
  signersReady: boolean;
  signerMetadataFinalized?: boolean;
}): PaidProReviewTrustStep[] {
  const signersDone = Boolean(args.signersReady);
  const linksDone = Boolean(args.signerMetadataFinalized) || signersDone;
  return [
    { id: "agreement_generated", label: "Agreement generated", state: "done" },
    { id: "legal_review_complete", label: "Legal review complete", state: "done" },
    {
      id: "signer_details",
      label: signersDone ? "Signer details added" : PAID_PRO_REVIEW_SIGNER_DETAILS_NEEDED_STATUS,
      state: signersDone ? "done" : "active",
    },
    {
      id: "signature_links_ready",
      label: linksDone
        ? "Ready for signing"
        : signersDone
          ? "Ready to prepare signing links"
          : "Signature links ready",
      state: linksDone ? "done" : "pending",
    },
  ];
}

export function resolvePaidProReviewSupportingCopy(args: {
  signersReady: boolean;
}): string {
  return args.signersReady
    ? PAID_PRO_REVIEW_SUPPORTING_AFTER_SIGNERS
    : PAID_PRO_REVIEW_SUPPORTING_BEFORE_SIGNERS;
}

export function resolvePaidProFinalVersionCopy(args: {
  signersReady: boolean;
}): string {
  return args.signersReady
    ? PAID_PRO_FINAL_VERSION_READY_FOR_SIGNATURE
    : PAID_PRO_FINAL_VERSION_BEFORE_SIGNERS;
}

export function formatPaidProSignerSavedMappings(
  mappings: readonly PaidProSignerSavedMapping[],
): string[] {
  return mappings
    .filter((m) => m.partyLegalName.trim() && m.signerName.trim())
    .map((m) => `${m.partyLegalName.trim()}\n→ ${m.signerName.trim()}`);
}
