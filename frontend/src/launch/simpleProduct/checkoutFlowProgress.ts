import { SIMPLE_FLOW_PROGRESS_LABELS } from "../../joy/clawJoyCopy";
import { CREATE_FLOW_CHECKOUT_AGREEMENT_ID } from "../../components/agreements/agreementAdvancedDraftAccess";
import { extractAgreementIdFromSendReturnUrl } from "../checkoutParams";

/** Starter “Upgrade to improve draft” checkout — review before send/sign. */
export const STARTER_UPGRADE_CHECKOUT_PROGRESS_LABELS = [
  "Draft",
  "Upgrade",
  "Review",
  "Send/Sign",
  "Proof",
] as const;

export const CHECKOUT_STARTER_UPGRADE_SUBTITLE =
  "Upgrade this starter draft into a full agreement. After checkout, review it before sending or signing.";

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
      labels: SIMPLE_FLOW_PROGRESS_LABELS,
      step: 2,
    };
  }

  if (directSendCheckout) {
    return {
      variant: "direct_send",
      labels: SIMPLE_FLOW_PROGRESS_LABELS,
      step: 2,
    };
  }

  return {
    variant: "default",
    labels: SIMPLE_FLOW_PROGRESS_LABELS,
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
