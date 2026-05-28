import { buildAgreementPreviewTextCore } from "./agreementPreviewFromDraft";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { corpusMatchesFreeBasicDraft, hashPlainTextCorpus } from "./premiumReadonlyRenderCorpus";
import type { PremiumRenderResolveSource } from "./premiumRenderSourceResolver";
import {
  authorityTierToRenderSource,
  isNeverAuthoritativePaidProSource,
  isPaidProCorpusAuthoritativeForUi,
  mapRenderSourceToAuthorityTier,
  resolvePaidProCorpusAuthority,
  type PaidProCorpusAuthorityCandidate,
  type PaidProCorpusAuthorityTier,
} from "./paidProCorpusAuthority";
import {
  isPremiumGenerationApiUnavailablePipelineSource,
  shouldBlockLivePreviewAsPaidProAuthority,
} from "./premiumGenerationApiAvailability";
import { readCanonicalAgreementCorpusForSurface } from "./canonicalAgreementSnapshot";

export const PAID_PRO_UNAVAILABLE_RETRY_HEADLINE =
  "We couldn't finish the Pro rewrite. Your starter draft is safe.";
export const PAID_PRO_UNAVAILABLE_RETRY_BODY =
  "Retry Pro draft when you're ready — LawDog will use your original deal terms. Nothing is sent from this step.";

/** Sources that must never drive paid Pro review when checkout completed. */
export const PAID_PRO_FORBIDDEN_DISPLAY_SOURCES = new Set<string>([
  "none",
  "free_starter",
  "rendered_preview",
  "starter_review_preview",
]);

export type PaidProReviewRenderSurface =
  | {
      mode: "authoritative_pro";
      plainText: string;
      sourceUsed: PremiumRenderResolveSource;
      authorityTier: PaidProCorpusAuthorityTier;
      usedLocalDeterministicFallback?: boolean;
    }
  | {
      mode: "premium_unavailable_retry";
      reason: string;
      starterBaselinePlain: string;
      attemptedSource: string;
      attemptedLen: number;
    };

export function buildFreeStarterBaselinePlain(draft: ParsedDraftShape | null): string {
  if (!draft) return "";
  return buildAgreementPreviewTextCore(draft, { starterPreview: true }).trim();
}

export function isPaidProForbiddenDisplaySource(source: string | null | undefined): boolean {
  return isNeverAuthoritativePaidProSource(source);
}

/**
 * True when paid Pro would display the same corpus as the free starter preview.
 */
export function isFreeStarterCloneOnPaidPro(args: {
  candidatePlain: string;
  freeBaselinePlain: string;
  renderSource?: string | null;
}): boolean {
  const candidate = (args.candidatePlain || "").trim();
  const free = (args.freeBaselinePlain || "").trim();
  if (!candidate || !free) return false;
  if (corpusMatchesFreeBasicDraft(candidate, free)) return true;
  const src = (args.renderSource || "").trim();
  if (isPaidProForbiddenDisplaySource(src) && candidate.length <= free.length + 120) return true;
  if (candidate.length > 0 && free.length > 0 && candidate.length < free.length + 80) {
    if (hashPlainTextCorpus(candidate) === hashPlainTextCorpus(free)) return true;
  }
  return false;
}

export function isAuthoritativePaidProCorpusForGuided(args: {
  corpusPlain: string;
  freeBaselinePlain: string;
  renderSource?: string | null;
  pipelineSource?: string | null;
  authorityTier?: PaidProCorpusAuthorityTier | null;
  minLen?: number;
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
}): boolean {
  const tier =
    args.authorityTier ??
    mapRenderSourceToAuthorityTier({
      renderSource: args.renderSource,
      pipelineSource: args.pipelineSource,
    });
  return isPaidProCorpusAuthoritativeForUi({
    plainText: args.corpusPlain,
    tier,
    freeBaselinePlain: args.freeBaselinePlain,
    intakeText: args.intakeText,
    draft: args.draft,
    pipelineSource: args.pipelineSource,
  });
}

export function logPaidProStarterCloneBlocked(payload: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.warn("[paid-pro-starter-clone-blocked]", payload);
}

