import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { readCreateReviewAgreementResumeId } from "../components/agreements/agreementIntakeStorage";
import { getLawdogEntryContextStored } from "./lawdogEntryContext";
import {
  deriveCreatorDashboardStatus,
  sortCreatorDashboardRows,
  type CreatorDashboardStatus,
} from "./creatorDashboardPresentation";

export type CreatorDashboardAgreementFilterResult = {
  featuredAgreementId: string | null;
  visibleRows: WorkspaceIndexAgreement[];
  hiddenStaleCount: number;
};

const ACTIVE_PIPELINE_STATUSES = new Set<CreatorDashboardStatus>([
  "in_review",
  "review_approved",
  "ready_for_signing",
  "signing_in_progress",
]);

export function isLegitimateAdditionalCreatorDashboardAgreement(
  row: WorkspaceIndexAgreement,
): boolean {
  const status = deriveCreatorDashboardStatus(row);
  return ACTIVE_PIPELINE_STATUSES.has(status);
}

export function resolveCreatorDashboardFeaturedAgreementId(
  rows: readonly WorkspaceIndexAgreement[],
): string | null {
  const sorted = sortCreatorDashboardRows(rows);
  const resumeId = readCreateReviewAgreementResumeId();
  if (resumeId && sorted.some((row) => row.id === resumeId)) return resumeId;

  const pipelineRow = sorted.find((row) => isLegitimateAdditionalCreatorDashboardAgreement(row));
  if (pipelineRow) return pipelineRow.id;

  return sorted[0]?.id ?? null;
}

export function shouldFocusCreatorDashboardOnSingleAgreement(): boolean {
  const entry = getLawdogEntryContextStored();
  return entry === "new" || Boolean(readCreateReviewAgreementResumeId());
}

export function filterCreatorDashboardAgreements(
  rows: readonly WorkspaceIndexAgreement[],
): CreatorDashboardAgreementFilterResult {
  const sorted = sortCreatorDashboardRows(rows);
  const featuredAgreementId = resolveCreatorDashboardFeaturedAgreementId(sorted);
  const resumeId = (readCreateReviewAgreementResumeId() || "").trim();
  const focusSingle = shouldFocusCreatorDashboardOnSingleAgreement();

  if (resumeId && focusSingle) {
    const featured = featuredAgreementId && sorted.some((row) => row.id === featuredAgreementId)
      ? featuredAgreementId
      : resumeId;
    const visibleRows = sorted.filter((row) => row.id === featured);
    return {
      featuredAgreementId: featured,
      visibleRows,
      hiddenStaleCount: Math.max(0, sorted.length - visibleRows.length),
    };
  }

  const featuredRow = featuredAgreementId
    ? sorted.find((row) => row.id === featuredAgreementId) ?? null
    : null;
  const trimStaleDrafts =
    focusSingle ||
    Boolean(
      featuredRow &&
        isLegitimateAdditionalCreatorDashboardAgreement(featuredRow) &&
        Boolean((featuredRow.review_sent_at || "").trim()),
    );

  if (!trimStaleDrafts) {
    return {
      featuredAgreementId,
      visibleRows: sorted,
      hiddenStaleCount: 0,
    };
  }

  const visibleRows = sorted.filter((row) => {
    if (row.id === featuredAgreementId) return true;
    return isLegitimateAdditionalCreatorDashboardAgreement(row);
  });

  return {
    featuredAgreementId,
    visibleRows,
    hiddenStaleCount: sorted.length - visibleRows.length,
  };
}

let lastCreatorDashboardAgreementFilterLogKey = "";

export function logCreatorDashboardAgreementFilter(payload: {
  totalLoaded: number;
  shownCount: number;
  hiddenStaleCount: number;
  featuredAgreementId: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(payload);
  if (key === lastCreatorDashboardAgreementFilterLogKey) return;
  lastCreatorDashboardAgreementFilterLogKey = key;
  const id = (payload.featuredAgreementId || "").trim();
  // eslint-disable-next-line no-console
  console.info("[creator-dashboard-agreement-filter]", {
    totalLoaded: payload.totalLoaded,
    shownCount: payload.shownCount,
    hiddenStaleCount: payload.hiddenStaleCount,
    featuredAgreementIdShort: id.length <= 12 ? id || null : `${id.slice(0, 8)}…`,
  });
}
