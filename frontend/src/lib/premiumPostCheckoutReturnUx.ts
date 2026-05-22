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
  { short: "Upgrade", full: "Upgrade confirmed" },
  { short: "Terms loaded", full: "Source terms loaded" },
  { short: "Pro draft", full: "Pro agreement building" },
  { short: "Review", full: "Review screen ready" },
] as const;

/** Rotating status microcopy — one line visible at a time; no fake progress. */
export const PREMIUM_PRO_WAIT_ROTATING_LINES: readonly string[] = [
  "Using your original deal terms.",
  "Organizing the bones.",
  "Tightening the deal flow.",
  "Organizing parties and responsibilities.",
  "Turning rough terms into review-ready language.",
  "Preparing collaboration + signing.",
  "Building the review-ready version.",
  "Keeping the workflow under your control.",
  "Making it easier for the other side to review.",
] as const;

/** Banned stale / awkward phrases — guarded in tests. */
export const PREMIUM_PRO_WAIT_STALE_COPY_BANS = [
  "real meat",
  "more chewing",
  "Large agreement. Still working",
  "this one has some bark",
  "Still finishing your Pro agreement",
  "generation failed",
  "starter draft",
] as const;

export const PREMIUM_PRO_WAIT_ROTATE_INTERVAL_MS = 5000;

export const PREMIUM_RETURN_RETRY_GENERATION_LABEL = "Retry Pro generation";
export const PREMIUM_RETURN_USE_STARTER_LABEL = "Use current draft for now";
export const PREMIUM_NETWORK_RECOVERABLE_HEADLINE =
  "Your payment is confirmed. We had a connection issue while building the Pro draft.";
export const PREMIUM_NETWORK_RECOVERABLE_BODY =
  "Your starter draft is still here. Retry Pro draft when your connection is stable — no additional checkout.";
export const PREMIUM_NETWORK_RECOVERABLE_RETRY_LABEL = "Retry Pro draft";
export const PREMIUM_NETWORK_RECOVERABLE_STARTER_LABEL = "Continue with starter draft";
export const PREMIUM_NETWORK_RECOVERABLE_COPY_DEBUG_LABEL = "Copy debug info";

export type PremiumNetworkRecoverableDebugPayload = {
  sessionGenerationId?: string | null;
  intakeFingerprint?: string | null;
  agreementId?: string | null;
  renderSource?: string | null;
  phase?: string | null;
  ts?: string;
};

export function buildPremiumNetworkRecoverableDebugInfo(
  payload: PremiumNetworkRecoverableDebugPayload,
): string {
  const lines = [
    "LawDog Pro checkout return (network recoverable)",
    `ts: ${payload.ts ?? new Date().toISOString()}`,
    `phase: ${payload.phase ?? "premium_network_recoverable"}`,
    `sessionGenerationId: ${payload.sessionGenerationId ?? "—"}`,
    `intakeFingerprint: ${payload.intakeFingerprint ?? "—"}`,
    `agreementId: ${payload.agreementId ?? "—"}`,
    `renderSource: ${payload.renderSource ?? "premium_network_retryable"}`,
  ];
  return lines.join("\n");
}

export function logPremiumNetworkRecoverable(payload: PremiumNetworkRecoverableDebugPayload): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[premium-network-recoverable]", payload);
}

/** Shown when HTTP succeeded but client corpus gates rejected the paid body. */
export const PREMIUM_PAID_CORPUS_REJECTED_HEADLINE = "We couldn't safely finalize the Pro version.";
export const PREMIUM_PAID_CORPUS_REJECTED_BODY =
  "Your current draft is still available. Retry Pro draft or keep editing.";

export function formatPremiumPaidCorpusRejectedMessage(): string {
  return `${PREMIUM_PAID_CORPUS_REJECTED_HEADLINE}\n\n${PREMIUM_PAID_CORPUS_REJECTED_BODY}`;
}

export type PremiumProWaitProgressStepState = "pending" | "active" | "done";

export type PremiumProWaitProgressStep = {
  shortLabel: string;
  state: PremiumProWaitProgressStepState;
};

