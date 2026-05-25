import type { AgreementDraft } from "../../agreement/agreementTypes";
import { SIGNING_TOKEN_SECRET_NOT_CONFIGURED_CODE } from "../../agreement/recipientAccessMintPayload";
import { isPaidProAgreementAuthoritative } from "../../components/agreements/paidProAgreementAuthority";
import { peekPremiumSendIntent, type PremiumSendIntent } from "./premiumSendIntent";

export const REVIEW_FIRST_INLINE_ERROR_HEADLINE = "Review links unavailable";

/** Session marker: paid Pro final review → “Send for review first” (survives `/app/send` safety-net landings). */
export const REVIEW_FIRST_HANDOFF_SOURCE_SS_KEY = "claw_review_first_handoff_source_v1";

/** Pinned authoritative corpus for review-link mint (survives hydrate / `/app/send` fallback). */
export const REVIEW_FIRST_PINNED_CORPUS_SS_KEY = "claw_review_first_pinned_corpus_v1";

/** Prevents duplicate POST mint when create handoff and `/app/send` safety-net race. */
export const REVIEW_FIRST_MINT_IN_FLIGHT_SS_KEY = "claw_review_first_mint_in_flight_v1";

export const REVIEW_FIRST_SIMPLE_PRO_SOURCE = "simple_pro_send_for_review";

/** Copy that must never appear for paid Pro review-first (generic `/app/send` gate + upsell). */
export const REVIEW_FIRST_GENERIC_SEND_FORBIDDEN_COPY = [
  "Your Agreement",
  "Review before sending",
  "Continue to send",
  "Send this as a professional agreement",
  "Continue with draft version",
] as const;

