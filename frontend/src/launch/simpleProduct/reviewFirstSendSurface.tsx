import type { AgreementDraft } from "../../agreement/agreementTypes";
import { SIGNING_TOKEN_SECRET_NOT_CONFIGURED_CODE } from "../../agreement/recipientAccessMintPayload";
import { isPaidProAgreementAuthoritative } from "../../components/agreements/paidProAgreementAuthority";
import type { PremiumSendIntent } from "./premiumSendIntent";

/** Copy that must never appear for paid Pro review-first (generic `/app/send` gate + upsell). */
export const REVIEW_FIRST_GENERIC_SEND_FORBIDDEN_COPY = [
  "Your Agreement",
  "Review before sending",
  "Continue to send",
  "Send this as a professional agreement",
] as const;

export const REVIEW_FIRST_SIGNING_TOKEN_SECRET_USER_MESSAGE =
  "Review links could not be created because signing/review token minting is not configured on this environment. " +
  "Please configure the signing token secret and retry.";

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

export function isPaidProReviewFirstSendIntent(
  draft: AgreementDraft | null,
  agreementId: string,
  premiumSendIntent: PremiumSendIntent | null | undefined,
): boolean {
  if (premiumSendIntent !== "review") return false;
  return isPaidProAgreementAuthoritative({ draft, agreementId });
}

export type ReviewFirstMintErrorPanelProps = {
  message: string;
  busy?: boolean;
  onBackToFinalReview?: () => void;
  onRetry?: () => void;
};

export function ReviewFirstMintErrorPanel({
  message,
  busy = false,
  onBackToFinalReview,
  onRetry,
}: ReviewFirstMintErrorPanelProps) {
  return (
    <div
      className="mx-auto w-full max-w-xl rounded-xl border border-rose-800/45 bg-rose-950/25 px-5 py-5 text-sm leading-snug text-rose-50/95"
      role="alert"
      data-testid="review-first-mint-error-panel"
    >
      <p className="font-semibold text-rose-100">Review links could not be created</p>
      <p className="mt-2 text-xs leading-relaxed text-rose-100/90">{message}</p>
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
        {onRetry ? (
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
