import { useState } from "react";
import { RecipientControlCenter } from "../agreement/RecipientControlCenter";
import type { AgreementDraft } from "../agreement/agreementTypes";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import type { OwnerReviewPartyStatusRow } from "./simpleProduct/ownerReviewPartyStatusChecklist";
import {
  CREATOR_ALL_REVIEWERS_APPROVED_HELPER,
  CREATOR_ALL_REVIEWERS_APPROVED_HELPER_EXTENDED,
  CREATOR_MANAGE_RECIPIENTS_LABEL,
  CREATOR_NEXT_ACTION_PREPARE_SIGNATURE_LINKS,
  CREATOR_OPEN_REVIEW_LINK_PAGE_LABEL,
  CREATOR_PREPARE_SIGNATURE_LINKS_BLOCKED_NOTICE,
  CREATOR_PREPARE_SIGNATURE_LINKS_LABEL,
  CREATOR_SIGNATURE_LINKS_LOCKED_HELPER,
} from "./creatorDashboardCopy";
import {
  creatorDashboardPrimaryAction,
  creatorDashboardShowsReviewPanel,
  creatorDashboardSupplementalActions,
  deriveCreatorDashboardStatus,
  deriveCreatorDashboardStatusPillFromGate,
  deriveCreatorNextActionLabel,
  deriveCreatorReviewProgressLabel,
  deriveCreatorSigningStatusLabel,
  displayCreatorAgreementTitle,
  formatCreatorDashboardUpdated,
} from "./creatorDashboardPresentation";
import { creatorDashboardUsesManualReviewLinkPage, creatorDashboardFocusAgreementPath } from "./creatorDashboardReviewLinkRouting";
import {
  creatorDashboardReviewHydrationPending,
  creatorDashboardWaitingOnReviewer,
  resolveCreatorDashboardReviewGate,
} from "./creatorDashboardReviewGate";
import { creatorDashboardShowManageRecipients } from "./creatorDashboardSignatureTrack";

type Props = {
  rows: readonly WorkspaceIndexAgreement[];
  reviewRowsByAgreementId: Readonly<Record<string, OwnerReviewPartyStatusRow[]>>;
  draftByAgreementId?: Readonly<Record<string, AgreementDraft | null>>;
  onNavigate: (path: string) => void;
  onFocusReviewStatus?: (agreementId: string) => void;
  onPrepareSignatureLinks: (agreementId: string) => void | Promise<void>;
  prepareBusyAgreementId?: string | null;
  prepareNoticeByAgreementId?: Readonly<Record<string, string>>;
  featured?: boolean;
  compact?: boolean;
  manualReviewLinkPage?: boolean;
};

