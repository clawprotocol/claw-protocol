import type { PremiumSuccessGateResult } from "./premiumSuccessGate";

const BLOCKED_RENDER_SOURCES = new Set([
  "live_generated_preview",
  "fallback_preview",
  "legacy_snapshot",
  "rejected_paid_corpus",
]);

export function shouldShowRetryNeedsDetailsPanel(args: {
  proFullDraftQualityRetry: boolean;
  premiumProTruthGate: PremiumSuccessGateResult | null;
}): boolean {
  if (args.proFullDraftQualityRetry) return true;
  const g = args.premiumProTruthGate;
  if (!g) return false;
  if (!g.strict_intent) return false;
  return !g.signerCtaAllowed || !g.successBannerAllowed;
}

export function shouldShowBlockedDraftPreviewLabel(args: {
  premiumProTruthGate: PremiumSuccessGateResult | null;
  renderSource: string | null | undefined;
}): boolean {
  const g = args.premiumProTruthGate;
  if (!g || !g.strict_intent) return false;
  if (g.signerCtaAllowed && g.successBannerAllowed) return false;
  return BLOCKED_RENDER_SOURCES.has((args.renderSource || "").trim());
}
