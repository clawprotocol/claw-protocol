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
  "Add legal entity, signer name, email, and title for each party. Those details feed notices and either party-review links or signature links — nothing is sent until you confirm.";

/** When the draft still shows clarification-style brackets after generate. */
export const PAID_PRO_REVIEW_SUPPORTING_IDENTITY_PLACEHOLDERS =
  "Party names from your prompt should appear in the draft. If any brackets remain, continue to signer details to lock legal names, emails, and titles before review or signing.";

export const PAID_PRO_REVIEW_SUPPORTING_AFTER_SIGNERS =
  "Signer details are saved. Choose send for review (basic track-changes with the other parties) or prepare for signing when terms are final.";

/** Shown only on non-compact shells that still render the final-version card. */
export const PAID_PRO_FINAL_VERSION_HEADLINE = "Next step";

export const PAID_PRO_FINAL_VERSION_BEFORE_SIGNERS =
  "Add signer details below (legal entity, signer name, email, and title), then choose party review or prepare signature links.";

export const PAID_PRO_FINAL_VERSION_READY_FOR_SIGNATURE =
  "Send for party review with basic track-changes, or prepare signature links when you are ready to share them.";

export const PAID_PRO_SIGNER_SAVED_BANNER_HEADLINE = "Signer details saved.";

/** Trust-rail label for automated structural/copy checks — not a human legal review. */
export const PAID_PRO_REVIEW_AUTOMATED_DRAFT_CHECKS_LABEL = "Automated draft checks completed";

export type PaidProSignerSavedMapping = {
  partyLegalName: string;
  signerName: string;
};

export function resolvePaidProReviewTrustSteps(args: {
  signersReady: boolean;
  signerMetadataFinalized?: boolean;
  /** When false, do not claim Ready for signing (hydration/persist incomplete). */
  signingReadyHydrated?: boolean;
}): PaidProReviewTrustStep[] {
  const signersDone = Boolean(args.signersReady);
  // Ready for signing only after successful signer-detail finalize produced a signing-ready corpus.
  const linksDone =
    Boolean(args.signerMetadataFinalized) && args.signingReadyHydrated !== false;
  return [
    {
      id: "agreement_generated",
      label: signersDone ? "Agreement generated" : "Agreement draft generated",
      state: "done",
    },
    {
      id: "legal_review_complete",
      label: PAID_PRO_REVIEW_AUTOMATED_DRAFT_CHECKS_LABEL,
      state: "done",
    },
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
          ? "Choose review or signing"
          : "Review or signature links",
      state: linksDone ? "done" : "pending",
    },
  ];
}

export function resolvePaidProReviewSupportingCopy(args: {
  signersReady: boolean;
  /** True when review preview still has [Your Company Legal Name]-style tokens. */
  hasUnresolvedIdentityPlaceholders?: boolean;
}): string {
  if (args.signersReady) return PAID_PRO_REVIEW_SUPPORTING_AFTER_SIGNERS;
  if (args.hasUnresolvedIdentityPlaceholders) return PAID_PRO_REVIEW_SUPPORTING_IDENTITY_PLACEHOLDERS;
  return PAID_PRO_REVIEW_SUPPORTING_BEFORE_SIGNERS;
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
