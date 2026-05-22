import type { FinalReviewSendIntent } from "../simpleProFinalReviewPhase";

export type GuidedProSigningConfirmationScreenProps = {
  agreementTitle: string;
  bodyLen: number;
  signerLines: readonly string[];
  sendIntent: FinalReviewSendIntent;
  signFirst: boolean;
  onSignFirstChange: (signFirst: boolean) => void;
  continueDisabled?: boolean;
  blockMessage?: string | null;
  onContinue: () => void;
  onBackToFinalReview: () => void;
  className?: string;
};

export const GUIDED_SIGNING_CONFIRMATION_HEADLINE = "Ready to send for signature";
export const GUIDED_SIGNING_CONFIRMATION_SAFETY =
  "Nothing is sent until you confirm.";

export function GuidedProSigningConfirmationScreen({
  agreementTitle,
  bodyLen,
  signerLines,
  sendIntent,
  signFirst,
  onSignFirstChange,
  continueDisabled = false,
  blockMessage = null,
  onContinue,
  onBackToFinalReview,
  className = "",
}: GuidedProSigningConfirmationScreenProps) {
  const isSignature = sendIntent === "signature";
  const primaryLabel = isSignature ? "Create signing links" : "Continue to confirmation";

  return (
    <div
      className={`flex flex-col gap-3 ${className}`}
      data-testid="guided-pro-signing-confirmation-screen"
      role="region"
      aria-label={isSignature ? GUIDED_SIGNING_CONFIRMATION_HEADLINE : "Ready to send for review"}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">LawDog Pro</p>
        <h2 className="mt-1 font-serif text-lg font-semibold tracking-tight text-stone-900 sm:text-xl">
          {isSignature ? GUIDED_SIGNING_CONFIRMATION_HEADLINE : "Ready to send for review"}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-stone-600">
          {GUIDED_SIGNING_CONFIRMATION_SAFETY}
        </p>
      </div>

      <div
        className="rounded-md border border-stone-200/95 bg-stone-50/95 px-3 py-2.5"
        data-testid="guided-signing-agreement-summary"
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Agreement</p>
        <p className="mt-0.5 text-sm font-medium text-stone-900">{agreementTitle || "Your agreement"}</p>
        {bodyLen > 0 ? (
          <p className="mt-1 text-[11px] text-stone-600">Final version · {bodyLen.toLocaleString()} characters</p>
        ) : null}
      </div>

      {signerLines.length > 0 ? (
        <div
          className="rounded-md border border-emerald-200/90 bg-emerald-50/80 px-3 py-2.5"
          data-testid="guided-signing-signer-list"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900/90">Signers</p>
          <ul className="mt-1.5 list-none space-y-1 text-xs font-medium text-emerald-950">
            {signerLines.map((line, i) => (
              <li key={`signer-line-${i}`}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {isSignature ? (
        <fieldset className="rounded-md border border-stone-200/95 bg-white px-3 py-2.5">
          <legend className="text-xs font-semibold text-stone-900">Signing order</legend>
          <div className="mt-2 flex flex-col gap-2">
            <label className="flex cursor-pointer items-start gap-2 text-xs text-stone-800">
              <input
                type="radio"
                name="guided-signing-order"
                className="mt-0.5"
                checked={signFirst}
                onChange={() => onSignFirstChange(true)}
                data-testid="guided-signing-order-self-first"
              />
              <span>I sign first</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-xs text-stone-800">
              <input
                type="radio"
                name="guided-signing-order"
                className="mt-0.5"
                checked={!signFirst}
                onChange={() => onSignFirstChange(false)}
                data-testid="guided-signing-order-other-first"
              />
              <span>Other party signs first</span>
            </label>
          </div>
        </fieldset>
      ) : null}

      {blockMessage ? (
        <p className="text-xs font-medium text-amber-800" role="alert" data-testid="guided-signing-block-message">
          {blockMessage}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="w-full rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-45"
          disabled={continueDisabled || Boolean(blockMessage)}
          onClick={onContinue}
          data-testid="guided-signing-continue-confirmation"
        >
          {primaryLabel}
        </button>
        <button
          type="button"
          className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800"
          onClick={onBackToFinalReview}
          data-testid="guided-signing-back-to-final-review"
        >
          Back to final review
        </button>
      </div>
    </div>
  );

}
