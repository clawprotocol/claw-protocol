import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import {
  deriveCreatorNextActionLabel,
  displayCreatorAgreementTitle,
  type CreatorDashboardStatus,
} from "./creatorDashboardPresentation";
import { deriveCreatorDashboardEffectiveStatus } from "./creatorDashboardSignatureTrack";
import {
  creatorDashboardWaitingOnReviewer,
  type CreatorDashboardReviewGate,
} from "./creatorDashboardReviewGate";
import {
  isAgreementCompletedForDashboard,
} from "./creatorDashboardAgreementCompletion";
import {
  formatCreatorSigningProgressLabel,
  resolveCreatorSigningProgressSnapshot,
  type CreatorSigningProgressSnapshot,
} from "./creatorDashboardSigningProgress";
import {
  isAgreementPacketPrepared,
} from "../vs01/vs01WorkspaceSigningStatus";
import { formatCreatorReviewProgressLabel } from "./creatorDashboardReviewGate";

export type AgreementTimelineStepId =
  | "draft_created"
  | "review_sent"
  | "reviews_approved"
  | "signature_links_prepared"
  | "signed";

export type AgreementTimelineStepState = "complete" | "current" | "upcoming";

export type AgreementTimelineStep = {
  id: AgreementTimelineStepId;
  label: string;
  state: AgreementTimelineStepState;
};

export type DashboardWhatsNextPresentation = {
  agreementId: string;
  agreementTitle: string;
  status: CreatorDashboardStatus;
  headline: string;
  progressLine: string | null;
  nextStepLabel: string;
  timeline: AgreementTimelineStep[];
};

const TIMELINE_LABELS: Record<AgreementTimelineStepId, string> = {
  draft_created: "Draft Created",
  review_sent: "Review Sent",
  reviews_approved: "Reviews Approved",
  signature_links_prepared: "Signature Links Prepared",
  signed: "Signed",
};

export function resolveDashboardFeaturedAgreementId(
  featuredAgreementId: string | null,
  attentionRows: readonly WorkspaceIndexAgreement[],
  allRows: readonly WorkspaceIndexAgreement[],
): string | null {
  const featured = (featuredAgreementId || "").trim();
  if (featured && allRows.some((row) => row.id === featured)) return featured;
  return attentionRows[0]?.id ?? allRows[0]?.id ?? null;
}

function pendingReviewerNames(reviewGate: CreatorDashboardReviewGate): string[] {
  return reviewGate.partyStatuses
    .filter((p) => p.status !== "approved")
    .map((p) => p.displayName)
    .filter(Boolean);
}

function effectiveStatus(
  row: WorkspaceIndexAgreement,
  reviewGate: CreatorDashboardReviewGate,
): CreatorDashboardStatus {
  return deriveCreatorDashboardEffectiveStatus(row, reviewGate);
}

export function deriveWhatsNextHeadline(
  row: WorkspaceIndexAgreement,
  reviewGate: CreatorDashboardReviewGate,
  serverProgress?: CreatorSigningProgressSnapshot | null,
): string {
  const status = effectiveStatus(row, reviewGate);
  const title = displayCreatorAgreementTitle(row.title);

  if (status === "completed") return "Agreement fully signed";
  if (status === "signing_in_progress") {
    const progress = resolveCreatorSigningProgressSnapshot(row, serverProgress ?? null);
    if (progress?.partiallySigned) {
      return "Waiting for remaining signatures";
    }
    return "Waiting for signatures";
  }
  if (status === "ready_for_signing" || status === "review_approved") {
    return "All reviews complete";
  }
  if (status === "in_review") {
    const pending = pendingReviewerNames(reviewGate);
    if (pending.length === 1) return `Review requested from ${pending[0]}`;
    if (pending.length > 1) return `Review requested from ${pending.length} parties`;
    return `Review in progress for ${title}`;
  }
  return `Continue working on ${title}`;
}

