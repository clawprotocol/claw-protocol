import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./AppShell";
import { useLaunchNav } from "./LaunchNavContext";
import {
  fetchWorkspaceIndex,
  fetchAgreementDraft,
  type WorkspaceIndexAgreement,
} from "../agreement/agreementWorkspaceApi";
import { dedupeWorkspaceIndexAgreements } from "./workspaceIndexDedupe";
import {
  clearLawdogEntryContext,
  resolveLawdogEntryContext,
  setLawdogFocusCreateIntakeAfterNavigation,
} from "./lawdogEntryContext";
import { canAccessOperatorGrowthDashboard } from "./ops/OperatorGrowthDashboard";
import { CreatorDashboardAgreementList } from "./CreatorDashboardAgreementList";
import {
  countCreatorReviewApproved,
  creatorDashboardAllPartiesApproved,
  creatorDashboardReviewRowsFromDraft,
  deriveCreatorDashboardStatus,
  sortCreatorDashboardRows,
} from "./creatorDashboardPresentation";
import { logCreatorDashboardAgreementStatusLoaded } from "./creatorDashboardCopy";
import { navigateCreatorPrepareSignatureLinks } from "./creatorDashboardPrepareSignatureLinks";
import type { OwnerReviewPartyStatusRow } from "./simpleProduct/ownerReviewPartyStatusChecklist";
import { workspaceAgreementStatusBadge } from "./workspaceAgreementCard";

export type WorkspaceMode = "empty" | "active" | "power";

/** Lightweight workspace phase from data already on the dashboard (no new APIs). */
export function getWorkspaceMode(
  recent: WorkspaceIndexAgreement[],
  indexLoading: boolean,
): WorkspaceMode {
  if (indexLoading) return "active";
  const n = recent.length;
  if (n === 0) return "empty";
  if (n >= 4) return "power";
  return "active";
}

/** Status line for recent-agreement rows (workspace index). */
export function workspaceAgreementStatusLabel(r: WorkspaceIndexAgreement): string {
  return workspaceAgreementStatusBadge(r);
}

