/**
 * Single thread from existing LawDog copy → one customer-visible action result.
 * Does not invent new product surfaces; it binds owner, recipient, signer, and
 * anonymous outcomes to {@link JourneyActionFeedback}.
 */
import {
  PUBLIC_ALL_REVIEWS_COMPLETE_BODY,
  PUBLIC_ALL_REVIEWS_COMPLETE_HERO,
  PUBLIC_REVIEW_SUBMITTED_BODY,
  PUBLIC_REVIEW_SUBMITTED_HERO,
} from "../../agreement/recipientApprovedWaitingPresentation";
import {
  RECIPIENT_LINK_INVALID_OR_EXPIRED_MESSAGE,
  REVIEW_LINKS_ALREADY_READY_MESSAGE,
} from "../../launch/simpleProduct/reviewLinkMintIdempotency";
import { SIGNER_ALREADY_SIGNED_EMAIL_BLOCK } from "../../agreement/recipientEmailCorrection";
import { CUSTOMER_JOURNEY_STATE } from "./customerJourneyReadiness";
import {
  PAID_PRO_DELIVERY_TRACK_REVIEW_DESCRIPTION,
  PAID_PRO_DELIVERY_TRACK_REVIEW_TITLE,
  PAID_PRO_DELIVERY_TRACK_SIGNATURE_DESCRIPTION,
  PAID_PRO_DELIVERY_TRACK_SIGNATURE_TITLE,
} from "./paidProDeliveryTrackGtmCopy";
import {
  feedbackAfterFailedCreate,
  feedbackAfterGeneration,
  feedbackAfterLinkFailure,
  feedbackAfterPartyAdded,
  feedbackAfterReviewLinksAlreadyReady,
  feedbackAfterReviewLinksCreated,
  feedbackAfterSigningLinksCreated,
  feedbackBlocked,
  feedbackCreatingAgreement,
  feedbackCreatingLinks,
  feedbackFailed,
  feedbackSucceeded,
  feedbackWorking,
  type JourneyActionFeedback,
} from "./journeyActionFeedback";

export type LawDogUserActor = "anonymous" | "owner" | "recipient" | "signer";

export type LawDogUserAction =
  | "create_agreement"
  | "add_party"
  | "create_review_links"
  | "create_signing_links"
  | "approve_review"
  | "complete_signature"
  | "complete_agreement"
  | "open_review_link"
  | "choose_review_track"
  | "choose_signature_track";

export type LawDogUserActionOutcome =
  | "working"
  | "succeeded"
  | "already_complete"
  | "blocked"
  | "failed";

export type UserActionFeedbackInput = {
  actor: LawDogUserActor;
  action: LawDogUserAction;
  outcome: LawDogUserActionOutcome;
  /** Safe, already-humanized remainder (party name, remaining signer, field remedy). */
  remainder?: string | null;
  remainingNamed?: string | null;
  linkCount?: number;
  allReviewsComplete?: boolean;
  /** Clarification panel title — never a raw capability code. */
  title?: string | null;
  partyCount?: number;
  focusSelector?: string;
};

const SIGNATURE_COMPLETE_TITLE = "Saved in LawDog";
const SIGNATURE_COMPLETE_BODY =
  "Your signature is complete. Other signers still need to sign.";
const WRONG_PARTY_SIGN_BODY =
  "This signing link belongs to a different party. Open the link that was sent to you.";
const EARLY_COMPLETE_BODY =
  "This agreement cannot complete yet. Wait for the remaining required signatures.";
const ANON_RESTORE_BODY =
  "Your draft is still here. Continue with the same parties — nothing was charged.";