export function deriveWhatsNextProgressLine(
  row: WorkspaceIndexAgreement,
  reviewGate: CreatorDashboardReviewGate,
  serverProgress?: CreatorSigningProgressSnapshot | null,
): string | null {
  const status = effectiveStatus(row, reviewGate);
  if (status === "in_review" && reviewGate.authoritative && reviewGate.requiredPartyCount > 0) {
    return formatCreatorReviewProgressLabel(reviewGate);
  }
  if (status === "ready_for_signing" || status === "review_approved") {
    return "All required reviews are complete";
  }
  if (status === "signing_in_progress") {
    const progress = resolveCreatorSigningProgressSnapshot(row, serverProgress ?? null);
    if (progress && progress.requiredCount > 0) {
      return formatCreatorSigningProgressLabel(progress);
    }
    return "Signature links have been sent. Track who has signed and who is still pending.";
  }
  if (status === "completed") {
    return "All required parties have signed. Your proof record is ready.";
  }
  return null;
}

export function deriveWhatsNextNextStep(
  row: WorkspaceIndexAgreement,
  reviewGate: CreatorDashboardReviewGate,
): string {
  const status = effectiveStatus(row, reviewGate);
  if (status === "signing_in_progress") return "View signing status";
  if (status === "completed") return "View signed agreement or download proof";
  if (status === "ready_for_signing" || status === "review_approved") {
    return "Prepare and send signing links";
  }
  if (status === "in_review") {
    if (reviewGate.hasOpenChangeRequests) return "Review suggested changes";
    if (creatorDashboardWaitingOnReviewer(reviewGate)) return "Wait for remaining reviewer";
    if (
      reviewGate.authoritative &&
      reviewGate.requiredPartyCount > 0 &&
      reviewGate.approvedCount < reviewGate.requiredPartyCount
    ) {
      return "Wait for reviewer approval";
    }
  }
  return deriveCreatorNextActionLabel(row, reviewGate);
}

function stepComplete(id: AgreementTimelineStepId, row: WorkspaceIndexAgreement, reviewGate: CreatorDashboardReviewGate): boolean {
  switch (id) {
    case "draft_created":
      return Boolean(row.created_at || row.updated_at);
    case "review_sent":
      return Boolean(row.review_sent_at);
    case "reviews_approved":
      return reviewGate.allRequiredReviewPartiesApproved || row.all_reviewers_approved === true;
    case "signature_links_prepared":
      return row.has_server_signing_lock || isAgreementPacketPrepared(row.id);
    case "signed":
      return isAgreementCompletedForDashboard(row);
    default:
      return false;
  }
}

export function deriveAgreementProgressTimeline(
  row: WorkspaceIndexAgreement,
  reviewGate: CreatorDashboardReviewGate,
): AgreementTimelineStep[] {
  const order: AgreementTimelineStepId[] = [
    "draft_created",
    "review_sent",
    "reviews_approved",
    "signature_links_prepared",
    "signed",
  ];
  const completed = order.map((id) => stepComplete(id, row, reviewGate));
  let currentIndex = completed.findIndex((done) => !done);
  if (currentIndex < 0) currentIndex = order.length - 1;

  return order.map((id, index) => {
    let state: AgreementTimelineStepState = "upcoming";
    if (completed[index]) state = "complete";
    else if (index === currentIndex) state = "current";
    return { id, label: TIMELINE_LABELS[id], state };
  });
}

export function deriveDashboardWhatsNextPresentation(
  row: WorkspaceIndexAgreement,
  reviewGate: CreatorDashboardReviewGate,
  serverProgress?: CreatorSigningProgressSnapshot | null,
): DashboardWhatsNextPresentation {
  return {
    agreementId: row.id,
    agreementTitle: displayCreatorAgreementTitle(row.title),
    status: effectiveStatus(row, reviewGate),
    headline: deriveWhatsNextHeadline(row, reviewGate, serverProgress),
    progressLine: deriveWhatsNextProgressLine(row, reviewGate, serverProgress),
    nextStepLabel: deriveWhatsNextNextStep(row, reviewGate),
    timeline: deriveAgreementProgressTimeline(row, reviewGate),
  };
}
