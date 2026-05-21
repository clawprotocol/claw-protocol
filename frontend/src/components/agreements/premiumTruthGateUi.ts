import type { PremiumSuccessGateResult } from "./premiumSuccessGate";

const BLOCKED_RENDER_SOURCES = new Set([
  "live_generated_preview",
  "fallback_preview",
  "legacy_snapshot",
  "rejected_paid_corpus",
]);

const LONG_AUTHORITATIVE_MIN_LEN = 15_000;

export function isCatastrophicProRenderFailure(args: {
  structuralCatastrophic?: boolean;
  bodyLen?: number;
  renderSource?: string | null;
}): boolean {
  if (args.structuralCatastrophic) return true;
  const len = args.bodyLen ?? 0;
  if (len > 0 && len < 200) return true;
  const src = (args.renderSource || "").trim();
  if (BLOCKED_RENDER_SOURCES.has(src)) return true;
  return false;
}

/** Retry panel only for catastrophic structural/render failure — not unanswered material questions. */
export function shouldShowRetryNeedsDetailsPanel(args: {
  proFullDraftQualityRetry: boolean;
  premiumProTruthGate: PremiumSuccessGateResult | null;
  structuralCatastrophic?: boolean;
  bodyLen?: number;
  renderSource?: string | null;
}): boolean {
  if (
    isCatastrophicProRenderFailure({
      structuralCatastrophic: args.structuralCatastrophic,
      bodyLen: args.bodyLen,
      renderSource: args.renderSource,
    })
  ) {
    return true;
  }
  const len = args.bodyLen ?? 0;
  if (args.proFullDraftQualityRetry && len >= LONG_AUTHORITATIVE_MIN_LEN) {
    return false;
  }
  if (args.proFullDraftQualityRetry) return true;
  const g = args.premiumProTruthGate;
  if (!g) return false;
  if (!g.strict_intent) return false;
  if (len >= LONG_AUTHORITATIVE_MIN_LEN && g.successBannerAllowed) return false;
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
