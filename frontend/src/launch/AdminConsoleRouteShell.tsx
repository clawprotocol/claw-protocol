import { useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { AdminConsoleAccessGate, AdminConsoleUnavailable } from "./AdminConsoleAccessGate";
import { AdminConsolePage } from "./AdminConsolePage";
import {
  canAccessAdminConsoleWithoutServerAuth,
  isAdminConsoleDeploymentEnabled,
  requiresAdminConsoleServerAuth,
} from "./adminConsoleAccess";
import { fetchOperatorConsoleCapability } from "./operatorConsoleCapability";

/**
 * Admin Console route entry: prefer backend operator registry capability, then
 * existing deployment / production access gates. Does not weaken grant/revoke auth.
 */
export function AdminConsoleRouteShell() {
  const [state, setState] = useState<"loading" | "operator" | "fallback">("loading");

  useEffect(() => {
    let cancelled = false;
    void fetchOperatorConsoleCapability().then((cap) => {
      if (cancelled) return;
      setState(cap.authorized ? "operator" : "fallback");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <AppShell title="Operator access" subtitle="Checking operator session…">
        <p className="max-w-md text-sm text-slate-400">Verifying internal authorization…</p>
      </AppShell>
    );
  }

  if (state === "operator") {
    return <AdminConsolePage />;
  }

  if (requiresAdminConsoleServerAuth()) {
    return <AdminConsoleAccessGate />;
  }
  if (canAccessAdminConsoleWithoutServerAuth() || isAdminConsoleDeploymentEnabled()) {
    return <AdminConsolePage />;
  }
  return <AdminConsoleUnavailable />;
}
