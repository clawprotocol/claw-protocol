/**
 * Premium full-draft network failure classification (logging only).
 * Distinguishes browser connectivity events from aborts and duplicate orchestration.
 */

export type PremiumNetworkClassificationCause =
  | "browser_network_changed"
  | "browser_fetch_failed"
  | "browser_connection_error"
  | "browser_offline"
  | "request_aborted_user"
  | "request_fetch_timeout"
  | "duplicate_checkout_suppressed"
  | "retry_recovered"
  | "non_network_failure";

export type PremiumNetworkClassification = {
  cause: PremiumNetworkClassificationCause;
  recoverable: boolean;
};

export function classifyPremiumNetworkFailure(error: unknown): PremiumNetworkClassification {
  if (error == null) {
    return { cause: "non_network_failure", recoverable: false };
  }
  const msg = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") {
    if (/premium_full_draft_fetch_timeout/i.test(msg)) {
      return { cause: "request_fetch_timeout", recoverable: true };
    }
    return { cause: "request_aborted_user", recoverable: false };
  }
  if (/ERR_NETWORK_CHANGED|network changed/i.test(msg)) {
    return { cause: "browser_network_changed", recoverable: true };
  }
  if (/browser offline/i.test(msg)) {
    return { cause: "browser_offline", recoverable: true };
  }
  if (
    /ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_NAME_NOT_RESOLVED|ERR_TIMED_OUT/i.test(
      msg,
    )
  ) {
    return { cause: "browser_connection_error", recoverable: true };
  }
  if (/Failed to fetch|NetworkError|Load failed|ERR_INTERNET_DISCONNECTED|net::ERR_/i.test(msg)) {
    return { cause: "browser_fetch_failed", recoverable: true };
  }
  if (name === "TypeError" && /fetch|network/i.test(msg)) {
    return { cause: "browser_fetch_failed", recoverable: true };
  }
  return { cause: "non_network_failure", recoverable: false };
}

export function logPremiumNetworkClassification(args: {
  cause: PremiumNetworkClassificationCause;
  recoverable: boolean;
  sessionGenerationIdShort?: string | null;
  intakeFingerprint?: string | null;
  attemptCount?: number;
  networkAttempt?: number;
  duplicateCheckoutBlocked?: boolean;
  note?: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[premium-network-classification]", {
    cause: args.cause,
    recoverable: args.recoverable,
    sessionGenerationIdShort: args.sessionGenerationIdShort ?? null,
    intakeFingerprint: args.intakeFingerprint ?? null,
    attemptCount: args.attemptCount ?? null,
    networkAttempt: args.networkAttempt ?? null,
    duplicateCheckoutBlocked: args.duplicateCheckoutBlocked ?? false,
    note: args.note ?? null,
  });
}
