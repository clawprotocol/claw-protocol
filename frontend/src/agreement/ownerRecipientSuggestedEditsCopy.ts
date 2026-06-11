/**
 * Owner-facing copy when a party has submitted suggested edits (recipient proposal).
 * LawDog-only; keep calm and non-technical.
 */
export const OWNER_SUGGESTED_CHANGES_RECEIVED_TITLE = "Suggested changes received";

export const OWNER_SUGGESTED_CHANGES_REVIEW_SUBTEXT =
  "Review the proposed edits before continuing to signing.";

export const OWNER_REVIEW_BEFORE_SIGNING = "Review before signing";

/** Shown under the title while the owner is deciding. */
export const OWNER_SUGGESTED_CHANGES_NOT_SIGNED_LINE =
  "Nothing is signed yet. Accepting these changes updates the draft and continues the signing flow.";

export const OWNER_CTA_REVIEW_SUGGESTED_CHANGES = "Review suggested changes";

export const OWNER_SUGGESTED_CHANGES_NEED_REVIEW = "Suggested changes need your review";

export const OWNER_NO_PENDING_SUGGESTED_CHANGES = "No suggested changes are pending.";

export const OWNER_CTA_ACCEPT_PROPOSED_CHANGES = "Accept proposed changes";

export const OWNER_CTA_DECLINE_PROPOSED_CHANGES = "Decline changes";

export const OWNER_CTA_ACCEPT_AND_CONTINUE = "Accept and continue";

export const OWNER_CTA_MAKE_MORE_CHANGES = "Make more changes";

export const OWNER_MAKE_MORE_CHANGES_LINE = "Make changes before sending for signature.";

export const OWNER_CTA_REJECT_SUGGESTIONS = "Reject suggestions";

/** When more than one pending suggestion exists — avoid “queue” wording. */
export const OWNER_MULTIPLE_SUGGESTIONS_LABEL = "Choose which set to review";

/**
 * Pre-lock primary CTA after owner accepts suggested edits (same control as finalize — applies signing lock).
 */
export const OWNER_LOCK_AND_CONTINUE_TO_SIGNING = "Lock and continue to signing";

/** Explains what the lock button does in the post-accept success guide. */
export const OWNER_POST_ACCEPT_LOCK_EXPLAINER =
  "This locks the accepted draft before it is sent for signature.";

/** Short hint on the finalize card when not in the post-accept banner (avoids “continue” before lock). */
export const OWNER_FINALIZE_LOCK_HINT =
  "Locking saves the version used for signatures before anything is sent.";

/** After owner accepts a recipient’s suggested edits — confirmation + handoff into signing setup. */
export const OWNER_ACCEPT_SUGGESTED_CHANGES_SUCCESS_TITLE = "Changes accepted";

export const OWNER_ACCEPT_SUGGESTED_CHANGES_SUCCESS_DETAIL =
  "The draft has been updated. Lock this version when you are ready to move toward signing.";

/** When signers / approvals still need attention before locking or sending. */
export const OWNER_NEXT_CONFIRM_SIGNERS_AND_SEND =
  "Next: confirm signers and send for signature.";

/** When the agreement is locked and ready for the home-screen signing handoff. */
export const OWNER_NEXT_SEND_FOR_SIGNATURE = "Next: send for signature.";

/** When the draft is ready to lock but signing handoff is not active yet. */
export const OWNER_NEXT_LOCK_THEN_SEND =
  "Next: lock this version below, then send for signature when the button is ready.";

export const OWNER_CTA_GO_TO_SIGNERS = "Go to signers";

export const OWNER_CTA_DISMISS_SUCCESS = "Dismiss";

/** Primary handoff control in the send panel when the version is locked and ready. */
export const OWNER_SEND_FOR_SIGNATURE = "Send for signature";
