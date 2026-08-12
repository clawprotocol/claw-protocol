/**
 * Canonical signer-setup → final-review transition (sticky + inline CTA).
 */

import type { GuidedAnswerApplyStatus } from "./guidedAnswerApplyOrchestration";
import { resolveGuidedSignerSetupStatus } from "./guidedAnswerApplyOrchestration";
import type { GuidedFinalReviewUnlockBlockReason } from "./guidedFinalReviewTransition";
import { describeGuidedValidationMissingItems } from "./guidedFinalCorpusFinalizer";

export type GuidedFinalReviewCtaRoute =
  | "sticky_cta"
  | "inline_cta"
  | "execute_primary_cta"
  | "programmatic";

export type GuidedSignerSetupContinueBlockReason =
  | GuidedFinalReviewUnlockBlockReason
  | "guided_validation_incomplete"
  | "refine_in_flight"
  | "unexpected_state";

export type EvaluateGuidedSignerSetupContinueReadinessArgs = {
  applyStatus: GuidedAnswerApplyStatus;
  signersComplete: boolean;
  authoritativeBodyLen: number;
  canonicalWorkingDraftLen?: number;
  signersEditing?: boolean;
  signerMetadataDebouncing?: boolean;
  refineInFlight?: boolean;
  minAuthoritativeLen?: number;
};

export function evaluateGuidedSignerSetupContinueReadiness(
  args: EvaluateGuidedSignerSetupContinueReadinessArgs,
): { ok: boolean; reason: GuidedSignerSetupContinueBlockReason | null } {
  if (args.refineInFlight) return { ok: false, reason: "refine_in_flight" };
  if (args.signersEditing) return { ok: false, reason: "signer_field_focused" };
  if (args.signerMetadataDebouncing) return { ok: false, reason: "metadata_write_pending" };
  if (args.applyStatus === "applying") return { ok: false, reason: "refine_in_flight" };
  if (!args.signersComplete) return { ok: false, reason: "signers_incomplete" };
  const minLen = args.minAuthoritativeLen ?? 500;
  const effectiveLen = Math.max(args.authoritativeBodyLen, args.canonicalWorkingDraftLen ?? 0);
  if (effectiveLen < minLen) return { ok: false, reason: "authoritative_body_missing" };
  return { ok: true, reason: null };
}

export function userMessageForGuidedSignerSetupContinueBlock(
  reason: GuidedSignerSetupContinueBlockReason,
): string {
  switch (reason) {
    case "signers_incomplete":
      return "Add the required signer details before final review.";
    case "authoritative_body_missing":
      return "LawDog is still preparing your Pro agreement. Please wait a moment and try again.";
    case "guided_validation_incomplete":
      return "LawDog is still merging your guided answers into the final agreement. Please wait a moment and try again.";
    case "party_placeholders_unresolved":
      return "Signer names are saved, but party placeholders remain in the agreement. Edit signer details and try again.";
    case "signer_field_focused":
      return "Finish editing signer details, then tap Continue to final review again.";
    case "metadata_write_pending":
      return "Saving signer details… try again in a moment.";
    case "refine_in_flight":
      return "LawDog is still applying your answers. Wait for that to finish, then continue.";
    case "apply_not_complete":
      return "Still applying your answers. Please try again in a moment.";
    default:
      return "Final review is not ready yet. Check signer details and try again.";
  }
}

export function logGuidedFinalReviewCtaClick(payload: {
  route: GuidedFinalReviewCtaRoute;
  reason?: string;
  applyStatus: GuidedAnswerApplyStatus;
  phase: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-cta-click]", payload);
}

export function logGuidedFinalReviewCtaRoute(payload: {
  route: GuidedFinalReviewCtaRoute;
  handler: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-cta-route]", payload);
}

export function logGuidedFinalReviewTransitionStart(payload: {
  applyStatus: GuidedAnswerApplyStatus;
  needsApply: boolean;
  authoritativeBodyLen: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-transition-start]", payload);
}

export function logGuidedFinalReviewTransitionComplete(payload: {
  bodyLen: number;
  phase: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-transition-complete]", payload);
}

export function logGuidedFinalReviewTransitionSuccess(payload: {
  bodyLen: number;
  phase: string;
  hash?: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-transition-success]", payload);
}

export function logGuidedFinalReviewTransitionFailure(payload: {
  reason: GuidedSignerSetupContinueBlockReason;
  route?: GuidedFinalReviewCtaRoute;
  phase?: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-transition-failure]", payload);
}

export function logGuidedFinalReviewTransitionBlocked(
  reason: GuidedSignerSetupContinueBlockReason,
  payload?: Record<string, unknown>,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-transition-blocked]", { reason, ...payload });
}

export function logGuidedFinalReviewTransitionDeduped(): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-transition-deduped]");
}

export function logGuidedFinalReviewApplyAwaitStart(payload?: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-apply-await-start]", payload ?? {});
}

export function logGuidedFinalReviewApplyAwaitSuccess(payload?: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-apply-await-success]", payload ?? {});
}

export function logGuidedFinalReviewApplyAwaitTimeout(payload?: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-apply-await-timeout]", payload ?? {});
}

