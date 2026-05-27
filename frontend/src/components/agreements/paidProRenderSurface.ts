import { buildAgreementPreviewTextCore } from "./agreementPreviewFromDraft";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { corpusMatchesFreeBasicDraft, hashPlainTextCorpus } from "./premiumReadonlyRenderCorpus";
import type { PremiumRenderResolveSource } from "./premiumRenderSourceResolver";
import { isUnacceptableReadonlyProSource } from "./paidProCorpusAcceptance";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import { tryBuildPaidProLocalDeterministicFallback } from "./paidProLocalDeterministicFallback";

export const PAID_PRO_UNAVAILABLE_RETRY_HEADLINE =
  "We couldn't finish the Pro rewrite. Your starter draft is safe.";
export const PAID_PRO_UNAVAILABLE_RETRY_BODY =
  "Retry Pro draft when you're ready — LawDog will use your original deal terms. Nothing is sent from this step.";

/** Sources that must never drive paid Pro review when checkout completed. */
export const PAID_PRO_FORBIDDEN_DISPLAY_SOURCES = new Set<string>([
  "none",
  "live_generated_preview",
  "free_starter",
  "rendered_preview",
  "starter_review_preview",
]);

export type PaidProReviewRenderSurface =
  | {
      mode: "authoritative_pro";
      plainText: string;
      sourceUsed: PremiumRenderResolveSource;
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
  const s = (source || "").trim();
  if (!s) return true;
  return PAID_PRO_FORBIDDEN_DISPLAY_SOURCES.has(s);
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
  minLen?: number;
}): boolean {
  const t = (args.corpusPlain || "").trim();
  const minLen = args.minLen ?? 500;
  if (t.length < minLen) return false;
  if (
    isFreeStarterCloneOnPaidPro({
      candidatePlain: args.corpusPlain,
      freeBaselinePlain: args.freeBaselinePlain,
      renderSource: args.renderSource,
    })
  ) {
    return false;
  }
  const src = (args.renderSource || "").trim();
  if (isUnacceptableReadonlyProSource(src as PremiumRenderResolveSource)) return false;
  if (isPaidProForbiddenDisplaySource(src)) return false;
  const pipe = (args.pipelineSource || "").trim();
  if (pipe && !isAuthoritativePremiumPipelineRenderSource(pipe)) {
    if (t.length < 1_200) return false;
  }
  return true;
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
}): PaidProReviewRenderSurface {
  const freeBaseline = buildFreeStarterBaselinePlain(args.draft);
  const picked = (args.pickedPlain || "").trim();
  const source = (args.pickedSource || "none").trim() as PremiumRenderResolveSource;

  if (!args.premiumCheckoutCompleted) {
    return { mode: "authoritative_pro", plainText: picked, sourceUsed: source };
  }

  const paidFallback = (args.paidAuthoritativeFallback || "").trim();
  if (
    picked &&
    !isFreeStarterCloneOnPaidPro({
      candidatePlain: picked,
      freeBaselinePlain: freeBaseline,
      renderSource: source,
    }) &&
    !isPaidProForbiddenDisplaySource(source)
  ) {
    return { mode: "authoritative_pro", plainText: picked, sourceUsed: source };
  }

  if (
    paidFallback.length >= 500 &&
    !isFreeStarterCloneOnPaidPro({
      candidatePlain: paidFallback,
      freeBaselinePlain: freeBaseline,
      renderSource: "server_full_document_text",
    })
  ) {
    return {
      mode: "authoritative_pro",
      plainText: paidFallback,
      sourceUsed: "server_full_document_text",
    };
  }

  if (args.allowLocalDeterministicFallback !== false && args.intakeText) {
    const local = tryBuildPaidProLocalDeterministicFallback(args.intakeText, args.draft);
    if (
      local &&
      !isFreeStarterCloneOnPaidPro({
        candidatePlain: local,
        freeBaselinePlain: freeBaseline,
        renderSource: "server_full_document_text",
      })
    ) {
      return {
        mode: "authoritative_pro",
        plainText: local,
        sourceUsed: "server_full_document_text",
        usedLocalDeterministicFallback: true,
      };
    }
  }

  logPaidProStarterCloneBlocked({
    reason: "premium_unavailable_retry",
    attemptedSource: source,
    attemptedLen: picked.length,
    freeBaselineLen: freeBaseline.length,
    hashMatchesFree: picked && freeBaseline ? corpusMatchesFreeBasicDraft(picked, freeBaseline) : false,
    pipelineSource: args.pipelineSource ?? null,
  });

  return {
    mode: "premium_unavailable_retry",
    reason: "free_starter_clone_or_missing_authoritative_pro",
    starterBaselinePlain: freeBaseline,
    attemptedSource: source,
    attemptedLen: picked.length,
  };
}
