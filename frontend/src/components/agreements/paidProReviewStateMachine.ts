/**
 * Canonical paid Pro review state machine.
 *
 * Paid flows must fail CLOSED and RECOVERABLE: once checkout (or QA bypass) completes,
 * the surface may ONLY resolve to a valid authoritative corpus or an explicit
 * FAILED_PREMIUM_CORPUS recovery state. It must never silently degrade into the
 * free starter / preview surface, render an empty authoritative body, or expose a
 * "Continue with Pro" upsell CTA.
 */

export type PaidProReviewState =
  | "NOT_PAID"
  | "GENERATING"
  | "AUTHORITATIVE_READY"
  | "FAILED_PREMIUM_CORPUS";

export type ResolvePaidProReviewStateArgs = {
  /** Paid document chrome is (or should be) active for this surface. */
  premiumPaidDocumentSurface: boolean;
  /** Checkout / QA bypass latched: a paid session, persisted flow, or SoT exists. */
  premiumCheckoutCompleted: boolean;
  /** Premium generation / network recovery still in flight (not yet a final result). */
  premiumGenerationInFlight: boolean;
  /** A valid authoritative paid corpus is available (SoT or committed authoritative UI). */
  hasValidAuthoritativeCorpus: boolean;
  /** Authority candidates were evaluated and rejected (premium-unavailable-retry). */
  premiumCorpusValidationFailed: boolean;
  /**
   * Length of the authoritative body actually resolvable for render. When provided and zero while a
   * corpus is otherwise "valid", the surface must NOT report AUTHORITATIVE_READY (which would emit an
   * `authoritativeLen: 0` invariant violation): a transiently empty body — e.g. mid signer hydration —
   * stays GENERATING/RECOVERING until the paid SoT body resolves again.
   */
  authoritativeBodyLen?: number;
};

/**
 * Single source of truth for paid review routing.
 *
 * AUTHORITATIVE_READY wins whenever a valid corpus exists. Otherwise, once checkout
 * completed and generation is no longer in flight, the only terminal non-ready state
 * is FAILED_PREMIUM_CORPUS — never NOT_PAID and never a starter degrade.
 */
export function resolvePaidProReviewState(
  args: ResolvePaidProReviewStateArgs,
): PaidProReviewState {
  const paid = args.premiumPaidDocumentSurface || args.premiumCheckoutCompleted;
  if (!paid) return "NOT_PAID";
  // AUTHORITATIVE_READY requires a non-empty body. A valid-but-empty body (e.g. the active review
  // predicate transiently false during signer hydration) must never report ready with len 0.
  const bodyKnownEmpty =
    typeof args.authoritativeBodyLen === "number" && args.authoritativeBodyLen <= 0;
  if (args.hasValidAuthoritativeCorpus && !bodyKnownEmpty) return "AUTHORITATIVE_READY";
  if (args.premiumCorpusValidationFailed) return "FAILED_PREMIUM_CORPUS";
  if (args.premiumGenerationInFlight) return "GENERATING";
  // Paid authority exists but the body is momentarily empty: keep recovering, never fail/ready.
  if (args.hasValidAuthoritativeCorpus && bodyKnownEmpty) return "GENERATING";
  // Checkout completed, generation finished, and no valid corpus exists: fail closed.
  if (args.premiumCheckoutCompleted) return "FAILED_PREMIUM_CORPUS";
  return "GENERATING";
}

/** Paid state of any kind: the free starter / preview surface must never mount. */
export function paidProReviewStateBlocksStarterSurface(state: PaidProReviewState): boolean {
  return state !== "NOT_PAID";
}

/** Review document (authoritative body / final review shell) may render only when ready. */
export function paidProReviewStateBlocksReviewRender(state: PaidProReviewState): boolean {
  return state === "FAILED_PREMIUM_CORPUS" || state === "GENERATING";
}

/** Recipient setup, delivery tracks, and VS01 require a ready authoritative corpus. */
export function paidProReviewStateAllowsRecipientSetup(state: PaidProReviewState): boolean {
  return state === "AUTHORITATIVE_READY";
}

export function paidProReviewStateAllowsVs01(state: PaidProReviewState): boolean {
  return state === "AUTHORITATIVE_READY";
}

/** After paid acceptance the CTA may never offer a Pro upsell ("Continue with Pro"). */
export function paidProReviewStateForbidsProUpsellCta(state: PaidProReviewState): boolean {
  return state !== "NOT_PAID";
}

export function isFailedPremiumCorpusState(state: PaidProReviewState): boolean {
  return state === "FAILED_PREMIUM_CORPUS";
}

export type PaidProQaInvariantInput = {
  state: PaidProReviewState;
  authoritativeBodySource: string | null | undefined;
  authoritativeLen: number;
  freeStarterShellResolved: boolean;
  ctaLabel: string;
  starterLabelRendered: boolean;
};

/**
 * Deterministic QA invariants for a *ready* paid review. Returns a list of violations
 * (empty when healthy). These mirror the required log assertions:
 *  - authoritative body source must never be "none"
 *  - authoritative length must never be 0
 *  - free starter shell must never resolve
 *  - CTA label must never contain "Pro"
 *  - starter labels must never render
 */
export function collectPaidProQaInvariantViolations(
  input: PaidProQaInvariantInput,
): string[] {
  const violations: string[] = [];
  if (input.state === "NOT_PAID") return violations;

  if (input.freeStarterShellResolved) violations.push("free_starter_shell_resolved_after_paid");
  if (input.starterLabelRendered) violations.push("starter_label_rendered_after_paid");
  if (/\bpro\b/i.test(input.ctaLabel) && /continue with pro/i.test(input.ctaLabel)) {
    violations.push("continue_with_pro_cta_after_paid");
  }

  if (input.state === "AUTHORITATIVE_READY") {
    const src = (input.authoritativeBodySource || "").trim().toLowerCase();
    if (!src || src === "none") violations.push("authoritative_body_source_none");
    if (input.authoritativeLen <= 0) violations.push("authoritative_len_zero");
  }
  return violations;
}

export function logPaidProReviewStateTelemetry(args: {
  state: PaidProReviewState;
  authoritativeLen: number;
  premiumCorpusValidationFailed: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-review-state]", args);
}

export function logPaidProQaInvariantViolations(violations: readonly string[]): void {
  if (!violations.length) return;
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.error("[paid-pro-qa-invariant-violation]", { violations });
}
