import {
  PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS,
  PREMIUM_POST_CHECKOUT_SOFT_PROGRESS_MS,
} from "./postCheckoutModalTimeout";

/** After 120s modal patience threshold — request may still be in flight up to {@link PREMIUM_COMPLETION_ATTEMPT_MAX_MS}. */
export const PREMIUM_POST_CHECKOUT_PATIENCE_TITLE = "Still finishing your Pro agreement";
export const PREMIUM_POST_CHECKOUT_PATIENCE_BODY =
  "Your payment was detected. No additional checkout needed.";
export const PREMIUM_POST_CHECKOUT_PATIENCE_HELPER =
  "Larger multi-party agreements can take a few minutes.";

export const PREMIUM_RETURN_KEEP_WAITING_LABEL = "Keep waiting";
export const PREMIUM_RETURN_RETRY_GENERATION_LABEL = "Retry Pro generation";
export const PREMIUM_RETURN_USE_STARTER_LABEL = "Use starter draft for now";

export type PremiumCheckoutModalCopyTier = "initial" | "soft_progress" | "patience_extended";

export function resolvePremiumCheckoutModalCopy(tier: PremiumCheckoutModalCopyTier): {
  title: string;
  body: string;
  helper: string | null;
  showPatienceActions: boolean;
} {
  if (tier === "patience_extended") {
    return {
      title: PREMIUM_POST_CHECKOUT_PATIENCE_TITLE,
      body: PREMIUM_POST_CHECKOUT_PATIENCE_BODY,
      helper: PREMIUM_POST_CHECKOUT_PATIENCE_HELPER,
      showPatienceActions: true,
    };
  }
  if (tier === "soft_progress") {
    return {
      title: "Still building your Pro agreement…",
      body: "This can take up to a minute. Nothing is sent until you confirm.",
      helper: null,
      showPatienceActions: false,
    };
  }
  return {
    title: "Building your Pro agreement…",
    body: "Using your original deal terms. You can refine details after it appears.",
    helper: null,
    showPatienceActions: false,
  };
}

/**
 * Hard modal ceiling (120s) is a patience threshold only — not terminal failure while the authoritative request runs.
 */
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

/** Log and reconcile UI when Pro output lands after patience threshold or terminal failopen. */
export function shouldLogPremiumReturnLateSuccess(args: {
  hardFailopenWasActive: boolean;
  patienceExtendedWasActive: boolean;
}): boolean {
  return args.hardFailopenWasActive || args.patienceExtendedWasActive;
}

export { PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS, PREMIUM_POST_CHECKOUT_SOFT_PROGRESS_MS };
