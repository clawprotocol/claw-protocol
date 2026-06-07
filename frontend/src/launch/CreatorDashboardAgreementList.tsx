import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import type { OwnerReviewPartyStatusRow } from "./simpleProduct/ownerReviewPartyStatusChecklist";
import {
  CREATOR_ALL_REVIEWERS_APPROVED_HELPER,
  CREATOR_ALL_REVIEWERS_APPROVED_HELPER_EXTENDED,
  CREATOR_NEXT_ACTION_PREPARE_SIGNATURE_LINKS,
  CREATOR_OPEN_REVIEW_LINK_PAGE_LABEL,
  CREATOR_PREPARE_SIGNATURE_LINKS_LABEL,
  CREATOR_REVIEWS_COMPLETE_PILL,
} from "./creatorDashboardCopy";
import {
  CREATOR_DASHBOARD_STATUS_LABEL,
  creatorDashboardAllPartiesApproved,
  creatorDashboardPrimaryAction,
  creatorDashboardShowsReviewPanel,
  deriveCreatorDashboardStatus,
  deriveCreatorReviewProgressLabel,
  deriveCreatorSigningStatusLabel,
  displayCreatorAgreementTitle,
  formatCreatorDashboardUpdated,
} from "./creatorDashboardPresentation";

type Props = {
  rows: readonly WorkspaceIndexAgreement[];
  reviewRowsByAgreementId: Readonly<Record<string, OwnerReviewPartyStatusRow[]>>;
  onNavigate: (path: string) => void;
  onPrepareSignatureLinks: (agreementId: string) => void | Promise<void>;
  prepareBusyAgreementId?: string | null;
  featured?: boolean;
};

function deriveCreatorDashboardStatusPillLabel(
  row: WorkspaceIndexAgreement,
  reviewRows: readonly OwnerReviewPartyStatusRow[],
): string {
  const status = deriveCreatorDashboardStatus(row);
  if (status === "ready_for_signing" && creatorDashboardAllPartiesApproved(row, reviewRows)) {
    return CREATOR_REVIEWS_COMPLETE_PILL;
  }
  return CREATOR_DASHBOARD_STATUS_LABEL[status];
}

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

export function CreatorDashboardAgreementList(props: Props) {
  const {
    rows,
    reviewRowsByAgreementId,
    onNavigate,
    onPrepareSignatureLinks,
    prepareBusyAgreementId = null,
    featured: featuredSection = false,
  } = props;

  return (
    <ul
      className={featuredSection ? "space-y-3" : "mt-4 space-y-3"}
      data-testid="creator-dashboard-agreement-list"
    >
      {rows.map((row) => {
        const status = deriveCreatorDashboardStatus(row);
        const action = creatorDashboardPrimaryAction(row);
        const reviewRows = reviewRowsByAgreementId[row.id] ?? [];
        const allApproved = creatorDashboardAllPartiesApproved(row, reviewRows);
        const readyForSigning = status === "ready_for_signing" && allApproved;
        const showReview = creatorDashboardShowsReviewPanel(status);
        const statusPill = deriveCreatorDashboardStatusPillLabel(row, reviewRows);
        const reviewProgress = deriveCreatorReviewProgressLabel(row, reviewRows);
        const signingStatus = deriveCreatorSigningStatusLabel(row);
        const featured = featuredSection && readyForSigning;
        const donePath = `/app/done/${encodeURIComponent(row.id)}`;
        const prepareBusy = prepareBusyAgreementId === row.id;

        return (
          <li
            key={row.id}
            className={`rounded-2xl border px-4 py-4 transition-colors sm:px-5 sm:py-5 ${
              readyForSigning
                ? "border-emerald-800/50 bg-emerald-950/20 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]"
                : "border-slate-800/70 bg-slate-950/25"
            }`}
            data-testid={`creator-dashboard-agreement-${row.id}`}
            data-creator-dashboard-status={status}
            data-creator-dashboard-featured={featured ? "true" : "false"}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="truncate text-base font-semibold tracking-tight text-white">
                    {displayCreatorAgreementTitle(row.title)}
                  </h3>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                      readyForSigning
                        ? "bg-emerald-900/50 text-emerald-200"
                        : status === "completed"
                          ? "bg-slate-800 text-slate-300"
                          : "bg-slate-900/80 text-slate-400"
                    }`}
                    data-testid={`creator-dashboard-status-pill-${row.id}`}
                  >
                    {statusPill}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-slate-500" data-testid={`creator-dashboard-updated-${row.id}`}>
                  {formatCreatorDashboardUpdated(row.updated_at)}
                </p>
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
                ) : (
                  <p className="mt-2 text-sm text-slate-300">
                    Next action: <span className="text-slate-100">{action.label}</span>
                  </p>
                )}
                {reviewProgress ? (
                  <p className="mt-2 text-sm text-slate-400" data-testid={`creator-dashboard-review-progress-${row.id}`}>
                    Review progress: <span className="text-slate-200">{reviewProgress}</span>
                  </p>
                ) : null}
                <p className="mt-1 text-sm text-slate-400" data-testid={`creator-dashboard-signing-status-${row.id}`}>
                  Signing status: <span className="text-slate-200">{signingStatus}</span>
                </p>
                {showReview ? (
                  <ReviewStatusPanel rows={reviewRows} allApproved={allApproved} />
                ) : null}
              </div>
              <div className="flex flex-col gap-2 md:items-end">
                {readyForSigning ? (
                  <>
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--compact vs01-btn--primary !mt-0 min-w-[10rem]"
                      data-testid={`creator-dashboard-action-${row.id}`}
                      disabled={prepareBusy}
                      onClick={() => void onPrepareSignatureLinks(row.id)}
                    >
                      {prepareBusy ? "Preparing signature links…" : CREATOR_PREPARE_SIGNATURE_LINKS_LABEL}
                    </button>
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--compact vs01-btn--secondary !mt-0 min-w-[10rem]"
                      data-testid={`creator-dashboard-open-review-${row.id}`}
                      onClick={() => onNavigate(donePath)}
                    >
                      {CREATOR_OPEN_REVIEW_LINK_PAGE_LABEL}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={`vs01-btn vs01-btn--compact !mt-0 min-w-[10rem] ${
                      action.emphasis === "primary" ? "vs01-btn--primary" : "vs01-btn--secondary"
                    }`}
                    data-testid={`creator-dashboard-action-${row.id}`}
                    onClick={() => onNavigate(action.path)}
                  >
                    {action.label}
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
