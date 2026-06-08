import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./AppShell";
import { useLaunchNav } from "./LaunchNavContext";
import {
  fetchWorkspaceIndex,
  fetchAgreementDraft,
  fetchAgreementDraftWithSigningLock,
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
  creatorDashboardReviewRowsFromDraft,
  deriveCreatorDashboardStatusPillFromGate,
  resolveCreatorDashboardIndexPreviewForDiagnostics,
  resolveEffectiveCreatorDashboardReviewRows,
  sortCreatorDashboardRows,
} from "./creatorDashboardPresentation";
import {
  creatorDashboardNeedsAuthoritativeReviewHydration,
  resolveCreatorDashboardReviewGate,
} from "./creatorDashboardReviewGate";
import {
  filterCreatorDashboardAgreements,
  logCreatorDashboardAgreementFilter,
} from "./creatorDashboardAgreementFilter";
import {
  CREATOR_PREPARE_BRIDGE_FAILED_NOTICE,
  CREATOR_PREPARE_SIGNATURE_LINKS_BLOCKED_NOTICE,
  logCreatorDashboardAgreementStatusLoaded,
  logCreatorDashboardPrepareBridgeResult,
  logCreatorDashboardPrepareClick,
  logCreatorDashboardPrepareNavigationBlocked,
  logCreatorDashboardReviewGate,
  logDashboardInitialState,
  logDashboardPostReviewGateState,
} from "./creatorDashboardCopy";
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
  const [prepareNoticeByAgreementId, setPrepareNoticeByAgreementId] = useState<Record<string, string>>({});
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

  const filteredDashboard = useMemo(() => filterCreatorDashboardAgreements(rows), [rows]);
  const safeRecent = useMemo(
    () => sortCreatorDashboardRows(filteredDashboard.visibleRows),
    [filteredDashboard.visibleRows],
  );
  const mode = useMemo(() => getWorkspaceMode(safeRecent, indexLoading), [safeRecent, indexLoading]);
  const primaryRow = useMemo(() => {
    const featuredId = filteredDashboard.featuredAgreementId;
    if (featuredId) {
      const featured = safeRecent.find((row) => row.id === featuredId);
      if (featured) return featured;
    }
    return safeRecent[0] ?? null;
  }, [filteredDashboard.featuredAgreementId, safeRecent]);
  const otherRows = useMemo(
    () => (primaryRow ? safeRecent.filter((row) => row.id !== primaryRow.id) : []),
    [primaryRow, safeRecent],
  );

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
    if (indexLoading) return;
    logCreatorDashboardAgreementFilter({
      totalLoaded: rows.length,
      shownCount: filteredDashboard.visibleRows.length,
      hiddenStaleCount: filteredDashboard.hiddenStaleCount,
      featuredAgreementId: filteredDashboard.featuredAgreementId,
    });
  }, [indexLoading, rows.length, filteredDashboard]);

  useEffect(() => {
    if (indexLoading || safeRecent.length === 0) return;
    let cancel = false;
    void (async () => {
      const targets = safeRecent.filter((row) => creatorDashboardNeedsAuthoritativeReviewHydration(row));
      const missing = targets.filter((row) => !(reviewRowsByAgreementId[row.id]?.length));
      if (missing.length === 0) return;
      const entries = await Promise.all(
        missing.map(async (row) => {
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
  }, [indexLoading, safeRecent, reviewRowsByAgreementId]);

  useEffect(() => {
    if (indexLoading) return;
    for (const row of safeRecent) {
      if (!creatorDashboardNeedsAuthoritativeReviewHydration(row)) continue;
      const preview = resolveCreatorDashboardIndexPreviewForDiagnostics(row);
      logDashboardInitialState({
        agreementId: row.id,
        approvedCount: preview.approvedCount,
        requiredPartyCount: preview.requiredPartyCount,
        allApproved: preview.allApproved,
        statusPill: preview.statusPill,
        source: "workspace_index",
      });
    }
  }, [indexLoading, safeRecent]);

  useEffect(() => {
    if (indexLoading) return;
    for (const row of safeRecent) {
      const reviewRows = reviewRowsByAgreementId[row.id] ?? [];
      const reviewGate = resolveCreatorDashboardReviewGate(row, reviewRows);
      if (!reviewGate.authoritative) continue;
      const waitingOnReviewer = reviewGate.approvedCount > 0 && !reviewGate.allRequiredReviewPartiesApproved;
      const statusPill = deriveCreatorDashboardStatusPillFromGate(row, reviewGate);
      logDashboardPostReviewGateState({
        agreementId: row.id,
        approvedCount: reviewGate.approvedCount,
        requiredPartyCount: reviewGate.requiredPartyCount,
        allApproved: reviewGate.allRequiredReviewPartiesApproved,
        statusPill,
        source: reviewGate.source,
      });
      logCreatorDashboardReviewGate({
        agreementId: row.id,
        requiredPartyCount: reviewGate.requiredPartyCount,
        approvedCount: reviewGate.approvedCount,
        allApproved: reviewGate.allRequiredReviewPartiesApproved,
        partyStatuses: reviewGate.partyStatuses.map((party) => ({
          displayName: party.displayName,
          statusLabel: party.statusLabel,
        })),
        prepareSignatureLinksVisible:
          reviewGate.allRequiredReviewPartiesApproved || waitingOnReviewer,
        prepareSignatureLinksEnabled: reviewGate.allRequiredReviewPartiesApproved,
        source: reviewGate.source,
      });
      if (!reviewGate.allRequiredReviewPartiesApproved) continue;
      logCreatorDashboardAgreementStatusLoaded({
        agreementId: row.id,
        approvedCount: reviewGate.approvedCount,
        partyCount: reviewGate.requiredPartyCount,
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
      setPrepareNoticeByAgreementId((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });

      try {
        const indexRow = rows.find((entry) => entry.id === id);
        const cachedReviewRows = reviewRowsByAgreementId[id] ?? [];
        const { ok, draft, lockedVersionId } = await fetchAgreementDraftWithSigningLock(id);
        const fetchedReviewRows = creatorDashboardReviewRowsFromDraft(draft);
        const reviewRows = resolveEffectiveCreatorDashboardReviewRows(draft, cachedReviewRows);
        const usedCachedReviewRows = fetchedReviewRows.length === 0 && cachedReviewRows.length > 0;
        const reviewGate = resolveCreatorDashboardReviewGate(
          indexRow ?? {
            id,
            title: "",
            updated_at: new Date(0).toISOString(),
            party_count: draft?.parties?.length ?? reviewRows.length,
            signer_count: 0,
            version_ledger_count: 0,
            completed_signed: false,
            has_server_signing_lock: false,
            locked_version_id: null,
            workspace_archived_at: null,
            review_sent_at: null,
          },
          reviewRows,
        );
        const hasSnapshot = Boolean(
          (draft?.premium_full_document_text || "").trim() ||
            (draft?.versions?.length ?? 0) > 0 ||
            Boolean((draft as { additional_terms?: string } | null)?.additional_terms?.trim()),
        );

        logCreatorDashboardPrepareClick({
          agreementId: id,
          hasDraft: ok && Boolean(draft),
          hasSnapshot,
          reviewApprovedCount: reviewGate.approvedCount,
          partyCount: reviewGate.requiredPartyCount,
          reviewSource: reviewGate.source,
          usedCachedReviewRows,
        });

        logCreatorDashboardReviewGate({
          agreementId: id,
          requiredPartyCount: reviewGate.requiredPartyCount,
          approvedCount: reviewGate.approvedCount,
          allApproved: reviewGate.allRequiredReviewPartiesApproved,
          partyStatuses: reviewGate.partyStatuses.map((party) => ({
            displayName: party.displayName,
            statusLabel: party.statusLabel,
          })),
          prepareSignatureLinksVisible: true,
          prepareSignatureLinksEnabled: reviewGate.allRequiredReviewPartiesApproved,
          source: `${reviewGate.source}:prepare_click`,
        });

        if (!reviewGate.allRequiredReviewPartiesApproved) {
          logCreatorDashboardPrepareNavigationBlocked({
            agreementId: id,
            reason: "review_gate_not_all_approved",
            reviewApprovedCount: reviewGate.approvedCount,
            partyCount: reviewGate.requiredPartyCount,
            allApproved: false,
          });
          setPrepareNoticeByAgreementId((prev) => ({
            ...prev,
            [id]: CREATOR_PREPARE_SIGNATURE_LINKS_BLOCKED_NOTICE,
          }));
          return;
        }

        clearLawdogEntryContext();
        const bridgeResult = await navigateCreatorPrepareSignatureLinks({
          agreementId: id,
          navigate: (path) => navigate(path),
          draft: ok ? draft : null,
          lockedVersionId,
          navigateOnBridgeFailure: false,
        });

        logCreatorDashboardPrepareBridgeResult({
          agreementId: id,
          navigated: bridgeResult.navigated,
          destination: bridgeResult.destination,
          bridgeAttempted: bridgeResult.bridgeAttempted,
          blockReason: bridgeResult.blockReason,
          vs01RouteAttempted: bridgeResult.vs01RouteAttempted,
        });

        if (bridgeResult.navigated && bridgeResult.vs01RouteAttempted) {
          return;
        }

        if (!bridgeResult.navigated) {
          logCreatorDashboardPrepareNavigationBlocked({
            agreementId: id,
            reason: bridgeResult.blockReason ?? "prepare_navigation_blocked",
            reviewApprovedCount: reviewGate.approvedCount,
            partyCount: reviewGate.requiredPartyCount,
            allApproved: true,
          });
          setPrepareNoticeByAgreementId((prev) => ({
            ...prev,
            [id]: CREATOR_PREPARE_BRIDGE_FAILED_NOTICE,
          }));
        }
      } finally {
        setPrepareBusyAgreementId(null);
      }
    },
    [navigate, prepareBusyAgreementId, reviewRowsByAgreementId, rows],
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
                prepareNoticeByAgreementId={prepareNoticeByAgreementId}
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
                  prepareNoticeByAgreementId={prepareNoticeByAgreementId}
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
