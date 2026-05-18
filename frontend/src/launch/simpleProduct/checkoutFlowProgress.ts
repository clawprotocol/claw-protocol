import { AGREEMENT_LIFECYCLE_PROGRESS_LABELS } from "../../agreement/agreementLifecycleRail";
import { CREATE_FLOW_CHECKOUT_AGREEMENT_ID } from "../../components/agreements/agreementAdvancedDraftAccess";
import { extractAgreementIdFromSendReturnUrl } from "../checkoutParams";
import { CHECKOUT_SUBTITLE } from "./proConversionCopy";

/** Checkout uses the same lifecycle rail; step 2 highlights Review while upgrading. */
export const STARTER_UPGRADE_CHECKOUT_PROGRESS_LABELS = AGREEMENT_LIFECYCLE_PROGRESS_LABELS;

export const CHECKOUT_STARTER_UPGRADE_SUBTITLE = CHECKOUT_SUBTITLE;

export const CHECKOUT_STARTER_UPGRADE_AFTER_PAYMENT_LINE =
  "After payment: back to your agreement to review — nothing sends until you confirm.";

export type CheckoutFlowProgressVariant = "starter_upgrade" | "direct_send" | "single_agreement" | "default";

export type CheckoutFlowStep = 1 | 2 | 3 | 4 | 5;

export type CheckoutFlowProgress = {
  variant: CheckoutFlowProgressVariant;
  labels: readonly string[];
  step: CheckoutFlowStep;
};

/**
 * Checkout stepper: never mark Send complete or Sign active while the user is only paying to upgrade.
 * Starter create-flow checkout highlights Upgrade; send-path checkouts highlight Send.
 */
export function resolveCheckoutFlowProgress(params: {
  agreementId: string;
  isSingleAgreementCheckout: boolean;
  returnTo: string;
}): CheckoutFlowProgress {
  const isCreateAgreementCheckout =
    params.agreementId === CREATE_FLOW_CHECKOUT_AGREEMENT_ID && !params.isSingleAgreementCheckout;

  if (isCreateAgreementCheckout) {
    return {
      variant: "starter_upgrade",
      labels: STARTER_UPGRADE_CHECKOUT_PROGRESS_LABELS,
      step: 2,
    };
  }

  const sendReturnAgreementId = extractAgreementIdFromSendReturnUrl(params.returnTo);
  const directSendCheckout = Boolean(sendReturnAgreementId);

  if (params.isSingleAgreementCheckout) {
    return {
      variant: "single_agreement",
      labels: AGREEMENT_LIFECYCLE_PROGRESS_LABELS,
      step: 2,
    };
  }

  if (directSendCheckout) {
    return {
      variant: "direct_send",
      labels: AGREEMENT_LIFECYCLE_PROGRESS_LABELS,
      step: 2,
    };
  }

  return {
    variant: "default",
    labels: AGREEMENT_LIFECYCLE_PROGRESS_LABELS,
    step: 2,
  };
}

/** True when the label at `index` would render as completed (✓) for this progress state. */
export function checkoutProgressStepIsComplete(progress: CheckoutFlowProgress, index: number): boolean {
  return index < progress.step - 1;
}

export function checkoutProgressStepIsCurrent(progress: CheckoutFlowProgress, index: number): boolean {
  return index === progress.step - 1;
}
