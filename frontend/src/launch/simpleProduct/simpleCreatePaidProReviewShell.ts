import { CreateUiStage } from "../../components/agreements/createUiStage";
import { AGREEMENT_LIFECYCLE_CONTROL_LINE } from "../../agreement/agreementLifecycleRail";

export const SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE = "Review your Pro agreement";

export const SIMPLE_CREATE_PAID_PRO_REVIEW_SUBTITLE =
  "Your agreement is ready. Edit it, send it for review, or start signatures.";

export const SIMPLE_CREATE_PAID_PRO_REVIEW_CONTROL_LINE = AGREEMENT_LIFECYCLE_CONTROL_LINE;

/** @deprecated Use {@link AGREEMENT_LIFECYCLE_PROGRESS_LABELS} from agreementLifecycleRail. */
export { AGREEMENT_LIFECYCLE_PROGRESS_LABELS as SIMPLE_CREATE_STARTER_PROGRESS_LABELS } from "../../agreement/agreementLifecycleRail";

/** Starter hero title on `/app/create` when the shell is in first-session marketing mode. */
export const SIMPLE_CREATE_STARTER_HERO_TITLE = "Draft it fast. Review it before it moves.";

export const SIMPLE_CREATE_STARTER_HERO_SUBHEAD =
  "Type or speak what you need. LawDog creates a starter draft you can review, improve, share for review, or prepare for signing when you're ready.";

/** Trust line under starter hero — lifecycle-aware, not send-only. */
export const SIMPLE_CREATE_STARTER_CONTROL_LINE =
  "You control the next step — review, improve, share, sign, or stop.";

export const PRO_REVIEW_DOCUMENT_PANEL_HEADING = "Review your draft";

export const PRO_REVIEW_DOCUMENT_PANEL_SUBCOPY =
  "Send a private review link for comments and edits. Or start the signature flow when you're ready.";

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
