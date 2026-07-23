/**
 * Gate authenticated dashboard surfaces on a validated session (or explicit local e2e bridge).
 */
import React from "react";
import { useAuth } from "./AuthProvider";
import {
  isAuthenticatedDashboardSurface,
  isPublicTokenAgreementSurface,
  resolveCurrentUser,
} from "../account/currentUser";
import { useLaunchNav } from "../launch/LaunchNavContext";

export function RequireAuthenticatedDashboard({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const { enabled, loading, user } = useAuth();
  const { pathname, navigate } = useLaunchNav();
  const path = (pathname || "").replace(/\/$/, "") || "/";

  if (isPublicTokenAgreementSurface(path)) {
    return <>{children}</>;
  }
  if (!isAuthenticatedDashboardSurface(path)) {
    return <>{children}</>;
  }

  const current = resolveCurrentUser({
    supabaseUserId: user?.id,
    supabaseEmail: user?.email ?? null,
    supabaseDisplayName:
      (user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? null,
  });

  if (loading && enabled) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-stone-600" data-testid="auth-dashboard-loading">
        Checking your session…
      </div>
    );
  }

  // Only a validated session / e2e seed counts — never org headers alone.
  if (current.isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center" data-testid="auth-dashboard-required">
      <h1 className="text-xl font-semibold text-stone-900">Sign in required</h1>
      <p className="mt-2 text-sm text-stone-600">
        Your dashboard and account surfaces require a signed-in session. Org headers alone are not enough.
      </p>
      <button
        type="button"
        className="mt-6 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white"
        data-testid="auth-dashboard-sign-in"
        onClick={() => navigate("/app/sign-in")}
      >
        Sign in
      </button>
    </div>
  );
}