function ReviewStatusPanel(props: {
  rows: readonly OwnerReviewPartyStatusRow[];
  allApproved: boolean;
}) {
  const { rows, allApproved } = props;
  if (rows.length === 0) return null;
  return (
    <div
      className="mt-3 rounded-lg bg-slate-900/40 px-3 py-2.5"
      data-testid="creator-dashboard-review-status"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Review status</p>
      {allApproved ? (
        <p className="mt-1.5 text-sm font-medium text-emerald-300/95" data-testid="creator-dashboard-all-approved">
          All parties approved review
        </p>
      ) : null}
      <ul className="mt-2 space-y-1">
        {rows.map((row) => (
          <li
            key={`${row.partyIndex}-${row.displayName}`}
            className="text-sm text-slate-300"
            data-testid={`creator-dashboard-review-party-${row.partyIndex}`}
          >
            {row.displayName} — {row.statusLabel}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreatorDashboardAgreementCardSkeleton(props: {
  row: WorkspaceIndexAgreement;
  featured: boolean;
}) {
  const { row, featured } = props;
  return (
    <li
      className="rounded-2xl border border-slate-800/70 bg-slate-950/25 px-4 py-4 sm:px-5 sm:py-5"
      data-testid={`creator-dashboard-agreement-skeleton-${row.id}`}
      data-creator-dashboard-featured={featured ? "true" : "false"}
      aria-busy="true"
      aria-label={`Loading review status for ${displayCreatorAgreementTitle(row.title)}`}
    >
      <div className="animate-pulse space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="h-5 w-40 rounded bg-slate-800/80" />
          <div className="h-5 w-28 rounded-full bg-slate-800/60" />
        </div>
        <div className="h-4 w-24 rounded bg-slate-800/50" />
        <p className="text-sm text-slate-500" data-testid={`creator-dashboard-review-hydrating-${row.id}`}>
          Loading review status…
        </p>
        <div className="space-y-2 pt-1">
          <div className="h-4 w-56 rounded bg-slate-800/40" />
          <div className="h-4 w-44 rounded bg-slate-800/40" />
        </div>
      </div>
    </li>
  );
}

export function CreatorDashboardAgreementList(props: Props) {
  const {
    rows,
    reviewRowsByAgreementId,
    draftByAgreementId = {},
    onNavigate,
    onFocusReviewStatus,
    onPrepareSignatureLinks,
    prepareBusyAgreementId = null,
    prepareNoticeByAgreementId = {},
    featured: featuredSection = false,
    compact = false,
    manualReviewLinkPage = creatorDashboardUsesManualReviewLinkPage(),
  } = props;
  const [prepareBlockedNoticeAgreementId, setPrepareBlockedNoticeAgreementId] = useState<string | null>(
    null,
  );
  const [manageRecipientsOpenByAgreementId, setManageRecipientsOpenByAgreementId] = useState<
    Record<string, boolean>
  >({});

  return (
    <ul
      className={featuredSection ? "space-y-3" : "mt-4 space-y-3"}
      data-testid="creator-dashboard-agreement-list"
    >
      {rows.map((row) => {
        const reviewRows = reviewRowsByAgreementId[row.id] ?? [];
        const rowDraft = draftByAgreementId[row.id] ?? null;
        if (creatorDashboardReviewHydrationPending(row, reviewRows, rowDraft)) {
          return (
            <CreatorDashboardAgreementCardSkeleton
              key={row.id}
              row={row}
              featured={featuredSection}
            />
          );
        }

        const status = deriveCreatorDashboardStatus(row);
        const action = creatorDashboardPrimaryAction(row, { manualReviewLinkPage });
        const reviewGate = resolveCreatorDashboardReviewGate(row, reviewRows, { draft: rowDraft });
        const allApproved = reviewGate.allRequiredReviewPartiesApproved;
        const waitingOnReviewer = creatorDashboardWaitingOnReviewer(reviewGate);
        const signingComplete = status === "completed";
        const signingStarted = status === "signing_in_progress";
        const readyForSigning = allApproved && !signingComplete && !signingStarted;
        const showReview = creatorDashboardShowsReviewPanel(status) || waitingOnReviewer || readyForSigning;
        const statusPill = deriveCreatorDashboardStatusPillFromGate(row, reviewGate);
        const reviewProgress = deriveCreatorReviewProgressLabel(row, reviewRows);
        const signingStatus = deriveCreatorSigningStatusLabel(row);
        const nextActionLabel = deriveCreatorNextActionLabel(row, reviewGate);
        const featured = featuredSection && (readyForSigning || waitingOnReviewer);
        const reviewFocusPath = creatorDashboardFocusAgreementPath(row.id);
        const prepareBusy = prepareBusyAgreementId === row.id;
        const prepareNotice = prepareNoticeByAgreementId[row.id] ?? null;
        const inReviewEmailDashboard = status === "in_review" && !manualReviewLinkPage;
        const prepareSignatureLinksVisible =
          readyForSigning || (waitingOnReviewer && !inReviewEmailDashboard);
        const prepareSignatureLinksEnabled = readyForSigning;
        const supplementalActions = creatorDashboardSupplementalActions(row, { manualReviewLinkPage });
        const contentUnavailable = row.content_unavailable === true;
        const showManageRecipients = creatorDashboardShowManageRecipients(row, reviewGate);
        const manageRecipientsOpen = Boolean(manageRecipientsOpenByAgreementId[row.id]);
        const runDashboardAction = () => {
          if (action.kind === "manage_recipients") {
            setManageRecipientsOpenByAgreementId((prev) => ({
              ...prev,
              [row.id]: !prev[row.id],
            }));
            return;
          }
          if (action.kind === "focus_review_status") {
            onFocusReviewStatus?.(row.id);
            return;
          }
          onNavigate(action.path);
        };

        return (
          <li
            key={row.id}
            className={`rounded-2xl border px-4 py-4 transition-colors sm:px-5 sm:py-5 ${
              readyForSigning
                ? "border-emerald-800/50 bg-emerald-950/20 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]"
                : waitingOnReviewer
                  ? "border-amber-800/40 bg-amber-950/15"
                  : "border-slate-800/70 bg-slate-950/25"
            }`}
            data-testid={`creator-dashboard-agreement-${row.id}`}
            data-creator-dashboard-status={status}
            data-creator-dashboard-featured={featured ? "true" : "false"}
            data-creator-dashboard-review-gate-all-approved={allApproved ? "true" : "false"}
            data-creator-dashboard-prepare-enabled={prepareSignatureLinksEnabled ? "true" : "false"}
            data-creator-dashboard-review-source={reviewGate.source}
            data-lawdog-content-unavailable={contentUnavailable ? "true" : "false"}
            tabIndex={-1}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="truncate text-base font-semibold tracking-tight text-white">
                    {displayCreatorAgreementTitle(row.title)}
                  </h3>
                  {statusPill ? (
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                        readyForSigning
                          ? "bg-emerald-900/50 text-emerald-200"
                          : waitingOnReviewer
                            ? "bg-amber-900/40 text-amber-200"
                            : status === "completed"
                              ? "bg-slate-800 text-slate-300"
                              : "bg-slate-900/80 text-slate-400"
                      }`}
                      data-testid={`creator-dashboard-status-pill-${row.id}`}
                    >
                      {statusPill}
                    </span>
                  ) : null}
                </div>
                {!compact ? (
                  <p className="mt-1.5 text-sm text-slate-500" data-testid={`creator-dashboard-updated-${row.id}`}>
                    {formatCreatorDashboardUpdated(row.updated_at)}
                  </p>
                ) : null}
                {contentUnavailable ? (
                  <p
                    className="mt-2 text-sm text-amber-200/90"
                    data-testid={`creator-dashboard-content-unavailable-${row.id}`}
                  >
                    Agreement content unavailable — metadata only.
                  </p>
                ) : null}
                {readyForSigning ? (
                  <>
                    <p className="mt-3 text-sm text-slate-300" data-testid={`creator-dashboard-next-action-${row.id}`}>
                      Next action:{" "}
                      <span className="font-medium text-slate-100">
                        {CREATOR_NEXT_ACTION_PREPARE_SIGNATURE_LINKS}
                      </span>
                    </p>
                    <p
                      className="mt-2 text-sm leading-relaxed text-slate-400"
                      data-testid={`creator-dashboard-helper-${row.id}`}
                    >
                      {featured
                        ? CREATOR_ALL_REVIEWERS_APPROVED_HELPER_EXTENDED
                        : CREATOR_ALL_REVIEWERS_APPROVED_HELPER}
                    </p>
                  </>
                ) : waitingOnReviewer ? (
                  <>
                    <p className="mt-3 text-sm text-slate-300" data-testid={`creator-dashboard-next-action-${row.id}`}>
                      Next action:{" "}
                      <span className="font-medium text-slate-100">Wait for remaining reviewer approval</span>
                    </p>
                    <p
                      className="mt-2 text-sm leading-relaxed text-slate-400"
                      data-testid={`creator-dashboard-helper-${row.id}`}
                    >
                      {CREATOR_SIGNATURE_LINKS_LOCKED_HELPER}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-300" data-testid={`creator-dashboard-next-action-${row.id}`}>
                    Next action: <span className="text-slate-100">{nextActionLabel}</span>
                  </p>
                )}
                {reviewProgress && !compact ? (
                  <p className="mt-2 text-sm text-slate-400" data-testid={`creator-dashboard-review-progress-${row.id}`}>
                    Review progress: <span className="text-slate-200">{reviewProgress}</span>
                  </p>
                ) : null}
                {!compact ? (
                  <p className="mt-1 text-sm text-slate-400" data-testid={`creator-dashboard-signing-status-${row.id}`}>
                    Signing status: <span className="text-slate-200">{signingStatus}</span>
                  </p>
                ) : null}
                {showReview && !compact ? (
                  <ReviewStatusPanel rows={reviewRows} allApproved={allApproved} />
                ) : null}
                {showManageRecipients && manageRecipientsOpen ? (
                  <RecipientControlCenter
                    agreementId={row.id}
                    phase="review"
                    title="Recipient delivery"
                    compact={compact}
                  />
                ) : null}
              </div>
              <div className="flex flex-col gap-2 md:items-end">
                {prepareSignatureLinksVisible ? (
                  <>
                    <button
                      type="button"
                      className={`vs01-btn vs01-btn--compact !mt-0 min-w-[10rem] ${
                        prepareSignatureLinksEnabled ? "vs01-btn--primary" : "vs01-btn--secondary opacity-70"
                      }`}
                      data-testid={`creator-dashboard-action-${row.id}`}
                      disabled={prepareBusy || contentUnavailable}
                      aria-disabled={
                        contentUnavailable || !prepareSignatureLinksEnabled ? true : undefined
                      }
                      onClick={() => {
                        if (contentUnavailable || !prepareSignatureLinksEnabled) {
                          if (!contentUnavailable) {
                            setPrepareBlockedNoticeAgreementId(row.id);
                          }
                          return;
                        }
                        setPrepareBlockedNoticeAgreementId(null);
                        void onPrepareSignatureLinks(row.id);
                      }}
                    >
                      {prepareBusy ? "Preparing signature links…" : CREATOR_PREPARE_SIGNATURE_LINKS_LABEL}
                    </button>
                    {prepareNotice ? (
                      <p
                        className="text-sm text-amber-100/95"
                        data-testid={`creator-dashboard-prepare-notice-${row.id}`}
                        role="alert"
                      >
                        {prepareNotice}
                      </p>
                    ) : prepareBlockedNoticeAgreementId === row.id ? (
                      <p
                        className="text-sm text-amber-100/95"
                        data-testid={`creator-dashboard-prepare-blocked-notice-${row.id}`}
                        role="status"
                      >
                        {CREATOR_PREPARE_SIGNATURE_LINKS_BLOCKED_NOTICE}
                      </p>
                    ) : null}
                    {manualReviewLinkPage ? (
                      <button
                        type="button"
                        className="vs01-btn vs01-btn--compact vs01-btn--secondary !mt-0 min-w-[10rem]"
                        data-testid={`creator-dashboard-open-review-${row.id}`}
                        disabled={contentUnavailable}
                        onClick={() => {
                          if (!contentUnavailable) onNavigate(reviewFocusPath);
                        }}
                      >
                        {CREATOR_OPEN_REVIEW_LINK_PAGE_LABEL}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <button
                    type="button"
                    className={`vs01-btn vs01-btn--compact !mt-0 min-w-[10rem] ${
                      action.emphasis === "primary" ? "vs01-btn--primary" : "vs01-btn--secondary"
                    }`}
                    data-testid={`creator-dashboard-action-${row.id}`}
                    disabled={contentUnavailable}
                    onClick={() => {
                      if (!contentUnavailable) runDashboardAction();
                    }}
                  >
                    {action.label}
                  </button>
                )}
                {supplementalActions.map((sup) => (
                  <button
                    key={sup.testIdSuffix}
                    type="button"
                    className="vs01-btn vs01-btn--compact vs01-btn--secondary !mt-0 min-w-[10rem]"
                    data-testid={`creator-dashboard-${sup.testIdSuffix}-${row.id}`}
                    disabled={contentUnavailable}
                    onClick={() => {
                      if (!contentUnavailable) onNavigate(sup.path);
                    }}
                  >
                    {sup.label}
                  </button>
                ))}
                {showManageRecipients && action.kind !== "manage_recipients" ? (
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--compact vs01-btn--secondary !mt-0 min-w-[10rem]"
                    data-testid={`creator-dashboard-manage-recipients-${row.id}`}
                    aria-expanded={manageRecipientsOpen}
                    onClick={() =>
                      setManageRecipientsOpenByAgreementId((prev) => ({
                        ...prev,
                        [row.id]: !prev[row.id],
                      }))
                    }
                  >
                    {manageRecipientsOpen ? "Hide recipients" : CREATOR_MANAGE_RECIPIENTS_LABEL}
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
