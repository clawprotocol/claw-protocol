import type { PremiumCompletionResult } from "./premiumCompletionPipeline";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";

/**
 * Premium-full-draft already produced an authoritative winning corpus (pipeline client gates passed).
 * Used to avoid dropping UI apply when React effect cleanup marks the checkout run "stale" while the
 * completion result still belongs to this session generation.
 */
export function authoritativePremiumPipelineResultForUiApply(
  result: PremiumCompletionResult | null | undefined,
): boolean {
  if (!result?.premiumRenderSource) return false;
  if (result.staleIntakeOrGeneration) return false;
  if (result.proIntentGateMessage || result.founderDetailsGateMessage) return false;
  const w = (result.winningPremiumBodyText || "").trim();
  if (w.length < 500) return false;
  return isAuthoritativePremiumPipelineRenderSource(result.premiumRenderSource);
}

export function authoritativePremiumCompletionMatchesSession(
  result: PremiumCompletionResult,
  sessionGenForPass: string,
): boolean {
  if (!sessionGenForPass.trim()) return false;
  return String(result.agreementGenerationId ?? "") === String(sessionGenForPass);
}

