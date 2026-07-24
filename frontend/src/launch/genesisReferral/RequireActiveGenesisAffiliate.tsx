import type { ReactNode } from "react";
import { AppShell } from "../AppShell";
import { useLaunchNav } from "../LaunchNavContext";
import { useActiveGenesisAffiliateAccess } from "./genesisAffiliateAccess";

/**
 * Route gate for authenticated Genesis/affiliate dashboard surfaces.
 * Server still denies data; this prevents rendering sensitive UI for non-active users.
 */
export function RequireActiveGenesisAffiliate(props: {
  children: ReactNode;
  /** When true, redirect to /app instead of showing unavailable copy. */
  redirectToDashboard?: boolean;
}) {
  const { children, redirectToDashboard = true } = props;
  const { navigate } = useLaunchNav();
  const { state, allowed } = useActiveGenesisAffiliateAccess();

  if (state === "loading") {
    return (
      <AppShell title="Affiliate" subtitle="Checking access…" navMode="minimal" compactFooter>
        <p className="text-sm text-slate-400" data-testid="genesis-affiliate-access-loading">
          Checking access…
        </p>
      </AppShell>
    );
  }

  if (!allowed) {
    if (redirectToDashboard) {
      // Navigate after paint; avoid rendering commission/marketing dashboard chrome.
      queueMicrotask(() => navigate("/app"));
      return (
        <AppShell title="Unavailable" subtitle="This area is not available." navMode="minimal" compactFooter>
          <p className="text-sm text-slate-400" data-testid="genesis-affiliate-access-denied">
            Redirecting to your dashboard…
          </p>
        </AppShell>
      );
    }
    return (
      <AppShell title="Unavailable" subtitle="This area is not available." navMode="minimal" compactFooter>
        <div className="max-w-lg space-y-4" data-testid="genesis-affiliate-access-denied">
          <p className="text-sm text-slate-300">This area is not available for your account.</p>
          <button type="button" className="vs01-btn vs01-btn--secondary" onClick={() => navigate("/app")}>
            Back to dashboard
          </button>
        </div>
      </AppShell>
    );
  }

  return <>{children}</>;
}
