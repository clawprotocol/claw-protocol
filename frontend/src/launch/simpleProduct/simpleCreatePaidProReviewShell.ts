import { CreateUiStage } from "../../components/agreements/createUiStage";

export const SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE = "Review your Pro agreement";

export const SIMPLE_CREATE_PAID_PRO_REVIEW_SUBTITLE =
  "Your upgraded agreement is ready. Review, adjust, then continue to recipients.";

/** Starter hero title on `/app/create` when the shell is in first-session marketing mode. */
export const SIMPLE_CREATE_STARTER_HERO_TITLE = "Create an agreement in minutes.";

/**
 * `/app/create` shell chrome: authoritative paid Pro document is ready in the DRAFT-stage review pane.
 * `createUiStage === DRAFT` alone is not enough — it also covers pre-review intake; require `displayPhase === "review"`.
 */
export function computeSimpleCreatePaidProReviewReady(input: {
  simpleProductFlow: boolean;
  liveWorkspaceTwoPane: boolean;
  paidProAuthoritative: boolean;
  createUiStage: (typeof CreateUiStage)[keyof typeof CreateUiStage];
  displayPhase: string;
}): boolean {
  return (
    input.simpleProductFlow &&
    input.liveWorkspaceTwoPane &&
    input.paidProAuthoritative &&
    input.createUiStage === CreateUiStage.DRAFT &&
    input.displayPhase === "review"
  );
}
