import { isPostSignerMetadataFreezeActive } from "./authoritativeSigningSnapshot";

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
  /**
   * Signer (recipient) metadata is actively being edited over an accepted paid SoT. While true the
   * surface must NEVER downgrade to FAILED_PREMIUM_CORPUS (or a starter degrade): a transient recompute
   * during typing — validation flip, momentarily empty body, render-source churn — must hold on the
   * accepted corpus (AUTHORITATIVE_READY) or, at worst, recover (GENERATING), never fail.
   */
  signerMetadataEditActive?: boolean;
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
  // Signer-metadata-edit isolation: while editing signer metadata over a paid session, a transient
  // recompute must never downgrade to FAILED_PREMIUM_CORPUS or a starter degrade. Hold/recover only.
  if (args.signerMetadataEditActive) return "GENERATING";
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

/**
 * Paid Pro signer-setup isolation.
 *
 * Once an accepted paid SoT exists and the user is entering signer (recipient) metadata, the
 * surface must be fully isolated from the discovery surfaces: typing a signer name/email may only
 * update signer metadata state. It must NEVER re-trigger guided question-queue rebuilds, the free
 * starter refresh, Pro regeneration, or VS01/handoff corpus recomputation. The accepted SoT body /
 * hash / length stay frozen until the user explicitly advances ("Prepare signature links").
 */
export type PaidProSignerSetupIsolationArgs = {
  /** Paid Pro signer (recipient) setup surface is active. */
  signerSetupActive: boolean;
  /** A committed paid Pro Source of Truth exists. */
  hasPaidProSourceOfTruth: boolean;
  /**
   * The user has explicitly clicked "Prepare signature links" (or otherwise chosen a send/sign path).
   * This is the ONLY event that releases signer-metadata-edit isolation: once true the guard is no
   * longer active and downstream recomputes (handoff, VS01, delivery) may run again.
   */
  prepareSignatureLinksRequested?: boolean;
  /**
   * Inline signer setup latch — stays true after the user opens signer details until Prepare signature
   * links, even when the signer-details gate becomes complete mid-typing.
   */
  signerSetupLatched?: boolean;
};

export type PaidProSignerMetadataSessionArgs = PaidProSignerSetupIsolationArgs;

/**
 * Canonical paid Pro signer-metadata session — the single predicate for “typing/autofill in signer
 * fields must not rebuild document/corpus/preview/manifest paths”.
 *
 *   accepted paid Pro SoT exists
 *   AND (signer/recipient setup is active OR inline setup latch is armed)
 *   AND Prepare signature links has NOT been clicked.
 */
export function paidProSignerMetadataSessionActive(
  args: PaidProSignerMetadataSessionArgs,
): boolean {
  if (args.prepareSignatureLinksRequested) return false;
  if (!args.hasPaidProSourceOfTruth) return false;
  return Boolean(args.signerSetupActive || args.signerSetupLatched);
}

/**
 * While signer setup is active over an accepted SoT, the guided question queue must not be rebuilt
 * and the free starter surface must not refresh. Returns true when those recomputations are
 * suppressed (signer metadata edits are isolated).
 */
export function paidProSignerSetupSuppressesGuidedAndStarter(
  args: PaidProSignerSetupIsolationArgs,
): boolean {
  return paidProSignerMetadataSessionActive(args);
}

/**
 * The VS01 / handoff signing corpus must not be (re)computed during signer metadata entry — it is
 * only built when the user explicitly clicks "Prepare signature links". Returns true when handoff
 * recomputation must be deferred.
 */
export function paidProSignerSetupDefersHandoffRecompute(
  args: PaidProSignerSetupIsolationArgs & { prepareSignatureLinksRequested: boolean },
): boolean {
  if (args.prepareSignatureLinksRequested) return false;
  return paidProSignerMetadataSessionActive(args);
}

/**
 * Hard guard: paid Pro signer-metadata edit is active. This is the SINGLE canonical predicate every
 * recompute path consults:
 *
 *   accepted paid Pro SoT exists
 *   AND signer setup / recipient setup is active
 *   AND "Prepare signature links" has NOT yet been clicked.
 *
 * When true the surface is frozen on the accepted SoT and every discovery/derivation recompute
 * (guided queue, free starter refresh, handoff/VS01 corpus, premium render source, delivery flow,
 * FAILED_PREMIUM_CORPUS transition) must be suppressed — signer edits update signer metadata only.
 */
