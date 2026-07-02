import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { AppShell } from "./AppShell";
import { AdminConsolePage } from "./AdminConsolePage";
import { useLaunchNav } from "./LaunchNavContext";
import {
  bootstrapQaPaymentBypassAdminSession,
  refreshGenesisBetaPaymentBypassAuth,
  type GenesisBetaPaymentBypassAuth,
} from "./genesisBetaPaymentBypassAuth";
import { writeAdminConsoleSecret, readAdminConsoleSecret } from "./adminConsoleApi";

function AdminConsoleUnavailable() {
  const { navigate } = useLaunchNav();
  return (
    <AppShell title="Unavailable" subtitle="Internal admin is not enabled in this deployment.">
      <p className="max-w-md text-sm text-slate-400">
        This page is for operator tools only. Customer builds leave it off; use an internal build with admin
        console enabled if you need it.
      </p>
      <button type="button" className="vs01-btn vs01-btn--secondary mt-6" onClick={() => navigate("/app")}>
        Back to dashboard
      </button>
    </AppShell>
  );
}

function AdminConsoleBootstrapForm(props: {
  userId?: string | null;
  onBootstrapped: (auth: GenesisBetaPaymentBypassAuth, adminSecret: string) => void;
}) {
  const [secret, setSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = secret.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const bootstrapped = await bootstrapQaPaymentBypassAdminSession(trimmed);
      if (!bootstrapped) {
        setError("Invalid admin secret or operator session could not be started.");
        return;
      }
      const auth = await refreshGenesisBetaPaymentBypassAuth(props.userId);
      if (!auth.authorized) {
        setError("Operator session was not authorized after bootstrap.");
        return;
      }
      writeAdminConsoleSecret(trimmed);
      props.onBootstrapped(auth, trimmed);
    } catch {
      setError("Could not reach the operator authorization service.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title="Operator access"
      subtitle="Enter the internal admin secret to start a short-lived operator session."
    >
      <form className="max-w-md space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <p className="text-sm text-slate-400">
          Admin tools stay hidden until bootstrap succeeds. No agreement, billing, or user data is loaded here.
        </p>
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3">
          <label className="text-xs text-slate-400" htmlFor="admin-bootstrap-secret">
            Admin secret
          </label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              id="admin-bootstrap-secret"
              className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="x-claw-admin-secret"
              autoComplete="off"
              disabled={submitting}
            />
            <button
              type="submit"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact"
              disabled={submitting || !secret.trim()}
            >
              {submitting ? "Connecting…" : "Connect"}
            </button>
          </div>
        </div>
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      </form>
    </AppShell>
  );
}

export function AdminConsoleAccessGate() {
  const { user } = useAuth();
  const [auth, setAuth] = useState<GenesisBetaPaymentBypassAuth | undefined>(undefined);
  const [adminApiSecret, setAdminApiSecret] = useState<string | undefined>(undefined);

  const onBootstrapped = (nextAuth: GenesisBetaPaymentBypassAuth, adminSecret: string) => {
    setAdminApiSecret(adminSecret.trim());
    setAuth(nextAuth);
  };

  useEffect(() => {
    let cancelled = false;
    void refreshGenesisBetaPaymentBypassAuth(user?.id).then((result) => {
      if (!cancelled) setAuth(result);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (auth === undefined) {
    return (
      <AppShell title="Operator access" subtitle="Checking operator session…">
        <p className="max-w-md text-sm text-slate-400">Verifying internal authorization…</p>
      </AppShell>
    );
  }

  if (auth.authorized) {
    const storedSecret = adminApiSecret?.trim() || readAdminConsoleSecret().trim();
    return <AdminConsolePage initialAdminSecret={storedSecret || undefined} />;
  }

  return <AdminConsoleBootstrapForm userId={user?.id} onBootstrapped={onBootstrapped} />;
}

export { AdminConsoleUnavailable };