export function resolveUserActionFeedback(input: UserActionFeedbackInput): JourneyActionFeedback {
  const remainder = (input.remainder || "").trim();
  const remaining = (input.remainingNamed || "").trim();

  if (input.action === "create_agreement") {
    if (input.outcome === "working") return feedbackCreatingAgreement();
    if (input.outcome === "failed") return feedbackAfterFailedCreate(remainder || null);
    if (input.outcome === "blocked") {
      return feedbackBlocked(
        "create_agreement",
        (input.title || "").trim() || CUSTOMER_JOURNEY_STATE.describe,
        remainder || "Name the parties and what this agreement is for.",
        {
          remedyLabel: "Go to the first missing field",
          focusSelector: input.focusSelector,
        },
      );
    }
    const partyCount = input.partyCount && input.partyCount >= 2 && input.partyCount <= 4 ? input.partyCount : 0;
    return feedbackSucceeded(
      "create_agreement",
      CUSTOMER_JOURNEY_STATE.draftCreatedReviewRecommended,
      feedbackAfterGeneration({
        captured: remainder
          ? [remainder]
          : partyCount
            ? [`${partyCount} parties`, "scope"]
            : ["parties", "scope"],
      }),
    );
  }

  if (input.action === "choose_review_track") {
    return feedbackSucceeded("choose_review_track", PAID_PRO_DELIVERY_TRACK_REVIEW_TITLE, PAID_PRO_DELIVERY_TRACK_REVIEW_DESCRIPTION);
  }

  if (input.action === "choose_signature_track") {
    return feedbackSucceeded(
      "choose_signature_track",
      PAID_PRO_DELIVERY_TRACK_SIGNATURE_TITLE,
      PAID_PRO_DELIVERY_TRACK_SIGNATURE_DESCRIPTION,
    );
  }

  if (input.action === "add_party") {
    return feedbackSucceeded("add_party", CUSTOMER_JOURNEY_STATE.addPartyDetails, feedbackAfterPartyAdded(remainder || "Party", 3));
  }

  if (input.action === "create_review_links") {
    if (input.outcome === "working") return feedbackCreatingLinks("review");
    if (input.outcome === "already_complete") {
      return feedbackSucceeded("create_links", REVIEW_LINKS_ALREADY_READY_MESSAGE, feedbackAfterReviewLinksAlreadyReady());
    }
    if (input.outcome === "failed" || input.outcome === "blocked") {
      return feedbackFailed(
        "create_links",
        "Review links were not created",
        feedbackAfterLinkFailure({ kind: "review", saved: true, fieldRemedy: remainder || "Check each recipient email" }),
        { remedyLabel: "Retry" },
      );
    }
    return feedbackSucceeded(
      "create_links",
      CUSTOMER_JOURNEY_STATE.linksCreatedShareWhenReady,
      feedbackAfterReviewLinksCreated(input.linkCount ?? 1),
    );
  }

  if (input.action === "create_signing_links") {
    if (input.outcome === "working") return feedbackCreatingLinks("signing");
    if (input.outcome === "blocked") {
      return feedbackBlocked(
        "create_links",
        CUSTOMER_JOURNEY_STATE.waitingForReview,
        remaining
          ? `Waiting on ${remaining} before signature links can be prepared.`
          : "Wait for remaining reviewer approval before creating signing links.",
      );
    }
    if (input.outcome === "failed") {
      return feedbackFailed(
        "create_links",
        "Signing links were not created",
        feedbackAfterLinkFailure({ kind: "signing", saved: true, fieldRemedy: remainder || "Check each signer" }),
        { remedyLabel: "Retry" },
      );
    }
    return feedbackSucceeded(
      "create_links",
      CUSTOMER_JOURNEY_STATE.linksCreatedShareWhenReady,
      feedbackAfterSigningLinksCreated(input.linkCount ?? 1),
    );
  }

  if (input.action === "approve_review") {
    if (input.outcome === "working") {
      return feedbackWorking("approve_review", "Recording your review", "Recording your approval. Don’t tap Approve again until this finishes.");
    }
    if (input.outcome === "already_complete") {
      return feedbackSucceeded("approve_review", PUBLIC_REVIEW_SUBMITTED_HERO, PUBLIC_REVIEW_SUBMITTED_BODY);
    }
    if (input.outcome === "blocked") {
      return feedbackBlocked(
        "approve_review",
        "Review cannot be recorded yet",
        remainder || "Use the personal review link from the sender.",
      );
    }
    if (input.outcome === "failed") {
      return feedbackFailed("approve_review", "Review was not recorded", remainder || "Your approval was not saved. Try again.", {
        remedyLabel: "Retry",
      });
    }
    if (input.allReviewsComplete) {
      return feedbackSucceeded("approve_review", PUBLIC_ALL_REVIEWS_COMPLETE_HERO, PUBLIC_ALL_REVIEWS_COMPLETE_BODY);
    }
    return feedbackSucceeded("approve_review", PUBLIC_REVIEW_SUBMITTED_HERO, PUBLIC_REVIEW_SUBMITTED_BODY);
  }

  if (input.action === "complete_signature") {
    if (input.outcome === "working") {
      return feedbackWorking("complete_signature", "Recording your signature", "Recording your signature. Don’t tap Sign again until this finishes.");
    }
    if (input.outcome === "already_complete") {
      return feedbackSucceeded("complete_signature", SIGNATURE_COMPLETE_TITLE, SIGNER_ALREADY_SIGNED_EMAIL_BLOCK);
    }
    if (input.outcome === "blocked") {
      if (/wrong|different party|impersonat/i.test(remainder)) {
        return feedbackBlocked("complete_signature", "This is not your signing link", WRONG_PARTY_SIGN_BODY);
      }
      return feedbackBlocked(
        "complete_signature",
        "Signing cannot finish yet",
        remainder || "Open the signing link that was sent to you, then try again.",
      );
    }
    if (input.outcome === "failed") {
      return feedbackFailed("complete_signature", "Signature was not recorded", remainder || "Your signature was not saved. Try again.", {
        remedyLabel: "Retry",
      });
    }
    return feedbackSucceeded(
      "complete_signature",
      SIGNATURE_COMPLETE_TITLE,
      remaining ? `Your signature is complete. ${remaining} still needs to sign.` : SIGNATURE_COMPLETE_BODY,
    );
  }

  if (input.action === "complete_agreement") {
    if (input.outcome === "blocked") {
      return feedbackBlocked(
        "complete_agreement",
        CUSTOMER_JOURNEY_STATE.waitingForSignatures,
        remaining ? `This agreement cannot complete yet. Waiting on ${remaining}.` : EARLY_COMPLETE_BODY,
      );
    }
    if (input.outcome === "failed") {
      return feedbackFailed("complete_agreement", "Agreement did not complete", remainder || "The agreement is unchanged. Try again.", {
        remedyLabel: "Retry",
      });
    }
    return feedbackSucceeded("complete_agreement", CUSTOMER_JOURNEY_STATE.fullyExecuted, "The agreement is fully executed. All required parties are recorded.");
  }

  if (input.action === "open_review_link") {
    if (input.outcome === "working") {
      return feedbackWorking("open_review_link", "Validating link", "Checking this private link. This only takes a moment.");
    }
    if (input.outcome === "failed" || input.outcome === "blocked") {
      return feedbackFailed(
        "open_review_link",
        remainder ? "We couldn’t open this review" : "This link cannot be used",
        remainder || RECIPIENT_LINK_INVALID_OR_EXPIRED_MESSAGE,
      );
    }
    if (input.actor === "anonymous") {
      return feedbackSucceeded("open_review_link", CUSTOMER_JOURNEY_STATE.describe, ANON_RESTORE_BODY);
    }
    return feedbackSucceeded("open_review_link", "Review agreement", "Read the agreement, then approve it or suggest a revision.");
  }

  return feedbackFailed("unknown_action", "Action needs attention", remainder || "Nothing was changed. Try the next step again.", {
    remedyLabel: "Retry",
  });
}

export function userActionFeedbackHasNextStep(feedback: JourneyActionFeedback): boolean {
  return Boolean(feedback.body.trim()) && (feedback.kind !== "working" || Boolean(feedback.title.trim()));
}