export function isGuidedFinalReviewActionableBlockReason(
  reason: GuidedSignerSetupContinueBlockReason,
): boolean {
  return (
    reason === "signers_incomplete" ||
    reason === "party_placeholders_unresolved" ||
    reason === "signer_field_focused" ||
    reason === "metadata_write_pending" ||
    reason === "refine_in_flight" ||
    reason === "unexpected_state"
  );
}

export type GuidedFinalizeModalBlockedKind =
  | "signers_needed"
  | "still_preparing"
  | "internal_retry"
  | "validation_retry"
  | "generic";

export function describeGuidedFinalizeValidationBlock(args: {
  validationMissing?: readonly string[];
  validationContradictions?: readonly string[];
  guidedSession?: import("./types").GuidedCompletionSession | null;
}): string | null {
  const parts = [
    ...describeGuidedValidationMissingItems(args.validationMissing ?? [], args.guidedSession),
    ...(args.validationContradictions ?? []).map((c) => `Contradiction: ${c.replace(/_/g, " ")}`),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

export function logGuidedFinalReviewRetryStart(payload?: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-retry-start]", payload ?? {});
}

export function logGuidedFinalReviewRetryAnswers(
  answers: Array<{ variableId: string; answer: string }>,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-retry-answers]", { answers });
}

export function logGuidedFinalReviewRetrySuccess(payload?: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-retry-success]", payload ?? {});
}

export function logGuidedFinalReviewRetryFailed(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-retry-failed]", payload);
}

export function resolveGuidedFinalizeModalBlockedPresentation(args: {
  reason: GuidedSignerSetupContinueBlockReason;
  workingDraftLen?: number;
  validationMissing?: readonly string[];
  validationContradictions?: readonly string[];
}): {
  kind: GuidedFinalizeModalBlockedKind;
  headline: string;
  body: string;
  ctaLabel: string | null;
  footnote: string;
} {
  const workingLen = args.workingDraftLen ?? 0;
  switch (args.reason) {
    case "signers_incomplete":
    case "party_placeholders_unresolved":
    case "signer_field_focused":
      return {
        kind: "signers_needed",
        headline: "Add signer details.",
        body: userMessageForGuidedSignerSetupContinueBlock(args.reason),
        ctaLabel: "Edit signer details",
        footnote: "Update signer details below, then continue.",
      };
    case "guided_validation_incomplete":
      if ((args.validationMissing?.length ?? 0) > 0 || (args.validationContradictions?.length ?? 0) > 0) {
        return {
          kind: "still_preparing",
          headline: "Optimizing agreement structure.",
          body: "LawDog is finalizing your agreement and preserving your signer details.",
          ctaLabel: null,
          footnote: "Your answers and signer details are saved.",
        };
      }
      if (workingLen >= 1500) {
        return {
          kind: "still_preparing",
          headline: "Preparing final review.",
          body: "LawDog is applying your answers and signer details.",
          ctaLabel: null,
          footnote: "This usually takes a few seconds.",
        };
      }
      return {
        kind: "still_preparing",
        headline: "Optimizing agreement structure.",
        body: "LawDog is finalizing your agreement and preserving your signer details.",
        ctaLabel: null,
        footnote: "Your answers and signer details are saved.",
      };
    case "authoritative_body_missing":
      return workingLen >= 1500
        ? {
            kind: "still_preparing",
            headline: "Preparing final review.",
            body: "LawDog is applying your answers and signer details to the final agreement.",
            ctaLabel: null,
            footnote: "This usually takes a few seconds.",
          }
        : {
            kind: "still_preparing",
            headline: "Finalizing agreement.",
            body: "Your agreement draft is ready, but a few formatting refinements are still processing.",
            ctaLabel: null,
            footnote: "Your answers and signer details are saved.",
          };
    case "apply_not_complete":
    case "refine_in_flight":
    case "metadata_write_pending":
      return {
        kind: "still_preparing",
        headline: "Preparing final review.",
        body: "LawDog is applying your answers and signer details.",
        ctaLabel: null,
        footnote: "This usually takes a few seconds.",
      };
    default:
      return {
        kind: "still_preparing",
        headline: "Finalizing agreement.",
        body: "Your agreement draft is ready, but a few formatting refinements are still processing.",
        ctaLabel: null,
        footnote: "Your answers and signer details are saved.",
      };
  }
}

export function resolveGuidedSignerSetupContinueApplyStatus(
  applyStatus: GuidedAnswerApplyStatus,
  signersComplete: boolean,
): GuidedAnswerApplyStatus {
  void signersComplete;
  return applyStatus;
}

export function signerStatusFromComplete(signersComplete: boolean) {
  return resolveGuidedSignerSetupStatus(signersComplete);
}

export function isGuidedSignerSetupContinueToFinalReviewReason(reason: string | undefined): boolean {
  return (
    reason === "signer_setup_ready_final_review" ||
    reason === "guided_apply_failed_retry" ||
    reason === "updated_agreement_ready" ||
    reason === "guided_final_review_inline_cta"
  );
}
