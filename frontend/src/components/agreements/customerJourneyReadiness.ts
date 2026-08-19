/**
 * Single customer-facing readiness vocabulary for the paid-beta agreement journey.
 * Internal dimensions (content, parties, signers, reviewers, delivery) stay separate.
 * These labels are product-completeness guidance — not legal sufficiency.
 */

export const CUSTOMER_JOURNEY_STATE = {
  describe: "Describe your agreement",
  readyToCreate: "Ready to create",
  creatingAgreement: "Creating agreement",
  draftCreatedReviewRecommended: "Draft created—review recommended",
  decisionsNeededBeforeSignature: "Decisions needed before signature",
  addPartyDetails: "Add party details",
  addSignerDetails: "Add signer details",
  readyToCreateReviewLinks: "Ready to create review links",
  readyToCreateSigningLinks: "Ready to create signing links",
  creatingLinks: "Creating links",
  linksCreatedShareWhenReady: "Links created—share when ready",
  waitingForReview: "Waiting for review",
  waitingForSignatures: "Waiting for signatures",
  fullyExecuted: "Fully executed",
  actionNeedsAttention: "Action needs attention",
} as const;

export type CustomerJourneyStateId = keyof typeof CUSTOMER_JOURNEY_STATE;
export type CustomerJourneyStateLabel = (typeof CUSTOMER_JOURNEY_STATE)[CustomerJourneyStateId];

export type CustomerJourneyInternalDimensions = {
  hasTwoParties: boolean;
  hasSubstantivePurpose: boolean;
  draftCreated: boolean;
  contentBlockers: boolean;
  partiesComplete: boolean;
  signerDetailsComplete: boolean;
  reviewRecipientsComplete: boolean;
  deliveryTrack: "none" | "review" | "signature";
  linksCreated: boolean;
  waitingForReview: boolean;
  waitingForSignatures: boolean;
  fullyExecuted: boolean;
  actionNeedsAttention: boolean;
  creatingAgreement?: boolean;
  creatingLinks?: boolean;
};

/**
 * Route choice must not override factual readiness.
 * Selecting signature cannot make an incomplete agreement ready for signature.
 */
export function resolveCustomerJourneyState(
  d: CustomerJourneyInternalDimensions,
): CustomerJourneyStateLabel {
  if (d.actionNeedsAttention) return CUSTOMER_JOURNEY_STATE.actionNeedsAttention;
  if (d.fullyExecuted) return CUSTOMER_JOURNEY_STATE.fullyExecuted;
  if (d.creatingLinks) return CUSTOMER_JOURNEY_STATE.creatingLinks;
  if (d.waitingForSignatures) return CUSTOMER_JOURNEY_STATE.waitingForSignatures;
  if (d.waitingForReview) return CUSTOMER_JOURNEY_STATE.waitingForReview;
  if (d.linksCreated) return CUSTOMER_JOURNEY_STATE.linksCreatedShareWhenReady;
  if (!d.draftCreated) {
    if (d.creatingAgreement) return CUSTOMER_JOURNEY_STATE.creatingAgreement;
    if (d.hasTwoParties && d.hasSubstantivePurpose) return CUSTOMER_JOURNEY_STATE.readyToCreate;
    return CUSTOMER_JOURNEY_STATE.describe;
  }
  if (!d.partiesComplete) return CUSTOMER_JOURNEY_STATE.addPartyDetails;
  if (d.deliveryTrack === "signature") {
    if (d.contentBlockers) return CUSTOMER_JOURNEY_STATE.decisionsNeededBeforeSignature;
    if (!d.signerDetailsComplete) return CUSTOMER_JOURNEY_STATE.addSignerDetails;
    return CUSTOMER_JOURNEY_STATE.readyToCreateSigningLinks;
  }
  if (d.deliveryTrack === "review") {
    if (!d.reviewRecipientsComplete) return CUSTOMER_JOURNEY_STATE.addPartyDetails;
    return CUSTOMER_JOURNEY_STATE.readyToCreateReviewLinks;
  }
  if (d.contentBlockers) return CUSTOMER_JOURNEY_STATE.decisionsNeededBeforeSignature;
  return CUSTOMER_JOURNEY_STATE.draftCreatedReviewRecommended;
}