export function AppDashboard() {
  const { navigate, pathname } = useLaunchNav();
  const [rows, setRows] = useState<WorkspaceIndexAgreement[]>([]);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [indexLoading, setIndexLoading] = useState(true);
  const [reviewRowsByAgreementId, setReviewRowsByAgreementId] = useState<
    Record<string, OwnerReviewPartyStatusRow[]>
  >({});
  const [prepareBusyAgreementId, setPrepareBusyAgreementId] = useState<string | null>(null);
  const draftingRedirectedRef = useRef(false);

  const reloadWorkspaceIndex = useCallback(async () => {
    setIndexLoading(true);
    setIndexError(null);
    const { agreements, error } = await fetchWorkspaceIndex();
    setRows(dedupeWorkspaceIndexAgreements(agreements));
    setIndexError(error);
    setIndexLoading(false);
  }, []);

  useEffect(() => {
    void reloadWorkspaceIndex();
  }, [reloadWorkspaceIndex]);

  const safeRecent = useMemo(() => sortCreatorDashboardRows(rows), [rows]);
  const mode = useMemo(() => getWorkspaceMode(safeRecent, indexLoading), [safeRecent, indexLoading]);
  const primaryRow = safeRecent[0] ?? null;
  const otherRows = safeRecent.length > 1 ? safeRecent.slice(1) : [];

  const entryResolved = useMemo(
    () => resolveLawdogEntryContext(safeRecent.length, indexLoading),
    [safeRecent.length, indexLoading],
  );

  useEffect(() => {
    const path = (pathname || "").replace(/\/$/, "") || "/";
    if (path !== "/app") draftingRedirectedRef.current = false;
  }, [pathname]);

  useEffect(() => {
    if (draftingRedirectedRef.current) return;
    if (entryResolved !== "drafting") return;
    const path = (pathname || "").replace(/\/$/, "") || "/";
    if (path !== "/app") return;
    draftingRedirectedRef.current = true;
    setLawdogFocusCreateIntakeAfterNavigation();
    navigate("/app/create");
  }, [entryResolved, pathname, navigate]);

  useEffect(() => {
    if (indexLoading || safeRecent.length === 0) return;
    let cancel = false;
    void (async () => {
      const targets = safeRecent.filter((row) => {
        const status = deriveCreatorDashboardStatus(row);
        return status === "in_review" || status === "ready_for_signing" || status === "review_approved";
      });
      if (targets.length === 0) return;
      const entries = await Promise.all(
        targets.map(async (row) => {
          const { draft } = await fetchAgreementDraft(row.id);
          return [row.id, creatorDashboardReviewRowsFromDraft(draft)] as const;
        }),
      );
      if (cancel) return;
      setReviewRowsByAgreementId((prev) => {
        const next = { ...prev };
        for (const [id, reviewRows] of entries) {
          next[id] = reviewRows;
        }
        return next;
      });
    })();
    return () => {
      cancel = true;
    };
  }, [indexLoading, safeRecent]);

  useEffect(() => {
    if (indexLoading) return;
    for (const row of safeRecent) {
      const reviewRows = reviewRowsByAgreementId[row.id] ?? [];
      const status = deriveCreatorDashboardStatus(row);
      const allApproved = creatorDashboardAllPartiesApproved(row, reviewRows);
      if (status !== "ready_for_signing" || !allApproved) continue;
      logCreatorDashboardAgreementStatusLoaded({
        agreementId: row.id,
        approvedCount: countCreatorReviewApproved(row, reviewRows),
        partyCount: row.party_count || reviewRows.length || row.review_approvals_required || 0,
        nextAction: "prepare_signature_links",
      });
    }
  }, [indexLoading, safeRecent, reviewRowsByAgreementId]);

  const withClearEntry = useCallback((fn: () => void) => {
    clearLawdogEntryContext();
    fn();
  }, []);

  const handlePrepareSignatureLinks = useCallback(
    async (agreementId: string) => {
      const id = agreementId.trim();
      if (!id || prepareBusyAgreementId) return;
      setPrepareBusyAgreementId(id);
      try {
        await navigateCreatorPrepareSignatureLinks({
          agreementId: id,
          navigate: (path) => withClearEntry(() => navigate(path)),
        });
      } finally {
        setPrepareBusyAgreementId(null);
      }
    },
    [navigate, prepareBusyAgreementId, withClearEntry],
  );

  return (
    <AppShell
      title="Dashboard"
      subtitle="Track agreements you created, review approvals, and signing readiness."
    >
      {indexError ? (
        <div
          className="mb-6 rounded-xl border border-amber-800/40 bg-amber-950/25 px-4 py-3 text-sm text-amber-100"
          role="alert"
        >
          <p className="font-medium">We couldn&apos;t refresh your agreement list.</p>
          <p className="mt-1 text-amber-100/90">{indexError}</p>
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary vs01-btn--compact mt-3"
            onClick={() => void reloadWorkspaceIndex()}
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-3xl">
        {indexLoading ? (
          <p className="text-sm text-slate-400">Loading agreements…</p>
        ) : safeRecent.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed border-slate-800/80 bg-slate-950/20 px-6 py-10 text-center"
            data-testid="creator-dashboard-empty"
          >
            <p className="text-base font-medium text-slate-200">No agreements yet</p>
            <p className="mt-2 text-sm text-slate-500">Create your first agreement to begin.</p>
            <button
              type="button"
              className="vs01-btn vs01-btn--primary mt-5"
              onClick={() => withClearEntry(() => navigate("/app/create"))}
            >
              Create agreement
            </button>
          </div>
        ) : (
          <>
            <section aria-label="Current agreement" data-testid="creator-dashboard-primary">
              <CreatorDashboardAgreementList
                rows={primaryRow ? [primaryRow] : []}
                reviewRowsByAgreementId={reviewRowsByAgreementId}
                onNavigate={(path) => withClearEntry(() => navigate(path))}
                onPrepareSignatureLinks={handlePrepareSignatureLinks}
                prepareBusyAgreementId={prepareBusyAgreementId}
                featured
              />
            </section>
            {otherRows.length > 0 ? (
              <section className="mt-8" aria-labelledby="creator-dashboard-other-agreements-heading">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <h2
                    id="creator-dashboard-other-agreements-heading"
                    className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500"
                  >
                    Other agreements
                  </h2>
                  {mode !== "empty" ? (
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                      onClick={() => withClearEntry(() => navigate("/app/create"))}
                    >
                      New agreement
                    </button>
                  ) : null}
                </div>
                <CreatorDashboardAgreementList
                  rows={otherRows}
                  reviewRowsByAgreementId={reviewRowsByAgreementId}
                  onNavigate={(path) => withClearEntry(() => navigate(path))}
                  onPrepareSignatureLinks={handlePrepareSignatureLinks}
                  prepareBusyAgreementId={prepareBusyAgreementId}
                />
              </section>
            ) : (
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                  onClick={() => withClearEntry(() => navigate("/app/create"))}
                >
                  New agreement
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {canAccessOperatorGrowthDashboard() ? (
        <p className="mt-10 text-center text-[11px] text-slate-600">
          <span className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <button
              type="button"
              className="underline underline-offset-2 hover:text-slate-400"
              onClick={() => withClearEntry(() => navigate("/app/ops/growth"))}
            >
              Internal — growth funnel
            </button>
          </span>
        </p>
      ) : null}
    </AppShell>
  );
}
