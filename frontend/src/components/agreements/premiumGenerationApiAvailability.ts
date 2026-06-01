/**
 * Paid Pro generation failed before a server draft existed (network / API unreachable).
 * UI must not treat thin `live_generated_preview` or local deterministic fallback as paid authority.
 */

export const PREMIUM_GENERATION_DRAFT_API_PATH = "/api/agreements/premium-full-draft";

/** Minimum paid Pro body length when server draft never arrived (aligns with signing corpus gate). */
export const MIN_PAID_PRO_AUTHORITY_LEN = 1500;

export const PAID_PRO_API_UNAVAILABLE_HEADLINE =
  "The Pro generation API is not reachable. Your starter draft is safe.";
export const PAID_PRO_API_UNAVAILABLE_BODY =
  "Start the backend on http://127.0.0.1:8000 (see docs/DEV.md) or set VITE_API_URL to your API, then tap Retry Pro draft.";

const API_UNAVAILABLE_PIPELINE_SOURCES = new Set<string>(["premium_network_retryable"]);

export function isPremiumGenerationApiUnavailablePipelineSource(
  source: string | null | undefined,
): boolean {
  const s = String(source || "").trim();
  if (s === "premium_network_local_recovery") return false;
  if (s === "premium_degraded_server_local_recovery") return false;
  return API_UNAVAILABLE_PIPELINE_SOURCES.has(s);
}

export function shouldBlockLivePreviewAsPaidProAuthority(args: {
  pipelineSource?: string | null;
  previewLen: number;
  premiumCheckoutCompleted?: boolean;
  renderSource?: string | null;
}): boolean {
  if (args.premiumCheckoutCompleted && args.renderSource === "live_generated_preview") return true;
  if (!isPremiumGenerationApiUnavailablePipelineSource(args.pipelineSource)) return false;
  return args.previewLen < MIN_PAID_PRO_AUTHORITY_LEN;
}

/** Never show LawDog Pro chrome over live preview / free starter after checkout. */
export function isForbiddenPaidProDisplayRenderSource(source: string | null | undefined): boolean {
  const s = String(source || "").trim();
  return (
    s === "live_generated_preview" ||
    s === "none" ||
    s === "free_starter" ||
    s === "free_starter_paid_pro_baseline" ||
    s === "rendered_preview" ||
    s === "renderedAgreementPreview" ||
    s === "accepted_review" ||
    s === "reviewDraft" ||
    s === "review_draft"
  );
}

export function isPremiumGenerationApiUnavailableForUi(args: {
  premiumPostCheckoutPhase?: string | null;
  pipelineSource?: string | null;
  hasPaidProSourceOfTruth?: boolean;
}): boolean {
  if (args.hasPaidProSourceOfTruth) return false;
  if (String(args.pipelineSource || "").trim() === "premium_network_local_recovery") return false;
  if (String(args.pipelineSource || "").trim() === "premium_degraded_server_local_recovery") return false;
  const phase = String(args.premiumPostCheckoutPhase || "").trim();
  if (
    phase === "premium_network_recoverable" ||
    phase === "network_retry" ||
    phase === "generation_retry"
  ) {
    return true;
  }
  return isPremiumGenerationApiUnavailablePipelineSource(args.pipelineSource);
}

export function logPremiumGenerationApiUnavailable(payload: {
  endpoint?: string;
  error?: string | null;
  fallbackBlocked?: boolean;
  stage?: string;
  pipelineSource?: string | null;
}): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.warn("[premium_generation_api_unavailable]", {
    endpoint: payload.endpoint ?? PREMIUM_GENERATION_DRAFT_API_PATH,
    error: (payload.error ?? "").slice(0, 200) || null,
    fallbackBlocked: payload.fallbackBlocked ?? true,
    stage: payload.stage ?? null,
    pipelineSource: payload.pipelineSource ?? null,
  });
}
