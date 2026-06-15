import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./AppShell";
import { useLaunchNav } from "./LaunchNavContext";
import { resolveCurrentUser } from "../account/currentUser";
import {
  fetchWorkspaceIndex,
  fetchAgreementDraft,
  fetchAgreementDraftWithSigningLock,
  fetchAgreementAuditSignedFlag,
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
import { LawdogAgreementsTable } from "./LawdogAgreementsTable";
import { DashboardKpiCards } from "./DashboardKpiCards";
import { DashboardWhatsNextPanel } from "./DashboardWhatsNextPanel";
import { DashboardFirstUserOnboarding } from "./DashboardFirstUserOnboarding";
import { resolveDashboardFeaturedAgreementId } from "./dashboardWhatsNextPresentation";
import { LawdogDashboardLayout } from "./LawdogProductNav";
import {
  countLawdogDashboardKpis,
  lawdogAgreementNeedsAttention,
} from "./lawdogDashboardPresentation";
import {
  creatorDashboardReviewRowsFromDraft,
  deriveCreatorDashboardStatus,
  deriveCreatorDashboardStatusPillFromGate,
  deriveCreatorNextActionLabel,
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
  logCreatorDashboardPrepareBridgeNavigateStart,
  logCreatorDashboardPrepareBridgeResult,
  logCreatorDashboardPrepareClick,
  logCreatorDashboardPrepareNavigationBlocked,
  logCreatorDashboardPrepareQueryCleanup,
  logCreatorDashboardReviewGate,
  logDashboardInitialState,
  logDashboardPostReviewGateState,
} from "./creatorDashboardCopy";
import { navigateCreatorPrepareSignatureLinks } from "./creatorDashboardPrepareSignatureLinks";
import {
  isAppDashboardPathname,
  stripPrepareSignatureLinksQueryFromDashboardUrl,
} from "./creatorDashboardReviewLinkRouting";
import type { AgreementDraft } from "../agreement/agreementTypes";
import type { OwnerReviewPartyStatusRow } from "./simpleProduct/ownerReviewPartyStatusChecklist";
import { draftAuditHasRecipientRecordedApproval } from "../components/agreements/draftRecipientReviewSignals";
import { resolveCreatorDashboardSignatureTrackAction } from "./creatorDashboardSignatureTrack";
import { workspaceAgreementStatusBadge } from "./workspaceAgreementCard";
import { initializeNewAgreementSession } from "./newAgreementSessionReset";
import {
  buildDashboardWorkspaceIndexRowDiagnostic,
  logDashboardWorkspaceIndexRow,
  logDashboardWorkspaceIndexSkippedRow,
} from "./dashboardWorkspaceIndexDiagnostics";
import {
  mergeWorkspaceAgreementCompletion,
  workspaceRowNeedsCompletionAuditHydration,
} from "./creatorDashboardAgreementCompletion";
import {
  fetchServerSigningProgressSnapshot,
  workspaceRowNeedsSigningProgressHydration,
  type CreatorSigningProgressSnapshot,
} from "./creatorDashboardSigningProgress";
import { readSigningPacketStatus } from "../vs01/vs01SigningPacketStatusStore";

export type WorkspaceMode = "empty" | "active" | "power";

/** Status line for recent-agreement rows (workspace index). */
export function workspaceAgreementStatusLabel(r: WorkspaceIndexAgreement): string {
  return workspaceAgreementStatusBadge(r);
}

export function AppDashboard() {
  const { navigate, pathname, search } = useLaunchNav();
  const [rows, setRows] = useState<WorkspaceIndexAgreement[]>([]);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [indexLoading, setIndexLoading] = useState(true);
  const [reviewRowsByAgreementId, setReviewRowsByAgreementId] = useState<
    Record<string, OwnerReviewPartyStatusRow[]>
  >({});
  const [draftByAgreementId, setDraftByAgreementId] = useState<Record<string, AgreementDraft | null>>({});
  const [prepareBusyAgreementId, setPrepareBusyAgreementId] = useState<string | null>(null);
  const [prepareNoticeByAgreementId, setPrepareNoticeByAgreementId] = useState<Record<string, string>>({});
  const [signingStatusEpoch, setSigningStatusEpoch] = useState(0);
  const [auditCompletedByAgreementId, setAuditCompletedByAgreementId] = useState<Record<string, boolean>>({});
  const [signingProgressByAgreementId, setSigningProgressByAgreementId] = useState<
    Record<string, CreatorSigningProgressSnapshot>
  >({});
  const draftingRedirectedRef = useRef(false);
  const prepareSignatureLinksLaunchRef = useRef<string | null>(null);

  const hydrateAuditCompletionFlags = useCallback(async (sourceRows: readonly WorkspaceIndexAgreement[]) => {
    const candidates = sourceRows.filter(workspaceRowNeedsCompletionAuditHydration);
    if (candidates.length === 0) return;
    const flags = await Promise.all(
      candidates.map(async (row) => {
        const signed = await fetchAgreementAuditSignedFlag(row.id);
        return signed ? row.id : null;
      }),
    );
    const next: Record<string, boolean> = {};
    for (const id of flags) {
      if (id) next[id] = true;
    }
    if (Object.keys(next).length > 0) {
      setAuditCompletedByAgreementId((prev) => ({ ...prev, ...next }));
    }
  }, []);

  const hydrateSigningProgressFlags = useCallback(async (sourceRows: readonly WorkspaceIndexAgreement[]) => {
    const candidates = sourceRows.filter(workspaceRowNeedsSigningProgressHydration);
    if (candidates.length === 0) return;
    const entries = await Promise.all(
      candidates.map(async (row) => {
        const snap = await fetchServerSigningProgressSnapshot(row.id);
        return snap ? ([row.id, snap] as const) : null;
      }),
    );
    const next: Record<string, CreatorSigningProgressSnapshot> = {};
    for (const entry of entries) {
      if (entry) next[entry[0]] = entry[1];
    }
    if (Object.keys(next).length > 0) {
      setSigningProgressByAgreementId((prev) => ({ ...prev, ...next }));
    }
  }, []);

  const reloadWorkspaceIndex = useCallback(async () => {
    setIndexLoading(true);
    setIndexError(null);
    const { agreements, skipped, error } = await fetchWorkspaceIndex();
    const deduped = dedupeWorkspaceIndexAgreements(agreements);
    setRows(deduped);
    for (const row of agreements) {
      logDashboardWorkspaceIndexRow(
        buildDashboardWorkspaceIndexRowDiagnostic(row),
      );
    }
    for (const skip of skipped) {
      logDashboardWorkspaceIndexSkippedRow({
        agreementId: skip.id,
        skippedReason: skip.reason,
      });
    }
    setIndexError(error);
    setIndexLoading(false);
    void hydrateAuditCompletionFlags(deduped);
    void hydrateSigningProgressFlags(deduped);
  }, [hydrateAuditCompletionFlags, hydrateSigningProgressFlags]);

  useEffect(() => {
    void reloadWorkspaceIndex();
  }, [reloadWorkspaceIndex]);

  useEffect(() => {
    const bumpSigningStatus = () => setSigningStatusEpoch((epoch) => epoch + 1);
    const onStorage = (ev: StorageEvent) => {
      const key = ev.key ?? "";
      if (
        key.startsWith("vs01_signing_packet_status_v1:") ||
        key.startsWith("vs01_packet_prepared_v1:")
      ) {
        bumpSigningStatus();
      }
    };
    const onSigningStatusChanged = (ev: Event) => {
      bumpSigningStatus();
      const agreementId = String((ev as CustomEvent<{ agreementId?: string }>).detail?.agreementId ?? "").trim();
      if (agreementId) {
        void fetchServerSigningProgressSnapshot(agreementId).then((snap) => {
          if (!snap) return;
          setSigningProgressByAgreementId((prev) => ({ ...prev, [agreementId]: snap }));
        });
      }
      if (agreementId) {
        const snap = readSigningPacketStatus(agreementId);
        if (snap?.fullySigned) {
          void reloadWorkspaceIndex();
          return;
        }
      }
      void hydrateAuditCompletionFlags(rows);
      void hydrateSigningProgressFlags(rows);
    };
    const onFocus = () => {
      bumpSigningStatus();
      void hydrateAuditCompletionFlags(rows);
      void hydrateSigningProgressFlags(rows);
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    window.addEventListener("vs01-signing-packet-status-changed", onSigningStatusChanged);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("vs01-signing-packet-status-changed", onSigningStatusChanged);
    };
  }, [hydrateAuditCompletionFlags, hydrateSigningProgressFlags, reloadWorkspaceIndex, rows]);

  const mergedDashboardRows = useMemo(
    () =>
      rows.map((row) =>
        mergeWorkspaceAgreementCompletion(row, auditCompletedByAgreementId[row.id] === true),
      ),
    [rows, auditCompletedByAgreementId, signingStatusEpoch],
  );

  const filteredDashboard = useMemo(
    () => filterCreatorDashboardAgreements(mergedDashboardRows),
    [mergedDashboardRows],
  );
  const safeRecent = useMemo(
    () => sortCreatorDashboardRows(filteredDashboard.visibleRows),
    [filteredDashboard.visibleRows],
  );
  const dashboardKpis = useMemo(() => countLawdogDashboardKpis(safeRecent), [safeRecent]);
  const attentionRows = useMemo(
    () =>
      safeRecent.filter((row) =>
        lawdogAgreementNeedsAttention(row, deriveCreatorDashboardStatus(row)),
      ),
    [safeRecent],
  );
  const featuredAgreementId = useMemo(
    () => resolveDashboardFeaturedAgreementId(filteredDashboard.featuredAgreementId, attentionRows, safeRecent),
    [filteredDashboard.featuredAgreementId, attentionRows, safeRecent],
  );
  const featuredRow = useMemo(
    () => safeRecent.find((row) => row.id === featuredAgreementId) ?? null,
    [safeRecent, featuredAgreementId],
  );
  const secondaryAttentionRows = useMemo(
    () => attentionRows.filter((row) => row.id !== featuredAgreementId),
    [attentionRows, featuredAgreementId],
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

  const refreshDashboardReviewHydration = useCallback(async () => {
    if (indexLoading || safeRecent.length === 0) return;
    const targets = safeRecent.filter((row) => creatorDashboardNeedsAuthoritativeReviewHydration(row));
    if (targets.length === 0) return;
    const entries = await Promise.all(
      targets.map(async (row) => {
        const { draft } = await fetchAgreementDraft(row.id);
        return [row.id, draft, creatorDashboardReviewRowsFromDraft(draft)] as const;
      }),
    );
    setReviewRowsByAgreementId((prev) => {
      const next = { ...prev };
      for (const [id, , reviewRows] of entries) {
        next[id] = reviewRows;
      }
      return next;
    });
    setDraftByAgreementId((prev) => {
      const next = { ...prev };
      for (const [id, draft] of entries) {
        next[id] = draft;
      }
      return next;
    });
  }, [indexLoading, safeRecent]);

  useEffect(() => {
    void refreshDashboardReviewHydration();
  }, [refreshDashboardReviewHydration]);

  useEffect(() => {
    if (indexLoading || safeRecent.length === 0) return;
    const targets = safeRecent.filter((row) => creatorDashboardNeedsAuthoritativeReviewHydration(row));
    if (targets.length === 0) return;
    const intervalId =
      typeof import.meta !== "undefined" && import.meta.env?.MODE === "test"
        ? null
        : window.setInterval(() => {
            void refreshDashboardReviewHydration();
          }, 12_000);
    const refreshOnReturn = () => {
      void reloadWorkspaceIndex();
      void refreshDashboardReviewHydration();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") refreshOnReturn();
    };
    const onFocus = () => {
      refreshOnReturn();
    };
    if (typeof import.meta === "undefined" || import.meta.env?.MODE !== "test") {
      document.addEventListener("visibilitychange", onVis);
      window.addEventListener("focus", onFocus);
    }
    return () => {
      if (intervalId !== null) window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [indexLoading, safeRecent, refreshDashboardReviewHydration, reloadWorkspaceIndex]);

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
      const reviewGate = resolveCreatorDashboardReviewGate(row, reviewRows, {
        draft: draftByAgreementId[row.id] ?? null,
      });
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
        nextAction: deriveCreatorNextActionLabel(row, reviewGate)
          .toLowerCase()
          .replace(/\s+/g, "_"),
      });
    }
  }, [indexLoading, safeRecent, reviewRowsByAgreementId, draftByAgreementId, signingStatusEpoch]);

  const handleFocusAgreementReviewStatus = useCallback((agreementId: string) => {
    const id = agreementId.trim();
    if (!id) return;
    const el = document.querySelector(`[data-testid="creator-dashboard-agreement-${id}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus({ preventScroll: true });
      return;
    }
    navigate(`/app?focus=${encodeURIComponent(id)}`);
  }, [navigate]);

  useEffect(() => {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const focusId = params.get("focus")?.trim();
    if (!focusId || indexLoading) return;
    const timer = window.setTimeout(() => {
      handleFocusAgreementReviewStatus(focusId);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [search, indexLoading, handleFocusAgreementReviewStatus]);

  const withClearEntry = useCallback((fn: () => void) => {
    clearLawdogEntryContext();
    fn();
  }, []);

  const navigateToCreateNewAgreement = useCallback(() => {
    initializeNewAgreementSession();
    setLawdogFocusCreateIntakeAfterNavigation();
    navigate("/app/create");
  }, [navigate]);

  const currentUser = useMemo(() => resolveCurrentUser(), []);
  const greetingHeadline = useMemo(() => {
    const hour = new Date().getHours();
    const salutation = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    return `${salutation}, ${currentUser.displayName}`;
  }, [currentUser]);

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
        const indexRow = mergedDashboardRows.find((entry) => entry.id === id);
        const cachedReviewRows = reviewRowsByAgreementId[id] ?? [];
        const { ok, draft, lockedVersionId } = await fetchAgreementDraftWithSigningLock(id);
        const fetchedReviewRows = creatorDashboardReviewRowsFromDraft(draft);
        const reviewRows = resolveEffectiveCreatorDashboardReviewRows(draft, cachedReviewRows);
        const usedCachedReviewRows = fetchedReviewRows.length === 0 && cachedReviewRows.length > 0;
        const draftForReviewGate =
          ok && draft && draftAuditHasRecipientRecordedApproval(draft) ? draft : null;
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
          draftForReviewGate ? { draft: draftForReviewGate } : undefined,
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
        const pathnameBeforeBridge =
          typeof window !== "undefined" ? window.location.pathname : "";
        const searchBeforeBridge = typeof window !== "undefined" ? window.location.search : "";
        logCreatorDashboardPrepareBridgeNavigateStart({
          agreementId: id,
          pathname: pathnameBeforeBridge,
          search: searchBeforeBridge,
        });
        const cleanedPathBeforeBridge = stripPrepareSignatureLinksQueryFromDashboardUrl();
        if (cleanedPathBeforeBridge) {
          logCreatorDashboardPrepareQueryCleanup({
            agreementId: id,
            pathnameBefore: pathnameBeforeBridge,
            searchBefore: searchBeforeBridge,
            cleanPath: cleanedPathBeforeBridge,
            skippedReason: null,
          });
        }

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
          const pathnameAfterBridge =
            typeof window !== "undefined" ? window.location.pathname : "";
          const searchAfterBridge = typeof window !== "undefined" ? window.location.search : "";
          if (isAppDashboardPathname(pathnameAfterBridge)) {
            const cleanedPathAfterBridge = stripPrepareSignatureLinksQueryFromDashboardUrl();
            logCreatorDashboardPrepareQueryCleanup({
              agreementId: id,
              pathnameBefore: pathnameAfterBridge,
              searchBefore: searchAfterBridge,
              cleanPath: cleanedPathAfterBridge,
              skippedReason: cleanedPathAfterBridge ? null : "no_query_on_dashboard",
            });
          } else {
            logCreatorDashboardPrepareQueryCleanup({
              agreementId: id,
              pathnameBefore: pathnameAfterBridge,
              searchBefore: searchAfterBridge,
              cleanPath: null,
              skippedReason: "not_on_dashboard_after_bridge",
            });
          }
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
    [mergedDashboardRows, navigate, prepareBusyAgreementId, reviewRowsByAgreementId],
  );

  useEffect(() => {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const prepareId = params.get("prepare_signature_links")?.trim();
    if (!prepareId || indexLoading) return;
    if (prepareSignatureLinksLaunchRef.current === prepareId) return;
    const timer = window.setTimeout(() => {
      prepareSignatureLinksLaunchRef.current = prepareId;
      void handlePrepareSignatureLinks(prepareId);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [search, indexLoading, handlePrepareSignatureLinks]);

  const handleWhatsNextPrimaryAction = useCallback(
    (row: WorkspaceIndexAgreement) => {
      const reviewRows = reviewRowsByAgreementId[row.id] ?? [];
      const draft = draftByAgreementId[row.id] ?? null;
      const reviewGate = resolveCreatorDashboardReviewGate(row, reviewRows, { draft });
      const action = resolveCreatorDashboardSignatureTrackAction(row, reviewGate, {
        draft,
        signingProgress: signingProgressByAgreementId[row.id] ?? null,
      });
      if (action.kind === "prepare_signature_links") {
        void handlePrepareSignatureLinks(row.id);
        return;
      }
      if (action.kind === "focus_review_status") {
        handleFocusAgreementReviewStatus(row.id);
        return;
      }
      withClearEntry(() => navigate(action.path));
    },
    [
      draftByAgreementId,
      handleFocusAgreementReviewStatus,
      handlePrepareSignatureLinks,
      navigate,
      reviewRowsByAgreementId,
      signingProgressByAgreementId,
      withClearEntry,
    ],
  );

  return (
    <AppShell
      title="Dashboard"
      subtitle={
        <>
          <span className="block text-base font-medium text-slate-200" data-testid="dashboard-greeting">
            {greetingHeadline}
          </span>
          <span className="mt-1 block text-sm text-slate-500">
            See what you&apos;re working on, what to do next, and how close each agreement is to signing.
          </span>
        </>
      }
    >
      <LawdogDashboardLayout activeId="dashboard">
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

        {!indexLoading && safeRecent.length > 0 ? (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-400" data-testid="dashboard-agreement-count">
                {safeRecent.length} agreement{safeRecent.length === 1 ? "" : "s"}
              </p>
              <button
                type="button"
                className="vs01-btn vs01-btn--primary vs01-btn--compact"
                data-testid="dashboard-create-new-agreement"
                onClick={() => withClearEntry(navigateToCreateNewAgreement)}
              >
                Create new agreement
              </button>
            </div>
            <DashboardKpiCards kpis={dashboardKpis} />
          </>
        ) : null}

        {indexLoading ? (
          <p className="text-sm text-slate-400">Loading agreements…</p>
        ) : safeRecent.length === 0 ? (
          <DashboardFirstUserOnboarding
            agreementCount={0}
            onCreateAgreement={() => withClearEntry(navigateToCreateNewAgreement)}
          />
        ) : (
          <div className="mt-2 space-y-8">
            {featuredRow ? (
              <DashboardWhatsNextPanel
                row={featuredRow}
                reviewRows={reviewRowsByAgreementId[featuredRow.id] ?? []}
                draft={draftByAgreementId[featuredRow.id] ?? null}
                onPrimaryAction={handleWhatsNextPrimaryAction}
                onNavigate={(path) => withClearEntry(() => navigate(path))}
                onPrepareSignatureLinks={handlePrepareSignatureLinks}
                prepareBusy={prepareBusyAgreementId === featuredRow.id}
                prepareNotice={prepareNoticeByAgreementId[featuredRow.id] ?? null}
                signingProgress={signingProgressByAgreementId[featuredRow.id] ?? null}
              />
            ) : null}

            {safeRecent.length <= 3 ? (
              <DashboardFirstUserOnboarding
                agreementCount={safeRecent.length}
                onCreateAgreement={() => withClearEntry(navigateToCreateNewAgreement)}
              />
            ) : null}

            {secondaryAttentionRows.length > 0 ? (
              <section aria-label="Other agreements needing attention" data-testid="creator-dashboard-primary">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Also needs attention
                </h2>
                <CreatorDashboardAgreementList
                  rows={secondaryAttentionRows}
                  reviewRowsByAgreementId={reviewRowsByAgreementId}
                  draftByAgreementId={draftByAgreementId}
                  onNavigate={(path) => withClearEntry(() => navigate(path))}
                  onFocusReviewStatus={handleFocusAgreementReviewStatus}
                  onPrepareSignatureLinks={handlePrepareSignatureLinks}
                  prepareBusyAgreementId={prepareBusyAgreementId}
                  prepareNoticeByAgreementId={prepareNoticeByAgreementId}
                  signingProgressByAgreementId={signingProgressByAgreementId}
                  compact
                />
              </section>
            ) : null}
            <section aria-label="All agreements">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                All agreements
              </h2>
              <LawdogAgreementsTable
                rows={safeRecent}
                signingProgressByAgreementId={signingProgressByAgreementId}
                onNavigate={(path) => withClearEntry(() => navigate(path))}
                onFocusReviewStatus={handleFocusAgreementReviewStatus}
                onArchiveComplete={() => void reloadWorkspaceIndex()}
              />
            </section>
          </div>
        )}
      </LawdogDashboardLayout>

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
