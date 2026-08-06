import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { readCreateReviewAgreementResumeId } from "../components/agreements/agreementIntakeStorage";
import { getLawdogEntryContextStored } from "./lawdogEntryContext";
import {
  filterSupersededStaleDraftWorkspaceRows,
} from "./supersededStaleDraftWorkspaceRows";
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

/**
 * Hide sibling draft rows only when the featured agreement is already in the
 * post-intake pipeline (review sent / signing). Peer drafts from separate creates
 * must remain visible — resume focus alone must not collapse the dashboard to one card.
 */
export function shouldTrimSiblingCreatorDashboardDrafts(
  featuredRow: WorkspaceIndexAgreement | null,
): boolean {
  if (!featuredRow) return false;
  if (!isLegitimateAdditionalCreatorDashboardAgreement(featuredRow)) return false;
  return Boolean((featuredRow.review_sent_at || "").trim());
}

export function filterCreatorDashboardAgreements(
  rows: readonly WorkspaceIndexAgreement[],
): CreatorDashboardAgreementFilterResult {
  const dedupedRows = filterSupersededStaleDraftWorkspaceRows(rows);
  const sorted = sortCreatorDashboardRows(dedupedRows);
  const featuredAgreementId = resolveCreatorDashboardFeaturedAgreementId(sorted);
  const featuredRow = featuredAgreementId
    ? sorted.find((row) => row.id === featuredAgreementId) ?? null
    : null;
  const trimSiblingDrafts = shouldTrimSiblingCreatorDashboardDrafts(featuredRow);

  if (!trimSiblingDrafts) {
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
