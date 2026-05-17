import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./AppShell";
import { useLaunchNav } from "./LaunchNavContext";
import { getOrgId } from "./orgContext";
import { fetchSubscription } from "./billingApi";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import {
  fetchAgreementUsageSummary,
  fetchWorkspaceIndex,
  type AgreementUsageSummary,
} from "../agreement/agreementWorkspaceApi";
import { featureFlags } from "../config/featureFlags";
import { useFeatureGate } from "../config/featureFlags/useFeatureGate";
import { LawdogMarketingPixels } from "../compliance/LawdogMarketingPixels";
import { usePowerGatedNavigation } from "../monetization/usePowerGatedNavigation";
import {
  dismissReturnSaveBanner,
  incrementLawdogDashboardVisitCount,
  shouldShowReturnSaveBanner,
} from "../tracking/lawdogSession";
import { peekWorkspaceWinBack } from "./reEngagementStore";
import { WorkspaceWinBackBanner } from "./ReEngagementBanner";
import { LawdogProofActivityHeatmap } from "../proof/LawdogProofActivityHeatmap";
import { RecordsExportControlBar } from "../export/RecordsExportControlBar";
import {
  clearLawdogEntryContext,
  resolveLawdogEntryContext,
  setLawdogFocusCreateIntakeAfterNavigation,
} from "./lawdogEntryContext";
import { isFirstLawdogSession } from "./lawdogFirstDraftSession";
import { canAccessOperatorGrowthDashboard } from "./ops/OperatorGrowthDashboard";

export type WorkspaceMode = "empty" | "active" | "power";

/** Lightweight workspace phase from data already on the dashboard (no new APIs). */
export function getWorkspaceMode(
  recent: WorkspaceIndexAgreement[],
  usage: AgreementUsageSummary | null,
  indexLoading: boolean,
): WorkspaceMode {
  if (indexLoading) return "active";
  const created = usage?.agreements_created ?? 0;
  const n = recent.length;
  if (n === 0 && created < 1) return "empty";
  if (n >= 4 || created >= 6) return "power";
  return "active";
}

function sortRecentByUpdatedDesc(list: WorkspaceIndexAgreement[]): WorkspaceIndexAgreement[] {
  return [...list].sort((a, b) => {
    const ta = new Date(a.updated_at).getTime();
    const tb = new Date(b.updated_at).getTime();
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });
}

