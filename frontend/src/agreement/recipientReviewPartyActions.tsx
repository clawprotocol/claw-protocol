import type { ReactNode } from "react";

/**
 * Single source of truth for recipient party-review CTAs (landing + document read).
 * Keeps labels, order, and helper copy aligned across surfaces.
 */
export const recipientPartyReviewCopy = {
  reviewAgreement: "Review agreement",
  reviewAgain: "Review again",
  reviewAndSign: "Review and sign",
  /** Opens the revise composer (legacy single entry). */
  requestChanges: "Request changes",
  /** Primary professional workflow: full-document compare + redline. */
  sendBackRevised: "Send back a revised version",
  /** Lightweight instruction-only amend flow. */
  askQuickChange: "Ask for a quick change",
  downloadOriginal: "Download original",
  looksGood: "Looks good",
  notParticipating: "I'm not participating",
  reviewHelper: "Read before deciding.",
  requestChangesHelper: "Compare, redline, or send a revision — nothing changes until the sender accepts.",
  sendBackRevisedHelper: "Upload or paste a full revised draft for compare and redline.",
  askQuickChangeHelper: "Short instructions only — best for small edits.",
  looksGoodHelper: "Continue when the draft works for you.",
  notParticipatingHelper: "Step away from this review.",
  assuranceLine: "Nothing changes until the sender accepts.",
  nextStepSummary:
    "Read the agreement, send back a revised version or a quick change, download a copy, or mark ready when you are done.",
  /** Shown above the action stack after the recipient has read to the bottom of the agreement. */
  doneReadingPrompt: "Done reading? Choose what happens next.",
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
  requestChangesDisabled?: boolean;
  onReviewPrimary: () => void;
  /** Used when {@link reviseEntrySplit} is false (legacy single “Request changes” button). */
  onRequestChanges: () => void;
  onLooksGood: () => void;
  onNotParticipating: () => void;
  /** When true, replaces “Request changes” with send-back / quick-change / download-original. */
  reviseEntrySplit?: boolean;
  onSendBackRevised?: () => void;
  onAskQuickChange?: () => void;
  onDownloadOriginal?: () => void;
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
    requestChangesDisabled,
    onReviewPrimary,
    onRequestChanges,
    onLooksGood,
    onNotParticipating,
    reviseEntrySplit,
    onSendBackRevised,
    onAskQuickChange,
    onDownloadOriginal,
    children,
  } = props;

  const useSplitReviseEntry =
    Boolean(reviseEntrySplit && onSendBackRevised && onAskQuickChange && onDownloadOriginal);

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
  const requestChangesClass = `${btnSecondary} disabled:opacity-45`;
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
        <p className="text-center text-xs leading-snug text-slate-400 sm:text-left">
          View-only — suggesting edits isn&apos;t available on this link.
        </p>
        <button type="button" className={btnDecline} onClick={onNotParticipating}>
          {recipientPartyReviewCopy.notParticipating}
        </button>
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
      {!viewerLike && placement === "document-read" ? (
        <p className="text-xs leading-snug text-slate-400 sm:text-sm">{recipientPartyReviewCopy.assuranceLine}</p>
      ) : null}
      {!viewerLike && placement !== "document-read" ? (
        <p className="text-center text-xs leading-snug text-slate-400 sm:text-left">{recipientPartyReviewCopy.assuranceLine}</p>
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
      {useSplitReviseEntry ? (
        <>
          <button
            type="button"
            data-testid="recipient-send-back-revised"
            className={btnPrimary}
            disabled={requestChangesDisabled}
            onClick={onSendBackRevised}
          >
            {recipientPartyReviewCopy.sendBackRevised}
          </button>
          <button
            type="button"
            data-testid="recipient-ask-quick-change"
            className={requestChangesClass}
            disabled={requestChangesDisabled}
            onClick={onAskQuickChange}
          >
            {recipientPartyReviewCopy.askQuickChange}
          </button>
          <button
            type="button"
            data-testid="recipient-download-original-cta"
            className={btnQuiet}
            disabled={requestChangesDisabled}
            onClick={onDownloadOriginal}
          >
            {recipientPartyReviewCopy.downloadOriginal}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className={requestChangesClass}
            disabled={requestChangesDisabled}
            onClick={onRequestChanges}
          >
            {recipientPartyReviewCopy.requestChanges}
          </button>
        </>
      )}

      <button type="button" className={looksClass} disabled={looksDisabled} onClick={onLooksGood}>
        {looksGoodLoading ? "Saving…" : recipientPartyReviewCopy.looksGood}
      </button>

      <button type="button" className={btnDecline} onClick={onNotParticipating}>
        {recipientPartyReviewCopy.notParticipating}
      </button>

      {children}
    </div>
  );
}