export function paidProSignerMetadataEditActive(args: PaidProSignerSetupIsolationArgs): boolean {
  return paidProSignerMetadataSessionActive(args);
}

export type PaidProSignerMetadataEditGuard = {
  active: boolean;
  /** Return the existing paid SoT for all Pro document surfaces (no re-derivation). */
  returnFrozenSotForSurfaces: boolean;
  /** Do not rebuild the guided question queue. */
  suppressGuidedQuestionQueue: boolean;
  /** Do not recompute the guided authoritative body. */
  suppressGuidedAuthoritativeBodyRecompute: boolean;
  /** Do not refresh the free starter preview. */
  suppressFreeStarterPreviewRefresh: boolean;
  /** Do not recompute the premium render source. */
  suppressPremiumRenderSourceRecompute: boolean;
  /** Do not recompute handoff / VS01 signing corpus (until "Prepare signature links"). */
  suppressHandoffAndVs01Recompute: boolean;
  /** Do not recompute the delivery / signing-preparation flow. */
  suppressDeliveryFlowRecompute: boolean;
  /** Do not transition into FAILED_PREMIUM_CORPUS. */
  suppressFailedPremiumCorpusTransition: boolean;
};

/**
 * Resolves the full set of recompute suppressions for the signer-metadata edit guard. Every
 * suppression is keyed off the single canonical predicate `paidProSignerMetadataEditActive`, so the
 * ONLY release event is the explicit "Prepare signature links" click (carried by
 * `prepareSignatureLinksRequested`): once clicked the guard is fully inactive and all recomputes —
 * including handoff, VS01, and delivery — are allowed to run again.
 */
export function resolvePaidProSignerMetadataEditGuard(
  args: PaidProSignerSetupIsolationArgs,
): PaidProSignerMetadataEditGuard {
  const active = paidProSignerMetadataEditActive(args);
  return {
    active,
    returnFrozenSotForSurfaces: active,
    suppressGuidedQuestionQueue: active,
    suppressGuidedAuthoritativeBodyRecompute: active,
    suppressFreeStarterPreviewRefresh: active,
    suppressPremiumRenderSourceRecompute: active,
    suppressHandoffAndVs01Recompute: active,
    suppressDeliveryFlowRecompute: active,
    suppressFailedPremiumCorpusTransition: active,
  };
}

/**
 * Authoritative signing-corpus freeze — the SIMPLE, mode-independent invariant.
 *
 * Once an accepted paid Pro Source of Truth exists and the user has NOT yet clicked "Prepare
 * signature links", the VS01 / handoff signing corpus must be treated as frozen. This deliberately
 * does NOT depend on whether the app currently believes "signer setup" is active: the inline
 * signer-details surface can render while `displayPhase` is still review/draft_ready_for_review, in
 * which case the narrower signer-setup predicates are false and the old guard never engaged. The
 * only thing that matters is: a paid SoT exists and signing has not been requested yet.
 *
 *   hasPaidProSourceOfTruth && !prepareSignatureLinksRequested
 *
 * While true, callers must NOT compute the VS01 corpus (no `resolveFinalVs01CorpusOrBlock`, no
 * `source: handoff_corpus`, no `stage: vs01_signing`) and must NOT fail closed.
 */
export function paidProSigningCorpusFreezeActive(args: {
  hasPaidProSourceOfTruth: boolean;
  prepareSignatureLinksRequested: boolean;
}): boolean {
  return Boolean(args.hasPaidProSourceOfTruth && !args.prepareSignatureLinksRequested);
}

export function logPremiumSignerFreeze(payload: {
  hasSot: boolean;
  releaseRequested: boolean;
  blockedVs01Compute: boolean;
  blockedHandoffCompute: boolean;
  blockedGuidedQueue: boolean;
  blockedStarterPreview: boolean;
  blockedReviewTransition: boolean;
  reason: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[premium-signer-freeze]", payload);
}

export type PremiumSignerMetadataFreezeLog = {
  hasSot: boolean;
  partyIndex?: number;
  field?: string;
  inputEventKind?: "change" | "input" | "blur" | "paste" | "autofill";
  blockedPreviewRebuild: boolean;
  blockedIntegrityRepair: boolean;
  blockedCanonicalManifestRecompute: boolean;
  blockedSignaturePreviewRecompute: boolean;
  blockedVs01Compute: boolean;
  signerSetupStillMounted: boolean;
  sotHashBefore: string | null;
  sotHashAfter: string | null;
};

export function logPremiumSignerMetadataFreeze(payload: PremiumSignerMetadataFreezeLog): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[premium-signer-metadata-freeze]", payload);
}