export function writeReviewFirstHandoffSource(source: string, agreementId: string): void {
  const id = String(agreementId || "").trim();
  if (!id) return;
  try {
    sessionStorage.setItem(
      REVIEW_FIRST_HANDOFF_SOURCE_SS_KEY,
      JSON.stringify({ source: String(source || "").trim(), agreementId: id, savedAt: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

export function peekReviewFirstHandoffSource(agreementId?: string): string | null {
  try {
    const raw = sessionStorage.getItem(REVIEW_FIRST_HANDOFF_SOURCE_SS_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { source?: string; agreementId?: string };
    const id = String(agreementId ?? "").trim();
    if (id && String(o.agreementId ?? "").trim() !== id) return null;
    const source = String(o.source ?? "").trim();
    return source || null;
  } catch {
    return null;
  }
}

export function clearReviewFirstHandoffSource(): void {
  try {
    sessionStorage.removeItem(REVIEW_FIRST_HANDOFF_SOURCE_SS_KEY);
    sessionStorage.removeItem(REVIEW_FIRST_PINNED_CORPUS_SS_KEY);
    sessionStorage.removeItem(REVIEW_FIRST_MINT_IN_FLIGHT_SS_KEY);
  } catch {
    /* ignore */
  }
}

export function writeReviewFirstPinnedCorpus(agreementId: string, bodyPlain: string): void {
  const id = String(agreementId || "").trim();
  const body = String(bodyPlain || "").trim();
  if (!id || !body) return;
  try {
    sessionStorage.setItem(
      REVIEW_FIRST_PINNED_CORPUS_SS_KEY,
      JSON.stringify({ agreementId: id, bodyPlain: body, savedAt: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

export function peekReviewFirstPinnedCorpus(agreementId: string): string | null {
  try {
    const raw = sessionStorage.getItem(REVIEW_FIRST_PINNED_CORPUS_SS_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { agreementId?: string; bodyPlain?: string };
    if (String(o.agreementId ?? "").trim() !== String(agreementId || "").trim()) return null;
    const body = String(o.bodyPlain ?? "").trim();
    return body || null;
  } catch {
    return null;
  }
}

export function setReviewFirstMintInFlight(agreementId: string): void {
  const id = String(agreementId || "").trim();
  if (!id) return;
  try {
    sessionStorage.setItem(REVIEW_FIRST_MINT_IN_FLIGHT_SS_KEY, id);
  } catch {
    /* ignore */
  }
}

export function peekReviewFirstMintInFlight(agreementId?: string): boolean {
  try {
    const v = sessionStorage.getItem(REVIEW_FIRST_MINT_IN_FLIGHT_SS_KEY);
    if (!v) return false;
    const id = String(agreementId ?? "").trim();
    return !id || v === id;
  } catch {
    return false;
  }
}

export function clearReviewFirstMintInFlight(): void {
  try {
    sessionStorage.removeItem(REVIEW_FIRST_MINT_IN_FLIGHT_SS_KEY);
  } catch {
    /* ignore */
  }
}

/** True when create-page review-first owns routing (must not call generic onCreated → `/app/send`). */
export function isCreatePageReviewFirstHandoffSource(source: string | null | undefined): boolean {
  const s = String(source ?? "").trim();
  return s === REVIEW_FIRST_SIMPLE_PRO_SOURCE || s.startsWith("simple_pro_") || s.includes("review_first");
}

export function isReviewFirstPremiumSendIntentActive(args: {
  handoffPremiumIntent?: PremiumSendIntent | null;
  handoffOpenFlowPhase?: "review" | "send" | null;
  statePremiumIntent?: PremiumSendIntent | null;
  agreementId?: string;
}): boolean {
  const intent =
    args.handoffPremiumIntent ?? args.statePremiumIntent ?? peekPremiumSendIntent();
  if (intent === "review") return true;
  if (args.handoffOpenFlowPhase === "review") return true;
  if (peekReviewFirstHandoffSource(args.agreementId)) return true;
  return false;
}

export const REVIEW_FIRST_SIGNING_TOKEN_SECRET_USER_MESSAGE =
  "Review links could not be created because signing/review token minting is not configured on this environment.";

export const REVIEW_FIRST_SIGNING_TOKEN_SECRET_OPERATOR_HINT =
  "Railway/staging operator: set CLAW_AGREEMENT_SIGNING_TOKEN_SECRET (or CLAW_SIGNING_TOKEN_SECRET), redeploy the API service, then use Back to final review and try again.";

export function isReviewFirstSigningTokenSecretNotConfigured(args?: {
  errorCode?: string | null;
  message?: string | null;
}): boolean {
  const code = (args?.errorCode ?? "").trim();
  if (code === SIGNING_TOKEN_SECRET_NOT_CONFIGURED_CODE) return true;
  const msg = (args?.message ?? "").trim();
  return /signing_token_secret_not_configured/i.test(msg);
}

export function agreementIdShortForReviewFirstLog(agreementId: string | null | undefined): string {
  const id = String(agreementId ?? "").trim();
  return id.length >= 8 ? id.slice(0, 8) : id || "unknown";
}

export function logReviewFirstEnvTokenSecretMissing(payload: {
  agreementId?: string | null;
  source?: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[review-first-env-token-secret-missing]", {
    agreementIdShort: agreementIdShortForReviewFirstLog(payload.agreementId),
    source: payload.source ?? null,
  });
}

export function resolveReviewFirstMintFailureUserMessage(args?: {
  lastMintErrorCode?: string | null;
  firstErrorStatus?: number;
  lastMintErrorDetail?: string | null;
  fallback?: string;
}): string {
  const code = (args?.lastMintErrorCode ?? "").trim();
  if (code === SIGNING_TOKEN_SECRET_NOT_CONFIGURED_CODE || /signing_token_secret_not_configured/i.test(code)) {
    return REVIEW_FIRST_SIGNING_TOKEN_SECRET_USER_MESSAGE;
  }
  const fallback = (args?.fallback ?? "").trim();
  if (fallback) return fallback;
  return "Review links could not be created. Check recipient details and try again.";
}

export function mergeDraftWithReviewFirstPinnedCorpus(
  draft: AgreementDraft,
  agreementId: string,
): AgreementDraft {
  const pinned = peekReviewFirstPinnedCorpus(agreementId);
  if (!pinned) return draft;
  return {
    ...draft,
    server_full_document_text: pinned,
    premium_full_document_text: pinned,
    document_text: pinned,
  } as AgreementDraft;
}

export function isPaidProReviewFirstSendIntent(
  draft: AgreementDraft | null,
  agreementId: string,
  premiumSendIntent: PremiumSendIntent | null | undefined,
): boolean {
  if (premiumSendIntent !== "review") return false;
  return isPaidProAgreementAuthoritative({ draft, agreementId });
}

/**
 * Hard guard for `/app/send/:id`: paid Pro review-first must never mount generic send UI.
 * Trusts session/handoff review intent before draft hydration finishes.
 */
export function shouldRenderPaidProReviewFirstSendSurface(args: {
  agreementId: string;
  draft: AgreementDraft | null;
  handoffPremiumIntent?: PremiumSendIntent | null;
  handoffOpenFlowPhase?: "review" | "send" | null;
  statePremiumIntent?: PremiumSendIntent | null;
  streamlinedSimpleFlow?: boolean;
  sendAuthoritative?: boolean;
  paidProSendAllowed?: boolean;
  hasPrimedHandoffDraft?: boolean;
}): boolean {
  if (
    !isReviewFirstPremiumSendIntentActive({
      handoffPremiumIntent: args.handoffPremiumIntent,
      handoffOpenFlowPhase: args.handoffOpenFlowPhase,
      statePremiumIntent: args.statePremiumIntent,
      agreementId: args.agreementId,
    })
  ) {
    return false;
  }
  if (peekReviewFirstHandoffSource(args.agreementId)) return true;
  if (args.streamlinedSimpleFlow && args.handoffPremiumIntent === "review") return true;
  if (args.sendAuthoritative) return true;
  if (args.paidProSendAllowed) return true;
  if (args.hasPrimedHandoffDraft && args.handoffPremiumIntent === "review") return true;
  return isPaidProReviewFirstSendIntent(args.draft, args.agreementId, "review");
}

export type ReviewFirstMintErrorPanelProps = {
  message: string;
  busy?: boolean;
  signingTokenSecretMissing?: boolean;
  onBackToFinalReview?: () => void;
  onRetry?: () => void;
};

export function ReviewFirstMintErrorPanel({
  message,
  busy = false,
  signingTokenSecretMissing = false,
  onBackToFinalReview,
  onRetry,
}: ReviewFirstMintErrorPanelProps) {
  const showRetry = Boolean(onRetry) && !signingTokenSecretMissing;
  return (
    <div
      className="mx-auto w-full max-w-xl rounded-xl border border-rose-800/45 bg-rose-950/25 px-5 py-5 text-sm leading-snug text-rose-50/95"
      role="alert"
      data-testid="review-first-mint-error-panel"
    >
      <p className="font-semibold text-rose-100">Review links unavailable</p>
      <p className="mt-2 text-xs leading-relaxed text-rose-100/90">{message}</p>
      {signingTokenSecretMissing ? (
        <p
          className="mt-3 rounded-md border border-rose-700/40 bg-rose-950/40 px-3 py-2 text-[11px] leading-relaxed text-rose-100/85"
          data-testid="review-first-env-config-hint"
        >
          {REVIEW_FIRST_SIGNING_TOKEN_SECRET_OPERATOR_HINT}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {onBackToFinalReview ? (
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary min-h-[2.5rem] px-4 text-sm"
            disabled={busy}
            onClick={onBackToFinalReview}
            data-testid="review-first-back-to-final-review"
          >
            Back to final review
          </button>
        ) : null}
        {showRetry ? (
          <button
            type="button"
            className="vs01-btn vs01-btn--primary min-h-[2.5rem] px-4 text-sm"
            disabled={busy}
            onClick={onRetry}
            data-testid="review-first-retry-mint"
          >
            {busy ? "Retrying…" : "Retry creating review links"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
