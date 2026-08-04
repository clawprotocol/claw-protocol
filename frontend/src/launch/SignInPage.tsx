import { useMemo, useState } from "react";
import { useLaunchNav } from "./LaunchNavContext";
import { useAuth } from "../auth/AuthProvider";
import { isGoogleAuthConfigured } from "../auth/supabaseAuthService";
import {
  isStagingAuthMagicLinkClientSurface,
  stagingAuthDefaultTestEmail,
} from "../auth/stagingAuthMagicLink";
import { logProductEvent } from "../lib/experimentation/productEvents";
import { resolveSignInNextDestination } from "./genesisReferral/genesisReferralColdCreateGate";
import { getGenesisReferralCode } from "./genesisReferral/genesisReferralCapture";

/** Returning-user sign-in — lands on dashboard, or `?next=` (e.g. referral create return). */
export function SignInPage() {
  const { navigate, search } = useLaunchNav();
  const { enabled, loading, user, signInEmail, signInGoogle } = useAuth();
  const stagingAuthSurface = isStagingAuthMagicLinkClientSurface();
  const [email, setEmail] = useState(() => (stagingAuthSurface ? stagingAuthDefaultTestEmail() : ""));
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const destinationPath = useMemo(() => resolveSignInNextDestination(search, "/app"), [search]);
  const referralCode = useMemo(() => getGenesisReferralCode(), []);
  const signInOpts = useMemo(
    () => ({ returningSignIn: true as const, destinationPath }),
    [destinationPath],
  );

  if (!enabled) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-slate-400">
        Sign-in is not configured in this environment.
      </div>
    );
  }

  if (loading) {
    return <p className="px-4 py-16 text-center text-sm text-slate-400">Checking sign-in…</p>;
  }

  if (user) {
    navigate(destinationPath);
    return null;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-xl font-semibold text-white">Sign in to LawDog</h1>
      <p className="mt-2 text-sm text-slate-400">
        {referralCode
          ? "Sign in to continue with your referral invite and open create."
          : "Access your agreements and workspace."}
      </p>
      {isGoogleAuthConfigured() ? (
        <button
          type="button"
          className="mt-6 w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-100 hover:bg-slate-800 disabled:opacity-60"
          disabled={busy}
          onClick={() => {
            logProductEvent("dashboard_sign_in_initiated", {
              surface: "sign_in_page",
              method: "google",
              has_referral: Boolean(referralCode),
            });
            setBusy(true);
            void signInGoogle(signInOpts)
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
          logProductEvent("magic_link_requested", {
            surface: "sign_in_page",
            has_referral: Boolean(referralCode),
          });
          void signInEmail(email.trim(), signInOpts)
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
      {stagingAuthSurface ? (
        <button
          type="button"
          className="mt-3 w-full rounded-lg border border-amber-700/60 bg-amber-950/40 px-4 py-2.5 text-sm font-medium text-amber-100 hover:bg-amber-900/50 disabled:opacity-60"
          disabled={busy}
          onClick={() => {
            const target = email.trim() || stagingAuthDefaultTestEmail();
            setEmail(target);
            setBusy(true);
            setStatus(null);
            logProductEvent("magic_link_requested", { surface: "sign_in_page_staging_bypass" });
            void signInEmail(target, { ...signInOpts, stagingDirectOnly: true })
              .then((result) => {
                if (result.mode === "staging_redirect") {
                  setStatus("Signing you in via staging test login…");
                  return;
                }
                // stagingDirectOnly must never resolve as email_sent
                setStatus("Staging test login did not complete.");
              })
              .catch((err) =>
                setStatus(err instanceof Error ? err.message : "Staging test login failed."),
              )
              .finally(() => setBusy(false));
          }}
        >
          Staging test login (skip email throttle)
        </button>
      ) : null}
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
