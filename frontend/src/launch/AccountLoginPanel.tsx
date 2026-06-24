import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";

export function AccountLoginPanel(props: { className?: string }) {
  const { enabled, loading, user, signInEmail, signOut } = useAuth();
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
      <p className="text-sm text-slate-300">Sign in to save agreements across devices.</p>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim() || busy) return;
          setBusy(true);
          setStatus(null);
          void signInEmail(email.trim())
            .then(() => setStatus("Check your email for a sign-in link."))
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
