import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import type { OwnerReviewPartyStatusRow } from "./simpleProduct/ownerReviewPartyStatusChecklist";
import {
  CREATOR_DASHBOARD_STATUS_LABEL,
  creatorDashboardAllPartiesApproved,
  creatorDashboardPrimaryAction,
  creatorDashboardShowsReviewPanel,
  deriveCreatorDashboardStatus,
  displayCreatorAgreementTitle,
  formatCreatorDashboardUpdated,
} from "./creatorDashboardPresentation";

type Props = {
  rows: readonly WorkspaceIndexAgreement[];
  reviewRowsByAgreementId: Readonly<Record<string, OwnerReviewPartyStatusRow[]>>;
  onNavigate: (path: string) => void;
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
            className="flex items-baseline justify-between gap-3 text-sm text-slate-300"
            data-testid={`creator-dashboard-review-party-${row.partyIndex}`}
          >
            <span className="min-w-0 truncate">
              {row.status === "approved" ? "✓" : row.status === "requested_changes" ? "!" : "○"}{" "}
              {row.displayName}
            </span>
            <span
              className={
                row.status === "approved"
                  ? "shrink-0 text-emerald-400/90"
                  : row.status === "requested_changes"
                    ? "shrink-0 text-amber-400/90"
                    : "shrink-0 text-slate-500"
              }
            >
              {row.statusLabel}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CreatorDashboardAgreementList(props: Props) {
  const { rows, reviewRowsByAgreementId, onNavigate } = props;

  return (
    <ul className="mt-4 space-y-3" data-testid="creator-dashboard-agreement-list">
      {rows.map((row) => {
        const status = deriveCreatorDashboardStatus(row);
        const action = creatorDashboardPrimaryAction(row);
        const reviewRows = reviewRowsByAgreementId[row.id] ?? [];
        const allApproved = creatorDashboardAllPartiesApproved(row, reviewRows);
        const readyForSigning = status === "ready_for_signing" && allApproved;
        const showReview = creatorDashboardShowsReviewPanel(status);

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
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
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
                  >
                    {CREATOR_DASHBOARD_STATUS_LABEL[status]}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-slate-500">
                  {formatCreatorDashboardUpdated(row.updated_at)}
                  {" · "}
                  {row.party_count} {row.party_count === 1 ? "party" : "parties"}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  Next: <span className="text-slate-100">{action.label}</span>
                </p>
                {showReview ? (
                  <ReviewStatusPanel rows={reviewRows} allApproved={allApproved} />
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                <button
                  type="button"
                  className={`vs01-btn vs01-btn--compact !mt-0 min-w-[10rem] ${
                    action.emphasis === "primary" || readyForSigning
                      ? "vs01-btn--primary"
                      : "vs01-btn--secondary"
                  }`}
                  data-testid={`creator-dashboard-action-${row.id}`}
                  onClick={() => onNavigate(action.path)}
                >
                  {action.label}
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
