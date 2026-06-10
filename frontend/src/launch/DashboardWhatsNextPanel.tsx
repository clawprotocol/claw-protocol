import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import type { OwnerReviewPartyStatusRow } from "./simpleProduct/ownerReviewPartyStatusChecklist";
import { AgreementProgressTimeline } from "./AgreementProgressTimeline";
import {
  creatorDashboardPrimaryAction,
  CREATOR_DASHBOARD_STATUS_LABEL,
  deriveCreatorDashboardStatusPillFromGate,
  deriveCreatorSigningStatusLabel,
} from "./creatorDashboardPresentation";
import { creatorDashboardUsesManualReviewLinkPage } from "./creatorDashboardReviewLinkRouting";
import {
  creatorDashboardReviewHydrationPending,
  resolveCreatorDashboardReviewGate,
} from "./creatorDashboardReviewGate";
import { deriveDashboardWhatsNextPresentation } from "./dashboardWhatsNextPresentation";

type Props = {
  row: WorkspaceIndexAgreement;
  reviewRows: readonly OwnerReviewPartyStatusRow[];
  onPrimaryAction: (row: WorkspaceIndexAgreement) => void;
  onPrepareSignatureLinks?: (agreementId: string) => void;
  prepareBusy?: boolean;
  prepareNotice?: string | null;
};

export function DashboardWhatsNextPanel(props: Props) {
  const {
    row,
    reviewRows,
    onPrimaryAction,
    onPrepareSignatureLinks,
    prepareBusy = false,
    prepareNotice = null,
  } = props;

  if (creatorDashboardReviewHydrationPending(row, reviewRows)) {
    return (
      <section
        className="rounded-2xl border border-slate-800/70 bg-slate-950/40 px-5 py-6"
        data-testid="dashboard-whats-next-loading"
        aria-busy="true"
        aria-label="What's next"
      >
        <p className="text-sm text-slate-400">Loading your next step…</p>
      </section>
    );
  }

  const reviewGate = resolveCreatorDashboardReviewGate(row, reviewRows);
  const presentation = deriveDashboardWhatsNextPresentation(row, reviewGate);
  const manualReviewLinkPage = creatorDashboardUsesManualReviewLinkPage();
  const action = creatorDashboardPrimaryAction(row, { manualReviewLinkPage });
  const statusPill = deriveCreatorDashboardStatusPillFromGate(row, reviewGate);
  const signingStatus = deriveCreatorSigningStatusLabel(row);
  const readyForSigning = reviewGate.allRequiredReviewPartiesApproved;
  const showPrepare =
    readyForSigning &&
    onPrepareSignatureLinks &&
    presentation.status !== "signing_in_progress" &&
    presentation.status !== "completed";

  return (
    <section
      className="rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-950/80 to-slate-900/40 px-5 py-6 shadow-lg shadow-black/20"
      data-testid="dashboard-whats-next-panel"
      data-creator-dashboard-primary="true"
      data-agreement-id={row.id}
      aria-label="What's next"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        What&apos;s next
      </p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-lg font-semibold text-white">{presentation.headline}</h2>
            <span
              className="inline-flex rounded-full bg-slate-800/90 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300"
              data-testid={`creator-dashboard-status-pill-${row.id}`}
            >
              {statusPill ?? CREATOR_DASHBOARD_STATUS_LABEL[presentation.status]}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">{presentation.agreementTitle}</p>
          {presentation.progressLine ? (
            <p className="mt-2 text-sm text-slate-300" data-testid="dashboard-whats-next-progress">
              {presentation.progressLine}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-slate-300">
            Next step:{" "}
            <span className="font-medium text-white" data-testid="dashboard-whats-next-step">
              {presentation.nextStepLabel}
            </span>
          </p>
          <p className="mt-1 text-sm text-slate-400" data-testid={`creator-dashboard-signing-status-${row.id}`}>
            Signing status: <span className="text-slate-200">{signingStatus}</span>
          </p>
          <div className="mt-4">
            <AgreementProgressTimeline steps={presentation.timeline} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          {showPrepare ? (
            <button
              type="button"
              className="vs01-btn vs01-btn--primary vs01-btn--compact min-w-[11rem]"
              data-testid={`creator-dashboard-action-${row.id}`}
              disabled={prepareBusy}
              onClick={() => onPrepareSignatureLinks(row.id)}
            >
              {prepareBusy ? "Preparing…" : "Prepare signature links"}
            </button>
          ) : (
            <button
              type="button"
              className="vs01-btn vs01-btn--primary vs01-btn--compact min-w-[11rem]"
              data-testid={`creator-dashboard-action-${row.id}`}
              onClick={() => onPrimaryAction(row)}
            >
              {action.label}
            </button>
          )}
          {prepareNotice ? (
            <p
              className="max-w-xs text-sm text-amber-100/95"
              data-testid={`creator-dashboard-prepare-notice-${row.id}`}
            >
              {prepareNotice}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
