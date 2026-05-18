import {
  PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS,
  PREMIUM_POST_CHECKOUT_SOFT_PROGRESS_MS,
} from "./postCheckoutModalTimeout";

/** Visual phase for the single post-checkout Pro generation modal (not FSM `premiumPostCheckoutPhase`). */
export type PremiumProWaitVisualPhase =
  | "processing"
  | "soft_wait"
  | "extended_wait"
  | "terminal_failure"
  | "success";

export const PREMIUM_PRO_WAIT_REASSURANCE =
  "Nothing is sent, signed, or shared until you confirm.";

export const PREMIUM_PRO_WAIT_PROGRESS_STEPS = [
  "Payment confirmed",
  "Terms loaded",
  "Pro agreement building",
  "Review screen ready",
] as const;

export const PREMIUM_PRO_WAIT_ROTATING_LINES: readonly string[] = [
  "Using your original deal terms.",
  "Organizing parties and responsibilities.",
  "Strengthening commercial terms.",
  "Preparing collaboration + signing flow.",
  "Keeping everything review-first.",
] as const;

export const PREMIUM_RETURN_RETRY_GENERATION_LABEL = "Retry Pro generation";
export const PREMIUM_RETURN_USE_STARTER_LABEL = "Use current draft for now";
export const PREMIUM_RETURN_TERMINAL_HELPER = "No additional checkout needed.";

export type PremiumProWaitProgressStepState = "pending" | "active" | "done";

export type PremiumProWaitModalView = {
  phase: PremiumProWaitVisualPhase;
  title: string;
  body: string;
  flavorLine: string | null;
  showRotatingLines: boolean;
  showSpinner: boolean;
  showRecoveryActions: boolean;
  progressSteps: readonly { label: string; state: PremiumProWaitProgressStepState }[];
  reassurance: string;
};

export function resolvePremiumProWaitVisualPhase(args: {
  successFlash: boolean;
  terminalFailure: boolean;
  patienceExtended: boolean;
  softProgress: boolean;
}): PremiumProWaitVisualPhase {
  if (args.successFlash) return "success";
  if (args.terminalFailure) return "terminal_failure";
  if (args.patienceExtended) return "extended_wait";
  if (args.softProgress) return "soft_wait";
  return "processing";
}

export function resolvePremiumProWaitProgressSteps(
  phase: PremiumProWaitVisualPhase,
): readonly { label: string; state: PremiumProWaitProgressStepState }[] {
  const labels = PREMIUM_PRO_WAIT_PROGRESS_STEPS;
  if (phase === "success") {
    return labels.map((label) => ({ label, state: "done" as const }));
  }
  if (phase === "terminal_failure") {
    return [
      { label: labels[0], state: "done" },
      { label: labels[1], state: "done" },
      { label: labels[2], state: "pending" },
      { label: labels[3], state: "pending" },
    ];
  }
  const termsDone = phase === "soft_wait" || phase === "extended_wait";
  const buildingActive = phase === "processing" || phase === "soft_wait" || phase === "extended_wait";
  return [
    { label: labels[0], state: "done" },
    { label: labels[1], state: termsDone ? "done" : "active" },
    { label: labels[2], state: buildingActive ? "active" : "pending" },
    { label: labels[3], state: "pending" },
  ];
}

export function resolvePremiumProWaitModalView(phase: PremiumProWaitVisualPhase): PremiumProWaitModalView {
  const progressSteps = resolvePremiumProWaitProgressSteps(phase);
  const reassurance = PREMIUM_PRO_WAIT_REASSURANCE;

  if (phase === "success") {
    return {
      phase,
      title: "Pro agreement ready.",
      body: "Opening your review screen…",
      flavorLine: null,
      showRotatingLines: false,
      showSpinner: false,
      showRecoveryActions: false,
      progressSteps,
      reassurance,
    };
  }

  if (phase === "terminal_failure") {
    return {
      phase,
      title: "We couldn't finish your Pro agreement",
      body: "Your payment was detected.",
      flavorLine: null,
      showRotatingLines: false,
      showSpinner: false,
      showRecoveryActions: true,
      progressSteps,
      reassurance,
    };
  }

  if (phase === "extended_wait") {
    return {
      phase,
      title: "Large agreement. Still working.",
      body: "Multi-party agreements take a little more chewing.",
      flavorLine: "LawDog is organizing the bones.",
      showRotatingLines: true,
      showSpinner: true,
      showRecoveryActions: false,
      progressSteps,
      reassurance,
    };
  }

  if (phase === "soft_wait") {
    return {
      phase,
      title: "Still building — this one has real meat.",
      body: "Your Pro agreement is taking a bit longer than usual.",
      flavorLine: "This one has some bark.",
      showRotatingLines: true,
      showSpinner: true,
      showRecoveryActions: false,
      progressSteps,
      reassurance,
    };
  }

  return {
    phase,
    title: "Building your Pro agreement…",
    body: "Using your original deal terms. You can refine details after it appears.",
    flavorLine: null,
    showRotatingLines: true,
    showSpinner: true,
    showRecoveryActions: false,
    progressSteps,
    reassurance,
  };
}

/** @deprecated Use {@link resolvePremiumProWaitModalView} — kept for tests migrating off tier names. */
export type PremiumCheckoutModalCopyTier = "initial" | "soft_progress" | "patience_extended";

/** @deprecated */
export function resolvePremiumCheckoutModalCopy(tier: PremiumCheckoutModalCopyTier) {
  const phase =
    tier === "patience_extended"
      ? "extended_wait"
      : tier === "soft_progress"
        ? "soft_wait"
        : "processing";
  const view = resolvePremiumProWaitModalView(phase);
  return {
    title: view.title,
    body: view.body,
    helper: view.flavorLine,
    showPatienceActions: view.showRecoveryActions,
  };
}

export function shouldShowPremiumProWaitRecoveryActions(args: {
  visualPhase: PremiumProWaitVisualPhase;
  authoritativeRequestInFlight: boolean;
}): boolean {
  if (args.visualPhase !== "terminal_failure") return false;
  return !args.authoritativeRequestInFlight;
}

export function shouldTriggerPremiumModalFailopen(args: {
  hasAcceptedServerFullDraftBody: boolean;
  premiumFullDraftRequestFailed: boolean;
  authoritativeRequestInFlight: boolean;
}): boolean {
  if (args.hasAcceptedServerFullDraftBody) return false;
  if (args.authoritativeRequestInFlight) return false;
  if (args.premiumFullDraftRequestFailed) return true;
  return true;
}

export function shouldEnterPremiumReturnPatienceExtended(args: {
  elapsedMs: number;
  authoritativeRequestInFlight: boolean;
  hasAcceptedServerFullDraftBody: boolean;
}): boolean {
  if (!args.authoritativeRequestInFlight) return false;
  if (args.hasAcceptedServerFullDraftBody) return false;
  return args.elapsedMs >= PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS;
}

export function shouldLogPremiumReturnLateSuccess(args: {
  hardFailopenWasActive: boolean;
  patienceExtendedWasActive: boolean;
}): boolean {
  return args.hardFailopenWasActive || args.patienceExtendedWasActive;
}

export function logPremiumProWaitSuccessTransition(): void {
  console.info("[premium-pro-wait-success-transition]");
}

export {
  PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS,
  PREMIUM_POST_CHECKOUT_SOFT_PROGRESS_MS,
};
