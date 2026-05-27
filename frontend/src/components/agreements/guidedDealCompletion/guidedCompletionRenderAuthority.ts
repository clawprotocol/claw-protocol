/**
 * Canonical Pro document render authority during guided completion.
 * Prevents blank shells / preview fallback while users answer guided questions.
 */

import { isPaidProForbiddenDisplaySource } from "../paidProRenderSurface";
import { isAuthoritativePremiumPipelineRenderSource } from "../premiumRenderSourceResolver";
import { fingerprintAgreementBody } from "./guidedSigningPacketVersion";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "../simpleProFinalReviewCorpus";

export const GUIDED_MIN_AUTHORITATIVE_BODY_LEN = 500;

export type GuidedRenderDocumentSource =
  | "authoritative_hydrated_premium"
  | "last_known_good_authoritative"
  | "picker_authoritative"
  | "agreement_document_text"
  | "rendered_preview"
  | "starter_fallback"
  | "none";

export type GuidedRenderDocumentResolution = {
  plainText: string;
  source: GuidedRenderDocumentSource;
  usedLastKnownGood: boolean;
  blockedEmptyState: boolean;
  authoritativeLen: number;
  downgradeBlocked: boolean;
};

export type ResolveGuidedRenderDocumentArgs = {
  /** Guided panel visible or session in progress on paid Pro surface. */
  guidedCompletionActive: boolean;
  /** After bulk apply — never fall back to structured preview over authoritative body. */
  postGuidedAuthoritativeReview?: boolean;
  authoritativeHydratedPlain?: string | null;
  pickerPlain?: string | null;
  pickerSource?: string | null;
  agreementDocumentPlain?: string | null;
  renderedPreviewPlain?: string | null;
  starterFallbackPlain?: string | null;
  lastKnownGoodPlain?: string | null;
};

function norm(s?: string | null): string {
  return (s || "").trim();
}

function hasPremiumMarkers(text: string): boolean {
  return /\b(?:lawdog pro|commercial safeguards|raw-intent premium protections|execution\s+—\s+signatures|signatures)\b/i.test(
    text,
  );
}

function guidedAuthorityDebugEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return window.localStorage.getItem("lawdog:guidedRenderDebug") === "1";
  } catch {
    return false;
  }
}

let lastLoggedRenderAuthorityKey = "";

export type LastKnownGoodAuthoritativeUpdateOptions = {
  /** Paid Pro / guided — refuse free-starter hash and never shrink a full corpus. */
  paidProFlow?: boolean;
  freeBaselinePlain?: string | null;
  source?: string;
};

