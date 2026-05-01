import { CreateUiStage } from "../../components/agreements/createUiStage";

export const SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE = "Review your Pro agreement";

export const SIMPLE_CREATE_PAID_PRO_REVIEW_SUBTITLE =
  "Your Pro agreement is ready. Review or adjust above, then choose how you want to deliver it (review or signature).";

/** Starter hero title on `/app/create` when the shell is in first-session marketing mode. */
export const SIMPLE_CREATE_STARTER_HERO_TITLE = "Create an agreement in minutes.";

/**
 * `/app/create` shell chrome: suppress generic “Create an agreement in minutes” marketing while authoritative
 * paid Pro drafting or recipient setup is active. Covers DRAFT review and RECIPIENTS so the shell does not
 * snap back to starter hero after “continue to recipients.”
 */
export function computeSimpleCreatePaidProReviewReady(input: {
  simpleProductFlow: boolean;
  liveWorkspaceTwoPane: boolean;
  paidProAuthoritative: boolean;
  createUiStage: (typeof CreateUiStage)[keyof typeof CreateUiStage];
  displayPhase: string;
}): boolean {
  if (!input.simpleProductFlow || !input.liveWorkspaceTwoPane || !input.paidProAuthoritative) return false;
  if (input.createUiStage === CreateUiStage.RECIPIENTS) return true;
  return input.createUiStage === CreateUiStage.DRAFT && input.displayPhase === "review";
}
