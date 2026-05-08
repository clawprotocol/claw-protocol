import type { ReactNode } from "react";
import { RECIPIENT_PUBLIC_HERO_SUBTITLE } from "./recipientReviewTrustCopy";

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
  /** Decision menu — bigger rewrite path. */
  sendBackRevised: "Send back a revised version",
  /** Decision menu — small tweak path. */
  askQuickChange: "Ask for a small tweak",
  looksGood: "Looks good",
  notParticipating: "I'm not participating",
  reviewHelper: "Read before deciding.",
  /** @deprecated */
  requestChangesHelper: "Compare, redline, or send a revision — nothing changes until the sender accepts.",
  /** @deprecated */
  sendBackRevisedHelper: "Upload or paste an edited draft.",
  /** @deprecated */
  askQuickChangeHelper: "Request a few edits before signing.",
  /** @deprecated */
  looksGoodHelper: "Continue when the draft works for you.",
  /** @deprecated */
  notParticipatingHelper: "Step away from this review.",
  assuranceLine: "Nothing changes until the sender accepts.",
  nextStepSummary: RECIPIENT_PUBLIC_HERO_SUBTITLE,
  /** @deprecated */
  doneReadingPrompt: "Done reading? Choose what happens next.",
  /** Friendly decision menu */
  decisionMenuHeading: "What would you like to do?",
  decisionMenuSubcopy: "Nothing changes until accepted.",
  requestChangesCardSub: "Suggest edits directly inside LawDog.",
  looksGoodCardTitle: "Looks good",
  looksGoodCardSub: "I’m ready to move forward.",
  smallTweakCardTitle: "Ask for a small tweak",
  smallTweakCardSub: "A sentence or two, like payment timing or wording.",
  biggerRewriteCardTitle: "Send back a revised version",
  biggerRewriteCardSub: "Upload, paste, or edit a full draft. LawDog will redline it.",
  downloadCopyCardTitle: "Download copy",
  downloadCopyCardSub: "Save a copy for review.",
  stepAwayCardTitle: "I’m not participating",
  stepAwayCardSub: "No changes will be sent.",
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
  /** Shown after the review primary control, before the decision menu (e.g. draft downloads). */
  afterReviewSlot?: ReactNode;
  /** Document-first: four choices after the draft; no “Review agreement” gate or split revise menu. */
  documentFirstLayout?: boolean;
};

const decisionCardQuiet =
  "w-full rounded-xl border border-slate-700/55 bg-slate-950/25 px-4 py-3.5 text-left transition-colors hover:bg-slate-900/45 disabled:opacity-45";
const decisionCardGreen =
  "w-full rounded-xl border border-emerald-700/45 bg-emerald-950/30 px-4 py-3.5 text-left transition-colors hover:bg-emerald-950/45 disabled:opacity-45";
const decisionCardLow =
  "w-full rounded-xl border border-slate-800/80 bg-transparent px-4 py-3 text-left text-sm text-slate-400 transition-colors hover:bg-slate-900/35 hover:text-slate-200";