export function resolvePaidProReviewRenderSurface(args: {
  pickedPlain: string;
  pickedSource: PremiumRenderResolveSource | string;
  draft: ParsedDraftShape | null;
  intakeText?: string | null;
  premiumCheckoutCompleted?: boolean;
  paidAuthoritativeFallback?: string | null;
  pipelineSource?: string | null;
  allowLocalDeterministicFallback?: boolean;
  /** Extra locally persisted / hydrated candidates (tier 1–2). */
  extraCandidates?: PaidProCorpusAuthorityCandidate[];
  stickyPlainText?: string | null;
  stickyTier?: PaidProCorpusAuthorityTier | null;
}): PaidProReviewRenderSurface {
  const canonical = readCanonicalAgreementCorpusForSurface("readonly", { tier: "pro" });
  if (canonical) {
    return {
      mode: "authoritative_pro",
      plainText: canonical.canonicalText,
      sourceUsed: "server_full_document_text",
      authorityTier: "server_authoritative_paid_pro",
    };
  }
  const picked = (args.pickedPlain || "").trim();
  const source = (args.pickedSource || "none").trim();

  if (!args.premiumCheckoutCompleted) {
    return {
      mode: "authoritative_pro",
      plainText: picked,
      sourceUsed: source as PremiumRenderResolveSource,
      authorityTier: mapRenderSourceToAuthorityTier({
        renderSource: source,
        pipelineSource: args.pipelineSource,
      }),
    };
  }

  const freeBaseline = buildFreeStarterBaselinePlain(args.draft);
  const pipelineUnavailable = isPremiumGenerationApiUnavailablePipelineSource(args.pipelineSource);
  const candidates: PaidProCorpusAuthorityCandidate[] = [...(args.extraCandidates ?? [])];

  const paidFallback = (args.paidAuthoritativeFallback || "").trim();
  if (paidFallback.length >= 500) {
    candidates.push({
      plainText: paidFallback,
      tier: mapRenderSourceToAuthorityTier({
        renderSource: "server_full_document_text",
        pipelineSource: args.pipelineSource,
      }),
      sourceLabel: "paid_authoritative_fallback",
      pipelineSource: args.pipelineSource,
      sticky: true,
    });
  }

  if (
    picked.length >= 200 &&
    !isNeverAuthoritativePaidProSource(source) &&
    !shouldBlockLivePreviewAsPaidProAuthority({ pipelineSource: args.pipelineSource, previewLen: picked.length })
  ) {
    candidates.push({
      plainText: picked,
      tier: mapRenderSourceToAuthorityTier({ renderSource: source, pipelineSource: args.pipelineSource }),
      sourceLabel: source,
      pipelineSource: args.pipelineSource,
    });
  }

  const resolution = resolvePaidProCorpusAuthority({
    candidates,
    draft: args.draft,
    intakeText: args.intakeText,
    freeBaselinePlain: freeBaseline,
    stickyPlainText: args.stickyPlainText,
    stickyTier: args.stickyTier,
    allowDeterministicFallback:
      args.allowLocalDeterministicFallback !== false && !pipelineUnavailable,
  });

  if (resolution.mode === "authoritative") {
    if (import.meta.env.DEV && resolution.usedLocalDeterministicFallback) {
      // eslint-disable-next-line no-console
      console.info("[paid-pro-local-fallback]", {
        len: resolution.plainText.length,
        tier: resolution.tier,
        intakeLen: (args.intakeText || "").length,
      });
    }
    return {
      mode: "authoritative_pro",
      plainText: resolution.plainText,
      sourceUsed: authorityTierToRenderSource(resolution.tier),
      authorityTier: resolution.tier,
      usedLocalDeterministicFallback: resolution.usedLocalDeterministicFallback,
    };
  }

  logPaidProStarterCloneBlocked({
    reason: resolution.reason,
    attemptedSource: source,
    attemptedLen: picked.length,
    freeBaselineLen: freeBaseline.length,
    hashMatchesFree: picked && freeBaseline ? corpusMatchesFreeBasicDraft(picked, freeBaseline) : false,
    pipelineSource: args.pipelineSource ?? null,
    failedCandidates: resolution.failedCandidates,
  });

  return {
    mode: "premium_unavailable_retry",
    reason: resolution.reason,
    starterBaselinePlain: freeBaseline,
    attemptedSource: source,
    attemptedLen: picked.length,
  };
}
