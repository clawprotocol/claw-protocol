/**
 * Home dashboard load budget — keep first paint fast even with many agreements.
 * Full history stays available via “Show all” / Agreements tab.
 */

import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { creatorDashboardNeedsAuthoritativeReviewHydration } from "./creatorDashboardReviewGate";
import { deriveCreatorDashboardStatus } from "./creatorDashboardPresentation";

/** Agreements shown in the home “All agreements” table before expand. */
export const DASHBOARD_HOME_TABLE_PAGE_SIZE = 5;

/** Max draft/review hydrations on first paint (featured + attention first). */
export const DASHBOARD_PRIORITY_HYDRATION_LIMIT = 4;

/** Max secondary “needs attention” cards under What’s next. */
export const DASHBOARD_SECONDARY_ATTENTION_LIMIT = 3;

/** Background refresh interval while dashboard is open (ms). */
export const DASHBOARD_REVIEW_REFRESH_INTERVAL_MS = 45_000;

function rowNeedsReviewHydration(row: WorkspaceIndexAgreement): boolean {
  if (creatorDashboardNeedsAuthoritativeReviewHydration(row)) return true;
  const status = deriveCreatorDashboardStatus(row);
  return status === "draft" || status === "ready_for_signing" || status === "review_approved";
}

/**
 * Prefer featured + attention + recent draft/signing rows; hard-cap count so
 * N agreements do not fan out into N parallel draft GETs on every visit.
 */
export function selectDashboardPriorityHydrationRows(args: {
  featuredId?: string | null;
  attentionRows?: readonly WorkspaceIndexAgreement[];
  activeRows: readonly WorkspaceIndexAgreement[];
  limit?: number;
}): WorkspaceIndexAgreement[] {
  const limit = Math.max(1, args.limit ?? DASHBOARD_PRIORITY_HYDRATION_LIMIT);
  const seen = new Set<string>();
  const out: WorkspaceIndexAgreement[] = [];
  const push = (row: WorkspaceIndexAgreement | null | undefined) => {
    if (!row || seen.has(row.id) || out.length >= limit) return;
    seen.add(row.id);
    out.push(row);
  };

  const featuredId = (args.featuredId || "").trim();
  if (featuredId) {
    push(args.activeRows.find((row) => row.id === featuredId) ?? null);
  }
  for (const row of args.attentionRows ?? []) push(row);
  for (const row of args.activeRows) {
    if (rowNeedsReviewHydration(row)) push(row);
  }
  return out;
}

export function sliceDashboardHomeTableRows(
  rows: readonly WorkspaceIndexAgreement[],
  showAll: boolean,
  pageSize: number = DASHBOARD_HOME_TABLE_PAGE_SIZE,
): WorkspaceIndexAgreement[] {
  if (showAll || rows.length <= pageSize) return [...rows];
  return rows.slice(0, pageSize);
}