/** DEV-only: distinguishes validation-complete from explicit Prepare-signature-links release. */
export type PremiumSignerDetailsGateLog = {
  signerDetailsAreComplete: boolean;
  signaturePreparationRequested: boolean;
  metadataSessionActive: boolean;
  signingCorpusFreezeActive: boolean;
  inlineSignerSetupLatched: boolean;
  blockedVs01Compute: boolean;
  blockedHandoffCompute: boolean;
  blockedReadonlyReplacement: boolean;
  blockedFailedPremiumCorpus: boolean;
  reason: string;
};

export function resolvePremiumSignerDetailsGateDiagnostics(args: {
  signerDetailsAreComplete: boolean;
  signaturePreparationRequested: boolean;
  hasPaidProSourceOfTruth: boolean;
  signerSetupLatched: boolean;
  signerSetupActive?: boolean;
}): PremiumSignerDetailsGateLog {
  const metadataSessionActive = paidProSignerMetadataSessionActive({
    hasPaidProSourceOfTruth: args.hasPaidProSourceOfTruth,
    prepareSignatureLinksRequested: args.signaturePreparationRequested,
    signerSetupActive: args.signerSetupActive ?? false,
    signerSetupLatched: args.signerSetupLatched,
  });
  const signingCorpusFreezeActive = paidProSigningCorpusFreezeActive({
    hasPaidProSourceOfTruth: args.hasPaidProSourceOfTruth,
    prepareSignatureLinksRequested: args.signaturePreparationRequested,
  });
  const editGuard = resolvePaidProSignerMetadataEditGuard({
    hasPaidProSourceOfTruth: args.hasPaidProSourceOfTruth,
    prepareSignatureLinksRequested: args.signaturePreparationRequested,
    signerSetupActive: args.signerSetupActive ?? false,
    signerSetupLatched: args.signerSetupLatched,
  });
  return {
    signerDetailsAreComplete: args.signerDetailsAreComplete,
    signaturePreparationRequested: args.signaturePreparationRequested,
    metadataSessionActive,
    signingCorpusFreezeActive,
    inlineSignerSetupLatched: args.signerSetupLatched,
    blockedVs01Compute: signingCorpusFreezeActive,
    blockedHandoffCompute: editGuard.suppressHandoffAndVs01Recompute,
    blockedReadonlyReplacement: editGuard.suppressPremiumRenderSourceRecompute,
    blockedFailedPremiumCorpus: editGuard.suppressFailedPremiumCorpusTransition,
    reason: args.signerDetailsAreComplete
      ? "validation_complete_prepare_not_clicked"
      : "validation_incomplete",
  };
}

export function logPremiumSignerDetailsGate(payload: PremiumSignerDetailsGateLog): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[premium-signer-details-gate]", payload);
}

/** True when document/corpus/preview/manifest recompute paths must no-op during signer metadata entry. */
export function paidProSignerMetadataSessionBlocksDocumentRecompute(
  args: PaidProSignerMetadataSessionArgs,
): boolean {
  if (
    isPostSignerMetadataFreezeActive({
      signaturePreparationRequested: args.prepareSignatureLinksRequested,
    })
  ) {
    return true;
  }
  return paidProSignerMetadataSessionActive(args);
}

/** After signer metadata is finalized into an immutable snapshot, all authority recomputes stay blocked. */
export function paidProPostSignerMetadataFreezeBlocksRecompute(args: {
  prepareSignatureLinksRequested?: boolean;
}): boolean {
  return isPostSignerMetadataFreezeActive({
    signaturePreparationRequested: args.prepareSignatureLinksRequested,
  });
}

/**
 * Freeze-or-compute helper for signer-metadata-edit isolation. When the edit guard is active and a
 * previously computed value is already frozen, the value is reused and `compute` is NEVER called —
 * this is how the VS01/handoff signing-corpus resolver is prevented from running on every keystroke
 * during signer setup. The first computation (at signer-setup entry) captures the frozen value; the
 * guard release ("Prepare signature links") lets `compute` run again.
 */
export function resolveOrReuseFrozenForSignerEdit<T>(args: {
  editGuardActive: boolean;
  frozen: T | null | undefined;
  compute: () => T;
}): { value: T; computed: boolean } {
  if (args.editGuardActive && args.frozen != null) {
    return { value: args.frozen, computed: false };
  }
  return { value: args.compute(), computed: true };
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