function formatRelativeUpdated(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "Recently updated";
  const diffMs = Date.now() - t;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Last edited just now";
  if (mins < 60) return `Last edited ${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last edited ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `Last edited ${days} day${days === 1 ? "" : "s"} ago`;
  return `Last edited ${new Date(iso).toLocaleDateString()}`;
}

/** Status line for recent-agreement rows (workspace index). */
export function workspaceAgreementStatusLabel(r: WorkspaceIndexAgreement): string {
  if (r.completed_signed) return "Fully signed";
  if (r.has_server_signing_lock) return "Signing in progress";
  if (r.all_reviewers_approved) return "All reviewers approved — ready to prepare signing";
  const req = r.review_approvals_required ?? 0;
  const done = r.review_approvals_completed ?? 0;
  if (r.reviewer_approved && req > 1) {
    return `${done} of ${req} reviewers approved`;
  }
  if (r.reviewer_approved) return "Reviewer approved — ready to prepare signing";
  if (r.review_sent_at) return "Sent";
  if (r.version_ledger_count > 0) return "Ready to send";
  return "Draft";
}

function displayAgreementTitle(title: string): string {
  const t = (title || "").trim();
  if (t.length <= 2) return "Untitled agreement";
  return t;
}

function firstIncompleteAgreement(recent: WorkspaceIndexAgreement[]): WorkspaceIndexAgreement | null {
  return recent.find((r) => !r.completed_signed) ?? null;
}

export function AppDashboard() {
  const { navigate, search, pathname } = useLaunchNav();
  const affiliateAreaEnabled = useFeatureGate("affiliate_opportunity_enabled");
  const { navigateToReuse, navigateToWorkProduct } = usePowerGatedNavigation();
  const orgId = getOrgId();
  const [rows, setRows] = useState<WorkspaceIndexAgreement[]>([]);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [indexLoading, setIndexLoading] = useState(true);
  const [usage, setUsage] = useState<AgreementUsageSummary | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [signupPixelSurface, setSignupPixelSurface] = useState(false);
  const [showReturnSaveBanner, setShowReturnSaveBanner] = useState(false);
  const [showWinBackBanner, setShowWinBackBanner] = useState(false);
  const [exportPick, setExportPick] = useState<string | null>(null);
  const primaryQuickFocusRef = useRef<HTMLButtonElement | null>(null);
  const draftingRedirectedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const visitN = incrementLawdogDashboardVisitCount();
    setShowReturnSaveBanner(shouldShowReturnSaveBanner(visitN));
    setShowWinBackBanner(peekWorkspaceWinBack());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = (search || "").startsWith("?") ? search.slice(1) : search.replace(/^\?/, "");
    const q = new URLSearchParams(raw);
    if (q.get("welcome") !== "1") return;
    setSignupPixelSurface(true);
    q.delete("welcome");
    const qs = q.toString();
    const path = window.location.pathname;
    window.history.replaceState(window.history.state, "", `${path}${qs ? `?${qs}` : ""}${window.location.hash}`);
  }, [search]);

  const reloadWorkspaceIndex = useCallback(async () => {
    setIndexLoading(true);
    setIndexError(null);
    const { agreements, error } = await fetchWorkspaceIndex();
    setRows(agreements);
    setIndexError(error);
    setIndexLoading(false);
  }, []);

  useEffect(() => {
    void reloadWorkspaceIndex();
  }, [reloadWorkspaceIndex]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      setBillingError(null);
      setUsage(null);
      setPlan(null);
      const [u, sub] = await Promise.all([fetchAgreementUsageSummary(), fetchSubscription(orgId)]);
      if (cancel) return;
      const parts: string[] = [];
      if (u.error) parts.push(u.error);
      if (sub.error) parts.push(sub.error);
      if (parts.length) setBillingError(parts.join(" "));
      if (u.data) setUsage(u.data);
      if (sub.data?.plan_code) setPlan(sub.data.plan_code);
      else if (!sub.error) setPlan(null);
    })();
    return () => {
      cancel = true;
    };
  }, [orgId]);

  const safeRecent = useMemo(() => sortRecentByUpdatedDesc(rows), [rows]);
  const exportToolbarTarget = exportPick ?? (safeRecent.length === 1 ? safeRecent[0].id : null);

  const entryResolved = useMemo(
    () => resolveLawdogEntryContext(safeRecent.length, indexLoading),
    [safeRecent.length, indexLoading],
  );

  const hideWorkspaceFat = isFirstLawdogSession();
  const showLegacyQuickPath = !hideWorkspaceFat && usage?.tier === "free";

  const mode = useMemo(
    () => getWorkspaceMode(safeRecent, usage, indexLoading),
    [safeRecent, usage, indexLoading],
  );

  const continueDraft = useMemo(() => firstIncompleteAgreement(safeRecent), [safeRecent]);

  const hero = useMemo(() => {
    if (entryResolved === "drafting") {
      return {
        title: "Continue your draft",
        subtitle: (
          <span className="block">
            Your text is ready — finish structuring and send when ready.
          </span>
        ),
      };
    }
    if (entryResolved === "returning") {
      return {
        title: "Welcome back",
        subtitle: <span className="block">Pick up where you left off.</span>,
      };
    }
    if (mode === "empty") {
      return {
        title: "Start your first agreement",
        subtitle: (
          <>
            <span className="block">Create a draft in plain language, review it, then send when you&apos;re ready.</span>
          </>
        ),
      };
    }
    if (mode === "power") {
      return {
        title: "Your agreement workspace",
        subtitle: (
          <>
            <span className="block">
              Move faster with recent work, reuse, exports, and higher-throughput actions.
            </span>
          </>
        ),
      };
    }
    return {
      title: "Your workspace",
      subtitle: (
        <>
          <span className="block">Pick up where you left off, send a draft, or start a new agreement.</span>
        </>
      ),
    };
  }, [mode, entryResolved]);

  const returnBannerLine =
    mode === "empty"
      ? "You created something earlier — want to save it?"
      : "You've got work in progress — want to save it?";

  const primaryQuick = useMemo(() => {
    if (mode === "empty") {
      return { kind: "create" as const, label: "New agreement" };
    }
    if (mode === "power") {
      if (safeRecent.length >= 2) {
        return { kind: "reuse" as const, label: "Find & reuse agreements" };
      }
      return { kind: "create" as const, label: "New agreement" };
    }
    if (continueDraft) {
      return {
        kind: "continue" as const,
        label: "Continue draft",
        agreementId: continueDraft.id,
      };
    }
    return { kind: "create" as const, label: "New agreement" };
  }, [mode, safeRecent.length, continueDraft]);

  const withClearEntry = useCallback((fn: () => void) => {
    clearLawdogEntryContext();
    fn();
  }, []);

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
    if (entryResolved !== "returning") return;
    if (safeRecent.length === 0) return;
    const id = window.requestAnimationFrame(() => {
      document.getElementById("lawdog-recent-agreements")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [entryResolved, indexLoading, safeRecent.length]);

  useEffect(() => {
    if (indexLoading) return;
    if (entryResolved !== "new") return;
    const id = window.requestAnimationFrame(() => primaryQuickFocusRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [entryResolved, indexLoading]);

  const onPrimaryQuick = () => {
    withClearEntry(() => {
      if (primaryQuick.kind === "create") navigate("/app/create");
      else if (primaryQuick.kind === "reuse") navigateToReuse("app_dashboard_quick_actions", "/app/agreement-memory");
      else navigate(`/app/send/${encodeURIComponent(primaryQuick.agreementId)}`);
    });
  };

  const tiersBlock = (
    <div
      className={`mb-8 mt-2 rounded-xl border px-4 py-4 ${
        mode === "empty"
          ? "border-slate-800/50 bg-slate-950/20 opacity-80"
          : "border-slate-800/80 bg-slate-950/35"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">How LawDog tiers unlock more</p>
      <ul className="mt-3 grid gap-3 text-xs leading-relaxed text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
        <li>
          <span className="font-semibold text-slate-200">Free</span> — try create &amp; send
        </li>
        <li>
          <span className="font-semibold text-slate-200">Plus</span> — real sends, saved library, meaning-first search,
          starter memos
        </li>
        <li>
          <span className="font-semibold text-slate-200">Pro</span> — team memory, deal map, full memo &amp; brief
          studio
        </li>
        <li>
          <span className="font-semibold text-slate-200">Enterprise</span> — volume programs, APIs, compliance, org-wide
          memory
        </li>
      </ul>
      <button
        type="button"
        className="mt-3 text-xs font-medium text-teal-400/95 underline-offset-2 hover:underline"
        onClick={() => withClearEntry(() => navigate("/app/billing"))}
      >
        Compare plans &amp; prices
      </button>
    </div>
  );

  const activityCard = (
    <div className="claw-stat-card">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Activity</h2>
      {featureFlags.serverBilling ? (
        <p className="mt-2 text-sm text-slate-200">
          <span className="text-slate-400">Workspace</span>{" "}
          <code className="rounded bg-slate-900 px-1.5 py-0.5 text-xs text-slate-300">{orgId}</code>
        </p>
      ) : null}
      {mode === "empty" && (!usage || usage.agreements_created < 1) ? (
        <>
          <p className="mt-3 text-sm font-medium text-slate-200">You&apos;re ready to start</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Your first draft will appear here after you create it.
          </p>
        </>
      ) : usage ? (
        <>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
            {mode === "power" ? (
              <>
                <li>
                  <span className="font-semibold text-white">{usage.agreements_created}</span> active agreement
                  {usage.agreements_created === 1 ? "" : "s"}
                </li>
                <li>
                  <span className="font-semibold text-white">{usage.agreements_completed}</span> finalized record
                  {usage.agreements_completed === 1 ? "" : "s"}
                </li>
                <li className="text-slate-400">Export stays available across your workspace.</li>
              </>
            ) : (
              <>
                <li>
                  You have{" "}
                  <span className="font-semibold text-white">{usage.agreements_created}</span> agreement
                  {usage.agreements_created === 1 ? "" : "s"} started
                </li>
                <li>
                  <span className="font-semibold text-white">
                    {Math.max(0, usage.agreements_created - usage.agreements_completed)}
                  </span>{" "}
                  ready to finalize
                </li>
                {usage.tier === "free" ? (
                  <li>
                    <span className="font-semibold text-white">{usage.drafts_remaining ?? "—"}</span> drafts remaining
                  </li>
                ) : (
                  <li className="text-slate-400">
                    Save and send on your plan —{" "}
                    <span className="font-semibold text-slate-200">{usage.agreements_completed}</span> finalized
                  </li>
                )}
                {usage.tier === "free" && usage.agreements_remaining != null ? (
                  <li className="text-xs text-slate-500">
                    Finalized slots remaining:{" "}
                    <span className="font-medium text-slate-300">{usage.agreements_remaining}</span>
                  </li>
                ) : null}
                {usage.soft_throttle ? (
                  <li className="text-amber-200/90">High volume this month — responses may be briefly slower.</li>
                ) : null}
              </>
            )}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            {mode === "power"
              ? "Reuse and exports stay one click away from your recent list."
              : usage.tier === "free" && usage.drafts_remaining === 0
                ? "You're ready to create your next agreement."
                : "Open a recent agreement to continue faster."}
          </p>
          {!hideWorkspaceFat ? (
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            {usage.agreement_memory?.tier === "none" ? (
              <li>
                Agreement Memory: <span className="text-slate-400">Locked</span>
                <span className="mt-1 block text-xs text-slate-600">
                  Plus and above: search agreements by meaning and reuse what already worked — the remember &amp; reuse
                  steps on the ladder.
                </span>
                <button
                  type="button"
                  className="ml-0 mt-2 text-xs font-medium text-teal-400/95 underline-offset-2 hover:underline sm:ml-2 sm:mt-0"
                  onClick={() => withClearEntry(() => navigate("/app/billing"))}
                >
                  Upgrade
                </button>
                <button
                  type="button"
                  className="ml-2 text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
                  onClick={() => withClearEntry(() => navigate("/app/agreement-memory"))}
                >
                  Learn more
                </button>
              </li>
            ) : (
              <li>
                Agreement Memory: <span className="text-emerald-200/85">Included</span>
                <button
                  type="button"
                  className="ml-2 text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
                  onClick={() => withClearEntry(() => navigateToReuse("app_dashboard_memory_open", "/app/agreement-memory"))}
                >
                  Open
                </button>
              </li>
            )}
          </ul>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Usage summary unavailable — API may be offline.</p>
      )}
      <div className="mt-3 rounded-lg border border-slate-800/70 bg-slate-950/30 px-3 py-3">
        <LawdogProofActivityHeatmap />
      </div>
      {plan ? (
        <p className="mt-3 text-sm text-slate-400">
          Plan: <span className="text-slate-200">{plan}</span>
        </p>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No server subscription row yet (optional).</p>
      )}
      <button
        type="button"
        className="vs01-btn vs01-btn--secondary vs01-btn--compact mt-3"
        onClick={() => withClearEntry(() => navigate("/app/billing"))}
      >
        Plans &amp; billing
      </button>
    </div>
  );

  const quickActionsHelper =
    mode === "power" ? (
      <p className="mb-2 text-xs leading-relaxed text-slate-500">
        Reuse what already worked, then edit only what changed.
      </p>
    ) : null;

  const quickActionsCard = (
    <div className="claw-stat-card">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick actions</h2>
      {quickActionsHelper}
      <div className="mt-3 flex flex-col gap-2">
        <button
          ref={primaryQuickFocusRef}
          type="button"
          className="vs01-btn vs01-btn--primary"
          onClick={onPrimaryQuick}
        >
          {primaryQuick.label}
        </button>
        {!hideWorkspaceFat && primaryQuick.kind === "continue" ? (
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary"
            onClick={() => withClearEntry(() => navigate("/app/create"))}
          >
            New agreement
          </button>
        ) : null}
        {!hideWorkspaceFat && primaryQuick.kind === "reuse" ? (
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary"
            onClick={() => withClearEntry(() => navigate("/app/create"))}
          >
            New agreement
          </button>
        ) : null}
        {showLegacyQuickPath ? (
          <button type="button" className="vs01-btn vs01-btn--secondary" onClick={() => withClearEntry(() => navigate("/app/quick"))}>
            Quick send
          </button>
        ) : null}
        {!hideWorkspaceFat && primaryQuick.kind !== "reuse" ? (
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary"
            onClick={() => withClearEntry(() => navigateToReuse("app_dashboard_quick_actions", "/app/agreement-memory"))}
          >
            Find &amp; reuse agreements
          </button>
        ) : null}
        {!hideWorkspaceFat ? (
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary"
            onClick={() => withClearEntry(() => navigateToWorkProduct("app_dashboard_quick_actions"))}
            title="Briefs, memos, white papers — from your workspace sources"
          >
            Briefs &amp; memos
          </button>
        ) : null}
      </div>
    </div>
  );

  const recentAgreementsCard = (
    <div id="lawdog-recent-agreements" className="vs01-card vs01-card--envelope mt-2">
      <h2 className="vs01-card-title text-base">
        {mode === "empty" ? "No agreements yet" : "Recent agreements"}
      </h2>
      <p className="vs01-card-help">
        {mode === "empty"
          ? "Start with a new agreement or use Quick send if you already have a document."
          : mode === "power"
            ? "Status and last edited — jump back in or export when you need the file."
            : "Continue recent work or start something new."}
      </p>
      {indexLoading ? (
        <p className="mt-4 text-sm text-slate-400">Loading recent agreements…</p>
      ) : safeRecent.length === 0 && !indexError ? (
        <div className="mt-4 space-y-3">
          {mode !== "empty" ? (
            <p className="text-sm text-slate-400">Nothing here yet — pick a first step below.</p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className="vs01-btn vs01-btn--primary" onClick={() => withClearEntry(() => navigate("/app/create"))}>
              Create first agreement
            </button>
            {showLegacyQuickPath ? (
              <button type="button" className="vs01-btn vs01-btn--secondary" onClick={() => withClearEntry(() => navigate("/app/quick"))}>
                Quick send a document
              </button>
            ) : null}
          </div>
        </div>
      ) : safeRecent.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No agreements loaded.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {safeRecent.slice(0, 8).map((r, idx) => (
            <li
              key={r.id}
              className={`flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${
                ((mode === "active" || entryResolved === "returning") && idx === 0)
                  ? "border-emerald-900/35 bg-emerald-950/10"
                  : mode === "power"
                    ? "border-slate-700/90 bg-slate-950/40"
                    : "border-slate-800/80 bg-slate-950/30"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-100">{displayAgreementTitle(r.title)}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {workspaceAgreementStatusLabel(r)} · {formatRelativeUpdated(r.updated_at)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary vs01-btn--compact !mt-0 min-w-[4.5rem]"
                  onClick={() => withClearEntry(() => navigate(`/app/send/${encodeURIComponent(r.id)}`))}
                >
                  Open
                </button>
                {!hideWorkspaceFat ? (
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--secondary vs01-btn--compact !mt-0 min-w-[7rem] border-teal-900/50 text-teal-400/95 hover:border-teal-800/60 hover:text-teal-300"
                    onClick={() => setExportPick(r.id)}
                  >
                    Select for export
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const exportBar = hideWorkspaceFat ? null : (
    <RecordsExportControlBar
      className="mb-3 mt-8"
      hasRecords={!indexLoading && safeRecent.length > 0}
      selectedAgreementId={exportToolbarTarget}
      workspaceRowsForAi={rows}
      onWorkspaceOrganizationApplied={() => void reloadWorkspaceIndex()}
    />
  );

  const affiliateEntryBanner = affiliateAreaEnabled ? (
    <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-emerald-900/35 bg-gradient-to-br from-emerald-950/25 via-slate-950/40 to-slate-950/60 px-5 py-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight text-white">Earn with LawDog</h2>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-400">
          Share your link and track payouts.
        </p>
      </div>
      <button
        type="button"
        className="vs01-btn vs01-btn--primary shrink-0 self-start sm:self-center"
        onClick={() => withClearEntry(() => navigate("/app/opportunity"))}
      >
        Open affiliate dashboard
      </button>
    </div>
  ) : null;

  const alertsBlock = (
    <>
      {signupPixelSurface ? <LawdogMarketingPixels surface="signup_success" /> : null}
      {showWinBackBanner ? (
        <WorkspaceWinBackBanner onDismiss={() => setShowWinBackBanner(false)} navigate={(path) => navigate(path)} />
      ) : null}
      {showReturnSaveBanner ? (
        <div
          className="mb-6 flex flex-col gap-2 rounded-lg border border-teal-900/40 bg-teal-950/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <p className="text-sm text-teal-100/95">{returnBannerLine}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="vs01-btn vs01-btn--primary vs01-btn--compact"
              onClick={() => withClearEntry(() => navigate("/app/agreements"))}
            >
              Save it
            </button>
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact"
              onClick={() => {
                dismissReturnSaveBanner();
                setShowReturnSaveBanner(false);
              }}
            >
              Not now
            </button>
          </div>
        </div>
      ) : null}
      {indexError ? (
        <div
          className="mb-6 rounded-lg border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100"
          role="alert"
        >
          <p className="font-medium">We couldn’t refresh your agreement list.</p>
          <p className="mt-1 text-amber-100/90">{indexError}</p>
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary vs01-btn--compact mt-3"
            onClick={() => void window.location.reload()}
          >
            Retry
          </button>
        </div>
      ) : null}
      {billingError && featureFlags.serverBilling ? (
        <div
          className="mb-6 rounded-lg border border-rose-800/40 bg-rose-950/25 px-4 py-3 text-sm text-rose-100"
          role="alert"
        >
          <p className="font-medium">Account details didn’t load completely.</p>
          <p className="mt-1 text-rose-100/90">{billingError}</p>
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary vs01-btn--compact mt-3"
            onClick={() => withClearEntry(() => navigate("/app/billing"))}
          >
            Open account
          </button>
        </div>
      ) : null}
    </>
  );

  const twoColGrid = (
    <div className="mt-2 grid gap-5 md:grid-cols-2">
      {quickActionsCard}
      {activityCard}
    </div>
  );

  return (
    <AppShell title={hero.title} subtitle={hero.subtitle}>
      {alertsBlock}
      {affiliateEntryBanner}
      {mode === "empty" ? (
        <>
          {tiersBlock}
          {twoColGrid}
          {recentAgreementsCard}
          {exportBar}
        </>
      ) : mode === "active" ? (
        <>
          {tiersBlock}
          {recentAgreementsCard}
          {twoColGrid}
          {exportBar}
        </>
      ) : (
        <>
          {recentAgreementsCard}
          {twoColGrid}
          {exportBar}
          {tiersBlock}
        </>
      )}
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
            <span className="text-slate-700" aria-hidden>
              |
            </span>
            <button
              type="button"
              className="underline underline-offset-2 hover:text-slate-400"
              onClick={() => withClearEntry(() => navigate("/app/ops/paid-funnel"))}
            >
              Internal — paid funnel (Pro)
            </button>
            <span className="text-slate-700" aria-hidden>
              |
            </span>
            <button
              type="button"
              className="underline underline-offset-2 hover:text-slate-400"
              onClick={() => withClearEntry(() => navigate("/app/ops/starter-pro-refine"))}
            >
              Internal — Starter Pro Refine
            </button>
          </span>
        </p>
      ) : null}
    </AppShell>
  );
}
