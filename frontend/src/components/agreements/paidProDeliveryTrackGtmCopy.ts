/**
 * Practical GTM delivery-track copy — Option A (signing) vs Option B (party review / redline).
 * Keep labels unified across Forced chrome, SimplePro, Premium fork, and sticky CTAs.
 */

import { PAID_PRO_PREPARE_ESIGN_DECISION_CTA } from "./signerSetupPartyIdentity";

/** Option A — prepare tracked e-sign once terms are final. */
export const PAID_PRO_DELIVERY_TRACK_SIGNATURE_CTA = PAID_PRO_PREPARE_ESIGN_DECISION_CTA;

export const PAID_PRO_DELIVERY_TRACK_SIGNATURE_TITLE = "Prepare for signing";

export const PAID_PRO_DELIVERY_TRACK_SIGNATURE_DESCRIPTION =
  "Confirm one authorized signer for each contracting party, then create private signing links. Nothing is emailed automatically; you decide when to share each link.";

/** Option B — review draft with counterparties (basic track-changes / redline). */
export const PAID_PRO_DELIVERY_TRACK_REVIEW_CTA = "Send for review";

export const PAID_PRO_DELIVERY_TRACK_REVIEW_TITLE = "Review with other parties";

export const PAID_PRO_DELIVERY_TRACK_REVIEW_DESCRIPTION =
  "Create private review links so the parties can confirm the agreement or suggest changes. Nothing is emailed automatically; you decide when to share each link.";

export const PAID_PRO_DELIVERY_TRACK_REVIEW_BUSY_CTA = "Creating review links…";

/** Sticky / secondary label when the review path is armed. */
export const PAID_PRO_DELIVERY_TRACK_REVIEW_STICKY_LABEL = PAID_PRO_DELIVERY_TRACK_REVIEW_CTA;

/** Sticky label when the signature path is still the unresolved next step. */
export const PAID_PRO_DELIVERY_TRACK_SIGNATURE_STICKY_LABEL = "Add signers / prepare signature links";

/** After review track is selected — switch back to signing. */
export const PAID_PRO_DELIVERY_TRACK_SWITCH_TO_SIGNATURE_CTA = "Prepare for signing instead";

/** After review track is selected — continue sharing. */
export const PAID_PRO_DELIVERY_TRACK_SHARE_FOR_REVIEW_CTA = "Share for review";

/** Chooser eyebrow + foreshadow before signer details are complete. */
export const PAID_PRO_DELIVERY_TRACK_CHOOSER_EYEBROW = "Choose your next step";

export const PAID_PRO_DELIVERY_TRACK_BEFORE_SIGNERS_HINT =
  "For review, add reviewer emails. For signature, add one authorized signer for each contracting party. Nothing is emailed automatically.";

export const PAID_PRO_DELIVERY_TRACK_TRUST_LINE =
  "Nothing is sent or signed until you confirm the next step.";

/** Decision callout when both tracks are available (signer details complete). */
export const PAID_PRO_REVIEW_STEP_HEADLINE_CHOOSE_TRACK = "Choose review or signing";

export const PAID_PRO_REVIEW_STEP_NEXT_CHOOSE_TRACK =
  "Create private review links, or confirm one authorized signer for each party and create signing links. Nothing is emailed automatically.";
