import type { PremiumCompletionResult } from "./premiumCompletionPipeline";
import { resolveAuthoritativePremiumCommittedFromResult } from "./premiumAuthoritativeCommitted";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";

/** Minimum plain-text length for a usable post-checkout Pro body. */
export const PREMIUM_USABLE_BODY_MIN_LEN = 500;

export function isPremiumNetworkRecoverableResult(
  result: PremiumCompletionResult | null | undefined,
): boolean {
  if (!result) return false;
  return (
    Boolean(result.premiumNetworkRetryable) ||
    result.premiumRenderSource === "premium_network_retryable" ||
    result.premiumRenderSource === "premium_network_local_recovery"
  );
}

export function isPremiumNetworkLocalRecoveryResult(
  result: PremiumCompletionResult | null | undefined,
): boolean {
  if (!result) return false;
  return (
    Boolean(result.premiumNetworkLocalRecovery) ||
    result.premiumRenderSource === "premium_network_local_recovery"
  );
}

export function isPremiumGenerationRecoverableResult(
  result: PremiumCompletionResult | null | undefined,
): boolean {
  if (!result) return false;
  return (
    Boolean(result.premiumGenerationRetryable) ||
    result.premiumRenderSource === "premium_generation_retryable"
  );
}

export function isPremiumRecoverablePipelineResult(
  result: PremiumCompletionResult | null | undefined,
): boolean {
  return isPremiumNetworkRecoverableResult(result) || isPremiumGenerationRecoverableResult(result);
}

/** True only when pipeline produced an authoritative Pro body eligible for success UI. */
export function isPremiumPipelineRewriteSucceeded(
  result: PremiumCompletionResult | null | undefined,
): boolean {
  return authoritativePremiumPipelineResultForUiApply(result);
}

export function hasUsablePremiumBodyText(body: string | null | undefined): boolean {
  const t = (body || "").trim();
  if (t.length < PREMIUM_USABLE_BODY_MIN_LEN) return false;
  if (/^\[?\s*(placeholder|tbd|to be determined|\[\.\.\.\])\s*\]?$/i.test(t)) return false;
  return true;
}

/**
 * Premium-full-draft already produced an authoritative winning corpus (pipeline client gates passed).
 * Used to avoid dropping UI apply when React effect cleanup marks the checkout run "stale" while the
 * completion result still belongs to this session generation.
 *
 * Advisory `needs_details` / gate copy must not block apply when a long authoritative body is present.
 */
export function authoritativePremiumPipelineResultForUiApply(
  result: PremiumCompletionResult | null | undefined,
): boolean {
  if (!result?.premiumRenderSource) return false;
  if (result.staleIntakeOrGeneration) return false;
  if (isPremiumRecoverablePipelineResult(result)) return false;
  const w = (result.winningPremiumBodyText || "").trim();
  if (!hasUsablePremiumBodyText(w)) return false;
  if (!isAuthoritativePremiumPipelineRenderSource(result.premiumRenderSource)) return false;
  return resolveAuthoritativePremiumCommittedFromResult(result).committed;
}

export function authoritativePremiumCompletionMatchesSession(
  result: PremiumCompletionResult,
  sessionGenForPass: string,
): boolean {
  if (!sessionGenForPass.trim()) return false;
  return String(result.agreementGenerationId ?? "") === String(sessionGenForPass);
}

