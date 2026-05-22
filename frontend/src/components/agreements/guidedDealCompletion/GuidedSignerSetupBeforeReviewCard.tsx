import {
  GUIDED_SIGNER_SETUP_CTA,
  GUIDED_SIGNER_SETUP_HEADLINE,
  GUIDED_SIGNER_SETUP_SUBCOPY,
} from "./guidedSignerSetupUx";

export type GuidedSignerSetupBeforeReviewCardProps = {
  signersReady?: boolean;
  onScrollToSignerFields?: () => void;
  className?: string;
};

export function GuidedSignerSetupBeforeReviewCard({
  signersReady = false,
  onScrollToSignerFields,
  className = "",
}: GuidedSignerSetupBeforeReviewCardProps) {
  return (
    <div
      className={`rounded-lg border border-sky-200/90 bg-sky-50/95 px-4 py-4 ${className}`}
      data-testid="guided-signer-setup-before-review-card"
      role="region"
      aria-label={GUIDED_SIGNER_SETUP_HEADLINE}
    >
      <p className="text-sm font-semibold text-stone-900">{GUIDED_SIGNER_SETUP_HEADLINE}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-stone-600">{GUIDED_SIGNER_SETUP_SUBCOPY}</p>
      {signersReady ? (
        <p className="mt-2 text-[11px] font-medium text-emerald-800" data-testid="guided-signer-setup-ready-hint">
          Signer/reviewer details ready — updating your agreement…
        </p>
      ) : (
        <button
          type="button"
          className="mt-3 w-full rounded-lg bg-sky-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 sm:w-auto"
          data-testid="guided-signer-setup-cta"
          onClick={() => onScrollToSignerFields?.()}
        >
          {GUIDED_SIGNER_SETUP_CTA}
        </button>
      )}
    </div>
  );
}
