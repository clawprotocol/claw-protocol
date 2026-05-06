import type { ReactNode } from "react";

/**
 * Single source of truth for recipient party-review CTAs (landing + document read).
 * Keeps labels, order, and helper copy aligned across surfaces.
 */
export const recipientPartyReviewCopy = {
  reviewAgreement: "Review agreement",
  reviewAgain: "Review again",
  reviewAndSign: "Review and sign",
  suggestChanges: "Suggest changes",
  looksGood: "Looks good",
  notParticipating: "I'm not participating",
  reviewHelper: "Read before deciding.",
  suggestHelper: "Ask for edits before anyone signs.",
  looksGoodHelper: "Continue when the draft works for you.",
  notParticipatingHelper: "Step away from this review.",
  assuranceLine: "Take your time — nothing changes unless the owner accepts it.",
  nextStepSummary: "Next: Read it, request edits, or mark it ready.",
} as const;

export type RecipientPartyReviewActionsPlacement = "landing" | "landing-mobile" | "document-read";

type RecipientPartyReviewActionsProps = {
  placement: RecipientPartyReviewActionsPlacement;
  viewerLike: boolean;
  canSignFromHub: boolean;
  primarySigningHref?: string;
  /** When true, “Looks good” is visually primary and review is “Review again” (read tab). */
  promoteLooksGoodVisually: boolean;
  looksGoodLoading?: boolean;
  looksGoodDisabled?: boolean;
  suggestDisabled?: boolean;
  onReviewPrimary: () => void;
  onSuggest: () => void;
  onLooksGood: () => void;
  onNotParticipating: () => void;
  /** Extra row after the four choices (e.g. Ready to sign). */
  children?: ReactNode;
};

const btnBase =
  "inline-flex w-full items-center justify-center rounded-lg px-4 py-3 text-base font-semibold transition-colors";
const btnPrimary = `${btnBase} bg-emerald-600 text-white hover:bg-emerald-500`;
const btnSecondary = `${btnBase} border border-slate-600 bg-slate-900/70 text-slate-100 hover:bg-slate-800`;
const btnQuiet = `${btnBase} border border-slate-700/80 bg-transparent text-slate-200 hover:bg-slate-900/50`;
const btnDecline =
  "inline-flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-medium text-slate-400 underline decoration-slate-700 underline-offset-2 hover:bg-slate-900/35 hover:text-slate-200";

function HelperUnder({ text, placement }: { text: string; placement: RecipientPartyReviewActionsPlacement }) {
  const isMobile = placement === "landing-mobile";
  if (isMobile) return null;
  return <p className="mt-1 max-w-xl text-xs leading-snug text-slate-400 sm:text-[13px]">{text}</p>;
}

/**
 * Four-choice party review stack (or two-choice view-only).
 */
export function RecipientPartyReviewActions(props: RecipientPartyReviewActionsProps) {
  const {
    placement,
    viewerLike,
    canSignFromHub,
    primarySigningHref,
    promoteLooksGoodVisually,
    looksGoodLoading,
    looksGoodDisabled,
    suggestDisabled,
    onReviewPrimary,
    onSuggest,
    onLooksGood,
    onNotParticipating,
    children,
  } = props;

  const reviewLabel =
    canSignFromHub
      ? recipientPartyReviewCopy.reviewAndSign
      : promoteLooksGoodVisually
        ? recipientPartyReviewCopy.reviewAgain
        : recipientPartyReviewCopy.reviewAgreement;

  /** Signing hub link stays visually primary when available; otherwise “Looks good” can take primary on read tab. */
  const reviewIsPrimaryVisual = !viewerLike && (!promoteLooksGoodVisually || canSignFromHub);
  const looksGoodIsPrimaryVisual = !viewerLike && promoteLooksGoodVisually && !canSignFromHub;

  const reviewClass = reviewIsPrimaryVisual ? btnPrimary : btnQuiet;
  const suggestClass = `${btnSecondary} disabled:opacity-45`;
  const looksClass = `${looksGoodIsPrimaryVisual ? btnPrimary : btnQuiet} disabled:opacity-45`;
  const looksDisabled = Boolean(looksGoodDisabled || looksGoodLoading);


  if (viewerLike) {
    return (
      <div
        className="flex flex-col gap-2.5"
        data-testid="recipient-party-review-actions"
        data-placement={placement}
      >
        {canSignFromHub && primarySigningHref ? (
          <a className={btnPrimary} href={primarySigningHref}>
            {recipientPartyReviewCopy.reviewAndSign}
          </a>
        ) : (
          <button type="button" className={btnPrimary} onClick={onReviewPrimary}>
            {recipientPartyReviewCopy.reviewAgreement}
          </button>
        )}
        <HelperUnder text={recipientPartyReviewCopy.reviewHelper} placement={placement} />
        <p className="text-center text-xs leading-snug text-slate-400 sm:text-left">
          View-only — suggesting edits isn&apos;t available on this link.
        </p>
        <button type="button" className={btnDecline} onClick={onNotParticipating}>
          {recipientPartyReviewCopy.notParticipating}
        </button>
        <HelperUnder text={recipientPartyReviewCopy.notParticipatingHelper} placement={placement} />
        {children}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-2.5"
      data-testid="recipient-party-review-actions"
      data-placement={placement}
    >
      {!viewerLike && placement !== "document-read" ? (
        <p className="text-center text-sm leading-snug text-slate-300 sm:text-left">{recipientPartyReviewCopy.assuranceLine}</p>
      ) : null}
      {!viewerLike && placement === "document-read" ? (
        <p className="text-xs leading-snug text-slate-400 sm:text-sm">{recipientPartyReviewCopy.assuranceLine}</p>
      ) : null}

      {canSignFromHub && primarySigningHref ? (
        <a className={reviewIsPrimaryVisual ? btnPrimary : reviewClass} href={primarySigningHref}>
          {recipientPartyReviewCopy.reviewAndSign}
        </a>
      ) : (
        <button type="button" className={reviewIsPrimaryVisual ? btnPrimary : reviewClass} onClick={onReviewPrimary}>
          {reviewLabel}
        </button>
      )}
      <HelperUnder text={recipientPartyReviewCopy.reviewHelper} placement={placement} />

      <button type="button" className={suggestClass} disabled={suggestDisabled} onClick={onSuggest}>
        {recipientPartyReviewCopy.suggestChanges}
      </button>
      <HelperUnder text={recipientPartyReviewCopy.suggestHelper} placement={placement} />

      <button type="button" className={looksClass} disabled={looksDisabled} onClick={onLooksGood}>
        {looksGoodLoading ? "Saving…" : recipientPartyReviewCopy.looksGood}
      </button>
      <HelperUnder text={recipientPartyReviewCopy.looksGoodHelper} placement={placement} />

      <button type="button" className={btnDecline} onClick={onNotParticipating}>
        {recipientPartyReviewCopy.notParticipating}
      </button>
      <HelperUnder text={recipientPartyReviewCopy.notParticipatingHelper} placement={placement} />

      {children}
    </div>
  );
}
