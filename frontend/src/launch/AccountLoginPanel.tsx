import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { captureContinuationFromLocation } from "../auth/authContinuationContext";
import { isGoogleAuthConfigured } from "../auth/supabaseAuthService";
import { logProductEvent } from "../lib/experimentation/productEvents";

export function AccountLoginPanel(props: { className?: string }) {
  const { enabled, loading, user, signInEmail, signInGoogle, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!enabled) return null;
  if (loading) {
    return (
      <div className={props.className} data-testid="account-login-panel">
        <p className="text-sm text-slate-400">Checking sign-in…</p>
      </div>
    );
  }

  if (user) {
    return (
      <div className={props.className} data-testid="account-login-panel">
        <p className="text-sm text-slate-300">
          Signed in as <span className="font-medium text-white">{user.email ?? user.id}</span>
        </p>
        <button
          type="button"
          className="mt-2 text-sm text-slate-400 underline hover:text-slate-200"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className={props.className} data-testid="account-login-panel">
      <h2 className="text-base font-semibold text-white">Claim your agreement</h2>
      <p className="mt-1 text-sm text-slate-400">
        Sign in to save work across devices. Your current draft stays attached to this workspace.
      </p>
      {isGoogleAuthConfigured() ? (
        <button
          type="button"
          className="mt-4 w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-100 hover:bg-slate-800 disabled:opacity-60"
          disabled={busy}
          data-testid="account-login-google"
          onClick={() => {
            captureContinuationFromLocation({ workflowStage: "settings", destinationPath: "/app" });
            logProductEvent("google_authentication_started", { surface: "settings" });
            setBusy(true);
            void signInGoogle()
              .catch((err) => setStatus(err instanceof Error ? err.message : "Could not start Google sign-in."))
              .finally(() => setBusy(false));
          }}
        >
          Continue with Google
        </button>
      ) : null}
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim() || busy) return;
          setBusy(true);
          setStatus(null);
          captureContinuationFromLocation({ workflowStage: "settings", destinationPath: "/app" });
          logProductEvent("magic_link_requested", { surface: "settings" });
          void signInEmail(email.trim())
            .then((result) => {
              if (result.mode === "staging_redirect") {
                setStatus("Signing you in via staging test login…");
                return;
              }
              setStatus("Check your email for a sign-in link.");
            })
            .catch((err) => setStatus(err instanceof Error ? err.message : "Could not send sign-in link."))
            .finally(() => setBusy(false));
        }}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          data-testid="account-login-email"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-60"
          data-testid="account-login-submit"
        >
          Email me a sign-in link
        </button>
      </form>
      {status ? <p className="mt-2 text-sm text-slate-400">{status}</p> : null}
    </div>
  );
}