/**
 * Recipient decision menu: one primary green action, neutral alternatives, progressive tone.
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
    afterReviewSlot,
    documentFirstLayout,
  } = props;

  const useSplitReviseEntry =
    Boolean(reviseEntrySplit && onSendBackRevised && onAskQuickChange && onDownloadOriginal);

  const reviewLabel =
    canSignFromHub
      ? recipientPartyReviewCopy.reviewAndSign
      : promoteLooksGoodVisually
        ? recipientPartyReviewCopy.reviewAgain
        : recipientPartyReviewCopy.reviewAgreement;

  const looksDisabled = Boolean(looksGoodDisabled || looksGoodLoading);
  const isLandingPlacement = placement === "landing" || placement === "landing-mobile";
  const landingPrimaryReviewClass =
    "inline-flex w-full items-center justify-center rounded-xl bg-sky-600 px-4 py-3.5 text-base font-semibold text-white shadow-sm shadow-sky-950/20 hover:bg-sky-500";
  const landingPrimarySignClass =
    "inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-semibold text-white shadow-sm shadow-emerald-950/25 hover:bg-emerald-500";
  const defaultReviewControlClass =
    "inline-flex w-full items-center justify-center rounded-xl border border-slate-600 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-800/80";
  const landingRequestSecondaryClass =
    "w-full rounded-xl border border-slate-600/80 bg-transparent px-4 py-3 text-center text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-900/40 disabled:opacity-45 sm:text-left";

  if (documentFirstLayout && !viewerLike) {
    return (
      <div
        className={`flex flex-col ${isLandingPlacement ? "gap-3" : "gap-3"}`}
        data-testid="recipient-party-review-actions"
        data-placement={placement}
      >
        {canSignFromHub && primarySigningHref ? (
          <a
            className={isLandingPlacement ? landingPrimarySignClass : defaultReviewControlClass}
            href={primarySigningHref}
          >
            {recipientPartyReviewCopy.reviewAndSign}
          </a>
        ) : null}

        <button
          type="button"
          data-testid="recipient-document-first-looks-good"
          className={decisionCardGreen}
          disabled={looksDisabled}
          onClick={onLooksGood}
        >
          <span className="block text-base font-semibold text-emerald-50">
            {recipientPartyReviewCopy.looksGoodCardTitle}
          </span>
          <span className="mt-0.5 block text-xs font-normal text-emerald-100/85">
            {recipientPartyReviewCopy.looksGoodCardSub}
          </span>
        </button>

        <button
          type="button"
          data-testid="recipient-document-first-request-changes"
          className={decisionCardQuiet}
          disabled={requestChangesDisabled}
          onClick={onRequestChanges}
        >
          <span className="block text-base font-semibold text-slate-100">{recipientPartyReviewCopy.requestChanges}</span>
          <span className="mt-0.5 block text-xs font-normal text-slate-400">
            {recipientPartyReviewCopy.requestChangesCardSub}
          </span>
        </button>

        <button
          type="button"
          data-testid="recipient-document-first-download"
          className={decisionCardQuiet}
          disabled={requestChangesDisabled || !onDownloadOriginal}
          onClick={() => onDownloadOriginal?.()}
        >
          <span className="block text-base font-semibold text-slate-100">
            {recipientPartyReviewCopy.downloadCopyCardTitle}
          </span>
          <span className="mt-0.5 block text-xs font-normal text-slate-400">
            {recipientPartyReviewCopy.downloadCopyCardSub}
          </span>
        </button>

        <button
          type="button"
          data-testid="recipient-document-first-not-participating"
          className={decisionCardLow}
          onClick={onNotParticipating}
        >
          <span className="block font-medium text-slate-400">{recipientPartyReviewCopy.notParticipating}</span>
        </button>

        {afterReviewSlot ? <div className="min-w-0 max-w-full">{afterReviewSlot}</div> : null}
        {children}
      </div>
    );
  }

  if (viewerLike) {
    return (
      <div
        className="flex flex-col gap-3"
        data-testid="recipient-party-review-actions"
        data-placement={placement}
      >
        {canSignFromHub && primarySigningHref ? (
          <a
            className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-500"
            href={primarySigningHref}
          >
            {recipientPartyReviewCopy.reviewAndSign}
          </a>
        ) : (
          <button
            type="button"
            className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-500"
            onClick={onReviewPrimary}
          >
            {recipientPartyReviewCopy.reviewAgreement}
          </button>
        )}
        <p className="text-center text-xs leading-snug text-slate-400 sm:text-left">
          View-only — suggesting edits isn&apos;t available on this link.
        </p>
        <button type="button" className={decisionCardLow} onClick={onNotParticipating}>
          {recipientPartyReviewCopy.notParticipating}
        </button>
        {children}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col ${isLandingPlacement ? "gap-3" : "gap-4"}`}
      data-testid="recipient-party-review-actions"
      data-placement={placement}
    >
      {canSignFromHub && primarySigningHref ? (
        <a
          className={isLandingPlacement ? landingPrimarySignClass : defaultReviewControlClass}
          href={primarySigningHref}
        >
          {recipientPartyReviewCopy.reviewAndSign}
        </a>
      ) : (
        <button
          type="button"
          className={isLandingPlacement ? landingPrimaryReviewClass : defaultReviewControlClass}
          onClick={onReviewPrimary}
        >
          {reviewLabel}
        </button>
      )}

      {afterReviewSlot ? <div className="min-w-0 max-w-full">{afterReviewSlot}</div> : null}

      {useSplitReviseEntry ? (
        <div className="space-y-3" data-testid="recipient-decision-menu">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-slate-100">
              {recipientPartyReviewCopy.decisionMenuHeading}
            </h2>
            <p className="mt-1 text-xs leading-snug text-slate-500">{recipientPartyReviewCopy.decisionMenuSubcopy}</p>
          </div>
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              data-testid="recipient-decision-looks-good"
              className={decisionCardGreen}
              disabled={looksDisabled}
              onClick={onLooksGood}
            >
              <span className="block text-base font-semibold text-emerald-50">
                {recipientPartyReviewCopy.looksGoodCardTitle}
              </span>
              <span className="mt-0.5 block text-xs font-normal text-emerald-100/85">
                {recipientPartyReviewCopy.looksGoodCardSub}
              </span>
            </button>

            <button
              type="button"
              data-testid="recipient-ask-quick-change"
              className={decisionCardQuiet}
              disabled={requestChangesDisabled}
              onClick={onAskQuickChange}
            >
              <span className="block text-base font-semibold text-slate-100">
                {recipientPartyReviewCopy.smallTweakCardTitle}
              </span>
              <span className="mt-0.5 block text-xs font-normal text-slate-400">
                {recipientPartyReviewCopy.smallTweakCardSub}
              </span>
            </button>

            <button
              type="button"
              data-testid="recipient-send-back-revised"
              className={decisionCardQuiet}
              disabled={requestChangesDisabled}
              onClick={onSendBackRevised}
            >
              <span className="block text-base font-semibold text-slate-100">
                {recipientPartyReviewCopy.biggerRewriteCardTitle}
              </span>
              <span className="mt-0.5 block text-xs font-normal text-slate-400">
                {recipientPartyReviewCopy.biggerRewriteCardSub}
              </span>
            </button>

            <button
              type="button"
              data-testid="recipient-download-original-cta"
              className={decisionCardQuiet}
              disabled={requestChangesDisabled}
              onClick={onDownloadOriginal}
            >
              <span className="block text-base font-semibold text-slate-100">
                {recipientPartyReviewCopy.downloadCopyCardTitle}
              </span>
              <span className="mt-0.5 block text-xs font-normal text-slate-400">
                {recipientPartyReviewCopy.downloadCopyCardSub}
              </span>
            </button>

            <button type="button" className={decisionCardLow} onClick={onNotParticipating}>
              <span className="block font-medium text-slate-400">{recipientPartyReviewCopy.stepAwayCardTitle}</span>
              <span className="mt-0.5 block text-xs font-normal text-slate-500">
                {recipientPartyReviewCopy.stepAwayCardSub}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            className={
              isLandingPlacement
                ? landingRequestSecondaryClass
                : `${decisionCardQuiet} text-center font-semibold text-slate-100 sm:text-left`
            }
            disabled={requestChangesDisabled}
            onClick={onRequestChanges}
          >
            {recipientPartyReviewCopy.requestChanges}
          </button>
          <button
            type="button"
            className={decisionCardGreen}
            disabled={looksDisabled}
            onClick={onLooksGood}
          >
            <span className="block text-base font-semibold text-emerald-50">{recipientPartyReviewCopy.looksGood}</span>
            <span className="mt-0.5 block text-xs font-normal text-emerald-100/85">
              {recipientPartyReviewCopy.looksGoodCardSub}
            </span>
          </button>
          <button type="button" className={decisionCardLow} onClick={onNotParticipating}>
            {recipientPartyReviewCopy.notParticipating}
          </button>
        </>
      )}

      {children}
    </div>
  );
}