export function logAuthoritativeCorpusRejected(payload: Record<string, unknown>): void {
  if (!guidedAuthorityDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.warn("[authoritative-corpus-rejected]", payload);
}

export function logAuthoritativeCorpusAccepted(payload: Record<string, unknown>): void {
  if (!guidedAuthorityDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[authoritative-corpus-accepted]", payload);
}

export function updateLastKnownGoodAuthoritativeDraftRef(
  ref: { current: string },
  plainText: string,
  reason: string,
  options?: LastKnownGoodAuthoritativeUpdateOptions,
): boolean {
  const t = norm(plainText);
  const source = options?.source ?? reason;
  const hash = t ? fingerprintAgreementBody(t) : "";
  const minLen = options?.paidProFlow ? GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN : GUIDED_MIN_AUTHORITATIVE_BODY_LEN;
  if (t.length < minLen) {
    logAuthoritativeCorpusRejected({ reason: "too_short", len: t.length, hash, source });
    return false;
  }
  const freeBase = norm(options?.freeBaselinePlain);
  if (options?.paidProFlow && freeBase.length >= 200) {
    if (fingerprintAgreementBody(t) === fingerprintAgreementBody(freeBase)) {
      logAuthoritativeCorpusRejected({ reason: "free_hash_match", len: t.length, hash, source });
      return false;
    }
  }
  const cur = norm(ref.current);
  if (options?.paidProFlow && cur.length >= GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN && t.length < cur.length) {
    logAuthoritativeCorpusRejected({ reason: "shrink_attempt", len: t.length, hash, source });
    return false;
  }
  if (ref.current === t) return false;
  ref.current = t;
  logAuthoritativeCorpusAccepted({ len: t.length, hash, source });
  logGuidedAuthoritativeHydrated(reason, t.length);
  return true;
}

export function logGuidedRenderAuthority(resolution: GuidedRenderDocumentResolution, extra?: Record<string, unknown>): void {
  const key = `${resolution.source}:${resolution.usedLastKnownGood}:${resolution.blockedEmptyState}`;
  const sourceChanged = key !== lastLoggedRenderAuthorityKey;
  if (!guidedAuthorityDebugEnabled() && !sourceChanged) return;
  lastLoggedRenderAuthorityKey = key;
  // eslint-disable-next-line no-console
  console.info("[guided-render-authority]", {
    source: resolution.source,
    len: resolution.plainText.length,
    usedLastKnownGood: resolution.usedLastKnownGood,
    blockedEmptyState: resolution.blockedEmptyState,
    authoritativeLen: resolution.authoritativeLen,
    ...extra,
  });
}

export function logGuidedLastKnownGoodUsed(len: number): void {
  if (!guidedAuthorityDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[guided-last-known-good-used]", { len });
}

export function logGuidedAuthoritativeHydrated(reason: string, len: number): void {
  if (!guidedAuthorityDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[guided-authoritative-hydrated]", { reason, len });
}

export function logGuidedEmptyStateBlocked(context: string): void {
  if (!guidedAuthorityDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[guided-empty-state-blocked]", { context });
}

export function logGuidedQuestionApply(variableId: string, bodyLenBefore: number): void {
  if (!guidedAuthorityDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[guided-question-apply]", { variableId, bodyLenBefore });
}

export function logGuidedReviewTransition(extra?: Record<string, unknown>): void {
  if (!guidedAuthorityDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[guided-review-transition]", extra ?? {});
}

export function logGuidedSignTransition(extra?: Record<string, unknown>): void {
  if (!guidedAuthorityDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[guided-sign-transition]", extra ?? {});
}

/**
 * Priority (never reverse):
 * 1 authoritative hydrated premium
 * 2 lastKnownGoodAuthoritativeDraft
 * 3 picker (authoritative sources) / long agreement document text
 * 4 rendered preview
 * 5 starter fallback
 */
export function resolveGuidedCompletionRenderDocument(
  args: ResolveGuidedRenderDocumentArgs,
): GuidedRenderDocumentResolution {
  const authHydrated = norm(args.authoritativeHydratedPlain);
  const lastKnown = norm(args.lastKnownGoodPlain);
  const picker = norm(args.pickerPlain);
  const pickerSource = (args.pickerSource || "").trim();
  const adt = norm(args.agreementDocumentPlain);
  const preview = norm(args.renderedPreviewPlain);
  const starter = norm(args.starterFallbackPlain);

  const postGuided = Boolean(args.postGuidedAuthoritativeReview);
  const authoritativeExists =
    authHydrated.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN ||
    lastKnown.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN;
  const pickerForbidden =
    isPaidProForbiddenDisplaySource(pickerSource) ||
    (args.guidedCompletionActive && picker.length > 0 && picker.length < GUIDED_MIN_AUTHORITATIVE_BODY_LEN);

  type Cand = { plain: string; source: GuidedRenderDocumentSource; rank: number };
  const cands: Cand[] = [];

  if (authHydrated.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN) {
    cands.push({ plain: authHydrated, source: "authoritative_hydrated_premium", rank: 1 });
  }
  if (lastKnown.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN) {
    cands.push({ plain: lastKnown, source: "last_known_good_authoritative", rank: 2 });
  }
  const pickerAuthoritative =
    !pickerForbidden &&
    picker.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN &&
    (isAuthoritativePremiumPipelineRenderSource(pickerSource) ||
      args.guidedCompletionActive ||
      postGuided ||
      hasPremiumMarkers(picker));
  if (pickerAuthoritative) {
    cands.push({ plain: picker, source: "picker_authoritative", rank: 3 });
  }
  if (
    adt.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN &&
    (hasPremiumMarkers(adt) || args.guidedCompletionActive || postGuided)
  ) {
    cands.push({ plain: adt, source: "agreement_document_text", rank: 4 });
  }
  if (!postGuided) {
    const previewShorterThanAuthority =
      authoritativeExists &&
      preview.length >= 400 &&
      preview.length < Math.max(lastKnown.length, authHydrated.length) * 0.95;
    if (
      preview.length >= 400 &&
      !args.guidedCompletionActive &&
      !previewShorterThanAuthority &&
      !isPaidProForbiddenDisplaySource("rendered_preview")
    ) {
      cands.push({ plain: preview, source: "rendered_preview", rank: 5 });
    } else if (
      preview.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN &&
      args.guidedCompletionActive &&
      !authoritativeExists &&
      !previewShorterThanAuthority &&
      !isPaidProForbiddenDisplaySource("rendered_preview")
    ) {
      cands.push({ plain: preview, source: "rendered_preview", rank: 5 });
    }
    if (starter.length >= 200 && !args.guidedCompletionActive) {
      cands.push({ plain: starter, source: "starter_fallback", rank: 6 });
    }
  }

  cands.sort((a, b) => a.rank - b.rank);
  const authorityLen = Math.max(authHydrated.length, lastKnown.length);
  if (args.guidedCompletionActive && pickerForbidden && import.meta.env.DEV) {
    logGuidedAuthoritativeDowngradeBlocked({
      attemptedSource: pickerSource || "picker_forbidden",
      attemptedLen: picker.length,
      authoritativeLen: authorityLen,
    });
  }
  let downgradeBlocked = false;
  if (args.guidedCompletionActive && authorityLen >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN) {
    if (preview.length >= 200 && preview.length < authorityLen * 0.95) {
      downgradeBlocked = true;
      logGuidedAuthoritativeDowngradeBlocked({
        attemptedSource: "rendered_preview",
        attemptedLen: preview.length,
        authoritativeLen: authorityLen,
      });
    }
  }
  const winner = cands[0];
  const plainText = winner?.plain ?? "";
  const usedLastKnownGood = winner?.source === "last_known_good_authoritative";
  const blockedEmptyState = authoritativeExists && args.guidedCompletionActive;

  const resolution: GuidedRenderDocumentResolution = {
    plainText,
    source: winner?.source ?? "none",
    usedLastKnownGood,
    blockedEmptyState,
    authoritativeLen: Math.max(authHydrated.length, lastKnown.length, plainText.length),
    downgradeBlocked,
  };

  if (usedLastKnownGood) logGuidedLastKnownGoodUsed(plainText.length);
  logGuidedRenderAuthority(resolution, { guidedActive: args.guidedCompletionActive });
  if (blockedEmptyState && plainText.length < GUIDED_MIN_AUTHORITATIVE_BODY_LEN) {
    logGuidedEmptyStateBlocked("authority_present_but_no_display_corpus");
  }

  return resolution;
}

export function logGuidedAuthoritativeDowngradeBlocked(payload: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.warn("[guided-authoritative-downgrade-blocked]", payload);
}

export function canDisplayPaidProAgreementDuringGuided(args: {
  canProceedWithPaidProDocument: boolean;
  guidedCompletionActive: boolean;
  renderDocument: GuidedRenderDocumentResolution;
}): boolean {
  if (args.canProceedWithPaidProDocument) return true;
  if (!args.guidedCompletionActive) return false;
  return args.renderDocument.plainText.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN;
}

export function shouldBlockProEmptyDocumentFallback(renderDocument: GuidedRenderDocumentResolution): boolean {
  return (
    renderDocument.blockedEmptyState ||
    renderDocument.authoritativeLen >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN ||
    renderDocument.plainText.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN
  );
}
