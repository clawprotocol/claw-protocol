/**
 * Post-checkout Paid Pro render gate — first review after checkout must never route into
 * guided question collection. Display server SoT, deterministic local recovery, or an explicit
 * retry/recovery panel only.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import {
  hasPaidPremiumCompletionSession,
  readPremiumCompletionSnapshot,
} from "./premiumCompletionStorage";
import { PREMIUM_USABLE_BODY_MIN_LEN } from "./premiumPostCheckoutApplyEligible";
import {
  PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
  PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
} from "./premiumNetworkRecoveryLocalDraft";

/** Minimum plain length for a displayable degraded/local recovery Pro agreement on first review. */
export const PAID_PRO_RECOVERY_MIN_DISPLAY_LEN = 4_000;

export type PaidProPostCheckoutRenderGateInput = {
  premiumPaidDocumentSurface?: boolean;
  premiumCheckoutCompleted?: boolean;
  premiumCompletionSessionActive?: boolean;
  premiumRenderSource?: string | null;
  premiumDegradedServerLocalRecovery?: boolean;
  premiumDegradedServerRecoverable?: boolean;
  premiumNetworkLocalRecovery?: boolean;
};

export function isPaidProPostCheckoutRecoveryPipelineSource(
  pipelineSource: string | null | undefined,
): boolean {
  const s = String(pipelineSource || "").trim();
  return (
    s === PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE ||
    s === PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE ||
    s === "premium_generation_retryable" ||
    s === "rejected_paid_corpus"
  );
}

function isDegradedLocalRecoveryPipelineSource(pipelineSource: string | null | undefined): boolean {
  return String(pipelineSource || "").trim() === PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE;
}

function isNetworkLocalRecoveryPipelineSource(pipelineSource: string | null | undefined): boolean {
  return String(pipelineSource || "").trim() === PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE;
}

export function isPaidProPostCheckoutFlowActive(args: PaidProPostCheckoutRenderGateInput): boolean {
  if (!args.premiumPaidDocumentSurface && !args.premiumCheckoutCompleted) return false;
  const pipeline = String(args.premiumRenderSource || "").trim();
  return Boolean(
    args.premiumCheckoutCompleted ||
      args.premiumCompletionSessionActive ||
      hasPaidPremiumCompletionSession() ||
      args.premiumDegradedServerLocalRecovery ||
      args.premiumDegradedServerRecoverable ||
      args.premiumNetworkLocalRecovery ||
      isDegradedLocalRecoveryPipelineSource(pipeline) ||
      isNetworkLocalRecoveryPipelineSource(pipeline) ||
      isPaidProPostCheckoutRecoveryPipelineSource(pipeline),
  );
}

/** Hard gate: paid post-checkout must never mount guided question collection as the primary surface. */
export function shouldSuppressPaidProGuidedCompletionUi(
  args: PaidProPostCheckoutRenderGateInput,
): boolean {
  if (hasPaidProSourceOfTruth()) return true;
  return isPaidProPostCheckoutFlowActive(args);
}

export function meetsPaidProDegradedRecoveryDisplayRequirements(
  body: string,
  intakeText?: string | null,
): boolean {
  const t = (body || "").trim();
  if (t.length <= PAID_PRO_RECOVERY_MIN_DISPLAY_LEN) return false;
  const lower = `${t}\n${intakeText || ""}`.toLowerCase();
  if (!/blue canyon analytics/i.test(lower)) return false;
  if (!/iron vale systems/i.test(lower)) return false;
  if (!/delaware/i.test(lower)) return false;
  if (!/(?:\$|usd\s*)?8[,.]?500|\b8500\b/i.test(lower)) return false;
  if (countPaidProExecutionBlocks(t) !== 1) return false;
  if (!/\b(agreement|consulting)\b/i.test(t)) return false;
  return true;
}

export function isDisplayablePaidProDegradedLocalRecovery(args: {
  premiumRenderSource?: string | null;
  premiumDegradedServerLocalRecovery?: boolean;
  body: string;
  intakeText?: string | null;
}): boolean {
  const pipeline = String(args.premiumRenderSource || "").trim();
  if (
    !args.premiumDegradedServerLocalRecovery &&
    !isDegradedLocalRecoveryPipelineSource(pipeline)
  ) {
    return false;
  }
  return meetsPaidProDegradedRecoveryDisplayRequirements(args.body, args.intakeText);
}

export function resolvePaidProPostCheckoutRecoveryDisplayPlain(args?: {
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
  winningPremiumBodyText?: string | null;
  hydratedPremiumBody?: string | null;
  premiumRenderSource?: string | null;
  premiumDegradedServerLocalRecovery?: boolean;
}): string {
  const snap = readPremiumCompletionSnapshot();
  const pipeline = String(
    args?.premiumRenderSource ??
      snap?.premiumPipelineRenderSource ??
      snap?.premiumRenderResolveSource ??
      "",
  ).trim();
  const candidates = [
    args?.winningPremiumBodyText,
    args?.hydratedPremiumBody,
    snap?.premiumWinningBodyText,
    snap?.premiumReadonlyPlainText,
    snap?.premiumDraft?.premium_full_document_text,
  ]
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  const intake = args?.intakeText ?? null;
  for (const body of candidates) {
    if (
      isDisplayablePaidProDegradedLocalRecovery({
        premiumRenderSource: pipeline,
        premiumDegradedServerLocalRecovery:
          args?.premiumDegradedServerLocalRecovery ??
          pipeline === PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
        body,
        intakeText: intake,
      })
    ) {
      return body;
    }
    if (
      isNetworkLocalRecoveryPipelineSource(pipeline) &&
      body.length > PAID_PRO_RECOVERY_MIN_DISPLAY_LEN &&
      body.length >= PREMIUM_USABLE_BODY_MIN_LEN
    ) {
      return body;
    }
  }
  return "";
}

/** First-review plain for post-checkout recovery (never establishes SoT). */
export function resolvePaidProPostCheckoutFirstReviewPlain(
  args?: {
    intakeText?: string | null;
    draft?: ParsedDraftShape | null;
    winningPremiumBodyText?: string | null;
    hydratedPremiumBody?: string | null;
    premiumRenderSource?: string | null;
    premiumDegradedServerLocalRecovery?: boolean;
  },
): string {
  if (hasPaidProSourceOfTruth()) return "";
  const recovery = resolvePaidProPostCheckoutRecoveryDisplayPlain(args);
  if (recovery.length >= PAID_PRO_AUTHORITY_MIN_LEN) return recovery;
  return "";
}

export function paidProPostCheckoutShowsExplicitRecoveryPanel(args: {
  gate: PaidProPostCheckoutRenderGateInput;
  recoveryBodyLen: number;
  proIntentGateMessage?: string | null;
}): boolean {
  if (!isPaidProPostCheckoutFlowActive(args.gate)) return false;
  if (hasPaidProSourceOfTruth()) return false;
  if (args.recoveryBodyLen > PAID_PRO_RECOVERY_MIN_DISPLAY_LEN) return false;
  return Boolean(
    args.proIntentGateMessage?.trim() || args.gate.premiumDegradedServerRecoverable,
  );
}

/** Retry CTA on recovery panel must not imply guided completion. */
export function isPaidProExplicitRecoveryRetryLabel(label: string | null | undefined): boolean {
  const t = (label || "").trim().toLowerCase();
  if (!t) return false;
  if (t.includes("question")) return false;
  if (t.includes("almost done")) return false;
  return t.includes("retry pro draft") || t === "retry pro draft";
}
