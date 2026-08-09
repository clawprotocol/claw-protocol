/**
 * Practical GTM delivery-track copy — Option A (signing) vs Option B (party review / redline).
 * Keep labels unified across Forced chrome, SimplePro, Premium fork, and sticky CTAs.
 */

import { PAID_PRO_PREPARE_ESIGN_DECISION_CTA } from "./signerSetupPartyIdentity";

/** Option A — prepare tracked e-sign once terms are final. */
export const PAID_PRO_DELIVERY_TRACK_SIGNATURE_CTA = PAID_PRO_PREPARE_ESIGN_DECISION_CTA;

export const PAID_PRO_DELIVERY_TRACK_SIGNATURE_TITLE = "Prepare for signing";

export const PAID_PRO_DELIVERY_TRACK_SIGNATURE_DESCRIPTION =
  "Add or confirm signers, then create tracked e-sign links when the terms are final.";

/** Option B — review draft with counterparties (basic track-changes / redline). */
export const PAID_PRO_DELIVERY_TRACK_REVIEW_CTA = "Send for review";

export const PAID_PRO_DELIVERY_TRACK_REVIEW_TITLE = "Review with other parties";

export const PAID_PRO_DELIVERY_TRACK_REVIEW_DESCRIPTION =
  "Invite the other parties to review this draft and propose basic track-changes edits before any signature request is sent.";

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
  "First add party contacts. Then you can prepare signature links, or send the draft for review so the other parties can propose track-changes edits.";

export const PAID_PRO_DELIVERY_TRACK_TRUST_LINE =
  "Nothing is sent or signed until you confirm the next step.";

/** Decision callout when both tracks are available (signer details complete). */
export const PAID_PRO_REVIEW_STEP_HEADLINE_CHOOSE_TRACK = "Choose review or signing";

export const PAID_PRO_REVIEW_STEP_NEXT_CHOOSE_TRACK =
  "Send the draft for party review with basic track-changes, or prepare signature links when terms are final. Nothing is sent until you confirm.";
