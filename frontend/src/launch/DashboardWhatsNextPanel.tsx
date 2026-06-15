import { useState } from "react";
import type { AgreementDraft } from "../agreement/agreementTypes";
import { RecipientControlCenter } from "../agreement/RecipientControlCenter";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import type { OwnerReviewPartyStatusRow } from "./simpleProduct/ownerReviewPartyStatusChecklist";
import { AgreementProgressTimeline } from "./AgreementProgressTimeline";
import {
  CREATOR_DASHBOARD_STATUS_LABEL,
  deriveCreatorDashboardStatusPillFromGate,
  deriveCreatorSigningStatusLabel,
} from "./creatorDashboardPresentation";
import {
  CREATOR_MANAGE_RECIPIENTS_LABEL,
  CREATOR_VIEW_AGREEMENT_LABEL,
  logDashboardWhatsNextCtaClick,
} from "./creatorDashboardCopy";
import { creatorDashboardUsesManualReviewLinkPage } from "./creatorDashboardReviewLinkRouting";
import {
  creatorDashboardReviewHydrationPending,
  resolveCreatorDashboardReviewGate,
} from "./creatorDashboardReviewGate";
import { deriveDashboardWhatsNextPresentation } from "./dashboardWhatsNextPresentation";
import type { CreatorSigningProgressSnapshot } from "./creatorDashboardSigningProgress";
import {
  creatorDashboardShouldPrepareSignatureLinksFromTrack,
  creatorDashboardShowManageRecipients,
  creatorDashboardWhatsNextShowPrimaryCta,
  creatorDashboardWhatsNextShowViewAgreement,
  resolveCreatorDashboardSignatureTrackAction,
  resolveCreatorDashboardViewAgreementPath,
} from "./creatorDashboardSignatureTrack";

type Props = {
  row: WorkspaceIndexAgreement;
  reviewRows: readonly OwnerReviewPartyStatusRow[];
  draft?: AgreementDraft | null;
  onPrimaryAction: (row: WorkspaceIndexAgreement) => void;
  onNavigate?: (path: string) => void;
  onPrepareSignatureLinks?: (agreementId: string) => void;
  prepareBusy?: boolean;
  prepareNotice?: string | null;
  signingProgress?: CreatorSigningProgressSnapshot | null;
};

export function DashboardWhatsNextPanel(props: Props) {
  const {
    row,
    reviewRows,
    draft = null,
    onPrimaryAction,
    onNavigate,
    onPrepareSignatureLinks,
    prepareBusy = false,
    prepareNotice = null,
    signingProgress = null,
  } = props;
  const [manageRecipientsOpen, setManageRecipientsOpen] = useState(false);

  if (creatorDashboardReviewHydrationPending(row, reviewRows, draft)) {
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

  const reviewGate = resolveCreatorDashboardReviewGate(row, reviewRows, { draft });
  const presentation = deriveDashboardWhatsNextPresentation(row, reviewGate, signingProgress);
  const manualReviewLinkPage = creatorDashboardUsesManualReviewLinkPage();
  const trackAction = resolveCreatorDashboardSignatureTrackAction(row, reviewGate, {
    draft,
    manualReviewLinkPage,
    signingProgress,
  });
  const statusPill = deriveCreatorDashboardStatusPillFromGate(row, reviewGate, signingProgress);
  const signingStatus = deriveCreatorSigningStatusLabel(row, signingProgress);
  const showPrepare =
    Boolean(onPrepareSignatureLinks) &&
    creatorDashboardShouldPrepareSignatureLinksFromTrack(row, reviewGate, draft);
  const showPrimaryCta = creatorDashboardWhatsNextShowPrimaryCta(reviewGate, trackAction);
  const showViewAgreement = creatorDashboardWhatsNextShowViewAgreement(row, reviewGate, trackAction);
  const showManageRecipients = creatorDashboardShowManageRecipients(row, reviewGate);

  const handleCtaClick = () => {
    logDashboardWhatsNextCtaClick({
      agreementId: row.id,
      action: trackAction.kind,
      targetRoute: trackAction.path,
    });
    if (showPrepare && onPrepareSignatureLinks) {
      onPrepareSignatureLinks(row.id);
      return;
    }
    if (trackAction.kind === "focus_review_status") {
      onPrimaryAction(row);
      return;
    }
    if (trackAction.kind === "prepare_signature_links" && onPrepareSignatureLinks) {
      onPrepareSignatureLinks(row.id);
      return;
    }
    if (onNavigate) {
      onNavigate(trackAction.path);
      return;
    }
    onPrimaryAction(row);
  };

  const handleViewAgreementClick = () => {
    const path = resolveCreatorDashboardViewAgreementPath(row.id);
    logDashboardWhatsNextCtaClick({
      agreementId: row.id,
      action: "view_agreement",
      targetRoute: path,
    });
    if (onNavigate) {
      onNavigate(path);
      return;
    }
    onPrimaryAction(row);
  };

  const handleManageRecipientsClick = () => {
    logDashboardWhatsNextCtaClick({
      agreementId: row.id,
      action: "manage_recipients",
      targetRoute: "",
    });
    setManageRecipientsOpen((open) => !open);
  };

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
          {showPrimaryCta ? (
            <button
              type="button"
              className="vs01-btn vs01-btn--primary vs01-btn--compact min-w-[11rem]"
              data-testid={`creator-dashboard-action-${row.id}`}
              data-dashboard-whats-next-cta={trackAction.kind}
              disabled={showPrepare ? prepareBusy : false}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleCtaClick();
              }}
            >
              {showPrepare && prepareBusy ? "Preparing…" : trackAction.label}
            </button>
          ) : (
            <span
              className="sr-only"
              data-testid={`creator-dashboard-action-hidden-${row.id}`}
              data-dashboard-whats-next-cta="hidden"
            >
              No action while waiting for reviewer
            </span>
          )}
          {showViewAgreement ? (
            <button
              type="button"
              className="text-sm font-medium text-slate-300 underline-offset-4 transition-colors hover:text-white hover:underline"
              data-testid={`creator-dashboard-view-agreement-${row.id}`}
              data-dashboard-whats-next-cta="view_agreement"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleViewAgreementClick();
              }}
            >
              {CREATOR_VIEW_AGREEMENT_LABEL}
            </button>
          ) : null}
          {showManageRecipients ? (
            <button
              type="button"
              className="text-sm font-medium text-amber-200/95 underline-offset-4 transition-colors hover:text-amber-100 hover:underline"
              data-testid={`creator-dashboard-manage-recipients-${row.id}`}
              data-dashboard-whats-next-cta="manage_recipients"
              aria-expanded={manageRecipientsOpen}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleManageRecipientsClick();
              }}
            >
              {manageRecipientsOpen ? "Hide recipients" : CREATOR_MANAGE_RECIPIENTS_LABEL}
            </button>
          ) : null}
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
      {showManageRecipients && manageRecipientsOpen ? (
        <div className="mt-5 border-t border-slate-800/80 pt-5" data-testid={`dashboard-whats-next-recipients-${row.id}`}>
          <RecipientControlCenter agreementId={row.id} phase="review" title="Recipient delivery" />
        </div>
      ) : null}
    </section>
  );
}
