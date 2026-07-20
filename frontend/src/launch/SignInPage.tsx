import { useState } from "react";
import { useLaunchNav } from "./LaunchNavContext";
import { useAuth } from "../auth/AuthProvider";
import { isGoogleAuthConfigured } from "../auth/supabaseAuthService";
import { logProductEvent } from "../lib/experimentation/productEvents";
import { LaunchFailureState } from "./LaunchFailureState";

/** Returning-user sign-in — no pending draft; lands on dashboard after auth. */
export function SignInPage() {
  const { navigate } = useLaunchNav();
  const { enabled, loading, user, signInEmail, signInGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!enabled) {
    return (
      <LaunchFailureState
        kind="unauthorized"
        message="Sign-in is not configured in this environment."
        detail="Contact your administrator or reach out to support if you expected to sign in here."
        primaryAction={{ label: "Go to home", onClick: () => navigate("/") }}
      />
    );
  }

  if (loading) {
    return <p className="px-4 py-16 text-center text-sm text-slate-400">Checking sign-in…</p>;
  }

  if (user) {
    navigate("/app");
    return null;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-xl font-semibold text-white">Sign in to LawDog</h1>
      <p className="mt-2 text-sm text-slate-400">Access your agreements and workspace.</p>
      {isGoogleAuthConfigured() ? (
        <button
          type="button"
          className="mt-6 w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-100 hover:bg-slate-800 disabled:opacity-60"
          disabled={busy}
          onClick={() => {
            logProductEvent("dashboard_sign_in_initiated", { surface: "sign_in_page", method: "google" });
            setBusy(true);
            void signInGoogle({ returningSignIn: true })
              .catch((err) => setStatus(err instanceof Error ? err.message : "Could not start Google sign-in."))
              .finally(() => setBusy(false));
          }}
        >
          Continue with Google
        </button>
      ) : null}
      <form
        className="mt-4 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim() || busy) return;
          setBusy(true);
          setStatus(null);
          logProductEvent("magic_link_requested", { surface: "sign_in_page" });
          void signInEmail(email.trim(), { returningSignIn: true })
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
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-60"
        >
          Email me a sign-in link
        </button>
      </form>
      {status ? <p className="mt-3 text-sm text-slate-400">{status}</p> : null}
      <button
        type="button"
        className="mt-8 text-sm text-slate-500 underline hover:text-slate-300"
        onClick={() => navigate("/")}
      >
        Back to homepage
      </button>
    </div>
  );
}