export type PremiumProWaitModalView = {
  phase: PremiumProWaitVisualPhase;
  title: string;
  /** Static status for terminal phases; null while rotating lines run. */
  statusLine: string | null;
  showRotatingLines: boolean;
  showSpinner: boolean;
  showRecoveryActions: boolean;
  progressSteps: readonly PremiumProWaitProgressStep[];
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
): readonly PremiumProWaitProgressStep[] {
  const steps = PREMIUM_PRO_WAIT_PROGRESS_STEPS;
  if (phase === "success") {
    return steps.map((s) => ({ shortLabel: s.short, state: "done" as const }));
  }
  if (phase === "terminal_failure") {
    return [
      { shortLabel: steps[0].short, state: "done" },
      { shortLabel: steps[1].short, state: "done" },
      { shortLabel: steps[2].short, state: "pending" },
      { shortLabel: steps[3].short, state: "pending" },
    ];
  }
  const termsDone = phase === "soft_wait" || phase === "extended_wait";
  const buildingActive = phase === "processing" || phase === "soft_wait" || phase === "extended_wait";
  return [
    { shortLabel: steps[0].short, state: "done" },
    { shortLabel: steps[1].short, state: termsDone ? "done" : "active" },
    { shortLabel: steps[2].short, state: buildingActive ? "active" : "pending" },
    { shortLabel: steps[3].short, state: "pending" },
  ];
}

export function resolvePremiumProWaitModalView(phase: PremiumProWaitVisualPhase): PremiumProWaitModalView {
  const progressSteps = resolvePremiumProWaitProgressSteps(phase);
  const reassurance = PREMIUM_PRO_WAIT_REASSURANCE;

  if (phase === "success") {
    return {
      phase,
      title: "Pro agreement ready",
      statusLine: "Opening your review screen now.",
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
      title: PREMIUM_PAID_CORPUS_REJECTED_HEADLINE,
      statusLine: PREMIUM_PAID_CORPUS_REJECTED_BODY,
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
      title: "Big agreement. Still on it.",
      statusLine: null,
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
      title: "Still building — good deals take a minute",
      statusLine: null,
      showRotatingLines: true,
      showSpinner: true,
      showRecoveryActions: false,
      progressSteps,
      reassurance,
    };
  }

  return {
    phase,
    title: "Building your Pro agreement",
    statusLine: null,
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
    body: view.statusLine ?? "",
    helper: null,
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

export function logPremiumProWaitView(phase: PremiumProWaitVisualPhase): void {
  console.info("[premium-pro-wait-view]", { phase });
}

export function logPremiumProWaitCopyRotated(line: string): void {
  if (import.meta.env.DEV) {
    console.info("[premium-pro-wait-copy-rotated]", { line });
  }
}

export function logPremiumProWaitSuccessTransition(): void {
  console.info("[premium-pro-wait-success-transition]");
}

/** Stable focus target for post-checkout Pro review (matches SimpleFlowShell paid-Pro title). */
export const PREMIUM_PRO_REVIEW_SCROLL_ANCHOR_ID = "premium-pro-review-scroll-anchor";

export type PremiumReviewScrollResetReason =
  | "payment_success_authoritative_apply"
  | "premium_completion_hydrate"
  | "premium_return_restore";

let premiumReviewScrollResetConsumed = false;

/** Reset scroll/focus to top of Pro review shell after authoritative draft commit (once per success). */
export function resetPremiumReviewScrollToTop(args: {
  reason: PremiumReviewScrollResetReason;
  force?: boolean;
}): void {
  if (premiumReviewScrollResetConsumed && !args.force) {
    console.info("[premium-review-scroll-reset]", { reason: args.reason, applied: false });
    return;
  }
  premiumReviewScrollResetConsumed = true;

  const run = () => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } catch {
      /* ignore */
    }
    const anchor = document.getElementById(PREMIUM_PRO_REVIEW_SCROLL_ANCHOR_ID);
    if (anchor) {
      if (typeof anchor.scrollIntoView === "function") {
        anchor.scrollIntoView({ behavior: "auto", block: "start" });
      }
      if (!anchor.hasAttribute("tabindex")) anchor.setAttribute("tabindex", "-1");
      try {
        anchor.focus({ preventScroll: true });
      } catch {
        anchor.focus();
      }
    }
    const preview = document.getElementById("claw-agreement-preview-editor");
    if (preview && "scrollTop" in preview) {
      (preview as HTMLElement).scrollTop = 0;
    }
    const readonly = document.querySelector<HTMLElement>(".premium-readonly-doc");
    if (readonly) readonly.scrollTop = 0;
    console.info("[premium-review-scroll-reset]", { reason: args.reason, applied: true });
  };

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(run);
  });
}

/** Test-only: allow repeated scroll-reset assertions. */
export function resetPremiumReviewScrollResetConsumedForTests(): void {
  premiumReviewScrollResetConsumed = false;
}

export {
  PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS,
  PREMIUM_POST_CHECKOUT_SOFT_PROGRESS_MS,
};
